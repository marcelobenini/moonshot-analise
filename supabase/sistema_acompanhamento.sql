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

alter table jornada_etapa add column if not exists descricao text;
alter table jornada_etapa add column if not exists ativo boolean not null default true;

-- Roteiro base, do POP do consultor (consultoria inicial, plano de acao em 7 dias,
-- retorno a cada 3 meses) e do playbook da visita in loco (In Company e Private).
-- A coordenacao ajusta pela tela; aqui so entra o que ainda nao existe.
insert into jornada_etapa (programa, ordem, chave, nome, tipo, numero, descricao) values
  ('Moonshot Club', 1, 'reuniao_inicial', 'Consultoria inicial', 'consultoria', 0, 'Diagnóstico de 3 horas pelos pilares. Conferir o formulário 24h antes; sem formulário, remarcar.'),
  ('Moonshot Club', 2, 'plano_acao', 'Plano de ação', 'encontro', null, 'Entregar em até 7 dias: PDF no Notion e na pasta da aluna, com áudio explicando as prioridades.'),
  ('Moonshot Club', 3, 'consultoria_1', 'Retorno do 3º mês', 'consultoria', 1, 'Consultoria de acompanhamento: andamento das ações e resultados, com plano de metas complementares em 7 dias.'),
  ('Moonshot Club', 4, 'encontro_presencial', 'Encontro presencial', 'encontro', null, 'Encontro presencial com a aluna, quando houver. Se não houver, marque como não se aplica.'),
  ('Moonshot Club', 5, 'consultoria_2', 'Retorno do 6º mês', 'consultoria', 2, 'Consultoria de acompanhamento, com plano de metas complementares em 7 dias.'),
  ('Moonshot Club', 6, 'consultoria_3', 'Retorno do 9º mês', 'consultoria', 3, 'Consultoria de acompanhamento, com plano de metas complementares em 7 dias.'),
  ('Moonshot Club', 7, 'consultoria_4', 'Retorno do 12º mês', 'consultoria', 4, 'Fechamento do ciclo: resultados do ano e próximos objetivos.'),
  ('Moonshot Club', 8, 'proximos_passos', 'Renovação ou ascensão', 'encontro', null, 'Próximos passos: renovar, subir de programa ou encerrar. Registre o que foi combinado.'),
  ('Moonshot Pró', 1, 'reuniao_inicial', 'Consultoria inicial', 'consultoria', 0, 'Diagnóstico de 3 horas pelos pilares. Conferir o formulário 24h antes; sem formulário, remarcar.'),
  ('Moonshot Pró', 2, 'plano_acao', 'Plano de ação', 'encontro', null, 'Entregar em até 7 dias: PDF no Notion e na pasta da aluna, com áudio explicando as prioridades.'),
  ('Moonshot Pró', 3, 'consultoria_1', 'Retorno do 3º mês', 'consultoria', 1, 'Consultoria de acompanhamento: andamento das ações e resultados, com plano de metas complementares em 7 dias.'),
  ('Moonshot Pró', 4, 'encontro_presencial', 'Encontro presencial', 'encontro', null, 'Encontro presencial com a aluna, quando houver. Se não houver, marque como não se aplica.'),
  ('Moonshot Pró', 5, 'consultoria_2', 'Retorno do 6º mês', 'consultoria', 2, 'Consultoria de acompanhamento, com plano de metas complementares em 7 dias.'),
  ('Moonshot Pró', 6, 'consultoria_3', 'Retorno do 9º mês', 'consultoria', 3, 'Consultoria de acompanhamento, com plano de metas complementares em 7 dias.'),
  ('Moonshot Pró', 7, 'consultoria_4', 'Retorno do 12º mês', 'consultoria', 4, 'Fechamento do ciclo: resultados do ano e próximos objetivos.'),
  ('Moonshot Pró', 8, 'proximos_passos', 'Renovação ou ascensão', 'encontro', null, 'Próximos passos: renovar, subir de programa ou encerrar. Registre o que foi combinado.'),
  ('Moonshot In Company', 1, 'reuniao_inicial', 'Consultoria inicial', 'consultoria', 0, 'Diagnóstico de 3 horas pelos pilares. Conferir o formulário 24h antes; sem formulário, remarcar.'),
  ('Moonshot In Company', 2, 'plano_acao', 'Plano de ação', 'encontro', null, 'Entregar em até 7 dias: PDF no Notion e na pasta da aluna, com áudio explicando as prioridades.'),
  ('Moonshot In Company', 3, 'visita_preparacao', 'Preparação da visita in loco', 'encontro', null, 'D-10 a D-1: data confirmada, termo assinado, questionário prévio, DISC da equipe, documentos e dossiê de pré-visita.'),
  ('Moonshot In Company', 4, 'visita_in_loco', 'Visita in loco', 'encontro', null, 'Um dia inteiro na operação: observação, jornada do cliente, equipe, financeiro, marketing e vendas. Termina com devolutiva preliminar.'),
  ('Moonshot In Company', 5, 'devolutiva_final', 'Devolutiva final e plano de 90 dias', 'encontro', null, 'Até D+10: diagnóstico validado, dashboard e plano de ação de 90 dias nos cinco pilares.'),
  ('Moonshot In Company', 6, 'consultoria_1', 'Retorno do 3º mês', 'consultoria', 1, 'Consultoria de acompanhamento: andamento das ações e resultados, com plano de metas complementares em 7 dias.'),
  ('Moonshot In Company', 7, 'consultoria_2', 'Retorno do 6º mês', 'consultoria', 2, 'Consultoria de acompanhamento, com plano de metas complementares em 7 dias.'),
  ('Moonshot In Company', 8, 'consultoria_3', 'Retorno do 9º mês', 'consultoria', 3, 'Consultoria de acompanhamento, com plano de metas complementares em 7 dias.'),
  ('Moonshot In Company', 9, 'consultoria_4', 'Retorno do 12º mês', 'consultoria', 4, 'Fechamento do ciclo: resultados do ano e próximos objetivos.'),
  ('Moonshot In Company', 10, 'proximos_passos', 'Renovação ou ascensão', 'encontro', null, 'Próximos passos: renovar, subir de programa ou encerrar. Registre o que foi combinado.'),
  ('Moonshot Private', 1, 'reuniao_inicial', 'Consultoria inicial', 'consultoria', 0, 'Diagnóstico de 3 horas pelos pilares. Conferir o formulário 24h antes; sem formulário, remarcar.'),
  ('Moonshot Private', 2, 'plano_acao', 'Plano de ação', 'encontro', null, 'Entregar em até 7 dias: PDF no Notion e na pasta da aluna, com áudio explicando as prioridades.'),
  ('Moonshot Private', 3, 'visita_preparacao', 'Preparação da visita in loco', 'encontro', null, 'D-10 a D-1: data confirmada, termo assinado, questionário prévio, DISC da equipe, documentos e dossiê de pré-visita.'),
  ('Moonshot Private', 4, 'visita_in_loco', 'Visita in loco', 'encontro', null, 'Um dia inteiro na operação: observação, jornada do cliente, equipe, financeiro, marketing e vendas. Termina com devolutiva preliminar.'),
  ('Moonshot Private', 5, 'devolutiva_final', 'Devolutiva final e plano de 90 dias', 'encontro', null, 'Até D+10: diagnóstico validado, dashboard e plano de ação de 90 dias nos cinco pilares.'),
  ('Moonshot Private', 6, 'consultoria_1', 'Retorno do 3º mês', 'consultoria', 1, 'Consultoria de acompanhamento: andamento das ações e resultados, com plano de metas complementares em 7 dias.'),
  ('Moonshot Private', 7, 'consultoria_2', 'Retorno do 6º mês', 'consultoria', 2, 'Consultoria de acompanhamento, com plano de metas complementares em 7 dias.'),
  ('Moonshot Private', 8, 'consultoria_3', 'Retorno do 9º mês', 'consultoria', 3, 'Consultoria de acompanhamento, com plano de metas complementares em 7 dias.'),
  ('Moonshot Private', 9, 'consultoria_4', 'Retorno do 12º mês', 'consultoria', 4, 'Fechamento do ciclo: resultados do ano e próximos objetivos.'),
  ('Moonshot Private', 10, 'proximos_passos', 'Renovação ou ascensão', 'encontro', null, 'Próximos passos: renovar, subir de programa ou encerrar. Registre o que foi combinado.')
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
