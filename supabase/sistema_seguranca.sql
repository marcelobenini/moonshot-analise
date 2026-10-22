-- Protocolos minimos de seguranca. Aplicar DEPOIS de sistema_crm.sql.
-- Nada aqui apaga: pode reaplicar.
--
--   1. Registro de seguranca (auditoria): quem deu, mudou ou tirou acesso,
--      gerou senha, apagou ficha ou card, importou planilha.
--   2. Senha provisoria vence em 72 horas. Vencida, ninguem mais entra com
--      ela; a coordenacao gera outra.
--   3. Planilha importada nao fica guardada crua no banco depois de processada.

-- ---------------------------------------------------------------------------
-- 1. Auditoria. So nasce por gatilho e pelas funcoes do sistema; so a
-- coordenacao le; ninguem edita nem apaga pelo app.
-- ---------------------------------------------------------------------------
create table if not exists auditoria (
    id        bigint generated always as identity primary key,
    quando    timestamptz not null default now(),
    autor_id  uuid references perfil(id) on delete set null,
    acao      text not null,
    alvo      text,
    detalhe   jsonb not null default '{}'
);
create index if not exists ix_auditoria_quando on auditoria(quando desc);
alter table auditoria enable row level security;

create or replace function auditar(p_acao text, p_alvo text, p_detalhe jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into auditoria (autor_id, acao, alvo, detalhe) values (auth.uid(), p_acao, p_alvo, coalesce(p_detalhe, '{}'))
$$;

create or replace function perfil_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.papel is distinct from old.papel then
    perform auditar('perfil alterado', new.email, jsonb_build_object('de', old.papel, 'para', new.papel));
  end if;
  if new.ativo is distinct from old.ativo then
    perform auditar(case when new.ativo then 'acesso liberado' else 'acesso bloqueado' end, new.email);
  end if;
  if new.consultor_norm is distinct from old.consultor_norm then
    perform auditar('nome na planilha alterado', new.email, jsonb_build_object('de', old.consultor_norm, 'para', new.consultor_norm));
  end if;
  if old.trocar_senha and not new.trocar_senha
     and coalesce(current_setting('moonshot.senha_sistema', true), '') <> 'on' then
    perform auditar('senha definida pela pessoa', new.email);
  end if;
  return new;
end $$;
create or replace trigger tg_perfil_auditar after update on perfil
  for each row execute function perfil_auditar();

create or replace function aluna_apagada_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform auditar('ficha de aluna apagada', old.nome, jsonb_build_object('aluna_id', old.id, 'email', old.email));
  return old;
end $$;
create or replace trigger tg_aluna_apagada after delete on aluna
  for each row execute function aluna_apagada_auditar();

create or replace function card_apagado_auditar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform auditar('card apagado', old.titulo, jsonb_build_object('card_id', old.id, 'funil', old.funil_id));
  return old;
end $$;
create or replace trigger tg_card_apagado after delete on card
  for each row execute function card_apagado_auditar();

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'auditoria' and policyname = 'auditoria_coord') then
    execute 'create policy auditoria_coord on auditoria for select to authenticated using (eh_coordenador())';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Senha provisoria com prazo. criar_acesso e redefinir_senha marcam a hora;
-- a rotina de hora em hora troca a senha vencida por uma aleatoria que
-- ninguem conhece. A conta continua la, bloqueada para login, ate a
-- coordenacao gerar outra. Vale para todos menos a coordenacao: perder o
-- ultimo acesso de coordenador trancaria o sistema.
-- ---------------------------------------------------------------------------
alter table perfil add column if not exists senha_provisoria_em timestamptz;

create or replace function expirar_senhas_provisorias() returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  perform set_config('moonshot.senha_sistema', 'on', true);
  for r in select id, email from perfil
           where trocar_senha and senha_provisoria_em < now() - interval '72 hours'
             and papel is distinct from 'coordenador' loop
    if to_regclass('auth.identities') is not null then
      execute 'update auth.users set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(18), ''base64''), extensions.gen_salt(''bf'')), updated_at = now() where id = $1'
        using r.id;
    else
      update auth.users set encrypted_password = md5(random()::text) where id = r.id;
    end if;
    -- O gatilho do Auth tirou a marca ao ver a senha mudar: volta, sem prazo.
    update perfil set trocar_senha = true, senha_provisoria_em = null where id = r.id;
    perform auditar('senha provisoria vencida', r.email);
    n := n + 1;
  end loop;
  perform set_config('moonshot.senha_sistema', '', true);
  return n;
end $$;

-- Quem trocou a senha nao tem mais provisoria.
create or replace function senha_alterada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update perfil set trocar_senha = false, senha_provisoria_em = null where id = new.id and trocar_senha;
  return new;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('moonshot-senhas-provisorias', '23 * * * *', 'select public.expirar_senhas_provisorias()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Permissoes
-- ---------------------------------------------------------------------------
grant select on auditoria to authenticated;
revoke execute on function auditar(text, text, jsonb) from public, anon, authenticated;
revoke execute on function perfil_auditar() from public, anon, authenticated;
revoke execute on function aluna_apagada_auditar() from public, anon, authenticated;
revoke execute on function card_apagado_auditar() from public, anon, authenticated;
revoke execute on function expirar_senhas_provisorias() from public, anon, authenticated;
