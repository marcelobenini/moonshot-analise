-- O que as planilhas fazem e o sistema ainda nao fazia, e a importacao delas.
-- Aplicar DEPOIS de sistema.sql, sistema_funis.sql e sistema_importar.sql.
--
-- Cada planilha do Drive virou uma parte do sistema:
--
--   ALUNOS MATRICULADOS (uma aba por turma)  -> contrato (uma linha por compra)
--   Controle Consultorias (aba por consultor) -> consultoria_agenda + nota_aluna
--   Cancelamentos Atual                       -> cards no funil de Retencao
--   Maquina de Vendas (Jessica)               -> contrato de outro produto
--   Inadimplentes por consultor               -> contrato.status_financeiro
--   EVENTO MOONSHOT (aba por evento)          -> evento + evento_participante
--   Pijamas e jaquetas                        -> campos de kit da aluna
--   Cadastro de novo membro                   -> campos de onboarding da aluna
--
-- A importacao roda no banco: o navegador le o xlsx e manda as linhas cruas
-- para `importacao_linha`; `processar_importacao` casa cada linha com a aluna
-- certa e grava. Nada de dado pessoal passa por outro lugar.
--
-- Nenhum comando aqui apaga nada: o arquivo pode ser reaplicado.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    create extension if not exists pg_trgm with schema extensions;
  else
    create extension if not exists pg_trgm;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Aluna: o que as planilhas controlam e a tabela nao tinha.
-- ---------------------------------------------------------------------------
alter table aluna add column if not exists telefone2           text;
alter table aluna add column if not exists forma_pagamento     text;
alter table aluna add column if not exists plano_meses         integer;
alter table aluna add column if not exists contrato_assinatura text;
alter table aluna add column if not exists acesso_plataforma   text;
alter table aluna add column if not exists onboarding_status   text;
alter table aluna add column if not exists grupo_avisos        text;
alter table aluna add column if not exists cadastro_preenchido boolean not null default false;
alter table aluna add column if not exists link_notion         text;
alter table aluna add column if not exists jaqueta             text;
-- CS como aparece na planilha, ate existir perfil para ela (como consultor_planilha).
alter table aluna add column if not exists cs_planilha         text;

-- ---------------------------------------------------------------------------
-- Contrato: uma linha por compra. A mesma aluna renova, sobe para o Elite ou
-- compra a Maquina de Vendas; a planilha resolvia isso repetindo a aluna em
-- abas diferentes. A ficha da aluna mostra o contrato principal.
-- ---------------------------------------------------------------------------
create table if not exists contrato (
    id                 bigint generated always as identity primary key,
    aluna_id           bigint not null references aluna(id) on delete cascade,
    produto            text not null,
    turma              text,
    inicio             date,
    termino            date,
    plano_meses        integer,
    status             text not null default 'ativo'
                       check (status in ('ativo','pendente','bloqueado','pausado','encerrado','cancelado')),
    status_financeiro  text check (status_financeiro in ('adimplente','inadimplente','parcelado','quitado','pendente')),
    forma_pagamento    text,
    assinatura         text,
    observacao         text,
    -- Reimportar a mesma planilha atualiza em vez de duplicar.
    chave              text unique,
    criado_em          timestamptz not null default now(),
    atualizado_em      timestamptz not null default now()
);
create index if not exists ix_contrato_aluna on contrato(aluna_id);

