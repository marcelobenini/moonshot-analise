-- Pontuacao de potencial da aluna, de 0 a 100. Aplicar DEPOIS de sistema_crm.sql.
--
-- Calculada na hora, nunca gravada: coluna gravada envelhece em silencio (a
-- aluna para de responder e o numero continua alto). E aberta: a ficha mostra
-- de onde veio cada ponto, para a regra poder ser contestada.
--
--   Porte           ate 35  faturamento mensal contra o corte de oportunidade
--   Engajamento     ate 25  saude registrada pelo consultor
--   Relacao viva    ate 15  ultimo contato ou consultoria
--   Jornada         ate 15  consultorias realizadas
--   Espaco p/ subir ate 10  produto atual (quem esta no Club tem mais degrau)
--   Evento          +5      marcada como potencial alto num evento
--   Inadimplente    -25
--   Pausada/bloqueada -20 · cancelada/encerrada -40
--
-- Faixas: 70+ quente, 40 a 69 morno, abaixo de 40 frio.

create or replace function potencial_detalhe(a aluna) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  corte numeric := coalesce(param('corte_oportunidade'), 80000);
  porte int; engaj int; relacao int; jornada int; espaco int; evento int := 0; ajuste int := 0;
  feitas int; dias int; total int; itens jsonb := '[]';
begin
  porte := case when a.faturamento_mensal is null then 0
                else least(35, round(35 * a.faturamento_mensal / corte))::int end;
  itens := itens || jsonb_build_object('item', 'Porte', 'pontos', porte, 'max', 35,
    'porque', case when a.faturamento_mensal is null then 'faturamento não informado'
                   else 'fatura ' || to_char(a.faturamento_mensal, 'FM999G999G999') || '/mês' end);

  engaj := case a.saude when 'engajada' then 25 when 'renovou_upsell' then 25 when 'oscilante' then 12
                        when 'sem_contato' then 3 when 'risco_saida' then 0 else 8 end;
  itens := itens || jsonb_build_object('item', 'Engajamento', 'pontos', engaj, 'max', 25,
    'porque', coalesce(replace(a.saude, '_', ' '), 'saúde ainda não registrada'));

  dias := current_date - greatest(a.ultimo_contato, a.ultima_consultoria);
  relacao := case when dias is null then 0 when dias <= 30 then 15 when dias <= 60 then 10 when dias <= 90 then 5 else 0 end;
  itens := itens || jsonb_build_object('item', 'Relação viva', 'pontos', relacao, 'max', 15,
    'porque', case when dias is null then 'nenhum contato registrado' else 'último contato há ' || dias || ' dias' end);

  select count(distinct numero) into feitas from registro_consultoria
  where aluna_id = a.id and realizada and numero between 1 and 5;
  jornada := case when feitas >= 3 then 15 when feitas = 2 then 10 when feitas = 1 then 5 else 0 end;
  itens := itens || jsonb_build_object('item', 'Jornada', 'pontos', jornada, 'max', 15,
    'porque', feitas || ' de 5 consultorias feitas');

  espaco := case a.produto when 'Moonshot Club' then 10 when 'Moonshot Pró' then 8 when 'Máquina de Vendas' then 8
                           when 'Moonshot Elite' then 4 when 'Moonshot Private' then 2 when 'Moonshot In Company' then 2 else 6 end;
  itens := itens || jsonb_build_object('item', 'Espaço para subir', 'pontos', espaco, 'max', 10,
    'porque', coalesce(a.produto, 'produto não informado'));

  if exists (select 1 from evento_participante where aluna_id = a.id and potencial = 'alto') then
    evento := 5;
    itens := itens || jsonb_build_object('item', 'Evento', 'pontos', 5, 'max', 5, 'porque', 'potencial alto em evento');
  end if;

  if a.status_financeiro = 'inadimplente' then
    ajuste := ajuste - 25;
    itens := itens || jsonb_build_object('item', 'Inadimplente', 'pontos', -25, 'porque', 'pagamento em aberto');
  end if;
  if a.status_contrato in ('pausado', 'bloqueado') then
    ajuste := ajuste - 20;
    itens := itens || jsonb_build_object('item', 'Contrato ' || a.status_contrato, 'pontos', -20, 'porque', 'contrato parado');
  elsif a.status_contrato = 'em_cancelamento' then
    ajuste := ajuste - 30;
    itens := itens || jsonb_build_object('item', 'Em processo de cancelamento', 'pontos', -30, 'porque', 'pediu para sair');
  elsif a.status_contrato in ('cancelado', 'encerrado') then
    ajuste := ajuste - 40;
    itens := itens || jsonb_build_object('item', 'Contrato ' || a.status_contrato, 'pontos', -40, 'porque', 'fora do programa');
  end if;

  total := greatest(0, least(100, porte + engaj + relacao + jornada + espaco + evento + ajuste));
  return jsonb_build_object('pontos', total,
    'faixa', case when total >= 70 then 'quente' when total >= 40 then 'morno' else 'frio' end,
    'itens', itens);
end $$;

-- Coluna calculada: o app pede `aluna?select=*,potencial` e ordena por ela.
create or replace function potencial(a aluna) returns integer
language sql stable security definer set search_path = public as $$
  select (potencial_detalhe(a)->>'pontos')::int
$$;

revoke execute on function potencial_detalhe(aluna) from public, anon;
revoke execute on function potencial(aluna) from public, anon;
grant execute on function potencial_detalhe(aluna) to authenticated;
grant execute on function potencial(aluna) to authenticated;
