-- Potencial: onde ha conversa a ter, e qual conversa.
-- Aplicar DEPOIS de schema.sql.
--
-- Tres decisoes de desenho, todas para a regra poder ser contestada sem mexer
-- em codigo:
--
-- 1. O corte de porte e PARAMETRO, nao constante cravada.
-- 2. As regras existem como TABELA, em portugues, com a condicao ao lado.
-- 3. A classificacao e VIEW, nao coluna gravada. Coluna gravada envelhece em
--    silencio: o contrato vence, a aluna cancela, e o rotulo continua o mesmo.

create table if not exists parametro (
    chave      text primary key,
    valor      numeric not null,
    unidade    text,
    descricao  text not null,
    atualizado timestamptz not null default now()
);
comment on table parametro is
  'Numeros que governam a classificacao de potencial. Sao premissas de negocio, nao dado observado — mude aqui em vez de no SQL.';

insert into parametro (chave, valor, unidade, descricao) values
  ('corte_porte', 20000, 'R$/mes',
   'Faturamento mensal a partir do qual a aluna entra em upsell ou reconquista. Hoje e a mediana de quem tem contrato vivo — descreve a operacao como ela e, nao um alvo.'),
  ('meses_renovacao', 4, 'meses',
   'Janela antes do termino em que a renovacao vira conversa urgente. Escolha de calendario comercial, nao medida.'),
  ('meses_contrato', 12, 'meses', 'Duracao padrao do contrato.')
on conflict (chave) do nothing;

create table if not exists regra_potencial (
    ordem     integer primary key,
    potencial text not null unique,
    rotulo    text not null,
    condicao  text not null,
    acao      text not null,
    cuidado   text
);
comment on table regra_potencial is
  'As regras, em portugues, na ordem em que sao avaliadas. A ordem importa: uma aluna cabe em varias e a fila precisa de um dono so. Ordena por urgencia de calendario, nao por tamanho do cheque — renovacao tem data, upsell nao.';

insert into regra_potencial (ordem, potencial, rotulo, condicao, acao, cuidado) values
 (1, 'renovacao', 'Renovação a vencer',
     'Contrato vivo e término entre hoje e o limite de meses_renovacao.',
     'Conduzir a renovação antes do vencimento.',
     'Término não é saída: 64% dos pedidos de cancelamento com desfecho terminam com a aluna ficando.'),
 (2, 'retida_uma_vez', 'Já pediu para sair e ficou',
     'Existe pedido de cancelamento com desfecho "ficou".',
     'Cuidado, não venda. A relação já teve fricção registrada.',
     'A taxa de segunda tentativa não está em nenhum dado que temos.'),
 (3, 'sem_consultor', 'Sem consultor definido',
     'Contrato vivo e nenhuma das duas fontes aponta consultor.',
     'Atribuir dono antes de qualquer outra coisa.',
     'Pode ser cadastro faltando em vez de carteira órfã — o dado não distingue.'),
 (4, 'reconquista', 'Cancelada, negócio ativo',
     'Contrato cancelado e faturamento de referência maior ou igual ao corte_porte.',
     'Reabrir conversa. É o grupo de maior score do radar.',
     'O faturamento pode estar desatualizado se vier do formulário de entrada.'),
 (5, 'upsell', 'Ativa com porte alto',
     'Contrato vivo e faturamento de referência maior ou igual ao corte_porte.',
     'Oferecer Elite, clínica, presencial ou produto.',
     'Porte alto não é sinal de intenção de compra; é sinal de capacidade.'),
 (6, 'sem_gancho', 'Sem gancho claro',
     'Não se encaixa em nenhuma regra acima.',
     'Não trabalhar ativamente.',
     'Inclui quem não tem faturamento conhecido — ausência de dado não é ausência de potencial.')
on conflict (ordem) do nothing;

alter table parametro       enable row level security;
alter table regra_potencial enable row level security;

do $$
declare t text;
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach t in array array['parametro','regra_potencial'] loop
      execute format('drop policy if exists %I on %I', 'ler_' || t, t);
      execute format('create policy %I on %I for select to authenticated using (true)', 'ler_' || t, t);
    end loop;
  end if;
end $$;

drop view if exists vw_potencial_explicado;
drop view if exists vw_potencial;