-- O contrato principal e o Moonshot mais recente; Maquina de Vendas so quando
-- e o unico. A aluna espelha os campos dele, para funil e filtro continuarem
-- simples.
create or replace function sincronizar_aluna(p_aluna bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c contrato;
begin
  select * into c from contrato where aluna_id = p_aluna
  order by (produto <> 'Máquina de Vendas') desc,
           (status not in ('cancelado','encerrado')) desc,
           termino desc nulls last, id desc
  limit 1;
  if c.id is null then return; end if;
  update aluna set produto = c.produto, turma = coalesce(c.turma, turma),
                   inicio = coalesce(c.inicio, inicio), termino = coalesce(c.termino, termino),
                   status_contrato = c.status,
                   status_financeiro = coalesce(c.status_financeiro, status_financeiro),
                   forma_pagamento = coalesce(c.forma_pagamento, forma_pagamento),
                   plano_meses = coalesce(c.plano_meses, plano_meses),
                   contrato_assinatura = coalesce(c.assinatura, contrato_assinatura)
  where id = p_aluna;
end $$;

create or replace function contrato_depois() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform sincronizar_aluna(new.aluna_id);
  return new;
end $$;
create or replace trigger tg_contrato_depois after insert or update on contrato
  for each row execute function contrato_depois();

create or replace function contrato_antes() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;
create or replace trigger tg_contrato_antes before update on contrato
  for each row execute function contrato_antes();

-- O que a planilha "Inadimplentes por consultor" montava a mao.
create or replace view vw_inadimplentes with (security_invoker = true) as
select a.id as aluna_id, a.nome, a.produto, a.consultor_id,
       coalesce(p.nome, a.consultor_planilha) as consultor,
       c.produto as produto_contrato, c.forma_pagamento, c.termino
from contrato c
join aluna a on a.id = c.aluna_id
left join perfil p on p.id = a.consultor_id
where c.status_financeiro = 'inadimplente' and c.status not in ('cancelado','encerrado');

-- ---------------------------------------------------------------------------
-- Agenda de consultorias. As colunas 1.CONSULT. a 5.CONSULT. das abas de
-- consultor sao datas PREVISTAS (vao ate 2027, repetidas por turma). O
-- registro de consultoria diz o que aconteceu; a agenda, o que esta marcado.
-- ---------------------------------------------------------------------------
create table if not exists consultoria_agenda (
    id            bigint generated always as identity primary key,
    aluna_id      bigint not null references aluna(id) on delete cascade,
    numero        integer not null check (numero between 0 and 10),  -- 0 = entrada
    data_prevista date,
    realizada_em  date,
    observacao    text,
    unique (aluna_id, numero)
);
create index if not exists ix_agenda_data on consultoria_agenda(data_prevista) where realizada_em is null;

-- Registrar a consultoria N da baixa na agenda N.
create or replace function consultoria_agenda_baixa() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.realizada and new.numero is not null then
    insert into consultoria_agenda (aluna_id, numero, realizada_em)
    values (new.aluna_id, new.numero, new.data)
    on conflict (aluna_id, numero) do update set realizada_em = excluded.realizada_em;
  end if;
  return new;
end $$;
create or replace trigger tg_consultoria_agenda_baixa after insert on registro_consultoria
  for each row execute function consultoria_agenda_baixa();

-- ---------------------------------------------------------------------------
-- Anotacoes: o texto livre das planilhas (SITUACAO ALUNA, OBS CS, OBS
-- Consultor, POTENCIAIS) e o que o time escrever daqui em diante fora de uma
-- consultoria. Mesmo sigilo do relato de consultoria.
-- ---------------------------------------------------------------------------
create table if not exists nota_aluna (
    id        bigint generated always as identity primary key,
    aluna_id  bigint not null references aluna(id) on delete cascade,
    autor_id  uuid default auth.uid() references perfil(id) on delete set null,
    tipo      text not null default 'nota',   -- nota | situacao | obs_cs | obs_consultor | potencial
    texto     text not null,
    origem    text,                           -- 'planilha: <arquivo/aba>' quando importada
    criado_em timestamptz not null default now()
);
create index if not exists ix_nota_aluna on nota_aluna(aluna_id, criado_em desc);
create unique index if not exists ux_nota_importada on nota_aluna(aluna_id, md5(texto)) where origem is not null;

-- ---------------------------------------------------------------------------
-- Eventos: a planilha tinha uma aba por evento com a lista de convidados.
-- ---------------------------------------------------------------------------
create table if not exists evento (
    id        bigint generated always as identity primary key,
    nome      text not null,
    data      date,
    local     text,
    descricao text,
    criado_por uuid default auth.uid() references perfil(id) on delete set null,
    criado_em timestamptz not null default now(),
    unique (nome, data)
);

create table if not exists evento_participante (
    id                    bigint generated always as identity primary key,
    evento_id             bigint not null references evento(id) on delete cascade,
    aluna_id              bigint references aluna(id) on delete set null,
    nome                  text not null,
    nome_norm             text generated always as (norm_nome(nome)) stored,
    contato               text,
    tipo                  text not null default 'aluna' check (tipo in ('aluna','socio','convidado')),
    confirmado            boolean,
    presente              boolean,
    programa_informado    text,
    faturamento_informado text,
    potencial             text check (potencial in ('alto','medio','baixo')),
    potencial_obs         text,
    unique (evento_id, nome_norm)
);
create index if not exists ix_part_evento on evento_participante(evento_id);
create index if not exists ix_part_aluna  on evento_participante(aluna_id);

-- ---------------------------------------------------------------------------
-- Importacao
-- ---------------------------------------------------------------------------
create table if not exists importacao (
    id         bigint generated always as identity primary key,
    tipo       text not null check (tipo in ('matriculas','consultorias','cancelamentos','maquina',
                                             'inadimplentes','evento','kit','cadastro')),
    arquivo    text not null,
    status     text not null default 'recebendo' check (status in ('recebendo','processada','erro')),
    resumo     jsonb,
    criado_por uuid default auth.uid() references perfil(id) on delete set null,
    criado_em  timestamptz not null default now()
);

-- Linha crua como o navegador leu: chaves = cabecalho normalizado, mais
-- "_1", "_2"... pela posicao, para abas sem cabecalho.
create table if not exists importacao_linha (
    id            bigint generated always as identity primary key,
    importacao_id bigint not null references importacao(id) on delete cascade,
    aba           text not null,
    linha         integer not null,
    dados         jsonb not null
);
create index if not exists ix_implinha on importacao_linha(importacao_id, aba, linha);

-- O que nao deu para resolver sozinho: nome parecido demais com mais de uma
-- aluna, linha sem nome. Fica para alguem olhar, nao some numa media.
create table if not exists importacao_pendencia (
    id            bigint generated always as identity primary key,
    importacao_id bigint not null references importacao(id) on delete cascade,
    aba           text,
    linha         integer,
    nome          text,
    motivo        text not null,
    candidatos    jsonb,
    resolvida     boolean not null default false
);

-- Utilitarios de leitura -----------------------------------------------------

-- Primeiro valor nao vazio entre as chaves dadas.
create or replace function ler(d jsonb, variadic chaves text[]) returns text
language sql immutable as $$
  select v from (
    select nullif(trim(d->>k), '') as v, ord from unnest(chaves) with ordinality as t(k, ord)
  ) x where v is not null and v not in ('—', '-', '--') order by ord limit 1
$$;

create or replace function ler_data(t text) returns date
language plpgsql immutable as $$
declare m text[];
begin
  if t is null then return null; end if;
  t := trim(t);
  if t ~ '^\d{4}-\d{2}-\d{2}' then return left(t, 10)::date; end if;
  m := regexp_match(t, '^(\d{1,2})/(\d{1,2})/(\d{2,4})');
  if m is not null then
    return make_date(case when length(m[3]) = 2 then 2000 + m[3]::int else m[3]::int end, m[2]::int, m[1]::int);
  end if;
  return null;
exception when others then return null;
end $$;

-- "40K", "R$ 60.000,00", "R$7 mil/mês", "15000.0" -> numero. Faixa ("De 40 a
-- 50k") e texto ("ainda sem faturamento") ficam nulos: chute vira dado falso.
create or replace function ler_valor(t text) returns numeric
language plpgsql immutable as $$
declare s text; mult numeric := 1; n numeric;
begin
  if t is null then return null; end if;
  s := lower(trim(t));
  if s ~ '\d\s*a\s*\d' or s !~ '\d' then return null; end if;
  if s ~ '\d\s*(k|mil)\M' or s ~ '\d\s*k$' then mult := 1000; end if;
  s := regexp_replace(s, '[^0-9,.]', '', 'g');
  if s ~ ',\d{1,2}$' then s := replace(replace(s, '.', ''), ',', '.');
  elsif s ~ '^\d{1,3}(\.\d{3})+$' then s := replace(s, '.', '');
  else s := replace(s, ',', ''); end if;
  n := s::numeric * mult;
  if n < 0 or n > 100000000 then return null; end if;
  return n;
exception when others then return null;
end $$;

create or replace function mapear_status(t text) returns text
language sql immutable as $$
  select case
    when t is null then null
    -- "Processo Cancelamento" ainda e aluna ativa: e trabalho da retencao.
    when norm_nome(t) like '%processo%' then 'ativo'
    when norm_nome(t) like '%cancel%' then 'cancelado'
    when norm_nome(t) like '%encerr%' then 'encerrado'
    when norm_nome(t) like '%inadimpl%' then 'bloqueado'
    when norm_nome(t) like '%bloquead%' then 'bloqueado'
    when norm_nome(t) ~ 'pausa|suspens|trancad' then 'pausado'
    when norm_nome(t) like '%pendente%' then 'pendente'
    when norm_nome(t) ~ '^ativ|confirmar' then 'ativo'
    else null end
$$;

create or replace function mapear_financeiro(t text) returns text
language sql immutable as $$
  select case
    when t is null then null
    when norm_nome(t) like '%inadimpl%' then 'inadimplente'
    when norm_nome(t) like '%parcelad%' then 'parcelado'
    when norm_nome(t) ~ 'quitad|pagou total|^pago' then 'quitado'
    when norm_nome(t) like '%adimpl%' then 'adimplente'
    when norm_nome(t) like '%pendente%' then 'pendente'
    else null end
$$;

create or replace function mapear_produto(t text, aba text default null) returns text
language sql immutable as $$
  select case
    when norm_nome(coalesce(t, '')) like '%maquina%' then 'Máquina de Vendas'
    when norm_nome(coalesce(t, '') || ' ' || coalesce(aba, '')) like '%elite%' then 'Moonshot Elite'
    when norm_nome(coalesce(t, '') || ' ' || coalesce(aba, '')) ~ 'privat' then 'Moonshot Private'
    when norm_nome(coalesce(t, '') || ' ' || coalesce(aba, '')) ~ 'in ?company' then 'Moonshot In Company'
    when norm_nome(coalesce(t, '')) ~ 'pro\M|pró' or norm_nome(coalesce(t, '')) like '%moonshotpro%' then 'Moonshot Pró'
    when norm_nome(coalesce(t, '')) like '%club%' then 'Moonshot Club'
    when t is null and norm_nome(coalesce(aba, '')) ~ '^pb-' then 'Moonshot Club'
    when t is null then 'Moonshot Club'
    else initcap(t) end
$$;

-- Motivo de saida em lista fechada, como manda a especificacao. O texto
-- original fica no card; isto e so para medir.
create or replace function classificar_motivo(t text) returns text
language sql immutable as $$
  select case
    when t is null then 'Outro'
    when norm_nome(t) ~ 'financ|dinheir|pagar|caixa|condic|desempreg|divida|custo|valor|parcel' then 'Financeiro'
    when norm_nome(t) ~ 'insatisf|expectativ|entrega|conteudo|nao gostou|qualidade|promet|metodo|atendimento' then 'Insatisfação com a entrega'
    when norm_nome(t) ~ 'saude|doen|gravid|gestac|luto|falec|depress|ansied|cirurg|pessoal|familia|burnout|separa' then 'Saúde ou pessoal'
    when norm_nome(t) ~ 'tempo|agenda|rotina|sobrecarg' then 'Falta de tempo'
    when norm_nome(t) ~ 'fechou|vendeu|encerr.*(empresa|negocio|clinica)|fechar (a )?(empresa|clinica|loja)' then 'Fechou ou vendeu o negócio'
    else 'Outro' end
$$;

-- Casamento de identidade -----------------------------------------------------
-- A regra do REGRAS.md (secao 3) e de moonshot/consultoria.py, agora no banco.
--
-- Chave do nome: sem acento e caixa, e sem a anotacao que o consultor cola no
-- nome ("Fulana - Plano de acao entregue", "Fulana (socia X)", "Fulana /
-- Ciclana"): fica so o que vem antes de " - ", "(" ou "/".
create or replace function chave_nome(t text) returns text
language sql immutable as $$
  select nullif(trim(regexp_replace(regexp_replace(
           split_part(split_part(split_part(norm_nome(t), ' - ', 1), '(', 1), '/', 1),
           '[^a-z ]', ' ', 'g'), '\s+', ' ', 'g')), '')
$$;

alter table aluna add column if not exists nome_chave text generated always as (chave_nome(nome)) stored;
create index if not exists ix_aluna_chave on aluna(nome_chave);
do $$
begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
             where e.extname = 'pg_trgm' and n.nspname = 'extensions') then
    execute 'create index if not exists ix_aluna_chave_trgm on aluna using gin (nome_chave extensions.gin_trgm_ops)';
  else
    execute 'create index if not exists ix_aluna_chave_trgm on aluna using gin (nome_chave gin_trgm_ops)';
  end if;
end $$;

-- O nome como esta escrito (acento e tudo), so sem a anotacao. Tudo em
-- maiusculas vira nome proprio, com "da", "de", "dos" minusculos.
create or replace function limpar_nome(t text) returns text
language sql immutable as $$
  select case when x = upper(x)
              then trim(replace(replace(replace(replace(replace(replace(' ' || initcap(x) || ' ',
                     ' Da ', ' da '), ' De ', ' de '), ' Do ', ' do '), ' Das ', ' das '), ' Dos ', ' dos '), ' E ', ' e '))
              else x end
  from (select nullif(trim(regexp_replace(split_part(split_part(split_part(coalesce(t, ''), ' - ', 1), '(', 1), '/', 1),
                                          '\s+', ' ', 'g')), '') as x) y
$$;

-- Rotulo de secao e recado nao sao gente (REGRAS.md: "o que nao e pessoa").
create or replace function eh_nome_de_pessoa(t text) returns boolean
language sql immutable as $$
  select chave_nome(t) is not null
     and length(replace(chave_nome(t), ' ', '')) >= 3
     and chave_nome(t) !~ '^(nome|aluna|alunas|aluno|cliente|status|total|franquias?|inadimplentes?|consultor.*|cs .*|reuniao.*|observac.*|tamanho|pijamas?)$'
$$;

-- Passes, do mais seguro ao mais frouxo; o primeiro que casar vence.
--   e-mail -> telefone -> chave exata -> digitacao (trigrama >= 0,92)
--   -> nome parcial (mesmo primeiro nome e tokens de um contidos no outro)
--   -> primeiro + ultimo nome -> trigrama >= 0,8
-- Cada passe so casa com candidato UNICO. Semelhante mas incerto (0,55 a
-- 0,8) devolve os candidatos para virar pendencia de revisao.
create or replace function achar_aluna(p_nome text, p_email text, p_fone text,
                                       out aluna_id bigint, out metodo text, out candidatos jsonb)
language plpgsql stable set search_path = public, extensions as $$
declare k text := chave_nome(p_nome); toks text[]; ids bigint[];
begin
  if p_email is not null and p_email ~ '@' then
    select id into aluna_id from aluna where lower(email) = lower(trim(p_email)) limit 1;
    if aluna_id is not null then metodo := 'email'; return; end if;
  end if;
  if length(regexp_replace(coalesce(p_fone, ''), '\D', '', 'g')) >= 8 then
    select id into aluna_id from aluna where norm_fone(telefone) = norm_fone(p_fone)
      or norm_fone(telefone2) = norm_fone(p_fone) limit 1;
    if aluna_id is not null then metodo := 'telefone'; return; end if;
  end if;
  if k is null or length(k) < 4 then return; end if;
  toks := array(select w from unnest(string_to_array(k, ' ')) w where length(w) > 2);

  select array_agg(id) into ids from aluna where nome_chave = k;
  if array_length(ids, 1) = 1 then aluna_id := ids[1]; metodo := 'nome'; return; end if;

  select array_agg(id) into ids from aluna where nome_chave % k and similarity(nome_chave, k) >= 0.92;
  if array_length(ids, 1) = 1 then aluna_id := ids[1]; metodo := 'digitacao'; return; end if;

  if array_length(toks, 1) >= 2 then
    select array_agg(id) into ids from aluna a
    where split_part(a.nome_chave, ' ', 1) = split_part(k, ' ', 1)
      and (array(select w from unnest(string_to_array(a.nome_chave, ' ')) w where length(w) > 2) @> toks
           or array(select w from unnest(string_to_array(a.nome_chave, ' ')) w where length(w) > 2) <@ toks)
      and array_length(array(select w from unnest(string_to_array(a.nome_chave, ' ')) w where length(w) > 2), 1) >= 2;
    if array_length(ids, 1) = 1 then aluna_id := ids[1]; metodo := 'nome_parcial'; return; end if;

    select array_agg(id) into ids from aluna a
    where split_part(a.nome_chave, ' ', 1) = split_part(k, ' ', 1)
      and regexp_replace(a.nome_chave, '^.* ', '') = regexp_replace(k, '^.* ', '');
    if array_length(ids, 1) = 1 then aluna_id := ids[1]; metodo := 'primeiro_ultimo'; return; end if;
  end if;

  select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'similaridade', round(s::numeric, 2)) order by s desc)
    into candidatos
  from (select id, nome, similarity(nome_chave, k) as s from aluna
        where nome_chave % k order by s desc limit 3) c where s >= 0.55;
  if candidatos is not null and jsonb_array_length(candidatos) = 1
     and (candidatos->0->>'similaridade')::numeric >= 0.8 then
    aluna_id := (candidatos->0->>'id')::bigint; metodo := 'semelhanca'; candidatos := null;
  elsif candidatos is not null then
    metodo := 'duvida';
  end if;
end $$;

-- Acha ou cria. Na duvida cria e registra a pendencia "possivel duplicata":
-- perder a linha seria pior que ter que unir duas fichas depois.
create or replace function garantir_aluna(p_imp bigint, p_aba text, p_linha int,
                                          p_nome text, p_email text, p_fone text,
                                          out aluna_id bigint, out criada boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare r record; nome_limpo text;
begin
  criada := false;
  nome_limpo := trim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  if not eh_nome_de_pessoa(nome_limpo) then return; end if;
  select * into r from achar_aluna(nome_limpo, p_email, p_fone);
  if r.aluna_id is not null then aluna_id := r.aluna_id; return; end if;
  -- Uma palavra so ("Mell") nao identifica ninguem: fica para revisao.
  if position(' ' in chave_nome(nome_limpo)) = 0 then
    insert into importacao_pendencia (importacao_id, aba, linha, nome, motivo, candidatos)
    values (p_imp, p_aba, p_linha, nome_limpo, 'Nome incompleto (uma palavra só)', r.candidatos);
    return;
  end if;
  -- O nome guardado e o limpo, sem a anotacao do consultor.
  insert into aluna (nome, email, telefone, criado_por)
  values (limpar_nome(nome_limpo), nullif(lower(trim(p_email)), ''), p_fone, auth.uid())
  returning id into aluna_id;
  criada := true;
  if r.metodo = 'duvida' then
    insert into importacao_pendencia (importacao_id, aba, linha, nome, motivo, candidatos)
    values (p_imp, p_aba, p_linha, nome_limpo, 'Possível duplicata: ficha nova criada, confira se é a mesma pessoa',
            jsonb_build_object('nova', aluna_id, 'parecidas', r.candidatos));
  end if;
end $$;

-- Duas fichas da mesma pessoa viram uma. Tudo que aponta para a removida
-- passa para a mantida; campo vazio da mantida e completado pela removida.
create or replace function unir_alunas(p_manter bigint, p_remover bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r aluna;
begin
  if auth.uid() is not null and not eh_coordenador() then
    raise exception 'so a coordenacao une fichas';
  end if;
  if p_manter = p_remover then return; end if;
  select * into r from aluna where id = p_remover;
  if r.id is null then raise exception 'ficha % nao existe', p_remover; end if;
  perform set_config('moonshot.silencio', 'on', true);
  update contrato set aluna_id = p_manter where aluna_id = p_remover;
  update registro_consultoria set aluna_id = p_manter where aluna_id = p_remover;
  update nota_aluna n set aluna_id = p_manter where aluna_id = p_remover
    and not exists (select 1 from nota_aluna m where m.aluna_id = p_manter and md5(m.texto) = md5(n.texto));
  update consultoria_agenda g set aluna_id = p_manter where aluna_id = p_remover
    and not exists (select 1 from consultoria_agenda h where h.aluna_id = p_manter and h.numero = g.numero);
  update demanda set aluna_id = p_manter where aluna_id = p_remover;
  update evento_participante set aluna_id = p_manter where aluna_id = p_remover;
  -- Card aberto duplicado no mesmo funil: o da ficha removida fecha como
  -- historico (vai para a primeira etapa final do funil).
  update card c set aluna_id = p_manter where aluna_id = p_remover
    and not (fechado_em is null and exists (select 1 from card d where d.aluna_id = p_manter
                                            and d.funil_id = c.funil_id and d.fechado_em is null));
  update card c set aluna_id = p_manter, motivo = coalesce(motivo, 'Ficha unida'),
                    etapa_id = (select id from etapa e where e.funil_id = c.funil_id and e.tipo <> 'aberta' order by ordem limit 1)
  where aluna_id = p_remover;
  -- Apaga a removida antes de copiar os campos dela (ja estao em `r`): pessoa_id e unico.
  delete from aluna where id = p_remover;
  update aluna m set
    email = coalesce(m.email, r.email), telefone = coalesce(m.telefone, r.telefone),
    telefone2 = coalesce(m.telefone2, r.telefone2, case when r.telefone is distinct from m.telefone then r.telefone end),
    empresa = coalesce(m.empresa, r.empresa), ramo = coalesce(m.ramo, r.ramo), cidade = coalesce(m.cidade, r.cidade),
    uf = coalesce(m.uf, r.uf), faturamento_mensal = coalesce(m.faturamento_mensal, r.faturamento_mensal),
    consultor_id = coalesce(m.consultor_id, r.consultor_id), cs_id = coalesce(m.cs_id, r.cs_id),
    consultor_planilha = coalesce(m.consultor_planilha, r.consultor_planilha), cs_planilha = coalesce(m.cs_planilha, r.cs_planilha),
    saude = coalesce(m.saude, r.saude), ultima_consultoria = greatest(m.ultima_consultoria, r.ultima_consultoria),
    tamanho_kit = coalesce(m.tamanho_kit, r.tamanho_kit), jaqueta = coalesce(m.jaqueta, r.jaqueta),
    link_notion = coalesce(m.link_notion, r.link_notion), cadastro_preenchido = m.cadastro_preenchido or r.cadastro_preenchido,
    acesso_plataforma = coalesce(m.acesso_plataforma, r.acesso_plataforma),
    onboarding_status = coalesce(m.onboarding_status, r.onboarding_status), grupo_avisos = coalesce(m.grupo_avisos, r.grupo_avisos),
    pessoa_id = coalesce(m.pessoa_id, r.pessoa_id)
  where m.id = p_manter;
  perform sincronizar_aluna(p_manter);
  update importacao_pendencia set resolvida = true
  where not resolvida and (candidatos->>'nova')::bigint in (p_manter, p_remover);
  perform set_config('moonshot.silencio', 'off', true);
end $$;

-- Preenche so o que esta vazio: a planilha nao apaga o que o time ja
-- corrigiu no sistema. Excecoes: faturamento e consultor, que a aba do
-- consultor sabe melhor que qualquer outra fonte, sobrescrevem.
-- `consultor_se_vazio` e para fonte menos confiavel (coluna da matricula).
create or replace function completar_aluna(p_aluna bigint, campos jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  update aluna set
    email              = coalesce(email, nullif(lower(campos->>'email'), '')),
    telefone           = coalesce(telefone, nullif(campos->>'telefone', '')),
    telefone2          = coalesce(telefone2, nullif(campos->>'telefone2', '')),
    cidade             = coalesce(cidade, nullif(campos->>'cidade', '')),
    ramo               = coalesce(ramo, nullif(campos->>'ramo', '')),
    empresa            = coalesce(empresa, nullif(campos->>'empresa', '')),
    faturamento_mensal = coalesce(nullif(campos->>'faturamento', '')::numeric, faturamento_mensal),
    consultor_planilha = coalesce(nullif(campos->>'consultor', ''), consultor_planilha,
                                  nullif(campos->>'consultor_se_vazio', '')),
    cs_planilha        = coalesce(nullif(campos->>'cs', ''), cs_planilha, nullif(campos->>'cs_se_vazio', '')),
    acesso_plataforma  = coalesce(nullif(campos->>'acesso', ''), acesso_plataforma),
    onboarding_status  = coalesce(nullif(campos->>'onboarding', ''), onboarding_status),
    grupo_avisos       = coalesce(nullif(campos->>'grupo', ''), grupo_avisos),
    tamanho_kit        = coalesce(nullif(campos->>'pijama', ''), tamanho_kit),
    jaqueta            = coalesce(nullif(campos->>'jaqueta', ''), jaqueta),
    link_notion        = coalesce(nullif(campos->>'notion', ''), link_notion),
    cadastro_preenchido = cadastro_preenchido or coalesce((campos->>'cadastro')::boolean, false)
  where id = p_aluna;
end $$;

create or replace function anotar(p_aluna bigint, p_tipo text, p_texto text, p_origem text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_aluna is null or coalesce(trim(p_texto), '') = '' or length(trim(p_texto)) < 3 then return false; end if;
  insert into nota_aluna (aluna_id, tipo, texto, origem, autor_id)
  values (p_aluna, p_tipo, trim(p_texto), p_origem, null)
  on conflict (aluna_id, md5(texto)) where origem is not null do nothing;
  return found;
end $$;

-- Processadores ---------------------------------------------------------------

-- ALUNOS MATRICULADOS: cada aba de turma vira um contrato. Abas que nao sao
-- de turma (vendas com endereco e CPF, listas de renovacao e de pedidos)
-- ficam de fora; os pedidos vem pela planilha de cancelamentos.
create or replace function importar_matriculas(p_imp bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  l record; d jsonb; a record; v_nome text; v_produto text; ini date; fim date; v_status text;
  n_cont int := 0; n_alunas int := 0; n_onb int := 0; n_notas int := 0; ignoradas jsonb := '{}';
  v_chave text; acesso text; onb text; grupo text; et int; tocadas bigint[] := '{}'; r record;
begin
  for l in select * from importacao_linha where importacao_id = p_imp order by aba, linha loop
    if norm_nome(l.aba) ~ 'dados vendas|renovacao|boleto nb|pedidos de cancelamento|^cancelamentos$' then
      ignoradas := jsonb_set(ignoradas, array[l.aba], to_jsonb(coalesce((ignoradas->>l.aba)::int, 0) + 1));
      continue;
    end if;
    d := l.dados;
    v_nome := ler(d, 'nome', 'aluno(a)', 'aluna', 'coluna 2', '_2');
    if v_nome is null or v_nome ~ '^\d+(\.0)?$' or norm_nome(v_nome) in ('nome', 'aluna', 'aluno(a)') then continue; end if;
    select * into a from garantir_aluna(p_imp, l.aba, l.linha, v_nome, ler(d, 'e-mail', 'email'), ler(d, 'telefone'));
    if a.aluna_id is null then continue; end if;
    if a.criada then n_alunas := n_alunas + 1; end if;

    v_produto := mapear_produto(ler(d, 'tipo de plano'), l.aba);
    ini := ler_data(ler(d, 'data de inicio do plano'));
    fim := ler_data(ler(d, 'data de termino do plano'));
    v_status := coalesce(mapear_status(ler(d, 'status contrato')), mapear_status(ler(d, 'status')), 'ativo');
    acesso := ler(d, 'acesso plataforma'); onb := ler(d, 'onboarding'); grupo := ler(d, 'adc no grupo avisos');
    v_chave := 'matricula:' || md5(a.aluna_id || '|' || v_produto || '|' || l.aba);

    insert into contrato (aluna_id, produto, turma, inicio, termino, plano_meses, status,
                          status_financeiro, forma_pagamento, assinatura, chave)
    values (a.aluna_id, v_produto, trim(l.aba), ini, fim,
            nullif(regexp_replace(coalesce(ler(d, 'periodo do plano', 'plano'), ''), '\D', '', 'g'), '')::int,
            v_status,
            coalesce(mapear_financeiro(ler(d, 'status')), mapear_financeiro(ler(d, 'status contrato')),
                     mapear_financeiro(ler(d, 'pagamento'))),
            ler(d, 'pagamento'), ler(d, 'contrato'), v_chave)
    on conflict (chave) do update set
      inicio = excluded.inicio, termino = excluded.termino, plano_meses = excluded.plano_meses,
      status = excluded.status, status_financeiro = coalesce(excluded.status_financeiro, contrato.status_financeiro),
      forma_pagamento = excluded.forma_pagamento, assinatura = excluded.assinatura;
    n_cont := n_cont + 1;

    perform completar_aluna(a.aluna_id, jsonb_build_object(
      'email', ler(d, 'e-mail', 'email'), 'telefone', ler(d, 'telefone'),
      'telefone2', ler(d, 'telefone secundario'),
      'consultor_se_vazio', ler(d, 'consultor estrategico'), 'cs', ler(d, 'cs responsavel'),
      'acesso', acesso, 'onboarding', onb, 'grupo', grupo));

    -- Texto livre vira anotacao, com o sigilo do relato.
    if anotar(a.aluna_id, 'obs_cs', ler(d, 'obs cs'), 'planilha matriculas: ' || l.aba) then n_notas := n_notas + 1; end if;
    if anotar(a.aluna_id, 'obs_consultor', ler(d, 'obs consultor'), 'planilha matriculas: ' || l.aba) then n_notas := n_notas + 1; end if;
    if anotar(a.aluna_id, 'nota', ler(d, 'observacoes'), 'planilha matriculas: ' || l.aba) then n_notas := n_notas + 1; end if;
    if anotar(a.aluna_id, 'nota', ler(d, 'motivo do cancelamento'), 'planilha matriculas (motivo do cancelamento): ' || l.aba) then n_notas := n_notas + 1; end if;

    tocadas := array_append(tocadas, a.aluna_id);
  end loop;

  -- Onboarding pela metade vira card no funil da CS, na etapa em que parou.
  -- Olha a aluna depois de todas as abas: a aba do Elite nao repete o
  -- onboarding que a aluna ja fez na turma de origem.
  for r in select * from aluna where id = any(tocadas) and status_contrato = 'ativo'
             and (coalesce(norm_nome(onboarding_status), '') <> 'realizado'
                  or coalesce(norm_nome(acesso_plataforma), '') <> 'liberado'
                  or coalesce(norm_nome(grupo_avisos), '') <> 'sim') loop
    et := case when norm_nome(coalesce(r.onboarding_status, '')) = 'realizado' and norm_nome(coalesce(r.acesso_plataforma, '')) <> 'liberado' then 5
               when norm_nome(coalesce(r.onboarding_status, '')) = 'realizado' then 6
               when norm_nome(coalesce(r.onboarding_status, '')) like '%agendado%' then 3
               else 2 end;
    insert into card (funil_id, etapa_id, aluna_id, titulo, dados)
    select 'onboarding', etapa_de('onboarding', et), r.id, r.nome, jsonb_build_object('importado', true, 'turma', r.turma)
    where not exists (select 1 from card where funil_id = 'onboarding' and aluna_id = r.id);
    if found then n_onb := n_onb + 1; end if;
  end loop;
  return jsonb_build_object('contratos', n_cont, 'alunas_novas', n_alunas,
                            'onboarding_em_aberto', n_onb, 'anotacoes', n_notas, 'abas_ignoradas', ignoradas);
end $$;

-- Controle Consultorias: a aba e do consultor (mais confiavel que a coluna
-- da matricula, REGRAS.md 4). Agenda prevista, faturamento e o relato.
create or replace function importar_consultorias(p_imp bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  l record; d jsonb; a record; nome text; consultor text; fat numeric; i int; v text; dtp date;
  n_alunas int := 0; n_atual int := 0; n_agenda int := 0; n_notas int := 0; eng text;
begin
  for l in select * from importacao_linha where importacao_id = p_imp order by aba, linha loop
    d := l.dados;
    nome := ler(d, 'aluna');
    if nome is null or norm_nome(nome) = 'aluna' then continue; end if;
    select * into a from garantir_aluna(p_imp, l.aba, l.linha, nome, null, ler(d, 'contato'));
    if a.aluna_id is null then continue; end if;
    if a.criada then n_alunas := n_alunas + 1; end if;

    -- Nome do consultor vem da aba ("Thiago Geral" -> Thiago); onde a aba e
    -- de redistribuicao, da coluna.
    consultor := coalesce(ler(d, 'novo consultor', 'consultor'),
                          nullif(trim(regexp_replace(l.aba, '(?i)geral|relat.rio.*', '', 'g')), ''));
    fat := ler_valor(ler(d, 'faturamento mes'));
    if fat is null and ler_valor(ler(d, 'faturamento ano')) > 0 then fat := ler_valor(ler(d, 'faturamento ano')) / 12; end if;
    perform completar_aluna(a.aluna_id, jsonb_build_object(
      'cidade', ler(d, 'cidade'), 'ramo', ler(d, 'ramo atividade'), 'faturamento', fat,
      'consultor', case when norm_nome(l.aba) like 'relatorio%' then null else consultor end));
    n_atual := n_atual + 1;

    -- Engajamento da aba do Hiago vira saude estruturada.
    eng := norm_nome(ler(d, '_3'));
    if norm_nome(l.aba) like 'hiago%' and eng is not null then
      update aluna set saude = coalesce(saude, case
        when eng like 'engajada%' then 'engajada'
        when eng like 'nao e engajada%' then 'oscilante'
        when eng like 'cancelado%' then 'risco_saida' end) where id = a.aluna_id;
      if eng like 'inadimpl%' then
        update contrato set status_financeiro = 'inadimplente'
        where aluna_id = a.aluna_id and status not in ('cancelado','encerrado');
      end if;
    end if;

    -- Agenda: so datas de verdade. "nov/260", "ABRIL ok", "Trancado" ficam
    -- de fora; o consultor marca na tela.
    for i in 0..5 loop
      v := case when i = 0 then ler(d, 'entrada') else ler(d, i || '.consult.') end;
      dtp := ler_data(v);
      if dtp is not null and dtp between date '2024-01-01' and date '2028-12-31' then
        insert into consultoria_agenda (aluna_id, numero, data_prevista)
        values (a.aluna_id, i, dtp)
        on conflict (aluna_id, numero) do update set data_prevista = excluded.data_prevista
          where consultoria_agenda.realizada_em is null;
        n_agenda := n_agenda + 1;
      end if;
    end loop;

    if anotar(a.aluna_id, 'situacao', ler(d, 'situacao aluna', 'situacao negocio aluna', 'situacao moonshot aluna', 'situacao'),
              'planilha consultorias: ' || l.aba) then n_notas := n_notas + 1; end if;
    if anotar(a.aluna_id, 'potencial', ler(d, 'pontenciais', 'potenciais'), 'planilha consultorias: ' || l.aba) then n_notas := n_notas + 1; end if;
  end loop;
  return jsonb_build_object('alunas_atualizadas', n_atual, 'alunas_novas', n_alunas,
                            'datas_de_agenda', n_agenda, 'anotacoes', n_notas);
end $$;

-- Cancelamentos Atual: cada pedido vira card no funil de Retencao, na etapa
-- do status da planilha. Pedido ja resolvido entra fechado, para a taxa de
-- retencao do sistema nascer com o historico.
create or replace function importar_cancelamentos(p_imp bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  l record; d jsonb; a record; v_nome text; st text; et int; motivo_txt text; chave text;
  dentro7 boolean; proposta text; aberto bigint; n_cards int := 0; n_alunas int := 0; ignoradas jsonb := '{}';
  aba_n text; v_dados jsonb;
begin
  for l in select * from importacao_linha where importacao_id = p_imp order by aba, linha loop
    aba_n := norm_nome(l.aba);
    if aba_n ~ 'rodolfo|^pagina' then
      ignoradas := jsonb_set(ignoradas, array[l.aba], to_jsonb(coalesce((ignoradas->>l.aba)::int, 0) + 1));
      continue;
    end if;
    d := l.dados;
    -- Downsell nao tem cabecalho: a posicao manda.
    if aba_n like 'downsell%' then
      d := jsonb_build_object('nome', d->>'_1', 'e-mail', d->>'_2', 'contato', d->>'_3', 'solicitante', d->>'_4',
             'data', d->>'_5', 'prazo', d->>'_6', 'motivo do cancelamento', d->>'_7', 'observacoes', d->>'_8',
             'reponsavel por seguir', d->>'_9', 'resumo final', d->>'_10', 'status', d->>'_11',
             'acessos', d->>'_12', 'tmb', d->>'_13', 'distrato', d->>'_14');
    end if;
    v_nome := ler(d, 'nome', 'nome completo', 'coluna 1', '_1');
    if v_nome is null or norm_nome(v_nome) in ('nome', 'nome completo', 'coluna 1') then continue; end if;
    select * into a from garantir_aluna(p_imp, l.aba, l.linha, v_nome, ler(d, 'e-mail'), ler(d, 'contato'));
    if a.aluna_id is null then continue; end if;
    if a.criada then n_alunas := n_alunas + 1; end if;

    st := norm_nome(coalesce(ler(d, 'status', 'cancelamento', 'status joao'), ''));
    dentro7 := aba_n like '%7 dias%' or norm_nome(coalesce(ler(d, 'prazo'), '')) like '7 dias%';
    proposta := case when aba_n like 'downsell%' then 'Downsell' end;
    et := case
      when st ~ 'revertid|renegociad' then 6
      when aba_n like '%maquina%' and st = 'nao' then 6
      when st ~ 'cancel|reembolso|^sim$' then 7
      when aba_n like '%7 dias%' and st = '' then 7
      when st ~ 'em contato' then case when proposta is not null then 5 else 4 end
      when st ~ 'process|verific|analise' then 3
      else 2 end;
    motivo_txt := ler(d, 'motivo do cancelamento', 'motivo');
    chave := 'cancelamento:' || md5(l.aba || '|' || norm_nome(v_nome) || '|' || coalesce(ler(d, 'data'), ''));
    if exists (select 1 from card where funil_id = 'retencao' and card.dados->>'chave_importacao' = chave) then continue; end if;

    v_dados := jsonb_strip_nulls(jsonb_build_object(
      'importado', true, 'chave_importacao', chave, 'aba', l.aba,
      'prazo', case when dentro7 then 'dentro_7_dias' else 'fora_7_dias' end,
      'data_pedido', ler_data(ler(d, 'data'))::text,
      'solicitante', ler(d, 'solicitante'),
      'responsavel_planilha', ler(d, 'reponsavel por seguir', 'responsavel por seguir'),
      'motivo_texto', motivo_txt, 'observacoes', ler(d, 'observacoes'),
      'resumo', ler(d, 'resumo final', 'resumo'), 'produto', ler(d, 'produto'),
      'forma_pagamento', ler(d, 'forma de pagamento'), 'proposta', proposta,
      'acessos_removidos', ler(d, 'acessos'), 'cancelado_tmb', ler(d, 'tmb'), 'distrato', ler(d, 'distrato'),
      'status_planilha', ler(d, 'status', 'cancelamento')));

    -- Um pedido aberto por aluna: o mais novo atualiza o card que ja existe.
    select id into aberto from card where funil_id = 'retencao' and aluna_id = a.aluna_id and fechado_em is null;
    perform set_config('moonshot.silencio', 'on', true);
    if aberto is not null and et < 6 then
      update card set etapa_id = etapa_de('retencao', et), dados = card.dados || v_dados where id = aberto;
    else
      if aberto is not null then
        update card set etapa_id = etapa_de('retencao', et), dados = card.dados || v_dados,
                        motivo = case when et >= 7 then coalesce(motivo, case when dentro7 then 'Arrependimento (7 dias)' else classificar_motivo(motivo_txt) end) else motivo end
        where id = aberto;
      else
        insert into card (funil_id, etapa_id, aluna_id, titulo, motivo, dados)
        values ('retencao', etapa_de('retencao', et), a.aluna_id, (select nome from aluna where id = a.aluna_id),
                case when et >= 7 then case when dentro7 then 'Arrependimento (7 dias)' else classificar_motivo(motivo_txt) end
                     else classificar_motivo(motivo_txt) end,
                v_dados);
      end if;
    end if;
    perform set_config('moonshot.silencio', 'off', true);
    n_cards := n_cards + 1;

    if et = 7 then
      update contrato set status = 'cancelado'
      where aluna_id = a.aluna_id and status not in ('encerrado','cancelado')
        and (aba_n not like '%maquina%' or produto = 'Máquina de Vendas')
        and (aba_n like '%maquina%' or produto <> 'Máquina de Vendas');
    end if;
    perform completar_aluna(a.aluna_id, jsonb_build_object('email', ler(d, 'e-mail'), 'telefone', ler(d, 'contato')));
  end loop;
  return jsonb_build_object('pedidos', n_cards, 'alunas_novas', n_alunas, 'abas_ignoradas', ignoradas);
end $$;

-- Maquina de Vendas: outro produto. Mesma pessoa pode ter os dois contratos.
create or replace function importar_maquina(p_imp bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare l record; d jsonb; a record; n_cont int := 0; n_alunas int := 0; n_notas int := 0;
begin
  for l in select * from importacao_linha where importacao_id = p_imp order by aba, linha loop
    d := l.dados;
    if mapear_produto(ler(d, 'produto')) <> 'Máquina de Vendas' or ler(d, 'nome') is null then continue; end if;
    select * into a from garantir_aluna(p_imp, l.aba, l.linha, ler(d, 'nome'), ler(d, 'e-mail'), ler(d, 'telefone'));
    if a.aluna_id is null then continue; end if;
    if a.criada then n_alunas := n_alunas + 1; end if;
    insert into contrato (aluna_id, produto, inicio, termino, status, status_financeiro, forma_pagamento, chave)
    values (a.aluna_id, 'Máquina de Vendas', ler_data(ler(d, 'inicio do programa')), ler_data(ler(d, 'termino do programa')),
            coalesce(mapear_status(ler(d, 'status do contrato')), 'ativo'),
            mapear_financeiro(ler(d, 'status financeiro')), ler(d, 'forma de pagamento'),
            'maquina:' || a.aluna_id)
    on conflict (chave) do update set inicio = excluded.inicio, termino = excluded.termino,
      status = excluded.status, status_financeiro = coalesce(excluded.status_financeiro, contrato.status_financeiro),
      forma_pagamento = excluded.forma_pagamento;
    n_cont := n_cont + 1;
    perform completar_aluna(a.aluna_id, jsonb_build_object('email', ler(d, 'e-mail'), 'telefone', ler(d, 'telefone')));
    if anotar(a.aluna_id, 'nota', ler(d, 'observacoes'), 'planilha maquina de vendas') then n_notas := n_notas + 1; end if;
    if anotar(a.aluna_id, 'nota', ler(d, 'motivo do cancelamento'), 'planilha maquina de vendas (motivo do cancelamento)') then n_notas := n_notas + 1; end if;
  end loop;
  return jsonb_build_object('contratos', n_cont, 'alunas_novas', n_alunas, 'anotacoes', n_notas);
end $$;

-- Inadimplentes por consultor: linhas "Consultor X" abrem o bloco; abaixo,
-- numero e nome. Quem esta na lista fica inadimplente no contrato vivo.
create or replace function importar_inadimplentes(p_imp bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare l record; d jsonb; r record; consultor text; nome text; n_marc int := 0; n_sem int := 0;
begin
  for l in select * from importacao_linha where importacao_id = p_imp order by aba, linha loop
    d := l.dados;
    if norm_nome(coalesce(d->>'_1', '')) like 'consultor %' then
      consultor := trim(regexp_replace(d->>'_1', '(?i)^consultor\s*', '')); continue;
    end if;
    nome := coalesce(ler(d, '_2'), case when coalesce(d->>'_1', '') !~ '^\d' then ler(d, '_1') end);
    if nome is null then continue; end if;
    -- "Fulana / Ciclana" sao socias: a primeira e quem tem o contrato.
    select * into r from achar_aluna(split_part(nome, '/', 1), null, null);
    if r.aluna_id is null then
      insert into importacao_pendencia (importacao_id, aba, linha, nome, motivo, candidatos)
      values (p_imp, l.aba, l.linha, nome, case when r.metodo = 'ambiguo' then 'Nome parecido com mais de uma aluna'
                                               else 'Aluna não encontrada no sistema' end, r.candidatos);
      n_sem := n_sem + 1; continue;
    end if;
    update contrato set status_financeiro = 'inadimplente'
    where aluna_id = r.aluna_id and status not in ('cancelado','encerrado');
    if not found then
      insert into contrato (aluna_id, produto, status, status_financeiro, chave)
      select r.aluna_id, coalesce(produto, 'Moonshot Club'), status_contrato, 'inadimplente', 'inadimplente:' || r.aluna_id
      from aluna where id = r.aluna_id
      on conflict (chave) do update set status_financeiro = 'inadimplente';
    end if;
    perform completar_aluna(r.aluna_id, jsonb_build_object('consultor_se_vazio', consultor));
    n_marc := n_marc + 1;
  end loop;
  return jsonb_build_object('marcadas_inadimplentes', n_marc, 'nao_encontradas', n_sem);
end $$;

-- EVENTO MOONSHOT: cada aba e um evento ("1/10" -> 01/10 do ano da importacao).
create or replace function importar_evento(p_imp bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  l record; d jsonb; r record; v_aluna bigint; ev bigint; v_nome text; v_tipo text; pot text; fat text; m text[]; dt date;
  n_ev int := 0; n_part int := 0; arquivo text;
begin
  select i.arquivo into arquivo from importacao i where i.id = p_imp;
  for l in select * from importacao_linha where importacao_id = p_imp order by aba, linha loop
    d := l.dados;
    v_nome := ler(d, 'aluna', 'nome');
    if v_nome is null or norm_nome(v_nome) in ('aluna', 'nome') then continue; end if;
    m := regexp_match(l.aba, '(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?');
    dt := case when m is not null then make_date(coalesce(nullif(m[3], '')::int, extract(year from now())::int), m[2]::int, m[1]::int) end;
    insert into evento (nome, data) values (coalesce(nullif(regexp_replace(arquivo, '\.xlsx$', ''), ''), 'Evento') || ' — ' || l.aba, dt)
    on conflict (nome, data) do nothing;
    select id into ev from evento where evento.nome = coalesce(nullif(regexp_replace(arquivo, '\.xlsx$', ''), ''), 'Evento') || ' — ' || l.aba
      and data is not distinct from dt;
    if not exists (select 1 from evento_participante where evento_id = ev) then n_ev := n_ev + 1; end if;

    v_tipo := case when norm_nome(v_nome) ~ '\((socia|socio|esposo|esposa|marido|irma)' then 'socio'
                 when norm_nome(v_nome) ~ 'convidad' then 'convidado' else 'aluna' end;
    -- Na aba 30/10 as colunas de potencial e faturamento estao trocadas.
    pot := ler(d, 'potencial'); fat := ler(d, 'faturamento');
    if ler_valor(pot) is not null and fat ~* '^\s*(alto|medio|médio|baixo)' then
      pot := ler(d, 'faturamento'); fat := ler(d, 'potencial');
    end if;
    v_aluna := null;
    if v_tipo = 'aluna' then select (achar_aluna(v_nome, null, ler(d, 'contato'))).aluna_id into v_aluna; end if;
    insert into evento_participante (evento_id, aluna_id, nome, contato, tipo, confirmado,
                                     programa_informado, faturamento_informado, potencial, potencial_obs)
    values (ev, v_aluna, trim(regexp_replace(v_nome, '\s+', ' ', 'g')), ler(d, 'contato'), v_tipo,
            case when norm_nome(coalesce(ler(d, 'confirmacao'), '')) like 'sim%' then true
                 when norm_nome(coalesce(ler(d, 'confirmacao'), '')) like 'nao%' then false end,
            ler(d, 'programa atual'), fat,
            case when norm_nome(coalesce(pot, '')) like 'alto%' then 'alto'
                 when norm_nome(coalesce(pot, '')) like 'medio%' then 'medio'
                 when norm_nome(coalesce(pot, '')) like 'baixo%' then 'baixo' end,
            pot)
    on conflict (evento_id, nome_norm) do update set
      aluna_id = coalesce(excluded.aluna_id, evento_participante.aluna_id), contato = excluded.contato,
      confirmado = excluded.confirmado, programa_informado = excluded.programa_informado,
      faturamento_informado = excluded.faturamento_informado, potencial = excluded.potencial,
      potencial_obs = excluded.potencial_obs;
    n_part := n_part + 1;
    if v_aluna is not null and ler_valor(fat) is not null then
      update aluna set faturamento_mensal = coalesce(faturamento_mensal, ler_valor(fat)) where id = v_aluna;
    end if;
  end loop;
  return jsonb_build_object('eventos', n_ev, 'participantes', n_part);
end $$;

-- Pijamas e jaquetas: tamanho do kit e o que mais a aba sabe da aluna.
create or replace function importar_kit(p_imp bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare l record; d jsonb; a record; n int := 0; n_alunas int := 0; pij text;
begin
  for l in select * from importacao_linha where importacao_id = p_imp and norm_nome(aba) in ('pagina1', 'pijamas')
           order by aba, linha loop
    d := l.dados;
    if norm_nome(l.aba) = 'pijamas' then
      select * into a from garantir_aluna(p_imp, l.aba, l.linha, ler(d, '_1'), null, null);
      pij := ler(d, '_2');
    else
      select * into a from garantir_aluna(p_imp, l.aba, l.linha, ler(d, '_3'), ler(d, '_4'), ler(d, '_7'));
      pij := ler(d, '_5');
    end if;
    if a.aluna_id is null then continue; end if;
    if a.criada then n_alunas := n_alunas + 1; end if;
    if upper(coalesce(pij, '')) !~ '^(PP|P|M|G|GG|GGG|XG|XXG)$' then pij := null; end if;
    perform completar_aluna(a.aluna_id, jsonb_build_object(
      'pijama', upper(pij), 'jaqueta', ler(d, '_6'),
      'email', case when norm_nome(l.aba) = 'pagina1' then ler(d, '_4') end,
      'telefone', case when norm_nome(l.aba) = 'pagina1' then ler(d, '_7') end,
      'ramo', case when norm_nome(l.aba) = 'pagina1' then ler(d, '_8') end,
      'cidade', case when norm_nome(l.aba) = 'pagina1' then ler(d, '_9') end));
    n := n + 1;
  end loop;
  return jsonb_build_object('alunas_com_kit', n, 'alunas_novas', n_alunas);
end $$;

-- Cadastro de novo membro: quem preencheu, com consultor e CS.
create or replace function importar_cadastro(p_imp bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare l record; d jsonb; a record; n int := 0; n_alunas int := 0;
begin
  for l in select * from importacao_linha where importacao_id = p_imp order by aba, linha loop
    d := l.dados;
    if ler(d, 'aluna') is null or norm_nome(ler(d, 'aluna')) = 'aluna' then continue; end if;
    select * into a from garantir_aluna(p_imp, l.aba, l.linha, ler(d, 'aluna'), ler(d, 'e-mail'), ler(d, 'contato'));
    if a.aluna_id is null then continue; end if;
    if a.criada then n_alunas := n_alunas + 1; end if;
    perform completar_aluna(a.aluna_id, jsonb_build_object(
      'email', ler(d, 'e-mail'), 'telefone', ler(d, 'contato'),
      -- A coluna sem titulo e quem fez o cadastro, nao necessariamente a CS
      -- responsavel da matricula: so preenche se a ficha nao tiver.
      'consultor_se_vazio', ler(d, 'consultor estrategico'), 'cs_se_vazio', ler(d, 'column 2', '_5'),
      'notion', ler(d, 'link notion'), 'cadastro', true));
    n := n + 1;
  end loop;
  return jsonb_build_object('cadastros', n, 'alunas_novas', n_alunas);
end $$;

create or replace function processar_importacao(p_imp bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t text; r jsonb; antes int;
begin
  if auth.uid() is not null and not eh_coordenador() then
    raise exception 'so a coordenacao importa planilhas';
  end if;
  select tipo into t from importacao where id = p_imp;
  select count(*) into antes from aluna;
  r := case t
    when 'matriculas'    then importar_matriculas(p_imp)
    when 'consultorias'  then importar_consultorias(p_imp)
    when 'cancelamentos' then importar_cancelamentos(p_imp)
    when 'maquina'       then importar_maquina(p_imp)
    when 'inadimplentes' then importar_inadimplentes(p_imp)
    when 'evento'        then importar_evento(p_imp)
    when 'kit'           then importar_kit(p_imp)
    when 'cadastro'      then importar_cadastro(p_imp)
  end;
  r := r || jsonb_build_object('pendencias', (select count(*) from importacao_pendencia where importacao_id = p_imp));
  update importacao set status = 'processada', resumo = r where id = p_imp;
  -- Carteiras: consultor e CS da planilha viram perfil, se ja existir quem bata.
  perform vincular_equipe();
  return r;
end $$;

-- vincular_equipe passa a ligar a CS tambem. perfil.consultor_norm guarda
-- como a pessoa aparece nas planilhas, para qualquer papel, e aceita varios
-- nomes separados por virgula: "Thiago, Tiago", "Daniela, Dani". E o de-para
-- de apelidos (CONSULTOR_ALIAS do moonshot/db.py), agora editavel na tela.
create or replace function nomes_planilha(t text) returns text[]
language sql immutable as $$
  select array(select norm_nome(regexp_replace(x, '(?i)\s+gera(l|is)$', ''))
               from unnest(string_to_array(coalesce(t, ''), ',')) x where trim(x) <> '')
$$;

create or replace function vincular_equipe() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_alunas int; n_cs int; n_cards int;
begin
  if auth.uid() is not null and not eh_coordenador() then
    raise exception 'so a coordenacao vincula carteiras';
  end if;
  perform set_config('moonshot.silencio', 'on', true);
  update aluna a set consultor_id = p.id
  from perfil p
  where a.consultor_id is null and p.consultor_norm is not null and p.papel in ('consultor','coordenador')
    and norm_nome(regexp_replace(a.consultor_planilha, '(?i)\s+gera(l|is)$', '')) = any(nomes_planilha(p.consultor_norm));
  get diagnostics n_alunas = row_count;
  update aluna a set cs_id = p.id
  from perfil p
  where a.cs_id is null and p.consultor_norm is not null and p.papel in ('cs','coordenador')
    and norm_nome(a.cs_planilha) = any(nomes_planilha(p.consultor_norm));
  get diagnostics n_cs = row_count;
  update card c set responsavel_id = case when c.funil_id in ('onboarding','renovacao') then coalesce(a.cs_id, a.consultor_id)
                                          else a.consultor_id end
  from aluna a
  where c.aluna_id = a.id and c.responsavel_id is null
    and c.funil_id in ('consultoria', 'oportunidades', 'onboarding', 'renovacao')
    and coalesce(a.consultor_id, a.cs_id) is not null;
  get diagnostics n_cards = row_count;
  perform set_config('moonshot.silencio', 'off', true);
  return jsonb_build_object('alunas_vinculadas', n_alunas, 'cs_vinculadas', n_cs, 'cards_atribuidos', n_cards);
end $$;

-- ---------------------------------------------------------------------------
-- Visoes de acompanhamento
-- ---------------------------------------------------------------------------
-- Nomes de consultor e CS que as planilhas trouxeram, e se ja tem dono na
-- equipe. E o que a coordenacao precisa para preencher "nome na planilha".
create or replace view vw_nomes_planilha with (security_invoker = true) as
select 'consultor' as papel, norm_nome(regexp_replace(consultor_planilha, '(?i)\s+gera(l|is)$', '')) as nome_norm,
       min(consultor_planilha) as exemplo, count(*) as alunas,
       count(*) filter (where consultor_id is not null) as vinculadas
from aluna where consultor_planilha is not null group by 2
union all
select 'cs', norm_nome(cs_planilha), min(cs_planilha), count(*), count(*) filter (where cs_id is not null)
from aluna where cs_planilha is not null group by 2;

create or replace view vw_agenda_proxima with (security_invoker = true) as
select g.id, g.aluna_id, a.nome, g.numero, g.data_prevista, a.consultor_id,
       coalesce(p.nome, a.consultor_planilha) as consultor,
       g.data_prevista < current_date as atrasada
from consultoria_agenda g
join aluna a on a.id = g.aluna_id and a.status_contrato not in ('cancelado','encerrado')
left join perfil p on p.id = a.consultor_id
where g.realizada_em is null and g.data_prevista is not null
  and g.data_prevista <= current_date + 14;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table contrato             enable row level security;
alter table consultoria_agenda   enable row level security;
alter table nota_aluna           enable row level security;
alter table evento               enable row level security;
alter table evento_participante  enable row level security;
alter table importacao           enable row level security;
alter table importacao_linha     enable row level security;
alter table importacao_pendencia enable row level security;

do $$
declare p text[];
begin
  -- (tabela, politica, comando)
  foreach p slice 1 in array array[
    ['contrato', 'contrato_ler', 'create policy contrato_ler on contrato for select to authenticated using (ativo())'],
    ['contrato', 'contrato_mudar', 'create policy contrato_mudar on contrato for all to authenticated using (meu_papel() in (''coordenador'',''cs'')) with check (meu_papel() in (''coordenador'',''cs''))'],
    ['consultoria_agenda', 'agenda_ler', 'create policy agenda_ler on consultoria_agenda for select to authenticated using (eh_coordenador() or meu_papel() = ''cs'' or atende_aluna(aluna_id))'],
    ['consultoria_agenda', 'agenda_mudar', 'create policy agenda_mudar on consultoria_agenda for all to authenticated using (eh_coordenador() or meu_papel() = ''cs'' or atende_aluna(aluna_id)) with check (eh_coordenador() or meu_papel() = ''cs'' or atende_aluna(aluna_id))'],
    ['nota_aluna', 'nota_ler', 'create policy nota_ler on nota_aluna for select to authenticated using (eh_coordenador() or autor_id = auth.uid() or atende_aluna(aluna_id))'],
    ['nota_aluna', 'nota_criar', 'create policy nota_criar on nota_aluna for insert to authenticated with check (autor_id = auth.uid() and (eh_coordenador() or atende_aluna(aluna_id) or meu_papel() in (''cs'',''retencao'')))'],
    ['evento', 'evento_ler', 'create policy evento_ler on evento for select to authenticated using (ativo())'],
    ['evento', 'evento_mudar', 'create policy evento_mudar on evento for all to authenticated using (meu_papel() in (''coordenador'',''cs'',''comercial'')) with check (meu_papel() in (''coordenador'',''cs'',''comercial''))'],
    ['evento_participante', 'part_ler', 'create policy part_ler on evento_participante for select to authenticated using (ativo())'],
    ['evento_participante', 'part_mudar', 'create policy part_mudar on evento_participante for all to authenticated using (ativo()) with check (ativo())'],
    ['importacao', 'imp_coord', 'create policy imp_coord on importacao for all to authenticated using (eh_coordenador()) with check (eh_coordenador())'],
    ['importacao_linha', 'implinha_coord', 'create policy implinha_coord on importacao_linha for all to authenticated using (eh_coordenador()) with check (eh_coordenador())'],
    ['importacao_pendencia', 'imppend_coord', 'create policy imppend_coord on importacao_pendencia for all to authenticated using (eh_coordenador()) with check (eh_coordenador())']
  ] loop
    if not exists (select 1 from pg_policies where tablename = p[1] and policyname = p[2]) then
      execute p[3];
    end if;
  end loop;
end $$;

grant select, insert, update, delete on contrato, consultoria_agenda, nota_aluna, evento, evento_participante,
  importacao, importacao_linha, importacao_pendencia to authenticated;
grant select on vw_inadimplentes, vw_agenda_proxima, vw_nomes_planilha to authenticated;

-- Funcoes internas fora da API (ver sistema.sql).
revoke execute on function sincronizar_aluna(bigint) from public, anon, authenticated;
revoke execute on function contrato_depois() from public, anon, authenticated;
revoke execute on function consultoria_agenda_baixa() from public, anon, authenticated;
revoke execute on function garantir_aluna(bigint, text, integer, text, text, text) from public, anon, authenticated;
revoke execute on function completar_aluna(bigint, jsonb) from public, anon, authenticated;
revoke execute on function anotar(bigint, text, text, text) from public, anon, authenticated;
revoke execute on function importar_matriculas(bigint) from public, anon, authenticated;
revoke execute on function importar_consultorias(bigint) from public, anon, authenticated;
revoke execute on function importar_cancelamentos(bigint) from public, anon, authenticated;
revoke execute on function importar_maquina(bigint) from public, anon, authenticated;
revoke execute on function importar_inadimplentes(bigint) from public, anon, authenticated;
revoke execute on function importar_evento(bigint) from public, anon, authenticated;
revoke execute on function importar_kit(bigint) from public, anon, authenticated;
revoke execute on function importar_cadastro(bigint) from public, anon, authenticated;
revoke execute on function processar_importacao(bigint) from public, anon;
grant execute on function processar_importacao(bigint) to authenticated;
revoke execute on function achar_aluna(text, text, text) from public, anon;
revoke execute on function unir_alunas(bigint, bigint) from public, anon;
grant execute on function unir_alunas(bigint, bigint) to authenticated;
grant execute on function achar_aluna(text, text, text) to authenticated;

-- Funcoes auxiliares com search_path fixo (alerta do Supabase).
alter function contrato_antes() set search_path = public;
alter function ler(jsonb, text[]) set search_path = public;
alter function ler_data(text) set search_path = public;
alter function ler_valor(text) set search_path = public;
alter function mapear_status(text) set search_path = public;
alter function mapear_financeiro(text) set search_path = public;
alter function mapear_produto(text, text) set search_path = public;
alter function classificar_motivo(text) set search_path = public;
alter function chave_nome(text) set search_path = public;
alter function limpar_nome(text) set search_path = public;
alter function eh_nome_de_pessoa(text) set search_path = public;
alter function nomes_planilha(text) set search_path = public;
