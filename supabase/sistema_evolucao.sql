-- Evolucao da aluna fora da consultoria.
--   1. Faturamento e rentabilidade mes a mes (input mensal na ficha). O
--      faturamento registrado numa consultoria entra no mesmo historico.
--   2. Saude atualizada por observacao, a qualquer momento: a aluna pode
--      comecar bem, cair entre a 1a e a 2a consultoria e reengajar depois.
--   3. Arquivos da aluna (transcricao de consultoria) no Storage.
-- Aplicar DEPOIS de sistema_edicao.sql.

-- 1. Faturamento mensal ------------------------------------------------------
alter table aluna add column if not exists rentabilidade numeric(6,2);  -- % do ultimo mes informado

create table if not exists faturamento_mes (
    id            bigint generated always as identity primary key,
    aluna_id      bigint not null references aluna(id) on delete cascade,
    mes           date not null check (mes = date_trunc('month', mes)::date),
    faturamento   numeric(14,2) check (faturamento >= 0),
    rentabilidade numeric(6,2) check (rentabilidade between -1000 and 1000),  -- % de margem
    observacao    text,
    autor_id      uuid default auth.uid() references perfil(id) on delete set null,
    atualizado_em timestamptz not null default now(),
    unique (aluna_id, mes),
    check (faturamento is not null or rentabilidade is not null)
);
create index if not exists ix_fatmes_mes on faturamento_mes(mes);

alter table faturamento_mes enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'faturamento_mes' and policyname = 'fatmes_ler') then
    create policy fatmes_ler on faturamento_mes for select to authenticated using (ativo());
    create policy fatmes_mudar on faturamento_mes for all to authenticated
      using (edita_aluna()) with check (edita_aluna());
  end if;
end $$;
grant select, insert, update, delete on faturamento_mes to authenticated;

-- A ficha mostra o ultimo mes informado.
create or replace function faturamento_mes_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare al bigint := coalesce(new.aluna_id, old.aluna_id); f numeric; r numeric;
begin
  if not exists (select 1 from faturamento_mes where aluna_id = al) then return null; end if;
  select faturamento into f from faturamento_mes
   where aluna_id = al and faturamento is not null order by mes desc limit 1;
  select rentabilidade into r from faturamento_mes
   where aluna_id = al and rentabilidade is not null order by mes desc limit 1;
  update aluna set faturamento_mensal = coalesce(f, faturamento_mensal), rentabilidade = r
   where id = al and (faturamento_mensal is distinct from coalesce(f, faturamento_mensal) or rentabilidade is distinct from r);
  return null;
end $$;
create or replace function faturamento_mes_antes() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
create or replace trigger tg_faturamento_mes_antes before update on faturamento_mes
  for each row execute function faturamento_mes_antes();
create or replace trigger tg_faturamento_mes_depois after insert or update or delete on faturamento_mes
  for each row execute function faturamento_mes_depois();
revoke execute on function faturamento_mes_depois() from public, anon, authenticated;

-- Faturamento informado na consultoria vira o mes daquela consultoria.
create or replace function regcon_faturamento() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.faturamento_mensal is not null then
    insert into faturamento_mes (aluna_id, mes, faturamento, autor_id)
    values (new.aluna_id, date_trunc('month', new.data)::date, new.faturamento_mensal, new.consultor_id)
    on conflict (aluna_id, mes) do update set faturamento = excluded.faturamento;
  end if;
  return new;
end $$;
create or replace trigger tg_regcon_faturamento after insert on registro_consultoria
  for each row execute function regcon_faturamento();
revoke execute on function regcon_faturamento() from public, anon, authenticated;

-- O que as consultorias ja registraram entra no historico (uma vez).
insert into faturamento_mes (aluna_id, mes, faturamento, autor_id)
select distinct on (aluna_id, date_trunc('month', data))
       aluna_id, date_trunc('month', data)::date, faturamento_mensal, consultor_id
from registro_consultoria where faturamento_mensal is not null
order by aluna_id, date_trunc('month', data), data desc, id desc
on conflict (aluna_id, mes) do nothing;

