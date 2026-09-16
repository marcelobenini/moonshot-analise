-- Esquema Moonshot no Postgres (Supabase).
--
-- Traducao do SQLite local, com tres diferencas deliberadas:
--
-- 1. Tipos de verdade. No SQLite tudo era TEXT; aqui data e `date`, dinheiro e
--    `numeric` e o JSON bruto e `jsonb`, que da para consultar por dentro.
-- 2. CPF sai da tabela que se exporta. Ele fica so em `registro.dados`, no
--    bruto, porque nao serve para contato e nao precisa estar numa tabela que
--    alguem abre para trabalhar lista.
-- 3. RLS ligada em tudo. O Supabase liga por padrao e a tabela fica invisivel
--    ate existir politica. Isso e recurso, nao obstaculo: esta base tem nome,
--    telefone, faturamento e relato sobre inadimplencia e processo judicial.
--    As politicas do fim do arquivo liberam para usuario autenticado; ajuste
--    para o que a NB precisa antes de colocar gente dentro.

create table if not exists fonte (
    id           bigint generated always as identity primary key,
    arquivo      text        not null,
    sha256       text        not null unique,
    tipo         text        not null,
    ingerido_em  timestamptz not null default now(),
    linhas       integer,
    observacao   text
);
comment on table fonte is
  'Cada arquivo ingerido. O sha256 faz reingestao do mesmo arquivo ser no-op '
  'e faz versao nova do mesmo relatorio virar linha nova, preservando a anterior.';

create table if not exists pessoa (
    id            bigint generated always as identity primary key,
    nome_canonico text not null,
    criado_em     timestamptz not null default now(),
    fonte_origem  bigint references fonte(id)
);

-- Toda grafia ja vista de um nome aponta para a mesma pessoa. E o que impede
-- 'Elizabeth Lima' e 'Elisabete LIma' de virarem duas alunas na proxima planilha.
create table if not exists alias (
    nome_norm  text primary key,
    pessoa_id  bigint not null references pessoa(id) on delete cascade,
    nome_visto text not null,
    fonte_id   bigint references fonte(id),
    metodo     text,
    confianca  real,
    criado_em  timestamptz not null default now()
);
create index if not exists ix_alias_pessoa on alias(pessoa_id);

-- Linha crua, sem interpretacao. A rede de seguranca: se amanha eu entender
-- melhor uma coluna que hoje ignoro, o dado ainda esta aqui.
create table if not exists registro (
    id        bigint generated always as identity primary key,
    fonte_id  bigint not null references fonte(id) on delete cascade,
    aba       text,
    linha     integer,
    pessoa_id bigint references pessoa(id),
    dados     jsonb not null
);
create index if not exists ix_reg_fonte  on registro(fonte_id);
create index if not exists ix_reg_pessoa on registro(pessoa_id);
create index if not exists ix_reg_dados  on registro using gin (dados);

create table if not exists fato_matricula (
    id                bigint generated always as identity primary key,
    fonte_id          bigint not null references fonte(id) on delete cascade,
    pessoa_id         bigint references pessoa(id),
    turma             text,
    produto           text,
    periodo           text,
    consultor         text,
    consultor_norm    text,
    status            text,
    status_financeiro text,
    status_contrato   text,
    telefone          text,
    email             text,
    inicio            date,
    termino           date
);
create index if not exists ix_mat_pessoa on fato_matricula(pessoa_id);
create index if not exists ix_mat_term   on fato_matricula(termino);

create table if not exists fato_consultoria (
    id             bigint generated always as identity primary key,
    fonte_id       bigint not null references fonte(id) on delete cascade,
    pessoa_id      bigint references pessoa(id),
    consultor      text,
    consultor_norm text,
    aba            text,
    programa       text,
    entrada        date,
    consultorias   integer,
    situacao       text,
    cidade         text,
    ramo           text,
    fat_mes        numeric(14,2),
    fat_ano        numeric(14,2)
);
create index if not exists ix_con_pessoa on fato_consultoria(pessoa_id);

create table if not exists fato_cancelamento (
    id          bigint generated always as identity primary key,
    fonte_id    bigint not null references fonte(id) on delete cascade,
    pessoa_id   bigint references pessoa(id),
    aba         text,
    solicitante text,
    data_pedido date,
    prazo       text,
    motivo      text,
    observacoes text,
    desfecho    text,
    email       text,
    contato     text
);
create index if not exists ix_can_pessoa   on fato_cancelamento(pessoa_id);
create index if not exists ix_can_desfecho on fato_cancelamento(desfecho);

create table if not exists fato_formulario (
    id            bigint generated always as identity primary key,
    fonte_id      bigint not null references fonte(id) on delete cascade,
    pessoa_id     bigint references pessoa(id),
    origem        text,
    empresa       text,
    -- Faturamento ja parseado na ingestao. Deixar so no `respostas` em bruto
    -- obrigava reparsear texto livre a cada consulta, e na pratica significava
    -- nao usar: 21 alunas ficavam de fora de upsell e reconquista por isso.
    fat_declarado numeric(14,2),
    fat_confianca text,
    respostas     jsonb
);
comment on column fato_formulario.fat_declarado is
  'Faturamento mensal em BRL lido do texto livre. So entra com confianca alta, media ou inferida_milhar; faixa ambigua e valor implausivel ficam so no bruto.';
