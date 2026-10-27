-- Sistema operacional Moonshot: o que substitui as planilhas.
-- Aplicar DEPOIS de schema.sql (e de potencial.sql, se for usar).
--
-- Ate aqui o banco era derivado: planilha entrava, banco espelhava. A partir
-- deste arquivo o time registra direto no sistema, e as tabelas abaixo passam a
-- ser a verdade. As tabelas de ingestao (pessoa, fato_*) continuam existindo
-- como historico e como origem da importacao inicial.
--
-- Quatro decisoes de desenho:
--
-- 1. Nenhuma FK para `pessoa`. `carregar.py --recarregar` faz TRUNCATE ...
--    CASCADE em `pessoa`, e uma FK daqui faria a recarga da base historica
--    apagar o trabalho do time. `aluna.pessoa_id` e so a referencia de origem.
-- 2. Funil, etapa e automacao sao DADO. A etapa diz qual gatilho dispara ao
--    entrar nela (`gatilho`) e quantos dias parada vira alerta (`alerta_dias`).
--    Mudar o processo e editar linha, nao codigo.
-- 3. Permissao mora no banco (RLS), nao na tela. O app e so uma janela; quem
--    abrir o console do navegador ve exatamente o que a politica permite.
-- 4. Relato de consultor e observacao de cancelamento sao dado sensivel
--    (inadimplencia, processo judicial). Ficam em tabela propria, visivel so
--    para quem atende a aluna e para a coordenacao.

-- ---------------------------------------------------------------------------
-- Ambiente fora do Supabase (teste local): cria o minimo de `auth` para o
-- arquivo rodar igual. No Supabase tudo isto ja existe e o bloco nao faz nada.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    execute 'create schema auth';
    execute 'create table auth.users (id uuid primary key, email text,
               raw_user_meta_data jsonb default ''{}''::jsonb, encrypted_password text)';
    -- Mesma definicao do Supabase: aceita o claim avulso e o JSON do PostgREST.
    execute $f$create function auth.uid() returns uuid language sql stable as
      $b$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $b$ $f$;
    execute 'grant usage on schema auth to authenticated, anon';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Utilitarios
-- ---------------------------------------------------------------------------

-- Mesma ideia do casamento de nomes do banco.py: caixa, acento e espaco nao
-- fazem duas pessoas diferentes.
create or replace function norm_nome(t text) returns text
language sql immutable as $$
  select nullif(trim(regexp_replace(lower(translate(coalesce(t, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g')), '')
$$;

-- Ultimos 8 digitos: casa o mesmo celular com e sem DDD, com e sem o nono digito.
create or replace function norm_fone(t text) returns text
language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(t, ''), '\D', '', 'g'), 8), '')
$$;

create table if not exists parametro (
    chave      text primary key,
    valor      numeric not null,
    unidade    text,
    descricao  text not null,
    atualizado timestamptz not null default now()
);
insert into parametro (chave, valor, unidade, descricao) values
  ('dias_renovacao', 120, 'dias',
   'Antecedencia com que o card de renovacao nasce antes do termino do contrato. Sugerido na especificacao, nao testado.'),
  ('dias_sem_consultoria', 90, 'dias',
   'Sem consultoria registrada ha mais que isto, consultor e coordenacao recebem alerta.'),
  ('corte_oportunidade', 80000, 'R$/mes',
   'Faturamento a partir do qual aluna engajada vira sugestao de oportunidade. Premissa, nao medida.')
on conflict (chave) do nothing;

create or replace function param(c text) returns numeric
language sql stable security definer set search_path = public as $$
  select valor from parametro where chave = c
$$;

-- ---------------------------------------------------------------------------
-- Equipe
-- ---------------------------------------------------------------------------
create table if not exists perfil (
    id             uuid primary key references auth.users(id) on delete cascade,
    nome           text not null,
    email          text,
    papel          text check (papel in ('coordenador','cs','consultor','comercial','retencao')),
    ativo          boolean not null default false,
    -- Como o nome aparece nas planilhas ("carol", "ana paula"). E a ponte para
    -- a importacao atribuir a carteira certa.
    consultor_norm text,
    criado_em      timestamptz not null default now()
);
-- Conta criada com senha provisoria: ate trocar, nao ve dado nenhum (ver
-- meu_papel) e o app so mostra a tela de nova senha.
alter table perfil add column if not exists trocar_senha boolean not null default false;
comment on table perfil is
  'Quem usa o sistema. Conta nova nasce inativa e sem papel; a coordenacao libera na tela Equipe.';

-- Conta criada no Supabase Auth vira perfil inativo automaticamente.
create or replace function perfil_novo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfil (id, nome, email)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'nome', ''), split_part(new.email, '@', 1)),
          new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create or replace trigger tg_perfil_novo after insert on auth.users
  for each row execute function perfil_novo();

create or replace function meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from perfil where id = auth.uid() and ativo and not trocar_senha
$$;

-- A marca de senha provisoria so cai quando a senha muda de verdade no Auth.
-- Um botao "ja troquei" no app poderia ser chamado sem trocar nada.
create or replace function senha_alterada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update perfil set trocar_senha = false where id = new.id and trocar_senha;
  return new;
end $$;
create or replace trigger tg_senha_alterada after update of encrypted_password on auth.users
  for each row when (new.encrypted_password is distinct from old.encrypted_password)
  execute function senha_alterada();

create or replace function eh_coordenador() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() = 'coordenador', false)
$$;

create or replace function ativo() returns boolean
language sql stable security definer set search_path = public as $$
  select meu_papel() is not null
$$;

