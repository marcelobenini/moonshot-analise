-- A ficha da aluna como centro do trabalho: perfil do negocio, historico de
-- status, acompanhamento da CS, linha do tempo unica e a passagem de uma
-- oportunidade do consultor para o comercial com o contexto junto.
-- Aplicar DEPOIS de sistema_planilhas.sql. Nada aqui apaga: pode reaplicar.

-- ---------------------------------------------------------------------------
-- Perfil: o que as abas de consultor guardavam em texto solto.
-- ---------------------------------------------------------------------------
alter table aluna add column if not exists dores           text;
alter table aluna add column if not exists objetivos       text;
alter table aluna add column if not exists resumo          text;
alter table aluna add column if not exists instagram       text;
-- Acompanhamento: ultimo contato registrado e o retorno combinado.
alter table aluna add column if not exists ultimo_contato  date;
alter table aluna add column if not exists proximo_contato date;
create index if not exists ix_aluna_proximo on aluna(proximo_contato) where proximo_contato is not null;

-- ---------------------------------------------------------------------------
-- Historico: toda mudanca de status, saude, produto e carteira, com quem e
-- por que. A planilha so guardava o valor de hoje.
-- ---------------------------------------------------------------------------
create table if not exists aluna_historico (
    id        bigint generated always as identity primary key,
    aluna_id  bigint not null references aluna(id) on delete cascade,
    campo     text not null,
    de        text,
    para      text,
    motivo    text,
    autor_id  uuid references perfil(id) on delete set null,
    criado_em timestamptz not null default now()
);
create index if not exists ix_hist_aluna on aluna_historico(aluna_id, criado_em desc);

create or replace function aluna_historico_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m text := nullif(current_setting('moonshot.motivo', true), '');
  silencio boolean := coalesce(current_setting('moonshot.silencio', true), '') = 'on';
  quem text := coalesce((select nome from perfil where id = auth.uid()), 'Sistema');
begin
  if new.status_contrato is distinct from old.status_contrato then
    insert into aluna_historico (aluna_id, campo, de, para, motivo, autor_id)
    values (new.id, 'status_contrato', old.status_contrato, new.status_contrato, m, auth.uid());
    if not silencio and new.status_contrato in ('cancelado', 'pausado', 'bloqueado', 'em_cancelamento') then
      perform notificar(new.consultor_id, 'status', new.nome || ': ' || replace(replace(new.status_contrato, 'em_cancelamento', 'em processo de cancelamento'), '_', ' '),
                        coalesce(m, 'Mudado por ' || quem), '/alunas/' || new.id);
      perform notificar(new.cs_id, 'status', new.nome || ': ' || replace(replace(new.status_contrato, 'em_cancelamento', 'em processo de cancelamento'), '_', ' '),
                        coalesce(m, 'Mudado por ' || quem), '/alunas/' || new.id);
    end if;
    -- Pediu para sair: vira trabalho da retencao.
    if new.status_contrato = 'em_cancelamento' then
      perform abrir_retencao(new.id, 'Em processo de cancelamento' || coalesce(': ' || m, ''));
    end if;
  end if;
  if new.status_financeiro is distinct from old.status_financeiro then
    insert into aluna_historico (aluna_id, campo, de, para, motivo, autor_id)
    values (new.id, 'status_financeiro', old.status_financeiro, new.status_financeiro, m, auth.uid());
    if not silencio and new.status_financeiro = 'inadimplente' then
      perform notificar(new.consultor_id, 'status', new.nome || ' está inadimplente',
                        coalesce(m, 'Marcado por ' || quem), '/alunas/' || new.id);
      perform notificar(new.cs_id, 'status', new.nome || ' está inadimplente',
                        coalesce(m, 'Marcado por ' || quem), '/alunas/' || new.id);
    end if;
  end if;
  if new.saude is distinct from old.saude then
    insert into aluna_historico (aluna_id, campo, de, para, motivo, autor_id)
    values (new.id, 'saude', old.saude, new.saude, m, auth.uid());
  end if;
  if new.produto is distinct from old.produto then
    insert into aluna_historico (aluna_id, campo, de, para, motivo, autor_id)
    values (new.id, 'produto', old.produto, new.produto, m, auth.uid());
  end if;
  if new.consultor_id is distinct from old.consultor_id then
    insert into aluna_historico (aluna_id, campo, de, para, motivo, autor_id)
    values (new.id, 'consultor', (select nome from perfil where id = old.consultor_id),
            (select nome from perfil where id = new.consultor_id), m, auth.uid());
  end if;
  if new.cs_id is distinct from old.cs_id then
    insert into aluna_historico (aluna_id, campo, de, para, motivo, autor_id)
    values (new.id, 'cs', (select nome from perfil where id = old.cs_id),
            (select nome from perfil where id = new.cs_id), m, auth.uid());
  end if;
  return new;
