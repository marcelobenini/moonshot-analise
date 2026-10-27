-- Os seis funis da especificacao (entregaveis/funis_uno_crm.md), como dado.
-- Aplicar DEPOIS de sistema.sql. Reaplicar atualiza nome, permissao, campos e
-- etapas sem perder card: etapa e casada por (funil, ordem).
--
-- Mudar o processo e editar este arquivo e reaplicar, ou editar a linha na
-- tela da coordenacao. `alerta_dias` e `gatilho` sao as automacoes.

insert into funil (id, nome, descricao, ordem, papeis_editam, papeis_leem, restringe_carteira, campos, motivos) values
('onboarding', 'Onboarding', 'Da matrícula confirmada até a aluna ativada.', 1,
 '{cs}', '{retencao,consultor}', true,
 '[{"chave":"onboarding_em","rotulo":"Data do onboarding","tipo":"data"},
   {"chave":"tamanho_kit","rotulo":"Tamanho do kit","tipo":"selecao","opcoes":["PP","P","M","G","GG","XG"]},
   {"chave":"kit_enviado_em","rotulo":"Kit enviado em","tipo":"data"},
   {"chave":"rastreio","rotulo":"Código de rastreio","tipo":"texto"},
   {"chave":"eventos","rotulo":"Presença em eventos","tipo":"texto"}]',
 '{}'),
('consultoria', 'Ciclo de consultoria', 'As cinco consultorias do contrato. O card anda sozinho quando a consultoria é registrada.', 2,
 '{consultor}', '{cs,retencao}', true,
 '[{"chave":"proxima_consultoria","rotulo":"Próxima consultoria","tipo":"data"},
   {"chave":"plano_acao","rotulo":"Plano de ação (link)","tipo":"texto"}]',
 '{}'),
('oportunidades', 'Oportunidades', 'Venda, não entrega: a aluna pode estar na 3ª consultoria e em negociação ao mesmo tempo.', 3,
 '{consultor}', '{comercial}', true,
 '[{"chave":"produto","rotulo":"Produto de interesse","tipo":"selecao","opcoes":["Elite","Private","Presencial","Clínica","Produtos"]},
   {"chave":"faturamento_informado","rotulo":"Faturamento atual","tipo":"moeda"},
   {"chave":"justificativa","rotulo":"Justificativa do consultor","tipo":"textao"},
   {"chave":"canal","rotulo":"Melhor canal e horário","tipo":"texto"},
   {"chave":"observacao_consultor","rotulo":"Observação na passagem","tipo":"textao"}]',
 '{Sem fit,Fora de momento,Sem orçamento,Já comprou,Outro}'),
('comercial', 'Comercial', 'Oportunidade recebida até contrato assinado.', 4,
 '{comercial}', '{}', false,
 '[{"chave":"produto","rotulo":"Produto","tipo":"selecao","opcoes":["Elite","Private","Presencial","Clínica","Produtos"]},
   {"chave":"origem","rotulo":"Origem","tipo":"selecao","opcoes":["consultor","lista","inbound"]},
   {"chave":"enviado_por","rotulo":"Enviado por","tipo":"texto"},
   {"chave":"faturamento_informado","rotulo":"Faturamento atual","tipo":"moeda"},
   {"chave":"justificativa","rotulo":"Justificativa do consultor","tipo":"textao"},
   {"chave":"canal","rotulo":"Melhor canal e horário","tipo":"texto"},
   {"chave":"observacao_consultor","rotulo":"Observação na passagem","tipo":"textao"},
   {"chave":"valor_fechado","rotulo":"Valor fechado","tipo":"moeda"}]',
 '{Preço,Sem fit,Fora de momento,Concorrente,Sem retorno,Outro}'),
('renovacao', 'Renovação', 'Nasce sozinho 120 dias antes do término do contrato.', 5,
 '{cs,consultor}', '{retencao}', true,
 '[{"chave":"mes_vencimento","rotulo":"Mês de vencimento","tipo":"texto"},
   {"chave":"condicoes","rotulo":"Condições propostas","tipo":"textao"}]',
 '{Financeiro,Insatisfação com a entrega,Saúde ou pessoal,Falta de tempo,Fechou ou vendeu o negócio,Outro}'),