-- 2. Saude por observacao ----------------------------------------------------
create or replace function mudar_saude_aluna(p_aluna bigint, p_saude text, p_observacao text)
returns void language plpgsql security definer set search_path = public as $$
declare a aluna;
begin
  if not edita_aluna() then raise exception 'sem permissao para mudar a saude desta aluna'; end if;
  if p_saude not in ('engajada','oscilante','sem_contato','risco_saida','renovou_upsell') then
    raise exception 'saude desconhecida: %', p_saude;
  end if;
  if coalesce(trim(p_observacao), '') = '' then
    raise exception 'diga o que mudou: a observacao fica no historico da aluna';
  end if;
  select * into a from aluna where id = p_aluna;
  if a.id is null then raise exception 'aluna % nao existe', p_aluna; end if;

  perform set_config('moonshot.motivo', trim(p_observacao), true);
  update aluna set saude = p_saude where id = p_aluna;
  perform set_config('moonshot.motivo', '', true);
  insert into nota_aluna (aluna_id, tipo, texto, autor_id)
  values (p_aluna, 'saude', trim(p_observacao), auth.uid());

  if p_saude in ('risco_saida', 'sem_contato') and a.saude is distinct from p_saude then
    perform abrir_retencao(a.id, case p_saude when 'risco_saida' then 'Saúde: risco de saída'
                                              else 'Saúde: sem contato' end || ' · ' || trim(p_observacao));
  end if;
end $$;
revoke execute on function mudar_saude_aluna(bigint, text, text) from public, anon;
grant execute on function mudar_saude_aluna(bigint, text, text) to authenticated;

-- 3. Arquivos da aluna -------------------------------------------------------
-- O arquivo fica no bucket privado 'aluna-arquivos', no caminho <aluna_id>/<nome>.
-- Mesmo sigilo do relato de consultoria: le o time ativo, sobe quem edita a
-- ficha, apaga quem subiu ou a coordenacao.
create table if not exists aluna_arquivo (
    id                bigint generated always as identity primary key,
    aluna_id          bigint not null references aluna(id) on delete cascade,
    registro_id       bigint references registro_consultoria(id) on delete set null,
    tipo              text not null default 'transcricao' check (tipo in ('transcricao', 'documento', 'outro')),
    numero            integer check (numero between 0 and 10),  -- qual consultoria
    nome              text not null,
    caminho           text not null unique,
    tamanho           bigint,
    mime              text,
    autor_id          uuid default auth.uid() references perfil(id) on delete set null,
    criado_em         timestamptz not null default now()
);
create index if not exists ix_arquivo_aluna on aluna_arquivo(aluna_id, criado_em desc);
alter table aluna_arquivo enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'aluna_arquivo' and policyname = 'arquivo_ler') then
    create policy arquivo_ler on aluna_arquivo for select to authenticated using (ativo());
    create policy arquivo_criar on aluna_arquivo for insert to authenticated
      with check (edita_aluna() and autor_id = auth.uid() and caminho like aluna_id::text || '/%');
    create policy arquivo_mudar on aluna_arquivo for update to authenticated
      using (eh_coordenador() or (edita_aluna() and autor_id = auth.uid()))
      with check (eh_coordenador() or (edita_aluna() and autor_id = auth.uid()));
    create policy arquivo_apagar on aluna_arquivo for delete to authenticated
      using (eh_coordenador() or (edita_aluna() and autor_id = auth.uid()));
  end if;
end $$;
grant select, insert, update, delete on aluna_arquivo to authenticated;

-- Storage: so existe no Supabase (o banco de teste local nao tem o schema).
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('aluna-arquivos', 'aluna-arquivos', false, 52428800)
    on conflict (id) do nothing;
    if not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'aluna_arquivos_ler') then
      create policy aluna_arquivos_ler on storage.objects for select to authenticated
        using (bucket_id = 'aluna-arquivos' and public.ativo());
      create policy aluna_arquivos_subir on storage.objects for insert to authenticated
        with check (bucket_id = 'aluna-arquivos' and public.edita_aluna());
      create policy aluna_arquivos_apagar on storage.objects for delete to authenticated
        using (bucket_id = 'aluna-arquivos' and (public.eh_coordenador() or (public.edita_aluna() and owner_id = auth.uid()::text)));
    end if;
  end if;
end $$;
