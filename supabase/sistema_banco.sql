-- Importacao da planilha "BANCO DE DADOS MOONSHOT": a base de alunas que a
-- equipe validou. O navegador (app/src/lib/banco.ts) ja entrega um registro
-- pronto por aluna em importacao_linha (aba 'BANCO'); aqui ele vira aluna,
-- contrato, CPF, agenda de consultorias, anotacao, fechamento e card do ciclo.
--
-- Chave: aluna.pessoa_id = numero do ID MS-xxxx (ou uma chave do nome, para
-- quem nao tem ID). Reimportar nao duplica nem sobrescreve: depois que a
-- aluna existe, quem manda e o sistema. Aplicar depois de sistema_planilhas.sql.

alter table importacao drop constraint if exists importacao_tipo_check;
alter table importacao add constraint importacao_tipo_check
  check (tipo in ('matriculas','consultorias','cancelamentos','maquina','inadimplentes','evento','kit','cadastro','banco'));

-- Perfil cujo "nome na planilha" bate com o texto.
create or replace function perfil_da_planilha(p_nome text, p_papeis text[]) returns uuid
language sql stable security definer set search_path = public as $$
  select p.id from perfil p
  where p.consultor_norm is not null and p.papel = any(p_papeis)
    and norm_nome(regexp_replace(coalesce(p_nome, ''), '(?i)\s+gera(l|is)$', '')) = any(nomes_planilha(p.consultor_norm))
  order by p.ativo desc nulls last limit 1
$$;
revoke execute on function perfil_da_planilha(text, text[]) from public, anon;

create or replace function importar_banco(p_imp bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n_alunas int; n_contratos int; n_cpf int; n_agenda int; n_notas int; n_fech int; n_cards int; n_total int;
  mes_atual date := date_trunc('month', current_date)::date;
begin
  perform set_config('moonshot.silencio', 'on', true);

  drop table if exists _b, _novas;
  create temp table _b on commit drop as
  select (dados->>'pid')::bigint as pid, dados as d
  from importacao_linha where importacao_id = p_imp and aba = 'BANCO' and dados ? 'pid';
  select count(*) into n_total from _b;

  -- 1) Alunas novas. Consultor e CS ja entram ligados ao perfil, para a regra
  -- de CS por consultor nao trocar a CS que a equipe validou.
  create temp table _novas (pid bigint primary key, aluna_id bigint) on commit drop;
  with ins as (
    insert into aluna (pessoa_id, nome, telefone, telefone2, email, cidade, ramo, produto, turma, inicio, termino,
                       status_contrato, status_financeiro, faturamento_mensal, consultor_planilha, cs_planilha,
                       consultor_id, cs_id, saude, forma_pagamento, plano_meses, contrato_assinatura,
                       acesso_plataforma, onboarding_status, grupo_avisos, ultima_consultoria)
    select b.pid, d->>'nome', d->>'telefone', d->>'telefone2', lower(d->>'email'), d->>'cidade', d->>'ramo',
           d->>'produto', d->>'turma', (d->>'inicio')::date, (d->>'termino')::date,
           coalesce(d->>'status', 'ativo'),
           case when (d->>'inadimplente')::boolean then 'inadimplente' end,
           nullif((d->>'faturamento')::numeric, 0), d->>'consultor', d->>'cs',
           perfil_da_planilha(d->>'consultor', array['consultor','coordenador']),
           perfil_da_planilha(d->>'cs', array['cs','coordenador']),
           d->>'saude', d->>'forma_pagamento', (d->>'plano_meses')::int, d->>'assinatura',
           d->>'acesso', d->>'onboarding', d->>'grupo',
           (select max((x->>1)::date) from jsonb_array_elements(coalesce(d->'c', '[]')) x
             where x->>1 ~ '^\d{4}-\d{2}-\d{2}$' and (x->>1)::date < mes_atual)
    from _b b
    where not exists (select 1 from aluna a where a.pessoa_id = b.pid)
    returning id, pessoa_id
  )
  insert into _novas select pessoa_id, id from ins;
  get diagnostics n_alunas = row_count;

  -- 2) Contrato do programa (a ficha espelha o contrato principal).
  insert into contrato (aluna_id, produto, turma, inicio, termino, plano_meses, status, status_financeiro,
                        forma_pagamento, assinatura, chave)
  select n.aluna_id, d->>'produto', d->>'turma', (d->>'inicio')::date, (d->>'termino')::date, (d->>'plano_meses')::int,
         coalesce(d->>'status', 'ativo'), case when (d->>'inadimplente')::boolean then 'inadimplente' end,
         d->>'forma_pagamento', d->>'assinatura', 'banco:' || b.pid
  from _b b join _novas n using (pid)
  where d->>'produto' is not null
  on conflict (chave) do nothing;
  get diagnostics n_contratos = row_count;

  -- 3) CPF, so em formato valido e sem repetir.
  insert into aluna_documento (aluna_id, cpf)
  select distinct on (cpf) n.aluna_id, cpf
  from (select pid, lpad(regexp_replace(d->>'cpf', '\D', '', 'g'), 11, '0') as cpf from _b
        where length(regexp_replace(coalesce(d->>'cpf', ''), '\D', '', 'g')) between 10 and 11) c
  join _novas n using (pid)
  on conflict do nothing;
  get diagnostics n_cpf = row_count;

  -- 4) Agenda: entrada (0) e 1a a 5a consultoria. Mes passado conta como feita;
  -- texto ("Não realizada", "Perdeu") fica na observacao, sem data.
  insert into consultoria_agenda (aluna_id, numero, data_prevista, realizada_em, observacao)
  select n.aluna_id, x.numero, x.data, case when x.data < mes_atual then x.data end, x.texto
  from _b b join _novas n using (pid)
  cross join lateral (
    select 0 as numero, (d->>'entrada')::date as data, null::text as texto where d->>'entrada' is not null
    union all
    select (e->>0)::int,
           case when e->>1 ~ '^\d{4}-\d{2}-\d{2}$' then (e->>1)::date end,
           case when e->>1 !~ '^\d{4}-\d{2}-\d{2}$' then e->>1 end
    from jsonb_array_elements(coalesce(d->'c', '[]')) e
  ) x
  on conflict (aluna_id, numero) do nothing;
  get diagnostics n_agenda = row_count;

  -- 5) Franquia, observacao da planilha e entrega do plano de acao viram anotacao.
  insert into nota_aluna (aluna_id, tipo, texto, origem)
  select n.aluna_id, 'situacao', t.texto, 'planilha: Banco de dados Moonshot'
  from _b b join _novas n using (pid)
  cross join lateral (
    select 'Franquia Natalia Beauty: o Moonshot Pró veio com a franquia.' as texto where (d->>'franquia')::boolean
    union all
    select d->>'obs' where d->>'obs' is not null
    union all
    select 'Plano de ação entregue em ' || to_char((d->>'entrega_plano')::date, 'MM/YYYY') where d->>'entrega_plano' is not null
  ) t
  on conflict do nothing;
  get diagnostics n_notas = row_count;

  -- 6) Fechamentos (In Company, Private e afins) com valor.
  insert into fechamento (aluna_id, contrato_id, nome, produto, data_fechamento, valor_total, valor_pago,
                          forma_pagamento, plano_pagamento, consultor_id, cs_id, status, chave)
  select n.aluna_id, (select id from contrato where chave = 'banco:' || b.pid), d->>'nome', d->>'produto',
         coalesce((d->'fech'->>'data')::date, (d->>'inicio')::date, current_date),
         (d->'fech'->>'total')::numeric, coalesce((d->'fech'->>'pago')::numeric, 0),
         d->'fech'->>'forma', d->'fech'->>'plano', a.consultor_id, a.cs_id,
         case when d->>'status' = 'cancelado' then 'cancelado' else 'implantacao' end, 'banco:' || b.pid
  from _b b join _novas n using (pid) join aluna a on a.id = n.aluna_id
  where d ? 'fech' and d->>'produto' in ('Moonshot In Company','Moonshot Private','Moonshot Pró','Moonshot Elite','Moonshot Club')
  on conflict (chave) do nothing;
  get diagnostics n_fech = row_count;

  -- 7) Ciclo de consultoria: aluna ativa com consultor entra na etapa da
  -- ultima consultoria feita.
  insert into card (funil_id, etapa_id, aluna_id, titulo, responsavel_id, dados)
  select 'consultoria',
         coalesce((select id from etapa where funil_id = 'consultoria' and marco_consultoria = least(f.feitas, 5) and f.feitas > 0),
                  etapa_de('consultoria', 1)),
         a.id, a.nome, a.consultor_id, jsonb_build_object('importado', true)
  from _novas n join aluna a on a.id = n.aluna_id
  cross join lateral (select count(*)::int as feitas from consultoria_agenda g
                      where g.aluna_id = a.id and g.numero between 1 and 5 and g.realizada_em is not null) f
  where a.status_contrato = 'ativo' and a.consultor_planilha is not null
    and not exists (select 1 from card where funil_id = 'consultoria' and aluna_id = a.id and fechado_em is null);
  get diagnostics n_cards = row_count;

  perform set_config('moonshot.silencio', 'off', true);
  return jsonb_build_object('alunas_novas', n_alunas, 'ja_existiam', n_total - n_alunas, 'contratos', n_contratos,
                            'cpfs', n_cpf, 'datas_de_agenda', n_agenda, 'anotacoes', n_notas,
                            'fechamentos', n_fech, 'ciclos_consultoria', n_cards);