-- Quem nao e coordenador so muda o proprio nome.
create or replace function perfil_protege() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not eh_coordenador()
     and (new.papel is distinct from old.papel or new.ativo is distinct from old.ativo
          or new.consultor_norm is distinct from old.consultor_norm
          or new.email is distinct from old.email
          -- Nem ligar nem desligar: quem tira a marca e o gatilho do Auth
          -- (roda sem usuario logado), ao ver a senha mudar de verdade.
          or new.trocar_senha is distinct from old.trocar_senha) then
    raise exception 'so a coordenacao altera papel, acesso e vinculo de planilha';
  end if;
  return new;
end $$;
create or replace trigger tg_perfil_protege before update on perfil
  for each row execute function perfil_protege();

-- ---------------------------------------------------------------------------
-- Alunas: o contato unico. Uma aluna, um registro, todos os funis apontam aqui.
-- ---------------------------------------------------------------------------
create table if not exists aluna (
    id                 bigint generated always as identity primary key,
    pessoa_id          bigint unique,   -- origem na base historica; sem FK de proposito
    nome               text not null,
    nome_norm          text generated always as (norm_nome(nome)) stored,
    telefone           text,
    email              text,
    empresa            text,
    ramo               text,
    cidade             text,
    uf                 text,
    produto            text,
    turma              text,
    inicio             date,
    termino            date,
    status_contrato    text not null default 'ativo'
                       check (status_contrato in ('ativo','pendente','bloqueado','pausado','em_cancelamento','encerrado','cancelado')),
    status_financeiro  text,
    faturamento_mensal numeric(14,2),
    funcionarios       integer,
    consultor_id       uuid references perfil(id) on delete set null,
    cs_id              uuid references perfil(id) on delete set null,
    -- Nome do consultor como estava na planilha, ate existir perfil para ele.
    consultor_planilha text,
    saude              text check (saude in ('engajada','oscilante','sem_contato','risco_saida','renovou_upsell')),
    ultima_consultoria date,
    tamanho_kit        text,
    criado_por         uuid default auth.uid(),
    criado_em          timestamptz not null default now(),
    atualizado_em      timestamptz not null default now()
);
create index if not exists ix_aluna_nome      on aluna(nome_norm);
create index if not exists ix_aluna_email     on aluna(lower(email));
create index if not exists ix_aluna_fone      on aluna(norm_fone(telefone));
create index if not exists ix_aluna_consultor on aluna(consultor_id);
create index if not exists ix_aluna_cs        on aluna(cs_id);
create index if not exists ix_aluna_termino   on aluna(termino);

create or replace function carteira_minha(a aluna) returns boolean
language sql stable as $$
  select a.consultor_id = auth.uid() or a.cs_id = auth.uid()
$$;

create or replace function atende_aluna(aid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from aluna a where a.id = aid
                 and (a.consultor_id = auth.uid() or a.cs_id = auth.uid()))
$$;

-- Consultor edita a propria carteira, mas nao a redistribui.
create or replace function aluna_protege() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' and auth.uid() is not null
     and meu_papel() not in ('coordenador','cs')
     and (new.consultor_id is distinct from old.consultor_id
          or new.cs_id is distinct from old.cs_id) then
    raise exception 'so coordenacao e CS redistribuem carteira';
  end if;
  return new;
end $$;
create or replace trigger tg_aluna_protege before insert or update on aluna
  for each row execute function aluna_protege();

-- Antes de cadastrar: ja existe? Ordem da especificacao: e-mail, telefone, nome.
create or replace function possiveis_duplicatas(p_nome text, p_email text, p_telefone text)
returns table (id bigint, nome text, email text, telefone text, motivo text)
language sql stable as $$
  select a.id, a.nome, a.email, a.telefone,
         case when p_email is not null and lower(a.email) = lower(trim(p_email)) then 'mesmo e-mail'
              when norm_fone(p_telefone) is not null and norm_fone(a.telefone) = norm_fone(p_telefone) then 'mesmo telefone'
              when a.nome_norm = norm_nome(p_nome) then 'mesmo nome'
              else 'nome parecido' end
  from aluna a
  where (p_email is not null and trim(p_email) <> '' and lower(a.email) = lower(trim(p_email)))
     or (norm_fone(p_telefone) is not null and norm_fone(a.telefone) = norm_fone(p_telefone))
     or a.nome_norm = norm_nome(p_nome)
     or (length(norm_nome(p_nome)) > 5
         and a.nome_norm like split_part(norm_nome(p_nome), ' ', 1) || ' %'
         and a.nome_norm like '% ' || regexp_replace(norm_nome(p_nome), '^.* ', ''))
  limit 10
$$;

-- ---------------------------------------------------------------------------
-- Notificacoes. So nascem por gatilho; ninguem insere na mao.
-- ---------------------------------------------------------------------------
create table if not exists notificacao (
    id         bigint generated always as identity primary key,
    usuario_id uuid not null references perfil(id) on delete cascade,
    tipo       text not null,
    titulo     text not null,
    corpo      text,
    link       text,
    -- Evita a rotina diaria repetir o mesmo alerta todo dia.
    chave      text,
    lida_em    timestamptz,
    criado_em  timestamptz not null default now()
);
create index if not exists ix_notif_usuario on notificacao(usuario_id, lida_em, criado_em desc);
create unique index if not exists ux_notif_chave on notificacao(usuario_id, chave) where chave is not null;