create index if not exists ix_for_pessoa on fato_formulario(pessoa_id);

-- Casamentos que passaram perto do corte. Existem para serem conferidos por
-- gente, nao para sumirem dentro de uma media.
create table if not exists revisao_identidade (
    id         bigint generated always as identity primary key,
    fonte_id   bigint references fonte(id) on delete cascade,
    nome_novo  text not null,
    pessoa_id  bigint references pessoa(id),
    nome_atual text,
    confianca  real,
    decidido   boolean not null default false,
    criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Visoes: o cruzamento que o banco existe para permitir, ja pronto.
-- ---------------------------------------------------------------------------
create or replace view vw_pessoa_completa as
select p.id, p.nome_canonico,
  (select count(*) from alias a where a.pessoa_id = p.id)             as grafias,
  (select count(*) from fato_matricula m where m.pessoa_id = p.id)    as matriculas,
  (select count(*) from fato_consultoria c where c.pessoa_id = p.id)  as consultorias,
  (select count(*) from fato_formulario f where f.pessoa_id = p.id)   as formularios,
  (select count(*) from fato_cancelamento k where k.pessoa_id = p.id) as pedidos_de_saida,
  (select m.status from fato_matricula m where m.pessoa_id = p.id
     order by m.id desc limit 1)                                      as status_recente,
  (select m.telefone from fato_matricula m where m.pessoa_id = p.id
     and m.telefone is not null order by m.id desc limit 1)           as telefone,
  (select m.email from fato_matricula m where m.pessoa_id = p.id
     and m.email is not null order by m.id desc limit 1)              as email,
  (select m.consultor_norm from fato_matricula m where m.pessoa_id = p.id
     and m.consultor_norm is not null order by m.id desc limit 1)     as consultor_matricula,
  (select c.consultor_norm from fato_consultoria c where c.pessoa_id = p.id
     and c.consultor_norm is not null order by c.id desc limit 1)     as consultor_aba,
  (select c.fat_mes from fato_consultoria c where c.pessoa_id = p.id
     and c.fat_mes is not null and c.fat_mes > 0
     order by c.id desc limit 1)                                      as fat_mes_consultor,
  (select max(m.termino) from fato_matricula m where m.pessoa_id = p.id) as termino_recente,
  (select k.desfecho from fato_cancelamento k where k.pessoa_id = p.id
     order by k.id desc limit 1)                                      as desfecho_pedido
from pessoa p;

-- Onde as duas planilhas discordam sobre quem atende quem. Foi o erro que
-- inflou a carteira da Carol de 7 para 13.
create or replace view vw_divergencia_consultor as
select id, nome_canonico, consultor_matricula, consultor_aba
from vw_pessoa_completa
where consultor_matricula is not null and consultor_aba is not null
  and consultor_matricula <> consultor_aba;

-- Retencao: quem pediu para sair e ficou, contra quem pediu e foi.
-- A aba de 7 dias fica de fora: e direito de arrependimento do CDC, nao
-- retencao, e contando junto a taxa cai de 64% para 52%.
create or replace view vw_retencao as
select desfecho, count(*) as pedidos,
       count(*) filter (where motivo is not null) as com_motivo
from fato_cancelamento
where aba not ilike '%7 dias%'
group by desfecho;

-- ---------------------------------------------------------------------------
-- RLS. Sem politica, a tabela fica invisivel — inclusive para voce.
-- Estas liberam para usuario autenticado. Aperte antes de dar acesso ao time.
-- ---------------------------------------------------------------------------
alter table fonte              enable row level security;
alter table pessoa             enable row level security;
alter table alias              enable row level security;
alter table registro           enable row level security;
alter table fato_matricula     enable row level security;
alter table fato_consultoria   enable row level security;
alter table fato_cancelamento  enable row level security;
alter table fato_formulario    enable row level security;
alter table revisao_identidade enable row level security;

-- A role `authenticated` e criada pelo Supabase e nao existe num Postgres
-- comum. Sem o teste, este bloco derruba a criacao do esquema inteiro em
-- qualquer ambiente que nao seja o Supabase — inclusive num Postgres local
-- de teste, que e onde se descobre o erro antes de ele custar caro.
do $$
declare
  t text;
  alvo text;
begin
  select case when exists (select 1 from pg_roles where rolname = 'authenticated')
              then 'authenticated' else null end into alvo;
  if alvo is null then
    raise notice 'role "authenticated" ausente: RLS fica ligada e sem politica. '
                 'No Supabase ela existe; aqui as tabelas ficam invisiveis ate '
                 'voce criar a politica que quiser.';
    return;
  end if;
  foreach t in array array['fonte','pessoa','alias','registro','fato_matricula',
                           'fato_consultoria','fato_cancelamento','fato_formulario',
                           'revisao_identidade']
  loop
    execute format('drop policy if exists %I on %I', 'ler_' || t, t);
    execute format('create policy %I on %I for select to %I using (true)',
                   'ler_' || t, t, alvo);
  end loop;
end $$;