end $$;
revoke execute on function importar_banco(bigint) from public, anon, authenticated;

-- Mesmo despachante de sistema_planilhas.sql, com o tipo 'banco'.
create or replace function processar_importacao(p_imp bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare t text; r jsonb; antes int;
begin
  if auth.uid() is not null and not eh_coordenador() then
    raise exception 'so a coordenacao importa planilhas';
  end if;
  select tipo into t from importacao where id = p_imp;
  r := case t
    when 'matriculas'    then importar_matriculas(p_imp)
    when 'consultorias'  then importar_consultorias(p_imp)
    when 'cancelamentos' then importar_cancelamentos(p_imp)
    when 'maquina'       then importar_maquina(p_imp)
    when 'inadimplentes' then importar_inadimplentes(p_imp)
    when 'evento'        then importar_evento(p_imp)
    when 'kit'           then importar_kit(p_imp)
    when 'cadastro'      then importar_cadastro(p_imp)
    when 'banco'         then importar_banco(p_imp)
  end;
  r := r || jsonb_build_object('pendencias', (select count(*) from importacao_pendencia where importacao_id = p_imp));
  update importacao set status = 'processada', resumo = r where id = p_imp;
  -- O dado ja foi para as fichas; a planilha crua nao fica guardada.
  update importacao_linha set dados = '{}'::jsonb where importacao_id = p_imp;
  perform auditar('planilha importada', (select arquivo from importacao where id = p_imp),
                  jsonb_build_object('tipo', t, 'resumo', r));
  -- Carteiras: consultor e CS da planilha viram perfil, se ja existir quem bata.
  perform vincular_equipe();
  return r;
end $$;