end $$;
create or replace trigger tg_aluna_historico after update on aluna
  for each row execute function aluna_historico_depois();

-- Mudar status pela ficha. Muda o contrato principal (a aluna espelha) e a
-- propria aluna, e guarda o motivo no historico. Quem pode: coordenacao, CS,
-- retencao e quem atende a aluna.
create or replace function mudar_status_aluna(p_aluna bigint, p_status_contrato text,
                                              p_status_financeiro text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare c bigint; a aluna;
begin
  if not (eh_coordenador() or meu_papel() in ('cs', 'retencao') or atende_aluna(p_aluna)) then
    raise exception 'sem permissao para mudar o status desta aluna';
  end if;
  select * into a from aluna where id = p_aluna;
  if a.id is null then raise exception 'aluna % nao existe', p_aluna; end if;
  if coalesce(trim(p_motivo), '') = ''
     and (p_status_contrato in ('cancelado', 'pausado', 'bloqueado', 'encerrado', 'em_cancelamento')
          or p_status_financeiro = 'inadimplente') then
    raise exception 'diga o motivo: fica no historico da aluna';
  end if;
  perform set_config('moonshot.motivo', coalesce(trim(p_motivo), ''), true);
  select id into c from contrato where aluna_id = p_aluna
  order by (produto <> 'Máquina de Vendas') desc, (status not in ('cancelado','encerrado')) desc,
           termino desc nulls last, id desc
  limit 1;
  if c is not null then
    update contrato set status = coalesce(p_status_contrato, status),
                        status_financeiro = coalesce(p_status_financeiro, status_financeiro)
    where id = c;
  end if;
  update aluna set status_contrato = coalesce(p_status_contrato, status_contrato),
                   status_financeiro = coalesce(p_status_financeiro, status_financeiro)
  where id = p_aluna;
  perform set_config('moonshot.motivo', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Acompanhamento da CS: contato registrado (canal, o que foi falado) e o
-- retorno combinado. Registrar o proximo contato da baixa no anterior.
-- ---------------------------------------------------------------------------
alter table nota_aluna add column if not exists canal         text;
alter table nota_aluna add column if not exists retorno_em    date;
alter table nota_aluna add column if not exists retorno_feito boolean not null default false;

create or replace function nota_depois() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'contato' then
    update nota_aluna set retorno_feito = true
    where aluna_id = new.aluna_id and id <> new.id and retorno_em is not null and not retorno_feito;
    update aluna set ultimo_contato = greatest(coalesce(ultimo_contato, new.criado_em::date), new.criado_em::date),
                     proximo_contato = new.retorno_em
    where id = new.aluna_id;
  end if;
  return new;
end $$;
create or replace trigger tg_nota_depois after insert on nota_aluna
  for each row execute function nota_depois();

-- Consultoria registrada tambem conta como contato.
create or replace function consultoria_contato() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.realizada then
    update aluna set ultimo_contato = greatest(coalesce(ultimo_contato, new.data), new.data)
    where id = new.aluna_id;
  end if;
  return new;
end $$;
create or replace trigger tg_consultoria_contato after insert on registro_consultoria
  for each row execute function consultoria_contato();

-- ---------------------------------------------------------------------------
-- Quem trabalha a aluna num funil (comercial, retencao) ve o contexto dela:
-- relatos, anotacoes e agenda. Sem isso a comercial recebe so o nome.
-- ---------------------------------------------------------------------------
create or replace function acompanha_aluna(aid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select meu_papel() in ('comercial', 'retencao')
     and exists (select 1 from card c where c.aluna_id = aid and c.fechado_em is null
                 and pode_editar_funil(c.funil_id))
$$;

do $$
declare p text[];
begin
  foreach p slice 1 in array array[
    ['registro_consultoria', 'regcon_ler_funil', 'create policy regcon_ler_funil on registro_consultoria for select to authenticated using (acompanha_aluna(aluna_id))'],
    ['nota_aluna', 'nota_ler_funil', 'create policy nota_ler_funil on nota_aluna for select to authenticated using (acompanha_aluna(aluna_id))'],
    ['nota_aluna', 'nota_criar_funil', 'create policy nota_criar_funil on nota_aluna for insert to authenticated with check (autor_id = auth.uid() and acompanha_aluna(aluna_id))'],
    ['consultoria_agenda', 'agenda_ler_funil', 'create policy agenda_ler_funil on consultoria_agenda for select to authenticated using (acompanha_aluna(aluna_id))'],
    ['aluna_historico', 'hist_ler', 'create policy hist_ler on aluna_historico for select to authenticated using (ativo())']
  ] loop
    if not exists (select 1 from pg_policies where tablename = p[1] and policyname = p[2]) then
      execute p[3];
    end if;
  end loop;
end $$;
alter table aluna_historico enable row level security;

-- ---------------------------------------------------------------------------
-- Passagem ao comercial. O consultor (ou a CS) diz por que a aluna e
-- oportunidade; o card de Oportunidades vai para "Enviada ao comercial", o
-- gatilho abre o card no Comercial com esses dados, e a observacao entra no
-- historico do card da comercial.
-- ---------------------------------------------------------------------------
create or replace function enviar_ao_comercial(p_aluna bigint, p_produto text, p_faturamento numeric,
                                               p_justificativa text, p_canal text, p_observacao text)
returns bigint language plpgsql security definer set search_path = public as $$
declare a aluna; op card; e etapa; d jsonb; novo bigint; quem text;
begin
  if not (eh_coordenador() or meu_papel() = 'cs' or atende_aluna(p_aluna)) then
    raise exception 'so quem atende a aluna envia ao comercial';
  end if;
  if coalesce(trim(p_justificativa), '') = '' then
    raise exception 'escreva por que ela e uma oportunidade';
  end if;
  select * into a from aluna where id = p_aluna;
  if a.id is null then raise exception 'aluna % nao existe', p_aluna; end if;
  if exists (select 1 from card where funil_id = 'comercial' and aluna_id = p_aluna and fechado_em is null) then
    raise exception 'esta aluna ja esta no funil comercial';
  end if;
  quem := (select nome from perfil where id = auth.uid());
  if p_faturamento is not null then
    update aluna set faturamento_mensal = p_faturamento where id = p_aluna;
  end if;
  d := jsonb_strip_nulls(jsonb_build_object(
         'produto', nullif(trim(p_produto), ''), 'justificativa', trim(p_justificativa),
         'canal', nullif(trim(p_canal), ''), 'faturamento_informado', p_faturamento,
         'observacao_consultor', nullif(trim(p_observacao), ''),
         'enviado_por', quem, 'enviado_em', current_date::text));

  select * into op from card where funil_id = 'oportunidades' and aluna_id = p_aluna and fechado_em is null;
  if op.id is null then
    insert into card (funil_id, etapa_id, aluna_id, titulo, responsavel_id, dados, criado_por)
    values ('oportunidades', etapa_de('oportunidades', 3), p_aluna, a.nome,
            coalesce(case when meu_papel() = 'consultor' then auth.uid() end, a.consultor_id, auth.uid()),
            d, auth.uid());
  elsif op.etapa_id <> etapa_de('oportunidades', 3) then
    update card set dados = dados || d, etapa_id = etapa_de('oportunidades', 3) where id = op.id;
  else
    -- Ja estava em "Enviada" mas sem card no comercial: roda o gatilho de novo.
    update card set dados = dados || d where id = op.id returning * into op;
    select * into e from etapa where id = op.etapa_id;
    perform card_automacoes(op, e);
  end if;

  select id into novo from card where funil_id = 'comercial' and aluna_id = p_aluna and fechado_em is null;
  if novo is not null then
    update card set dados = dados || d where id = novo;
    insert into card_evento (card_id, tipo, texto, autor_id)
    values (novo, 'comentario',
            'Passagem de ' || coalesce(quem, 'consultor') || E':\n' || trim(p_justificativa)
            || coalesce(E'\n\nObservação: ' || nullif(trim(p_observacao), ''), ''),
            auth.uid());
  end if;
  return novo;
end $$;

-- ---------------------------------------------------------------------------
-- Linha do tempo: tudo que aconteceu com a aluna, de todas as areas, numa
-- lista so. security_invoker: cada um ve so o que as tabelas ja deixam ver.
-- ---------------------------------------------------------------------------
create or replace view vw_linha_tempo with (security_invoker = true) as
select h.aluna_id, h.criado_em as quando, 'status'::text as tipo, h.campo as titulo, h.motivo as texto,
       jsonb_build_object('de', h.de, 'para', h.para) as extra, h.autor_id, null::text as link
from aluna_historico h
union all
select r.aluna_id, (r.data + r.criado_em::time)::timestamptz, 'consultoria',
       case when r.numero = 0 then 'Entrada / diagnóstico' when r.numero is not null then r.numero || 'ª consultoria'
            else 'Contato do consultor' end,
       r.situacao,
       jsonb_strip_nulls(jsonb_build_object('saude', r.saude, 'realizada', r.realizada,
                                            'proximo_passo', r.proximo_passo, 'faturamento', r.faturamento_mensal)),
       r.consultor_id, null
from registro_consultoria r
union all
select n.aluna_id, n.criado_em, case when n.tipo = 'contato' then 'contato' else 'nota' end, n.tipo, n.texto,
       jsonb_strip_nulls(jsonb_build_object('canal', n.canal, 'retorno_em', n.retorno_em, 'origem', n.origem)),
       n.autor_id, null
from nota_aluna n
union all
select c.aluna_id, ev.criado_em, 'funil', f.nome,
       case ev.tipo when 'criado' then 'Entrou em ' || coalesce(ev.texto, '')
                    when 'moveu' then 'Foi para ' || coalesce(ev.texto, '')
                    when 'responsavel' then 'Responsável: ' || coalesce(ev.texto, 'ninguém')
                    else ev.texto end,
       jsonb_build_object('evento', ev.tipo), ev.autor_id, '/funis/' || c.funil_id || '?card=' || c.id
from card_evento ev
join card c on c.id = ev.card_id
join funil f on f.id = c.funil_id
where c.aluna_id is not null
union all
select ct.aluna_id, ct.criado_em, 'contrato', ct.produto,
       concat_ws(' · ', ct.turma, ct.status, ct.forma_pagamento),
       jsonb_strip_nulls(jsonb_build_object('inicio', ct.inicio, 'termino', ct.termino)), null, null
from contrato ct
union all
select d.aluna_id, d.criado_em, 'demanda', d.titulo, d.descricao,
       jsonb_build_object('status', d.status), d.solicitante_id, '/demandas/' || d.id
from demanda d
where d.aluna_id is not null
union all
select p.aluna_id, coalesce(ev.data::timestamptz, ev.criado_em), 'evento', ev.nome,
       case when p.presente then 'Esteve presente' when p.confirmado then 'Confirmou presença'
            when p.confirmado = false then 'Não confirmou' else 'Convidada' end,
       '{}'::jsonb, null, '/eventos/' || ev.id
from evento_participante p
join evento ev on ev.id = p.evento_id
where p.aluna_id is not null;

-- ---------------------------------------------------------------------------
-- Permissoes
-- ---------------------------------------------------------------------------
grant select on aluna_historico to authenticated;
grant select on vw_linha_tempo to authenticated;
revoke execute on function aluna_historico_depois() from public, anon, authenticated;
revoke execute on function nota_depois() from public, anon, authenticated;
revoke execute on function consultoria_contato() from public, anon, authenticated;
revoke execute on function mudar_status_aluna(bigint, text, text, text) from public, anon;
grant execute on function mudar_status_aluna(bigint, text, text, text) to authenticated;
revoke execute on function enviar_ao_comercial(bigint, text, numeric, text, text, text) from public, anon;
grant execute on function enviar_ao_comercial(bigint, text, numeric, text, text, text) to authenticated;
revoke execute on function acompanha_aluna(bigint) from public, anon;
grant execute on function acompanha_aluna(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Acessos criados pela coordenacao, sem passar pelo painel do Supabase.
-- A pessoa recebe uma senha provisoria de 6 digitos e, no primeiro login, e
-- obrigada a trocar por uma de 8 (perfil.trocar_senha).
-- ---------------------------------------------------------------------------
create or replace function criar_acesso(p_email text, p_nome text, p_papel text, p_nome_planilha text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(trim(p_email));
  v_senha text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  if not eh_coordenador() then raise exception 'so a coordenacao cria acessos'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'e-mail invalido'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'diga o nome da pessoa'; end if;
  if p_papel not in ('coordenador', 'cs', 'consultor', 'comercial', 'retencao') then raise exception 'perfil invalido'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'ja existe acesso com este e-mail';
  end if;
  if to_regclass('auth.identities') is not null then
    -- Supabase: usuario completo, com e-mail ja confirmado (ninguem depende de e-mail chegar).
    execute $q$
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change_token_new, email_change,
                              email_change_token_current, phone_change, phone_change_token, reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2,
              extensions.crypt($3, extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}', $4, now(), now(), '', '', '', '', '', '', '', '')$q$
      using v_id, v_email, v_senha, jsonb_build_object('nome', trim(p_nome));
    execute $q$
      insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), $1::text, $1,
              jsonb_build_object('sub', $1::text, 'email', $2, 'email_verified', true, 'phone_verified', false),
              'email', now(), now(), now())$q$
      using v_id, v_email;
  else
    -- Teste local: o auth minimo de sistema.sql.
    insert into auth.users (id, email, raw_user_meta_data, encrypted_password)
    values (v_id, v_email, jsonb_build_object('nome', trim(p_nome)), md5(v_senha));
  end if;
  update perfil set nome = trim(p_nome), papel = p_papel, ativo = true, trocar_senha = true,
                    consultor_norm = nullif(trim(coalesce(p_nome_planilha, '')), ''), senha_provisoria_em = now()
  where id = v_id;
  perform auditar('acesso criado', v_email, jsonb_build_object('perfil', p_papel, 'nome', trim(p_nome)));
  return v_senha;
end $$;

-- Esqueceu a senha: nova provisoria, troca obrigatoria de novo.
create or replace function redefinir_senha(p_usuario uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_senha text := lpad((floor(random() * 1000000))::int::text, 6, '0'); n int;
begin
  if not eh_coordenador() then raise exception 'so a coordenacao redefine senha'; end if;
  if p_usuario = auth.uid() then raise exception 'para a sua senha, use "trocar senha" no menu'; end if;
  perform set_config('moonshot.senha_sistema', 'on', true);
  -- EXECUTE nao atualiza FOUND: conta pelas linhas afetadas.
  if to_regclass('auth.identities') is not null then
    execute 'update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt(''bf'')), updated_at = now() where id = $1'
      using p_usuario, v_senha;
  else
    update auth.users set encrypted_password = md5(v_senha) where id = p_usuario;
  end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'usuario nao encontrado'; end if;
  -- O gatilho do Auth acabou de tirar a marca; a senha nova e provisoria.
  update perfil set trocar_senha = true, senha_provisoria_em = now() where id = p_usuario;
  perform set_config('moonshot.senha_sistema', '', true);
  perform auditar('senha provisoria gerada', (select email from perfil where id = p_usuario));
  return v_senha;
end $$;

-- Consultor cadastra aluna na propria carteira (a CS e a coordenacao ja podiam).
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'aluna' and policyname = 'aluna_criar_consultor') then
    execute 'create policy aluna_criar_consultor on aluna for insert to authenticated
             with check (meu_papel() = ''consultor'' and consultor_id = auth.uid())';
  end if;
end $$;

revoke execute on function criar_acesso(text, text, text, text) from public, anon;
grant execute on function criar_acesso(text, text, text, text) to authenticated;
revoke execute on function redefinir_senha(uuid) from public, anon;
grant execute on function redefinir_senha(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Status "em processo de cancelamento": aluna que pediu para sair e ainda
-- esta com a retencao. Continua viva (conta na carteira).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'aluna_status_contrato_check'
                 and pg_get_constraintdef(oid) like '%em_cancelamento%') then
    alter table aluna drop constraint if exists aluna_status_contrato_check;
    alter table aluna add constraint aluna_status_contrato_check
      check (status_contrato in ('ativo','pendente','bloqueado','pausado','em_cancelamento','encerrado','cancelado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contrato_status_check'
                 and pg_get_constraintdef(oid) like '%em_cancelamento%') then
    alter table contrato drop constraint if exists contrato_status_check;
    alter table contrato add constraint contrato_status_check
      check (status in ('ativo','pendente','bloqueado','pausado','em_cancelamento','encerrado','cancelado'));
  end if;
end $$;