('retencao', 'Retenção', 'Pedido de saída até o desfecho. Dentro de 7 dias é arrependimento (CDC art. 49), não retenção.', 6,
 '{retencao}', '{cs,consultor}', true,
 '[{"chave":"prazo","rotulo":"Prazo","tipo":"selecao","opcoes":["dentro_7_dias","fora_7_dias"]},
   {"chave":"data_pedido","rotulo":"Data do pedido","tipo":"data"},
   {"chave":"proposta","rotulo":"Proposta oferecida","tipo":"selecao","opcoes":["Downsell","Pausa","Renegociação","Nenhuma"]},
   {"chave":"multa","rotulo":"Valor da multa","tipo":"moeda"},
   {"chave":"observacoes","rotulo":"Observações","tipo":"textao"}]',
 '{Financeiro,Insatisfação com a entrega,Saúde ou pessoal,Falta de tempo,Fechou ou vendeu o negócio,Outro}')
on conflict (id) do update set
  nome = excluded.nome, descricao = excluded.descricao, ordem = excluded.ordem,
  papeis_editam = excluded.papeis_editam, papeis_leem = excluded.papeis_leem,
  restringe_carteira = excluded.restringe_carteira, campos = excluded.campos,
  motivos = excluded.motivos;

-- (funil, ordem, nome, tipo, exige_motivo, alerta_dias, alerta_coordenacao, gatilho, marco)
with e(funil_id, ordem, nome, tipo, exige_motivo, alerta_dias, alerta_coordenacao, gatilho, marco) as (values
  ('onboarding', 1, 'Matrícula confirmada', 'aberta', false, 3, false, null, null::int),
  ('onboarding', 2, 'Primeiro contato', 'aberta', false, null, false, null, null),
  ('onboarding', 3, 'Onboarding agendado', 'aberta', false, 7, true, null, null),
  ('onboarding', 4, 'Onboarding realizado', 'aberta', false, 7, true, null, null),
  ('onboarding', 5, 'Acesso liberado', 'aberta', false, null, false, null, null),
  ('onboarding', 6, 'Grupo de avisos', 'aberta', false, null, false, null, null),
  ('onboarding', 7, 'Kit enviado', 'aberta', false, null, false, null, null),
  ('onboarding', 8, 'Ativada', 'ganha', false, null, false, 'criar_ciclo_consultor', null),

  ('consultoria', 1, 'Carteira atribuída', 'aberta', false, 14, false, null, null),
  ('consultoria', 2, 'Entrada / diagnóstico', 'aberta', false, null, false, null, 0),
  ('consultoria', 3, '1ª consultoria', 'aberta', false, null, false, null, 1),
  ('consultoria', 4, 'Plano de ação entregue', 'aberta', false, null, false, null, null),
  ('consultoria', 5, '2ª consultoria', 'aberta', false, null, false, null, 2),
  ('consultoria', 6, '3ª consultoria', 'aberta', false, null, false, null, 3),
  ('consultoria', 7, '4ª consultoria', 'aberta', false, null, false, null, 4),
  ('consultoria', 8, 'Ciclo concluído', 'ganha', false, null, false, null, 5),

  ('oportunidades', 1, 'Sinalizada', 'aberta', false, null, false, null, null),
  ('oportunidades', 2, 'Qualificada pelo consultor', 'aberta', false, null, false, null, null),
  ('oportunidades', 3, 'Enviada ao comercial', 'aberta', false, null, false, 'enviar_comercial', null),
  ('oportunidades', 4, 'Virou venda', 'ganha', false, null, false, null, null),
  ('oportunidades', 5, 'Devolvida', 'perdida', true, null, false, 'devolvida', null),

  ('comercial', 1, 'Oportunidade recebida', 'aberta', false, 2, false, null, null),
  ('comercial', 2, 'Qualificada', 'aberta', false, null, false, null, null),
  ('comercial', 3, 'Contato realizado', 'aberta', false, 2, false, null, null),
  ('comercial', 4, 'Apresentação feita', 'aberta', false, null, false, null, null),
  ('comercial', 5, 'Proposta enviada', 'aberta', false, 7, true, null, null),
  ('comercial', 6, 'Em negociação', 'aberta', false, null, false, null, null),
  ('comercial', 7, 'Ganha', 'ganha', false, null, false, 'comercial_ganha', null),
  ('comercial', 8, 'Perdida', 'perdida', true, null, false, 'comercial_perdida', null),

  ('renovacao', 1, 'Vencimento em 120 dias', 'aberta', false, 21, false, null, null),
  ('renovacao', 2, 'Abordagem iniciada', 'aberta', false, null, false, null, null),
  ('renovacao', 3, 'Interesse confirmado', 'aberta', false, null, false, null, null),
  ('renovacao', 4, 'Proposta de renovação', 'aberta', false, 10, true, null, null),
  ('renovacao', 5, 'Renovada', 'ganha', false, null, false, null, null),
  ('renovacao', 6, 'Não renovada', 'perdida', true, null, false, null, null),
  ('renovacao', 7, 'Encaminhada à Retenção', 'perdida', false, null, false, 'encaminhar_retencao', null),

  -- Etapa 1 e o sinal que chega antes do pedido (consultor marcou risco, a
  -- renovacao sinalizou saida). Nao existe na planilha: hoje o risco so vira
  -- trabalho quando a aluna ja pediu para sair.
  ('retencao', 1, 'Risco sinalizado', 'aberta', false, 3, false, null, null),
  ('retencao', 2, 'Pedido recebido', 'aberta', false, 1, true, 'avisar_pedido_saida', null),
  ('retencao', 3, 'Triagem de prazo', 'aberta', false, 2, false, null, null),
  ('retencao', 4, 'Em contato', 'aberta', false, 5, false, null, null),
  -- Downsell e etapa propria: 20 de 26 ficaram (77% contra 64% da media).
  ('retencao', 5, 'Proposta de retenção / downsell', 'aberta', false, 7, false, null, null),
  ('retencao', 6, 'Retida', 'ganha', false, null, false, null, null),
  ('retencao', 7, 'Cancelada', 'perdida', true, null, false, null, null),
  ('retencao', 8, 'Jurídico / multa', 'perdida', true, null, true, null, null)
)
insert into etapa (funil_id, ordem, nome, tipo, exige_motivo, alerta_dias, alerta_coordenacao, gatilho, marco_consultoria)
select funil_id, ordem, nome, tipo, exige_motivo, alerta_dias, alerta_coordenacao, gatilho, marco from e
on conflict (funil_id, ordem) do update set
  nome = excluded.nome, tipo = excluded.tipo, exige_motivo = excluded.exige_motivo,
  alerta_dias = excluded.alerta_dias, alerta_coordenacao = excluded.alerta_coordenacao,
  gatilho = excluded.gatilho, marco_consultoria = excluded.marco_consultoria;

