-- Entrada da aluna: formulario do negocio, pre-analise e validacao.
-- Aplicar DEPOIS de sistema_permissoes.sql.
--
-- 1. A CS envia o formulario (Google Forms) e marca "enviado".
-- 2. A resposta chega sozinha (Apps Script da planilha do Forms -> funcao
--    receber-formulario -> receber_formulario) e se liga a ficha pelo e-mail,
--    telefone ou nome.
-- 3. A CS cola as respostas no Gemini, cola a analise de volta e sugere
--    consultor e CS.
-- 4. A coordenacao valida: aprova ou troca (com motivo). A aluna entra na
--    carteira e consultor e CS sao avisados.
-- O que foi sugerido e o que foi decidido ficam guardados: e o que mostra
-- quando a sugestao ja e boa o bastante para automatizar.

create table if not exists config_texto (
    chave      text primary key,
    valor      text not null,
    descricao  text not null
);
insert into config_texto (chave, valor, descricao) values
  ('link_formulario', '', 'Link do Google Forms de cadastro do negocio que a CS envia para a aluna.')
on conflict (chave) do nothing;

-- Segredos que so funcoes do banco leem (nenhuma politica: ninguem le direto).
create table if not exists segredo (
    chave text primary key,
    valor text not null
);
insert into segredo (chave, valor) values ('token_formulario', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (chave) do nothing;

create table if not exists formulario_entrada (
    id           bigint generated always as identity primary key,
    aluna_id     bigint references aluna(id) on delete set null,
    nome         text,
    email        text,
    telefone     text,
    -- Pergunta e resposta na ordem do formulario: [{"pergunta": ..., "resposta": ...}]
    respostas    jsonb not null,
    enviado_em   timestamptz,
    recebido_em  timestamptz not null default now(),
    chave        text unique
);
create index if not exists ix_form_aluna on formulario_entrada(aluna_id);

create table if not exists pre_analise (
    id                    bigint generated always as identity primary key,
    aluna_id              bigint not null unique references aluna(id) on delete cascade,
    status                text not null default 'aguardando_formulario'
                          check (status in ('aguardando_formulario','formulario_recebido','para_validar','aprovada','ajustada')),
    formulario_enviado_em timestamptz,
    enviado_por           uuid references perfil(id) on delete set null,
    formulario_id         bigint references formulario_entrada(id) on delete set null,
    texto_ia              text,
    resumo                text,
    porte                 text,
    dores                 text,
    objetivos             text,
    nivel                 integer check (nivel between 1 and 5),
    justificativa         text,
    pauta                 text,
    consultor_sugerido_id uuid references perfil(id) on delete set null,
    cs_sugerido_id        uuid references perfil(id) on delete set null,
    analisado_por         uuid references perfil(id) on delete set null,
    analisado_em          timestamptz,
    consultor_final_id    uuid references perfil(id) on delete set null,
    cs_final_id           uuid references perfil(id) on delete set null,
    motivo_ajuste         text,
    validado_por          uuid references perfil(id) on delete set null,
    validado_em           timestamptz,
    criado_em             timestamptz not null default now(),
    atualizado_em         timestamptz not null default now()
);
create index if not exists ix_pre_status on pre_analise(status);

-- A CS marca que enviou o formulario (abre a pre-analise da aluna).
create or replace function enviar_formulario(p_aluna bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not edita_aluna() then raise exception 'sem permissao'; end if;
  insert into pre_analise (aluna_id, formulario_enviado_em, enviado_por)
  values (p_aluna, now(), auth.uid())
  on conflict (aluna_id) do update set formulario_enviado_em = now(), enviado_por = auth.uid(), atualizado_em = now()
  where pre_analise.status = 'aguardando_formulario';
end $$;

-- Liga a resposta a uma ficha: e-mail, depois telefone, depois nome exato.
create or replace function ligar_formulario(p_form bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare f formulario_entrada; aid bigint;
begin
  select * into f from formulario_entrada where id = p_form;
  aid := f.aluna_id;
  if aid is null and f.email is not null then
    select id into aid from aluna where lower(email) = lower(f.email) order by id limit 1;
  end if;
  if aid is null and norm_fone(f.telefone) is not null then
    select id into aid from aluna where norm_fone(telefone) = norm_fone(f.telefone) order by id limit 1;
  end if;
  if aid is null and f.nome is not null then
    -- Pelo nome, so quando ha uma ficha com esse nome (homonimo vira pendencia).
    select min(id) into aid from aluna where norm_nome(nome) = norm_nome(f.nome) having count(*) = 1;
  end if;
  if aid is null then return null; end if;
  update formulario_entrada set aluna_id = aid where id = p_form;
  insert into pre_analise (aluna_id, status, formulario_id)
  values (aid, 'formulario_recebido', p_form)
  on conflict (aluna_id) do update set formulario_id = excluded.formulario_id, atualizado_em = now(),
    status = case when pre_analise.status = 'aguardando_formulario' then 'formulario_recebido' else pre_analise.status end;
  return aid;
end $$;

-- Chega do Apps Script do Forms (pela funcao receber-formulario), com o token.
-- p_respostas: [{"pergunta": ..., "resposta": ...}] na ordem das colunas da
-- planilha (um objeto {"Pergunta": "Resposta"} tambem serve, mas perde a ordem).
create or replace function receber_formulario(p_token text, p_respostas jsonb, p_enviado_em timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lista jsonb := '[]'; k text; v jsonb; r text;
  v_nome text; v_email text; v_fone text; fid bigint; aid bigint;
begin
  if p_token is distinct from (select valor from segredo where chave = 'token_formulario') then
    raise exception 'token invalido';
  end if;
  for k, v in
    select e->>'pergunta', e->'resposta' from jsonb_array_elements(case when jsonb_typeof(p_respostas) = 'array' then p_respostas else '[]' end) e
    union all
    select * from jsonb_each(case when jsonb_typeof(p_respostas) = 'object' then p_respostas else '{}' end)
  loop
    r := case jsonb_typeof(v) when 'array' then (select string_agg(x, ', ') from jsonb_array_elements_text(v) x)
                              else v #>> '{}' end;
    if coalesce(trim(r), '') = '' or norm_nome(k) in ('carimbo de data hora', 'timestamp') then continue; end if;
    lista := lista || jsonb_build_object('pergunta', k, 'resposta', trim(r));
    if v_email is null and (norm_nome(k) like '%mail%') and r ~ '@' then v_email := lower(trim(r)); end if;
    if v_fone is null and norm_nome(k) ~ 'telefone|whats|celular|contato' and norm_fone(r) is not null then v_fone := r; end if;
    if v_nome is null and norm_nome(k) like '%nome%' and norm_nome(k) !~ 'empresa|negocio|marca|clinica|fantasia|social'
       then v_nome := trim(r); end if;
  end loop;
  insert into formulario_entrada (nome, email, telefone, respostas, enviado_em, chave)
  values (v_nome, v_email, v_fone, lista, p_enviado_em,
          md5(coalesce(v_email, v_nome, '') || '|' || coalesce(p_enviado_em::text, md5(lista::text))))
  on conflict (chave) do update set respostas = excluded.respostas
  returning id into fid;
  aid := ligar_formulario(fid);
  if aid is not null then
    perform notificar_papel('cs', 'entrada', 'Formulário respondido', coalesce(v_nome, 'Aluna') || ' respondeu o formulário do negócio.',
                            '/entrada?aluna=' || aid, 'form:' || fid);
  else
    perform notificar_papel('cs', 'entrada', 'Formulário sem ficha', coalesce(v_nome, v_email, 'Alguém') || ' respondeu, mas não achei a ficha.',
                            '/entrada?aba=sem_ficha', 'form:' || fid);
  end if;
  return jsonb_build_object('formulario', fid, 'aluna', aid);
end $$;

-- Resposta que nao achou ficha: a CS liga a uma aluna existente ou cria a ficha.
create or replace function ligar_formulario_a(p_form bigint, p_aluna bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare f formulario_entrada; aid bigint := p_aluna;
begin
  if not edita_aluna() then raise exception 'sem permissao'; end if;
  select * into f from formulario_entrada where id = p_form;
  if f.id is null then raise exception 'formulario % nao existe', p_form; end if;
  if aid is null then
    insert into aluna (nome, email, telefone, criado_por) values (coalesce(f.nome, 'Sem nome'), f.email, f.telefone, auth.uid())
    returning id into aid;
  end if;
  update formulario_entrada set aluna_id = aid where id = p_form;
  return ligar_formulario(p_form);
end $$;

-- A CS salva a pre-analise e manda para validacao.
create or replace function salvar_pre_analise(p_aluna bigint, p jsonb, p_enviar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a aluna;
begin
  if not edita_aluna() then raise exception 'sem permissao'; end if;
  select * into a from aluna where id = p_aluna;
  insert into pre_analise (aluna_id, status) values (p_aluna, 'formulario_recebido') on conflict (aluna_id) do nothing;
  update pre_analise set
    texto_ia = p->>'texto_ia', resumo = p->>'resumo', porte = p->>'porte', dores = p->>'dores',
    objetivos = p->>'objetivos', nivel = nullif(p->>'nivel', '')::int, justificativa = p->>'justificativa',
    pauta = p->>'pauta', consultor_sugerido_id = nullif(p->>'consultor_sugerido_id', '')::uuid,
    cs_sugerido_id = nullif(p->>'cs_sugerido_id', '')::uuid,
    analisado_por = auth.uid(), analisado_em = now(), atualizado_em = now(),
    status = case when p_enviar then 'para_validar' else status end
  where aluna_id = p_aluna and status not in ('aprovada', 'ajustada');
  if not found then raise exception 'esta pre-analise ja foi validada'; end if;
  if p_enviar then
    if nullif(p->>'consultor_sugerido_id', '') is null then raise exception 'sugira o consultor antes de enviar'; end if;
    perform notificar_papel('coordenador', 'entrada', 'Pré-análise para validar',
                            a.nome || ': sugestão de ' || (select nome from perfil where id = (p->>'consultor_sugerido_id')::uuid),
                            '/entrada?aluna=' || p_aluna);
  end if;
end $$;

-- A coordenacao valida. Consultor e CS finais iguais a sugestao: aprovada;
-- diferentes: ajustada, com o motivo. A aluna entra na carteira.
create or replace function validar_pre_analise(p_aluna bigint, p_consultor uuid, p_cs uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare pa pre_analise; a aluna; ajuste boolean;
begin
  if not eh_coordenador() then raise exception 'so a coordenacao valida'; end if;
  select * into pa from pre_analise where aluna_id = p_aluna;
  if pa.status <> 'para_validar' then raise exception 'esta pre-analise nao esta esperando validacao'; end if;
  if p_consultor is null then raise exception 'escolha o consultor'; end if;
  ajuste := p_consultor is distinct from pa.consultor_sugerido_id
         or (p_cs is not null and p_cs is distinct from pa.cs_sugerido_id);
  if ajuste and coalesce(trim(p_motivo), '') = '' then raise exception 'diga por que trocou: e o que ensina as regras'; end if;
  update pre_analise set status = case when ajuste then 'ajustada' else 'aprovada' end,
         consultor_final_id = p_consultor, cs_final_id = coalesce(p_cs, pa.cs_sugerido_id),
         motivo_ajuste = nullif(trim(p_motivo), ''), validado_por = auth.uid(), validado_em = now(), atualizado_em = now()
  where aluna_id = p_aluna;
  perform set_config('moonshot.motivo', 'Pré-análise validada', true);
  update aluna set consultor_id = p_consultor, cs_id = coalesce(p_cs, pa.cs_sugerido_id, cs_id) where id = p_aluna
  returning * into a;
  perform set_config('moonshot.motivo', '', true);
  perform notificar(a.consultor_id, 'carteira', 'Aluna nova na sua carteira',
                    a.nome || ': a pré-análise e a pauta do diagnóstico estão na ficha.', '/alunas/' || a.id);
  perform notificar(a.cs_id, 'carteira', 'Aluna nova no seu acompanhamento', a.nome, '/alunas/' || a.id);
end $$;

-- A coordenacao ve o token para colar no Apps Script da planilha do Forms.
create or replace function token_formulario() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not eh_coordenador() then raise exception 'so a coordenacao ve o token'; end if;
  return (select valor from segredo where chave = 'token_formulario');
end $$;

alter table config_texto enable row level security;
alter table segredo enable row level security;
alter table formulario_entrada enable row level security;
alter table pre_analise enable row level security;
do $$
declare p text[];
begin
  foreach p slice 1 in array array[
    ['config_texto', 'cfg_ler', 'create policy cfg_ler on config_texto for select to authenticated using (ativo())'],
    ['config_texto', 'cfg_mudar', 'create policy cfg_mudar on config_texto for update to authenticated using (eh_coordenador()) with check (eh_coordenador())'],
    ['formulario_entrada', 'form_ler', 'create policy form_ler on formulario_entrada for select to authenticated using (ativo())'],
    ['pre_analise', 'pre_ler', 'create policy pre_ler on pre_analise for select to authenticated using (ativo())']
  ] loop
    if not exists (select 1 from pg_policies where tablename = p[1] and policyname = p[2]) then
      execute p[3];
    end if;
  end loop;
end $$;
grant select on config_texto, formulario_entrada, pre_analise to authenticated;
grant update on config_texto to authenticated;

revoke execute on function receber_formulario(text, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function ligar_formulario(bigint) from public, anon, authenticated;
revoke execute on function enviar_formulario(bigint) from public, anon;
grant execute on function enviar_formulario(bigint) to authenticated;
revoke execute on function ligar_formulario_a(bigint, bigint) from public, anon;
grant execute on function ligar_formulario_a(bigint, bigint) to authenticated;
revoke execute on function salvar_pre_analise(bigint, jsonb, boolean) from public, anon;
grant execute on function salvar_pre_analise(bigint, jsonb, boolean) to authenticated;
revoke execute on function validar_pre_analise(bigint, uuid, uuid, text) from public, anon;
grant execute on function validar_pre_analise(bigint, uuid, uuid, text) to authenticated;
revoke execute on function token_formulario() from public, anon;
grant execute on function token_formulario() to authenticated;
