-- Acompanhamento do consultor: o roteiro de cada programa, etapa por etapa.
-- Aplicar DEPOIS de sistema_entrada.sql.
--
-- Cada programa tem o seu roteiro (jornada_etapa). Etapa do tipo
-- "consultoria" e o registro de consultoria de sempre (registro_consultoria,
-- numero N; a reuniao inicial e a 0), entao ciclo, agenda e potencial seguem
-- funcionando. Etapa do tipo "encontro" (encontro presencial, proximos passos,
-- imersao...) fica em acompanhamento. O Elite segue o roteiro do Pro.

create table if not exists jornada_etapa (
    id        bigint generated always as identity primary key,
    programa  text not null,
    ordem     integer not null,
    chave     text not null,
    nome      text not null,
    tipo      text not null check (tipo in ('consultoria', 'encontro')),
    numero    integer check (numero between 0 and 10),
    unique (programa, chave),
    check ((tipo = 'consultoria') = (numero is not null))
);

insert into jornada_etapa (programa, ordem, chave, nome, tipo, numero) values
  ('Moonshot Club', 1, 'reuniao_inicial', 'Reunião inicial', 'consultoria', 0),
  ('Moonshot Club', 2, 'consultoria_1', 'Consultoria 1', 'consultoria', 1),
  ('Moonshot Club', 3, 'consultoria_2', 'Consultoria 2', 'consultoria', 2),
  ('Moonshot Club', 4, 'consultoria_3', 'Consultoria 3', 'consultoria', 3),
  ('Moonshot Club', 5, 'encontro_presencial', 'Encontro presencial', 'encontro', null),
  ('Moonshot Club', 6, 'proximos_passos', 'Próximos passos', 'encontro', null),
  ('Moonshot Pró', 1, 'reuniao_inicial', 'Reunião inicial', 'consultoria', 0),
  ('Moonshot Pró', 2, 'consultoria_1', 'Consultoria 1', 'consultoria', 1),
  ('Moonshot Pró', 3, 'consultoria_2', 'Consultoria 2', 'consultoria', 2),
  ('Moonshot Pró', 4, 'consultoria_3', 'Consultoria 3', 'consultoria', 3),
  ('Moonshot Pró', 5, 'encontro_presencial', 'Encontro presencial', 'encontro', null),
  ('Moonshot Pró', 6, 'consultoria_4', 'Consultoria 4', 'consultoria', 4),
  ('Moonshot Pró', 7, 'consultoria_5', 'Consultoria 5', 'consultoria', 5),
  ('Moonshot Pró', 8, 'proximos_passos', 'Próximos passos', 'encontro', null),
  ('Moonshot In Company', 1, 'reuniao_inicial', 'Reunião inicial', 'consultoria', 0),
  ('Moonshot In Company', 2, 'diagnostico_equipe', 'Diagnóstico da equipe', 'encontro', null),
  ('Moonshot In Company', 3, 'encontro_presencial', 'Encontro presencial na empresa', 'encontro', null),
  ('Moonshot In Company', 4, 'consultoria_1', 'Acompanhamento 1', 'consultoria', 1),
  ('Moonshot In Company', 5, 'consultoria_2', 'Acompanhamento 2', 'consultoria', 2),
  ('Moonshot In Company', 6, 'consultoria_3', 'Acompanhamento 3', 'consultoria', 3),
  ('Moonshot In Company', 7, 'consultoria_4', 'Acompanhamento 4', 'consultoria', 4),
  ('Moonshot In Company', 8, 'proximos_passos', 'Próximos passos', 'encontro', null),
  ('Moonshot Private', 1, 'reuniao_inicial', 'Reunião inicial', 'consultoria', 0),
  ('Moonshot Private', 2, 'imersao', 'Imersão presencial', 'encontro', null),
  ('Moonshot Private', 3, 'consultoria_1', 'Mentoria 1', 'consultoria', 1),
  ('Moonshot Private', 4, 'consultoria_2', 'Mentoria 2', 'consultoria', 2),
  ('Moonshot Private', 5, 'consultoria_3', 'Mentoria 3', 'consultoria', 3),
  ('Moonshot Private', 6, 'consultoria_4', 'Mentoria 4', 'consultoria', 4),
  ('Moonshot Private', 7, 'consultoria_5', 'Mentoria 5', 'consultoria', 5),
  ('Moonshot Private', 8, 'consultoria_6', 'Mentoria 6', 'consultoria', 6),
  ('Moonshot Private', 9, 'proximos_passos', 'Próximos passos', 'encontro', null)
on conflict (programa, chave) do nothing;

create table if not exists acompanhamento (
    id               bigint generated always as identity primary key,
    aluna_id         bigint not null references aluna(id) on delete cascade,
    etapa_chave      text not null,
    status           text not null default 'feito' check (status in ('agendado', 'feito', 'nao_se_aplica')),
    data             date,
    resumo           text,
    proximos_passos  text,
    proxima_data     date,
    autor_id         uuid default auth.uid() references perfil(id) on delete set null,
    atualizado_em    timestamptz not null default now(),
    unique (aluna_id, etapa_chave)
);

-- Encontro registrado conta como contato com a aluna.
create or replace function acompanhamento_depois() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'feito' and new.data is not null then
    update aluna set ultimo_contato = greatest(coalesce(ultimo_contato, new.data), new.data) where id = new.aluna_id;
  end if;
  return new;
end $$;
create or replace trigger tg_acompanhamento_depois after insert or update on acompanhamento
  for each row execute function acompanhamento_depois();

alter table jornada_etapa enable row level security;
alter table acompanhamento enable row level security;
do $$
declare p text[];
begin
  foreach p slice 1 in array array[
    ['jornada_etapa', 'jornada_ler', 'create policy jornada_ler on jornada_etapa for select to authenticated using (ativo())'],
    ['jornada_etapa', 'jornada_coord', 'create policy jornada_coord on jornada_etapa for all to authenticated using (eh_coordenador()) with check (eh_coordenador())'],
    ['acompanhamento', 'acomp_ler', 'create policy acomp_ler on acompanhamento for select to authenticated using (ativo())'],
    ['acompanhamento', 'acomp_mudar', 'create policy acomp_mudar on acompanhamento for all to authenticated using (edita_aluna()) with check (edita_aluna())']
  ] loop
    if not exists (select 1 from pg_policies where tablename = p[1] and policyname = p[2]) then
      execute p[3];
    end if;
  end loop;
end $$;
grant select on jornada_etapa to authenticated;
grant select, insert, update, delete on acompanhamento, jornada_etapa to authenticated;
revoke execute on function acompanhamento_depois() from public, anon, authenticated;