create view vw_potencial as
with p as (
  select max(valor) filter (where chave = 'corte_porte')     as corte_porte,
         max(valor) filter (where chave = 'meses_renovacao') as meses_renovacao
  from parametro
),
base as (
  select v.id, v.nome_canonico, v.telefone, v.email,
    v.consultor_matricula, v.consultor_aba,
    v.status_recente, v.termino_recente, v.desfecho_pedido, v.fat_mes_consultor,
    (select f.fat_declarado from fato_formulario f
      where f.pessoa_id = v.id and f.fat_declarado is not null
      order by f.id desc limit 1)                        as fat_formulario,
    (select f.empresa from fato_formulario f
      where f.pessoa_id = v.id and f.empresa is not null
      order by f.id desc limit 1)                        as empresa,
    (select c.ramo from fato_consultoria c
      where c.pessoa_id = v.id and c.ramo is not null
      order by c.id desc limit 1)                        as ramo,
    (select c.cidade from fato_consultoria c
      where c.pessoa_id = v.id and c.cidade is not null
      order by c.id desc limit 1)                        as cidade,
    lower(trim(coalesce(v.status_recente, '')))          as st,
    case when v.termino_recente is not null
         then round((v.termino_recente - current_date) / 30.44, 1) end as meses_ate_termino
  from vw_pessoa_completa v
),
c as (
  select b.*,
    b.st in ('ativo', 'pendente de pagamento', 'bloqueado') as contrato_vivo,
    coalesce(b.fat_mes_consultor, b.fat_formulario)         as fat_referencia,
    case when b.fat_mes_consultor is not null then 'relato do consultor'
         when b.fat_formulario   is not null then 'formulário de entrada' end as fat_origem
  from base b
)
select c.id, c.nome_canonico, c.empresa, c.ramo, c.cidade, c.telefone, c.email,
  c.status_recente, c.contrato_vivo, c.termino_recente, c.meses_ate_termino,
  c.consultor_matricula, c.consultor_aba,
  (c.consultor_matricula is not null and c.consultor_aba is not null
   and c.consultor_matricula <> c.consultor_aba)           as divergencia_consultor,
  c.desfecho_pedido,
  c.fat_referencia, c.fat_origem, c.fat_mes_consultor, c.fat_formulario,
  case
    when c.contrato_vivo and c.meses_ate_termino is not null
         and c.meses_ate_termino between 0 and p.meses_renovacao then 'renovacao'
    when c.desfecho_pedido = 'ficou'                                then 'retida_uma_vez'
    when c.contrato_vivo and c.consultor_matricula is null
         and c.consultor_aba is null                                then 'sem_consultor'
    when not c.contrato_vivo and c.st = 'cancelado'
         and c.fat_referencia >= p.corte_porte                      then 'reconquista'
    when c.contrato_vivo and c.fat_referencia >= p.corte_porte      then 'upsell'
    else 'sem_gancho'
  end                                                      as potencial
from c cross join p;

alter view vw_potencial set (security_invoker = true);

create view vw_potencial_explicado as
select v.*, r.ordem, r.rotulo, r.condicao, r.acao, r.cuidado
from vw_potencial v
join regra_potencial r on r.potencial = v.potencial;

alter view vw_potencial_explicado set (security_invoker = true);


-- ---------------------------------------------------------------------------
-- Regras de ingestao como dado. Aplicado por migracao no projeto moonshot-base;
-- reproduzido aqui para que um deploy novo nasca com elas.
-- O conteudo canonico esta em REGRAS.md, na raiz do repositorio.
-- ---------------------------------------------------------------------------
create table if not exists regra_ingestao (
    id      integer primary key,
    dominio text not null,
    ordem   integer not null,
    regra   text not null,
    corte   text,
    porque  text not null,
    onde    text
);
comment on table regra_ingestao is
  'Como o dado das planilhas do Drive vira linha no banco. Mudar aqui nao muda o comportamento — muda o codigo em moonshot/db.py e atualize esta tabela junto. Ela existe para a regra poder ser contestada por quem nao le Python.';

alter table regra_ingestao enable row level security;

create or replace view vw_regras as
select dominio, ordem, regra, corte as parametro, porque, onde from regra_ingestao
union all
select 'potencial', ordem, rotulo || ': ' || condicao, null,
       coalesce(cuidado, acao), 'regra_potencial' from regra_potencial
order by dominio, ordem;

alter view vw_regras set (security_invoker = true);