-- Ascensao: a escada da aluna, Club -> Pro -> In Company -> Private. Cada
-- coluna e um degrau; subir a aluna de coluna e ela ascender de programa. O
-- consultor sobe quem esta pronta, o comercial fecha, a CS acompanha.
-- "A definir" segura quem ainda nao tem o programa claro no cadastro.
insert into funil (id, nome, descricao, ordem, papeis_editam, papeis_leem, restringe_carteira, campos, motivos) values
  ('ascensao', 'Ascensão', 'Escada da aluna: Club → Pró → In Company → Private. Mova a aluna para o degrau em que ela está.', 7,
   '{consultor,comercial,cs}', '{retencao}', true,
   '[{"chave":"proximo_degrau_em","rotulo":"Previsão de subir","tipo":"data"},
     {"chave":"degrau_origem","rotulo":"De onde veio o degrau","tipo":"texto"},
     {"chave":"observacao","rotulo":"Observação","tipo":"textao"}]', '{}')
on conflict (id) do update set nome = excluded.nome, descricao = excluded.descricao, papeis_editam = excluded.papeis_editam,
  papeis_leem = excluded.papeis_leem, campos = excluded.campos;

insert into etapa (funil_id, ordem, nome, tipo) values
  ('ascensao', 1, 'A definir', 'aberta'),
  ('ascensao', 2, 'Moonshot Club', 'aberta'),
  ('ascensao', 3, 'Moonshot Pró', 'aberta'),
  ('ascensao', 4, 'Moonshot In Company', 'aberta'),
  ('ascensao', 5, 'Moonshot Private', 'aberta')
on conflict (funil_id, ordem) do update set nome = excluded.nome, tipo = excluded.tipo;
