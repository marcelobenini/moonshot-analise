-- Importacao inicial: da base historica (pessoa, fato_*) para o sistema.
-- Aplicar DEPOIS de sistema.sql e sistema_funis.sql, com a base carregada.
--
--     select importar_base_historica();   -- alunas, ciclos e pedidos em aberto
--     select vincular_equipe();           -- liga carteira a perfil (rodar de novo
--                                         -- sempre que entrar consultor novo)
--     select rotina_diaria();             -- gera os cards de renovacao
--
-- Idempotente: aluna ja importada (mesmo pessoa_id) nao entra de novo, e o
-- indice de card aberto por funil impede card duplicado. Depois do corte, quem
-- manda e o sistema: rodar de novo so traz alunas que ainda nao existem.

create or replace function importar_base_historica() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n_alunas int; n_ciclos int; n_pedidos int;
begin
  perform set_config('moonshot.silencio', 'on', true);

  -- Uma aluna por pessoa com matricula. Contrato vem da matricula mais recente;
  -- consultor vem da aba do consultor quando existe, porque ela e mais confiavel
  -- que a coluna da matricula (divergem em 59 casos).
  with m as (
    select distinct on (pessoa_id) * from fato_matricula
    where pessoa_id is not null order by pessoa_id, termino desc nulls last, id desc
  ), c as (
    select distinct on (pessoa_id) * from fato_consultoria
    where pessoa_id is not null order by pessoa_id, id desc
  ), cfat as (
    select distinct on (pessoa_id) pessoa_id, fat_mes from fato_consultoria
    where pessoa_id is not null and fat_mes > 0 order by pessoa_id, id desc
  ), f as (
    select distinct on (pessoa_id) pessoa_id, empresa, fat_declarado from fato_formulario
    where pessoa_id is not null order by pessoa_id, id desc
  )
  insert into aluna (pessoa_id, nome, telefone, email, empresa, ramo, cidade, produto, turma,
                     inicio, termino, status_contrato, status_financeiro, faturamento_mensal,
                     consultor_planilha, criado_por)
  select p.id, p.nome_canonico, m.telefone, m.email, f.empresa, c.ramo, c.cidade, m.produto, m.turma,
         m.inicio, m.termino,
         case when norm_nome(m.status) like '%cancel%' then 'cancelado'
              when norm_nome(m.status) like '%encerr%' then 'encerrado'
              when norm_nome(m.status) like '%pausad%' then 'pausado'
              when norm_nome(m.status) like '%bloquead%' then 'bloqueado'
              when norm_nome(m.status) like '%pendente%' then 'pendente'
              else 'ativo' end,
         m.status_financeiro,
         coalesce(cfat.fat_mes, f.fat_declarado),
         coalesce(c.consultor_norm, m.consultor_norm),
         null
  from pessoa p
  join m on m.pessoa_id = p.id
  left join c on c.pessoa_id = p.id
  left join cfat on cfat.pessoa_id = p.id
  left join f on f.pessoa_id = p.id
  where not exists (select 1 from aluna a where a.pessoa_id = p.id);
  get diagnostics n_alunas = row_count;

  -- Ciclo de consultoria: aluna ativa com consultor vira card na etapa da
  -- ultima consultoria feita, contada pela planilha.
  insert into card (funil_id, etapa_id, aluna_id, titulo, dados)
  select 'consultoria',
         coalesce((select id from etapa where funil_id = 'consultoria'
                   and marco_consultoria = least(coalesce(fc.consultorias, 0), 5)
                   and coalesce(fc.consultorias, 0) > 0),
                  etapa_de('consultoria', 1)),
         a.id, a.nome, jsonb_build_object('importado', true)
  from aluna a
  left join lateral (select consultorias from fato_consultoria
                     where pessoa_id = a.pessoa_id order by id desc limit 1) fc on true
  where a.status_contrato = 'ativo' and a.consultor_planilha is not null
    and not exists (select 1 from card where funil_id = 'consultoria' and aluna_id = a.id);
  get diagnostics n_ciclos = row_count;

  -- Pedidos de saida ainda sem desfecho continuam como trabalho de retencao.
  insert into card (funil_id, etapa_id, aluna_id, titulo, motivo, dados)
  select distinct on (a.id) 'retencao', etapa_de('retencao', 4), a.id, a.nome, k.motivo,
         jsonb_strip_nulls(jsonb_build_object(
           'importado', true,
           'data_pedido', k.data_pedido::text,
           'prazo', case when k.aba ilike '%7 dias%' then 'dentro_7_dias' else 'fora_7_dias' end,
           'observacoes', k.observacoes))
  from fato_cancelamento k join aluna a on a.pessoa_id = k.pessoa_id
  where k.desfecho = 'em_aberto'
    and not exists (select 1 from card where funil_id = 'retencao' and aluna_id = a.id)
  order by a.id, k.data_pedido desc nulls last;
  get diagnostics n_pedidos = row_count;

  perform set_config('moonshot.silencio', 'off', true);
  return jsonb_build_object('alunas', n_alunas, 'ciclos_consultoria', n_ciclos,
                            'pedidos_em_aberto', n_pedidos);
end $$;

-- Liga `consultor_planilha` ao perfil cujo `consultor_norm` bate. Cards de
-- ciclo e renovacao sem responsavel herdam o consultor da aluna.
create or replace function vincular_equipe() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_alunas int; n_cards int;
begin
  if auth.uid() is not null and not eh_coordenador() then
    raise exception 'so a coordenacao vincula carteiras';
  end if;
  perform set_config('moonshot.silencio', 'on', true);
  update aluna a set consultor_id = p.id
  from perfil p
  where a.consultor_id is null and p.consultor_norm is not null
    and norm_nome(a.consultor_planilha) = norm_nome(p.consultor_norm);
  get diagnostics n_alunas = row_count;

  update card c set responsavel_id = a.consultor_id
  from aluna a
  where c.aluna_id = a.id and c.responsavel_id is null and a.consultor_id is not null
    and c.funil_id in ('consultoria', 'oportunidades');
  get diagnostics n_cards = row_count;
  perform set_config('moonshot.silencio', 'off', true);
  return jsonb_build_object('alunas_vinculadas', n_alunas, 'cards_atribuidos', n_cards);
end $$;

revoke execute on function importar_base_historica() from public, authenticated, anon;
revoke execute on function vincular_equipe() from public, anon;
grant execute on function vincular_equipe() to authenticated;