-- A importacao inicial liga `moonshot.silencio` para nao soterrar o time com
-- mil notificacoes de cards que ja existiam na planilha.
drop function if exists notificar(uuid, text, text, text, text, text);
create or replace function notificar(p_usuario uuid, p_tipo text, p_titulo text,
                                     p_corpo text default null, p_link text default null,
                                     p_chave text default null,
                                     -- Sugestao do sistema vale mesmo para quem causou o evento.
                                     p_inclusive_autor boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_usuario is null or (p_usuario = auth.uid() and not p_inclusive_autor)
     or coalesce(current_setting('moonshot.silencio', true), '') = 'on' then
    return;
  end if;
  if not exists (select 1 from perfil where id = p_usuario and ativo) then
    return;
  end if;
  insert into notificacao (usuario_id, tipo, titulo, corpo, link, chave)
  values (p_usuario, p_tipo, p_titulo, p_corpo, p_link, p_chave)
  on conflict (usuario_id, chave) where chave is not null do nothing;
end $$;

create or replace function notificar_papel(p_papel text, p_tipo text, p_titulo text,
                                           p_corpo text default null, p_link text default null,
                                           p_chave text default null)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select id from perfil where papel = p_papel and ativo loop
    perform notificar(u, p_tipo, p_titulo, p_corpo, p_link, p_chave);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Funis (Kanban)
-- ---------------------------------------------------------------------------
create table if not exists funil (
    id            text primary key,
    nome          text not null,
    descricao     text,
    ordem         integer not null,
    papeis_editam text[] not null default '{}',
    papeis_leem   text[] not null default '{}',
    -- Consultor ve so a propria carteira neste funil.
    restringe_carteira boolean not null default true,
    -- Campos proprios do funil: [{"chave","rotulo","tipo","opcoes"}].
    -- tipo: texto | textao | numero | moeda | data | selecao
    campos        jsonb not null default '[]',
    motivos       text[] not null default '{}'
);

create table if not exists etapa (
    id               bigint generated always as identity primary key,
    funil_id         text not null references funil(id) on delete cascade,
    nome             text not null,
    ordem            integer not null,
    tipo             text not null default 'aberta' check (tipo in ('aberta','ganha','perdida')),
    exige_motivo     boolean not null default false,
    alerta_dias      integer,
    alerta_coordenacao boolean not null default false,
    -- Automacao ao entrar na etapa. Ver `card_automacoes`.
    gatilho          text,
    -- Funil de consultoria: numero da consultoria que esta etapa representa.
    marco_consultoria integer,
    unique (funil_id, ordem)
);

create or replace function pode_ver_funil(f text) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_coordenador() or exists (
    select 1 from funil where id = f
      and (meu_papel() = any(papeis_editam) or meu_papel() = any(papeis_leem)))
$$;

create or replace function pode_editar_funil(f text) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_coordenador() or exists (
    select 1 from funil where id = f and meu_papel() = any(papeis_editam))
$$;

create table if not exists card (
    id             bigint generated always as identity primary key,
    funil_id       text not null references funil(id),
    etapa_id       bigint not null references etapa(id),
    aluna_id       bigint references aluna(id) on delete cascade,
    titulo         text not null,
    responsavel_id uuid references perfil(id) on delete set null,
    valor          numeric(14,2),
    prazo          date,
    motivo         text,
    dados          jsonb not null default '{}',
    -- Card que originou este (oportunidade -> comercial, renovacao -> retencao).
    origem_card_id bigint references card(id) on delete set null,
    posicao        double precision not null default extract(epoch from now()),
    criado_por     uuid default auth.uid(),
    criado_em      timestamptz not null default now(),
    atualizado_em  timestamptz not null default now(),
    etapa_desde    timestamptz not null default now(),
    fechado_em     timestamptz
);
create index if not exists ix_card_funil on card(funil_id, etapa_id);
create index if not exists ix_card_aluna on card(aluna_id);
create index if not exists ix_card_resp  on card(responsavel_id);
-- "Um card em cada funil, nunca um cadastro por funil": uma aluna tem no
-- maximo um card aberto por funil. E isso que deixa as automacoes idempotentes.
create unique index if not exists ux_card_aberto on card(funil_id, aluna_id)
  where fechado_em is null and aluna_id is not null;

-- Historico e comentarios do card numa linha do tempo so.
create table if not exists card_evento (
    id         bigint generated always as identity primary key,
    card_id    bigint not null references card(id) on delete cascade,
    tipo       text not null check (tipo in ('criado','moveu','comentario','responsavel','editou')),
    texto      text,
    de_etapa   bigint,
    para_etapa bigint,
    autor_id   uuid default auth.uid(),
    criado_em  timestamptz not null default now()
);
create index if not exists ix_evento_card on card_evento(card_id, criado_em);

create or replace function etapa_de(f text, o integer) returns bigint
language sql stable as $$ select id from etapa where funil_id = f and ordem = o $$;

create or replace function card_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare e etapa;
begin
  select * into e from etapa where id = new.etapa_id;
  if e.funil_id is distinct from new.funil_id then
    raise exception 'etapa % nao pertence ao funil %', new.etapa_id, new.funil_id;
  end if;
  if e.exige_motivo and coalesce(trim(new.motivo), '') = '' then
    raise exception 'a etapa "%" exige motivo', e.nome;
  end if;
  new.atualizado_em := now();
  if tg_op = 'INSERT' or new.etapa_id <> old.etapa_id then
    new.etapa_desde := now();
    new.fechado_em := case when e.tipo = 'aberta' then null else now() end;
  end if;
  return new;
end $$;
create or replace trigger tg_card_antes before insert or update on card
  for each row execute function card_antes();

-- O coracao das automacoes. Cada gatilho e o nome de uma regra da especificacao
-- (entregaveis/funis_uno_crm.md); a etapa diz qual dispara ao entrar nela.
create or replace function card_automacoes(c card, e etapa) returns void
language plpgsql security definer set search_path = public as $$
declare
  a aluna;
  nome_aluna text;
  link text := '/funis/' || c.funil_id || '?card=' || c.id;
  novo bigint;
  origem card;
begin
  select * into a from aluna where id = c.aluna_id;
  nome_aluna := coalesce(a.nome, c.titulo);

  if e.gatilho = 'criar_ciclo_consultor' and a.id is not null then
    insert into card (funil_id, etapa_id, aluna_id, titulo, responsavel_id, origem_card_id)
    select 'consultoria', etapa_de('consultoria', 1), a.id, a.nome, a.consultor_id, c.id
    where not exists (select 1 from card where funil_id = 'consultoria'
                      and aluna_id = a.id and fechado_em is null)
    returning id into novo;
    if novo is not null then
      perform notificar(a.consultor_id, 'carteira', 'Aluna ativada na sua carteira',
                        nome_aluna || ' concluiu o onboarding.', '/funis/consultoria?card=' || novo);
    end if;

  elsif e.gatilho = 'avisar_pedido_saida' then
    perform notificar(a.consultor_id, 'cancelamento', 'Pedido de cancelamento',
                      nome_aluna || ' pediu para sair.', link);
    perform notificar(a.cs_id, 'cancelamento', 'Pedido de cancelamento',
                      nome_aluna || ' pediu para sair.', link);
    perform notificar_papel('retencao', 'cancelamento', 'Novo pedido de cancelamento',
                            nome_aluna, link);

  elsif e.gatilho = 'enviar_comercial' then
    insert into card (funil_id, etapa_id, aluna_id, titulo, valor, dados, origem_card_id)
    select 'comercial', etapa_de('comercial', 1), c.aluna_id, c.titulo, c.valor,
           c.dados || jsonb_build_object('origem', 'consultor',
                                         'consultor_origem', coalesce(c.responsavel_id::text, '')),
           c.id
    where not exists (select 1 from card where funil_id = 'comercial'
                      and aluna_id is not distinct from c.aluna_id and fechado_em is null
                      and c.aluna_id is not null)
    returning id into novo;
    if novo is not null then
      perform notificar_papel('comercial', 'oportunidade', 'Oportunidade recebida',
                              nome_aluna || ' enviada pelo consultor.', '/funis/comercial?card=' || novo);
    end if;

  elsif e.gatilho = 'comercial_ganha' then
    select * into origem from card where id = c.origem_card_id;
    perform notificar(origem.responsavel_id, 'oportunidade', 'Oportunidade ganha',
                      nome_aluna || ' fechou ' || coalesce(c.dados->>'produto', 'contrato') || '.', link);
    if a.id is not null and c.dados->>'produto' is not null then
      update aluna set produto = c.dados->>'produto' where id = a.id;
    end if;
    if origem.id is not null and origem.fechado_em is null then
      update card set etapa_id = (select id from etapa where funil_id = origem.funil_id
                                  and tipo = 'ganha' order by ordem limit 1)
      where id = origem.id
        and exists (select 1 from etapa where funil_id = origem.funil_id and tipo = 'ganha');
    end if;

  elsif e.gatilho = 'comercial_perdida' then
    select * into origem from card where id = c.origem_card_id;
    if origem.id is not null then
      update card set etapa_id = (select id from etapa where funil_id = origem.funil_id
                                  and gatilho = 'devolvida' limit 1),
                      motivo = c.motivo
      where id = origem.id;
      perform notificar(origem.responsavel_id, 'oportunidade', 'Oportunidade devolvida',
                        nome_aluna || ': ' || coalesce(c.motivo, 'sem motivo'),
                        '/funis/' || origem.funil_id || '?card=' || origem.id);
    end if;

  elsif e.gatilho = 'encaminhar_retencao' and a.id is not null then
    perform abrir_retencao(a.id, 'Renovacao sinalizou saida', c.id);

  end if;
end $$;

-- Usado pela renovacao e pelo registro de consultoria com saude em risco.
create or replace function abrir_retencao(p_aluna bigint, p_porque text, p_origem bigint default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare a aluna; novo bigint;
begin
  select * into a from aluna where id = p_aluna;
  insert into card (funil_id, etapa_id, aluna_id, titulo, dados, origem_card_id)
  select 'retencao', etapa_de('retencao', 1), a.id, a.nome,
         jsonb_build_object('sinal', p_porque), p_origem
  where not exists (select 1 from card where funil_id = 'retencao'
                    and aluna_id = a.id and fechado_em is null)
  returning id into novo;
  if novo is not null then
    perform notificar_papel('retencao', 'risco', 'Aluna em risco', a.nome || ': ' || p_porque,
                            '/funis/retencao?card=' || novo);
    perform notificar(a.cs_id, 'risco', 'Aluna em risco', a.nome || ': ' || p_porque,
                      '/funis/retencao?card=' || novo);
  end if;
  return novo;
end $$;

create or replace function card_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare e etapa;
begin
  select * into e from etapa where id = new.etapa_id;
  if tg_op = 'INSERT' then
    insert into card_evento (card_id, tipo, para_etapa, texto)
    values (new.id, 'criado', new.etapa_id, e.nome);
    perform notificar(new.responsavel_id, 'card', 'Card atribuído a você', new.titulo,
                      '/funis/' || new.funil_id || '?card=' || new.id);
    perform card_automacoes(new, e);
    return new;
  end if;

  if new.etapa_id <> old.etapa_id then
    insert into card_evento (card_id, tipo, de_etapa, para_etapa, texto)
    values (new.id, 'moveu', old.etapa_id, new.etapa_id,
            e.nome || case when new.motivo is not null and new.motivo is distinct from old.motivo
                           then '. Motivo: ' || new.motivo else '' end);
    perform notificar(new.responsavel_id, 'card', new.titulo || ' → ' || e.nome, null,
                      '/funis/' || new.funil_id || '?card=' || new.id);
    perform card_automacoes(new, e);
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    insert into card_evento (card_id, tipo, texto)
    values (new.id, 'responsavel', (select nome from perfil where id = new.responsavel_id));
    perform notificar(new.responsavel_id, 'card', 'Card atribuído a você', new.titulo,
                      '/funis/' || new.funil_id || '?card=' || new.id);
  end if;
  return new;
end $$;
create or replace trigger tg_card_depois after insert or update on card
  for each row execute function card_depois();

-- Comentario no card avisa o responsavel.
create or replace function evento_comentario() returns trigger
language plpgsql security definer set search_path = public as $$
declare c card;
begin
  if new.tipo = 'comentario' then
    select * into c from card where id = new.card_id;
    perform notificar(c.responsavel_id, 'comentario', 'Comentário em ' || c.titulo,
                      left(new.texto, 140), '/funis/' || c.funil_id || '?card=' || c.id);
  end if;
  return new;
end $$;
create or replace trigger tg_evento_comentario after insert on card_evento
  for each row execute function evento_comentario();

-- ---------------------------------------------------------------------------
-- Registro de consultoria: substitui as abas do Controle Consultorias.
-- ---------------------------------------------------------------------------
create table if not exists registro_consultoria (
    id                 bigint generated always as identity primary key,
    aluna_id           bigint not null references aluna(id) on delete cascade,
    consultor_id       uuid references perfil(id) on delete set null default auth.uid(),
    data               date not null default current_date,
    numero             integer check (numero between 0 and 10),  -- 0 = entrada/diagnostico
    realizada          boolean not null default true,
    saude              text not null check (saude in ('engajada','oscilante','sem_contato','risco_saida','renovou_upsell')),
    -- O relato. O campo mais valioso das planilhas, e o mais sensivel.
    situacao           text not null,
    faturamento_mensal numeric(14,2),
    proximo_passo      text,
    criado_em          timestamptz not null default now()
);
create index if not exists ix_regcon_aluna on registro_consultoria(aluna_id, data desc);

create or replace function consultoria_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a aluna;
  ciclo card;
  alvo bigint;
begin
  update aluna set saude = new.saude,
                   faturamento_mensal = coalesce(new.faturamento_mensal, faturamento_mensal),
                   ultima_consultoria = case when new.realizada
                     then greatest(coalesce(ultima_consultoria, new.data), new.data)
                     else ultima_consultoria end
  where id = new.aluna_id
  returning * into a;

  -- O card do ciclo anda sozinho para a etapa da consultoria registrada.
  if new.realizada and new.numero is not null then
    select * into ciclo from card where funil_id = 'consultoria' and aluna_id = a.id
      and fechado_em is null;
    select id into alvo from etapa where funil_id = 'consultoria'
      and marco_consultoria = new.numero;
    if ciclo.id is not null and alvo is not null
       and (select ordem from etapa where id = alvo) > (select ordem from etapa where id = ciclo.etapa_id) then
      update card set etapa_id = alvo where id = ciclo.id;
    end if;
  end if;

  if new.saude in ('risco_saida', 'sem_contato') then
    perform abrir_retencao(a.id, case new.saude when 'risco_saida' then 'Consultor: risco de saída'
                                               else 'Consultor: sem contato' end);
  elsif new.saude in ('engajada', 'renovou_upsell')
        and coalesce(a.faturamento_mensal, 0) >= param('corte_oportunidade')
        and not exists (select 1 from card where funil_id = 'oportunidades'
                        and aluna_id = a.id and fechado_em is null) then
    perform notificar(coalesce(new.consultor_id, a.consultor_id), 'oportunidade',
                      'Sugestão de oportunidade',
                      a.nome || ' está engajada e fatura acima do corte. Vale sinalizar ao comercial?',
                      '/alunas/' || a.id, 'sugestao_op:' || a.id || ':' || to_char(new.data, 'YYYY-MM'), true);
  end if;
  return new;
end $$;
create or replace trigger tg_consultoria_depois after insert on registro_consultoria
  for each row execute function consultoria_depois();

-- ---------------------------------------------------------------------------
-- Demandas: comunicacao interna, solicitacoes, tarefas entre areas.
-- ---------------------------------------------------------------------------
create table if not exists demanda (
    id             bigint generated always as identity primary key,
    titulo         text not null,
    descricao      text,
    tipo           text not null default 'solicitacao'
                   check (tipo in ('solicitacao','tarefa','duvida','problema','aviso')),
    prioridade     text not null default 'normal'
                   check (prioridade in ('baixa','normal','alta','urgente')),
    status         text not null default 'aberta'
                   check (status in ('aberta','em_andamento','aguardando','concluida','cancelada')),
    solicitante_id uuid default auth.uid() references perfil(id) on delete set null,
    responsavel_id uuid references perfil(id) on delete set null,
    -- Para a equipe toda quando nao se sabe quem pega.
    equipe         text check (equipe in ('coordenador','cs','consultor','comercial','retencao')),
    aluna_id       bigint references aluna(id) on delete set null,
    prazo          date,
    criado_em      timestamptz not null default now(),
    atualizado_em  timestamptz not null default now(),
    concluida_em   timestamptz
);
create index if not exists ix_dem_resp on demanda(responsavel_id, status);
create index if not exists ix_dem_sol  on demanda(solicitante_id, status);
create index if not exists ix_dem_eq   on demanda(equipe, status);

create table if not exists demanda_comentario (
    id         bigint generated always as identity primary key,
    demanda_id bigint not null references demanda(id) on delete cascade,
    autor_id   uuid default auth.uid() references perfil(id) on delete set null,
    texto      text not null,
    criado_em  timestamptz not null default now()
);
create index if not exists ix_demcom on demanda_comentario(demanda_id, criado_em);

create or replace function demanda_antes() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  if new.status in ('concluida','cancelada') then
    new.concluida_em := coalesce(new.concluida_em, now());
  else
    new.concluida_em := null;
  end if;
  return new;
end $$;
create or replace trigger tg_demanda_antes before insert or update on demanda
  for each row execute function demanda_antes();

create or replace function demanda_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  link text := '/demandas/' || new.id;
  rotulo text := case new.status when 'aberta' then 'aberta' when 'em_andamento' then 'em andamento'
                   when 'aguardando' then 'aguardando' when 'concluida' then 'concluída'
                   else 'cancelada' end;
begin
  if tg_op = 'INSERT' then
    if new.responsavel_id is not null then
      perform notificar(new.responsavel_id, 'demanda', 'Nova demanda para você', new.titulo, link);
    elsif new.equipe is not null then
      perform notificar_papel(new.equipe, 'demanda', 'Nova demanda para a equipe', new.titulo, link);
    end if;
    return new;
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    perform notificar(new.responsavel_id, 'demanda', 'Demanda atribuída a você', new.titulo, link);
  end if;
  if new.status <> old.status then
    perform notificar(new.solicitante_id, 'demanda', 'Sua demanda está ' || rotulo, new.titulo, link);
    if auth.uid() is distinct from new.responsavel_id then
      perform notificar(new.responsavel_id, 'demanda', 'Demanda ' || rotulo, new.titulo, link);
    end if;
  end if;
  return new;
end $$;
create or replace trigger tg_demanda_depois after insert or update on demanda
  for each row execute function demanda_depois();

create or replace function demanda_comentario_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare d demanda;
begin
  select * into d from demanda where id = new.demanda_id;
  perform notificar(d.solicitante_id, 'comentario', 'Resposta em: ' || d.titulo,
                    left(new.texto, 140), '/demandas/' || d.id);
  perform notificar(d.responsavel_id, 'comentario', 'Resposta em: ' || d.titulo,
                    left(new.texto, 140), '/demandas/' || d.id);
  update demanda set atualizado_em = now() where id = d.id;
  return new;
end $$;
create or replace trigger tg_demanda_comentario after insert on demanda_comentario
  for each row execute function demanda_comentario_depois();

-- ---------------------------------------------------------------------------
-- Rotina diaria: o que depende do calendario, nao de um clique.
-- ---------------------------------------------------------------------------
create or replace function rotina_diaria() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  renovacoes int := 0;
  parados int := 0;
  sem_consult int := 0;
  vencidas int := 0;
begin
  -- 1. Renovacao: card nasce N dias antes do termino. Nenhuma entrada manual.
  --    `termino_ref` amarra o card ao contrato, para nao renascer depois de fechado.
  for r in
    select a.* from aluna a
    where a.status_contrato not in ('cancelado','encerrado')
      and a.termino between current_date and current_date + param('dias_renovacao')::int
      and not exists (select 1 from card c where c.funil_id = 'renovacao' and c.aluna_id = a.id
                      and (c.fechado_em is null or c.dados->>'termino_ref' = a.termino::text))
  loop
    insert into card (funil_id, etapa_id, aluna_id, titulo, responsavel_id, prazo, dados)
    values ('renovacao', etapa_de('renovacao', 1), r.id, r.nome, coalesce(r.cs_id, r.consultor_id),
            r.termino, jsonb_build_object('termino_ref', r.termino::text,
                                          'mes_vencimento', to_char(r.termino, 'YYYY-MM')));
    renovacoes := renovacoes + 1;
  end loop;

  -- 2. Card parado na etapa alem do limite.
  for r in
    select c.*, e.nome as etapa_nome, e.alerta_dias, e.alerta_coordenacao
    from card c join etapa e on e.id = c.etapa_id
    where c.fechado_em is null and e.alerta_dias is not null
      and c.etapa_desde < now() - make_interval(days => e.alerta_dias)
  loop
    perform notificar(r.responsavel_id, 'parado', 'Card parado há mais de ' || r.alerta_dias || ' dias',
                      r.titulo || ' em "' || r.etapa_nome || '"',
                      '/funis/' || r.funil_id || '?card=' || r.id,
                      'parado:' || r.id || ':' || r.etapa_id || ':' || r.etapa_desde::date);
    if r.alerta_coordenacao then
      perform notificar_papel('coordenador', 'parado', 'Card parado há mais de ' || r.alerta_dias || ' dias',
                              r.titulo || ' em "' || r.etapa_nome || '"',
                              '/funis/' || r.funil_id || '?card=' || r.id,
                              'parado:' || r.id || ':' || r.etapa_id || ':' || r.etapa_desde::date);
    end if;
    parados := parados + 1;
  end loop;

  -- 3. Aluna ativa sem consultoria ha mais de N dias. Sem registro, conta a
  --    partir de quando ela entrou no sistema: a planilha nao traz a data da
  --    ultima consultoria, e contar do inicio do contrato faria a importacao
  --    disparar alerta para a base inteira no primeiro dia.
  for r in
    select a.* from aluna a
    where a.status_contrato = 'ativo' and a.consultor_id is not null
      and coalesce(a.ultima_consultoria, greatest(a.criado_em::date, coalesce(a.inicio, a.criado_em::date)))
          < current_date - param('dias_sem_consultoria')::int
  loop
    perform notificar(r.consultor_id, 'sem_consultoria', 'Sem consultoria há mais de '
                      || param('dias_sem_consultoria') || ' dias', r.nome, '/alunas/' || r.id,
                      'sem_consult:' || r.id || ':' || coalesce(r.ultima_consultoria::text, 'nunca'));
    perform notificar_papel('coordenador', 'sem_consultoria', 'Sem consultoria há mais de '
                      || param('dias_sem_consultoria') || ' dias', r.nome, '/alunas/' || r.id,
                      'sem_consult:' || r.id || ':' || coalesce(r.ultima_consultoria::text, 'nunca'));
    sem_consult := sem_consult + 1;
  end loop;

  -- 4. Demanda com prazo vencido.
  for r in
    select * from demanda where status not in ('concluida','cancelada') and prazo < current_date
  loop
    perform notificar(coalesce(r.responsavel_id, r.solicitante_id), 'demanda', 'Demanda com prazo vencido',
                      r.titulo, '/demandas/' || r.id, 'prazo:' || r.id || ':' || r.prazo);
    vencidas := vencidas + 1;
  end loop;

  return jsonb_build_object('renovacoes_criadas', renovacoes, 'cards_parados', parados,
                            'alunas_sem_consultoria', sem_consult, 'demandas_vencidas', vencidas);
end $$;

-- ---------------------------------------------------------------------------
-- Visoes de acompanhamento. `security_invoker` faz a visao respeitar a RLS de
-- quem consulta: consultor ve os numeros da propria carteira.
-- ---------------------------------------------------------------------------
create or replace view vw_funil_resumo with (security_invoker = true) as
select c.funil_id, e.id as etapa_id, e.nome as etapa, e.ordem,
       count(*) as cards,
       count(*) filter (where e.alerta_dias is not null
                        and c.etapa_desde < now() - make_interval(days => e.alerta_dias)) as parados,
       sum(c.valor) as valor
from card c join etapa e on e.id = c.etapa_id
where c.fechado_em is null
group by c.funil_id, e.id, e.nome, e.ordem;

create or replace view vw_renovacao_mes with (security_invoker = true) as
select to_char(a.termino, 'YYYY-MM') as mes, count(*) as contratos,
       sum(a.faturamento_mensal) as faturamento_mensal
from aluna a
where a.status_contrato not in ('cancelado','encerrado') and a.termino >= date_trunc('month', current_date)
group by 1;

create or replace view vw_carteira with (security_invoker = true) as
select p.id as consultor_id, p.nome as consultor,
       count(a.id) as alunas,
       count(a.id) filter (where a.saude in ('risco_saida','sem_contato')) as em_risco,
       -- Mesma regra do alerta da rotina diaria, para o painel e o sino nao discordarem.
       count(a.id) filter (where coalesce(a.ultima_consultoria, greatest(a.criado_em::date, coalesce(a.inicio, a.criado_em::date)))
                           < current_date - param('dias_sem_consultoria')::int) as sem_consultoria_recente,
       sum(a.faturamento_mensal) as faturamento_carteira
from perfil p join aluna a on a.consultor_id = p.id and a.status_contrato = 'ativo'
where p.papel = 'consultor'
  -- O contato da aluna e visivel ao time, mas o numero da carteira do colega nao.
  and (meu_papel() in ('coordenador', 'cs') or p.id = auth.uid())
group by p.id, p.nome;

-- Retencao medida no sistema, separando os 7 dias de arrependimento (CDC
-- art. 49), como manda o REGRAS.md.
create or replace view vw_retencao_sistema with (security_invoker = true) as
select coalesce(c.dados->>'prazo', 'nao_triado') as prazo, e.nome as desfecho, e.tipo, count(*) as pedidos
from card c join etapa e on e.id = c.etapa_id
where c.funil_id = 'retencao' and c.fechado_em is not null
group by 1, 2, 3;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table perfil               enable row level security;
alter table aluna                enable row level security;
alter table funil                enable row level security;
alter table etapa                enable row level security;
alter table card                 enable row level security;
alter table card_evento          enable row level security;
alter table registro_consultoria enable row level security;
alter table demanda              enable row level security;
alter table demanda_comentario   enable row level security;
alter table notificacao          enable row level security;
alter table parametro            enable row level security;

-- Reaplicar o arquivo recria as politicas do zero.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and tablename in ('perfil','aluna','funil','etapa','card',
             'card_evento','registro_consultoria','demanda','demanda_comentario','notificacao','parametro')
  loop
    execute format('drop policy %I on %I', p.policyname, p.tablename);
  end loop;
end $$;

-- Equipe: todos se enxergam (precisa para atribuir card e demanda).
create policy perfil_ler   on perfil for select to authenticated using (ativo() or id = auth.uid());
create policy perfil_mudar on perfil for update to authenticated
  using (eh_coordenador() or id = auth.uid()) with check (eh_coordenador() or id = auth.uid());

-- Contato basico de aluna: todo o time ve (busca e deduplicacao dependem disso).
-- O que e sensivel nao esta aqui, esta em registro_consultoria e nos cards.
create policy aluna_ler    on aluna for select to authenticated using (ativo());
create policy aluna_criar  on aluna for insert to authenticated
  with check (meu_papel() in ('coordenador','cs','comercial','retencao'));
create policy aluna_mudar  on aluna for update to authenticated
  using (meu_papel() in ('coordenador','cs') or carteira_minha(aluna))
  with check (meu_papel() in ('coordenador','cs') or carteira_minha(aluna));
create policy aluna_apagar on aluna for delete to authenticated using (eh_coordenador());

create policy funil_ler  on funil for select to authenticated using (pode_ver_funil(id));
create policy funil_coord on funil for all to authenticated
  using (eh_coordenador()) with check (eh_coordenador());
create policy etapa_ler  on etapa for select to authenticated using (pode_ver_funil(funil_id));
create policy etapa_coord on etapa for all to authenticated
  using (eh_coordenador()) with check (eh_coordenador());
create policy param_ler   on parametro for select to authenticated using (ativo());
create policy param_coord on parametro for all to authenticated
  using (eh_coordenador()) with check (eh_coordenador());

-- Card: o funil decide quem ve e quem edita; consultor fica na propria carteira.
create or replace function card_visivel(c card, editar boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select case when editar then pode_editar_funil(c.funil_id) else pode_ver_funil(c.funil_id) end
     and (meu_papel() is distinct from 'consultor'
          or not (select restringe_carteira from funil where id = c.funil_id)
          or c.responsavel_id = auth.uid()
          or atende_aluna(c.aluna_id))
$$;
create policy card_ler    on card for select to authenticated using (card_visivel(card, false));
create policy card_criar  on card for insert to authenticated with check (card_visivel(card, true));
create policy card_mudar  on card for update to authenticated
  using (card_visivel(card, true)) with check (card_visivel(card, true));
create policy card_apagar on card for delete to authenticated using (eh_coordenador());

-- Ver o card e poder comentar nele; o historico automatico vem por gatilho.
create policy evento_ler on card_evento for select to authenticated
  using (exists (select 1 from card c where c.id = card_id));
create policy evento_comentar on card_evento for insert to authenticated
  with check (tipo = 'comentario' and autor_id = auth.uid()
              and exists (select 1 from card c where c.id = card_id));

-- Relato do consultor: quem atende a aluna e a coordenacao.
create policy regcon_ler on registro_consultoria for select to authenticated
  using (eh_coordenador() or consultor_id = auth.uid() or atende_aluna(aluna_id));
create policy regcon_criar on registro_consultoria for insert to authenticated
  with check (consultor_id = auth.uid()
              and (eh_coordenador() or atende_aluna(aluna_id)));
create policy regcon_mudar on registro_consultoria for update to authenticated
  using (eh_coordenador() or consultor_id = auth.uid())
  with check (eh_coordenador() or consultor_id = auth.uid());

create or replace function demanda_minha(d demanda) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_coordenador() or d.solicitante_id = auth.uid() or d.responsavel_id = auth.uid()
      or (d.equipe is not null and d.equipe = meu_papel())
$$;
create policy demanda_ler   on demanda for select to authenticated using (demanda_minha(demanda));
create policy demanda_criar on demanda for insert to authenticated
  with check (ativo() and solicitante_id = auth.uid());
create policy demanda_mudar on demanda for update to authenticated
  using (demanda_minha(demanda)) with check (demanda_minha(demanda));
create policy demanda_apagar on demanda for delete to authenticated
  using (eh_coordenador() or (solicitante_id = auth.uid() and status = 'aberta'));

create policy demcom_ler on demanda_comentario for select to authenticated
  using (exists (select 1 from demanda d where d.id = demanda_id));
create policy demcom_criar on demanda_comentario for insert to authenticated
  with check (autor_id = auth.uid() and exists (select 1 from demanda d where d.id = demanda_id));

create policy notif_ler   on notificacao for select to authenticated using (usuario_id = auth.uid());
create policy notif_mudar on notificacao for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy notif_apagar on notificacao for delete to authenticated using (usuario_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on perfil, aluna, funil, etapa, card, card_evento,
  registro_consultoria, demanda, demanda_comentario, notificacao, parametro to authenticated;
grant select on vw_funil_resumo, vw_renovacao_mes, vw_carteira, vw_retencao_sistema to authenticated;
grant execute on function possiveis_duplicatas(text, text, text) to authenticated;
-- A rotina roda pelo agendador, nao pelo navegador.
revoke execute on function rotina_diaria() from public, authenticated, anon;

-- Toda funcao em `public` vira endpoint /rest/v1/rpc/. As de automacao so
-- podem rodar pelos gatilhos (security definer, dono postgres): sem isto,
-- qualquer um logado chamava notificar() e mandava aviso falso a um colega.
revoke execute on function notificar(uuid, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function notificar_papel(text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function abrir_retencao(bigint, text, bigint) from public, anon, authenticated;
revoke execute on function card_automacoes(card, etapa) from public, anon, authenticated;
revoke execute on function perfil_novo() from public, anon, authenticated;
revoke execute on function senha_alterada() from public, anon, authenticated;
revoke execute on function perfil_protege() from public, anon, authenticated;
revoke execute on function aluna_protege() from public, anon, authenticated;
revoke execute on function card_antes() from public, anon, authenticated;
revoke execute on function card_depois() from public, anon, authenticated;
revoke execute on function evento_comentario() from public, anon, authenticated;
revoke execute on function consultoria_depois() from public, anon, authenticated;
revoke execute on function demanda_depois() from public, anon, authenticated;
revoke execute on function demanda_comentario_depois() from public, anon, authenticated;
-- As que as politicas chamam: so para quem esta logado. Respondem apenas sobre
-- o proprio usuario (meu papel, se atendo esta aluna), entao podem ficar expostas.
revoke execute on function meu_papel() from public, anon;
revoke execute on function eh_coordenador() from public, anon;
revoke execute on function ativo() from public, anon;
revoke execute on function param(text) from public, anon;
revoke execute on function pode_ver_funil(text) from public, anon;
revoke execute on function pode_editar_funil(text) from public, anon;
revoke execute on function card_visivel(card, boolean) from public, anon;
revoke execute on function atende_aluna(bigint) from public, anon;
revoke execute on function demanda_minha(demanda) from public, anon;
grant execute on function meu_papel(), eh_coordenador(), ativo(), param(text), pode_ver_funil(text),
  pode_editar_funil(text), card_visivel(card, boolean), atende_aluna(bigint), demanda_minha(demanda)
  to authenticated;
alter function carteira_minha(aluna) set search_path = public;
alter function possiveis_duplicatas(text, text, text) set search_path = public;
alter function etapa_de(text, integer) set search_path = public;
alter function norm_nome(text) set search_path = public;
alter function norm_fone(text) set search_path = public;
alter function demanda_antes() set search_path = public;

-- O plano gratuito pausa o projeto apos dias sem acesso, e pg_cron interno nao
-- conta como acesso. O Cron da Vercel (app/api/manter-ativo.js) chama esta
-- funcao pela API todo dia. Nao le nem grava dado nenhum, por isso pode ser anon.
create or replace function manter_ativo() returns timestamptz
language sql stable set search_path = public as $$ select now() $$;
grant execute on function manter_ativo() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tempo real (sino de notificacoes e Kanban atualizando sozinho) e agendamento.
-- Os dois so existem no Supabase; fora dele os blocos so avisam.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['notificacao','card','demanda','demanda_comentario','card_evento'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table %I', t);
      end if;
    end loop;
  else
    raise notice 'publicacao supabase_realtime ausente: sem tempo real fora do Supabase';
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- 10h UTC = 7h em Brasilia: o alerta esta la quando o time chega.
    perform cron.schedule('moonshot-rotina-diaria', '0 10 * * *', 'select public.rotina_diaria()');
  else
    raise notice 'pg_cron indisponivel: agende `select rotina_diaria()` por fora';
  end if;
end $$;
