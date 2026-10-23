-- Numeros do painel do Inicio, ja agregados. Aplicar DEPOIS de sistema_potencial.sql.
-- security invoker: conta so o que quem pergunta pode ver. `p_minha` restringe
-- a carteira de quem pergunta (consultor ou CS), como no resto do Inicio.

create or replace function painel(p_minha boolean default false) returns jsonb
language sql stable security invoker set search_path = public as $$
  with base as (
    select a.* from aluna a
    where not p_minha or a.consultor_id = auth.uid() or a.cs_id = auth.uid()
  ), ativas as (
    select b.*, potencial(b::aluna) as pot from base b where b.status_contrato = 'ativo'
  ), semanas as (
    select generate_series(date_trunc('week', current_date) - interval '11 weeks',
                           date_trunc('week', current_date), interval '1 week')::date as semana
  ), contatos as (
    select date_trunc('week', n.criado_em)::date as semana, count(*) as n
    from nota_aluna n join base b on b.id = n.aluna_id
    where n.tipo = 'contato' and n.criado_em >= current_date - interval '12 weeks'
    group by 1
  ), consultorias as (
    select date_trunc('week', r.data)::date as semana, count(*) as n
    from registro_consultoria r join base b on b.id = r.aluna_id
    where r.realizada and r.data >= current_date - interval '12 weeks'
    group by 1
  )
  select jsonb_build_object(
    'ativas', (select count(*) from ativas),
    'novas_30d', (select count(*) from base where criado_em >= now() - interval '30 days'),
    'faturamento', (select coalesce(sum(faturamento_mensal), 0) from ativas),
    'com_faturamento', (select count(*) from ativas where faturamento_mensal is not null),
    'em_risco', (select count(*) from ativas where saude in ('risco_saida', 'sem_contato')),
    'inadimplentes', (select count(*) from base where status_financeiro = 'inadimplente'
                        and status_contrato not in ('cancelado', 'encerrado')),
    'saude', (select jsonb_object_agg(coalesce(saude, 'sem_registro'), n)
              from (select saude, count(*) as n from ativas group by saude) s),
    'potencial', jsonb_build_object(
      'quente', (select count(*) from ativas where pot >= 70),
      'morno', (select count(*) from ativas where pot >= 40 and pot < 70),
      'frio', (select count(*) from ativas where pot < 40)),
    'produtos', (select jsonb_object_agg(coalesce(produto, 'Sem produto'), n)
                 from (select produto, count(*) as n from ativas group by produto) p),
    'semanas', (select jsonb_agg(jsonb_build_object('semana', s.semana,
                                   'contatos', coalesce(c.n, 0), 'consultorias', coalesce(r.n, 0)) order by s.semana)
                from semanas s left join contatos c using (semana) left join consultorias r using (semana))
  )
$$;

revoke execute on function painel(boolean) from public, anon;
grant execute on function painel(boolean) to authenticated;
