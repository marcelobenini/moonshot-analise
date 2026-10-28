-- Teste da entrada: formulario, pre-analise e validacao (sistema_entrada.sql).
-- Roda depois de teste_sistema.sql (usa ok, como, barrado, conta_como).

\set ON_ERROR_STOP 1
\set QUIET 1

begin;

insert into auth.users (id, email, raw_user_meta_data) values
 ('40000000-0000-0000-0000-00000000000c', 'coord7@nb.com', '{"nome":"Coord"}'),
 ('40000000-0000-0000-0000-0000000000a1', 'cs7@nb.com',    '{"nome":"CS Sete"}'),
 ('40000000-0000-0000-0000-0000000000a2', 'cs6@nb.com',    '{"nome":"CS Seis"}'),
 ('40000000-0000-0000-0000-0000000000b1', 'cons7@nb.com',  '{"nome":"Consultor Sete"}'),
 ('40000000-0000-0000-0000-0000000000b2', 'cons6@nb.com',  '{"nome":"Consultor Seis"}');
update perfil set ativo = true, papel = 'coordenador' where email = 'coord7@nb.com';
update perfil set ativo = true, papel = 'cs'          where email in ('cs7@nb.com', 'cs6@nb.com');
update perfil set ativo = true, papel = 'consultor'   where email in ('cons7@nb.com', 'cons6@nb.com');
\set coord '''40000000-0000-0000-0000-00000000000c'''
\set cs    '''40000000-0000-0000-0000-0000000000a1'''
\set cs2   '''40000000-0000-0000-0000-0000000000a2'''
\set cons  '''40000000-0000-0000-0000-0000000000b1'''
\set cons2 '''40000000-0000-0000-0000-0000000000b2'''

insert into aluna (nome, email, telefone) values ('Rosa Teste Entrada', 'rosa@exemplo.teste', '11 97777-1234');
\set rosa '(select id from aluna where nome = ''Rosa Teste Entrada'')'

select como(:cs, $$select enviar_formulario((select id from aluna where nome = 'Rosa Teste Entrada'))$$);
select ok((select status = 'aguardando_formulario' and enviado_por = '40000000-0000-0000-0000-0000000000a1'
           from pre_analise where aluna_id = :rosa), 'CS marca o formulario como enviado');

select ok(barrado(:cs, $$select receber_formulario('x', '[]')$$), 'receber formulario nao e chamado pelo app');
select ok(barrado(:cs, 'select token_formulario()') and not barrado(:coord, 'select token_formulario()'),
          'so a coordenacao ve o token do formulario');
do $$ begin
  perform receber_formulario('token-errado', '[]'::jsonb);
  raise exception 'FALHOU: token errado passou';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok  token errado e recusado';
end $$;

select receber_formulario((select valor from segredo where chave = 'token_formulario'),
  '[{"pergunta":"Nome completo","resposta":"Rosa T. Entrada"},
    {"pergunta":"E-mail","resposta":"ROSA@exemplo.teste"},
    {"pergunta":"Nome da empresa","resposta":"Clinica Rosa"},
    {"pergunta":"Qual o faturamento mensal?","resposta":"80 mil"},
    {"pergunta":"Maior dor hoje","resposta":"Equipe nao vende"}]'::jsonb, '2026-10-20 10:00');
select ok((select p.status = 'formulario_recebido' and jsonb_array_length(f.respostas) = 5
                  and f.respostas->0->>'pergunta' = 'Nome completo' and f.respostas->2->>'resposta' = 'Clinica Rosa'
           from pre_analise p join formulario_entrada f on f.id = p.formulario_id where p.aluna_id = :rosa),
          'resposta chega, acha a ficha pelo e-mail e guarda as perguntas na ordem');
select ok((select count(*) >= 1 from notificacao where usuario_id = :cs and tipo = 'entrada'), 'CS e avisada');

select receber_formulario((select valor from segredo where chave = 'token_formulario'),
  '[{"pergunta":"Nome completo","resposta":"Pessoa Sem Ficha Teste"},{"pergunta":"E-mail","resposta":"nova@exemplo.teste"}]'::jsonb);
select ok((select aluna_id is null from formulario_entrada where email = 'nova@exemplo.teste'), 'sem ficha fica pendente');
select como(:cs2, $$select ligar_formulario_a((select id from formulario_entrada where email = 'nova@exemplo.teste'), null)$$);
select ok(exists (select 1 from aluna a join pre_analise p on p.aluna_id = a.id
                  where a.email = 'nova@exemplo.teste' and p.status = 'formulario_recebido'),
          'CS cria a ficha a partir da resposta');

select ok(barrado(:cs, $$select salvar_pre_analise((select id from aluna where nome = 'Rosa Teste Entrada'), '{"resumo":"x"}', true)$$),
          'nao envia sem consultor sugerido');
select como(:cs, $$select salvar_pre_analise((select id from aluna where nome = 'Rosa Teste Entrada'),
  '{"resumo":"Clinica com 6 funcionarias","nivel":"2","consultor_sugerido_id":"40000000-0000-0000-0000-0000000000b1",
    "cs_sugerido_id":"40000000-0000-0000-0000-0000000000a1","pauta":"Metas e rotina comercial"}', true)$$);
select ok((select status = 'para_validar' and nivel = 2 and analisado_por = :cs from pre_analise where aluna_id = :rosa),
          'CS salva a pre-analise e manda para validacao');
select ok((select count(*) >= 1 from notificacao where usuario_id = :coord and tipo = 'entrada'), 'coordenacao e avisada');

select ok(barrado(:cs, $$select validar_pre_analise((select id from aluna where nome = 'Rosa Teste Entrada'), '40000000-0000-0000-0000-0000000000b1', null, null)$$),
          'so a coordenacao valida');
select ok(barrado(:coord, $$select validar_pre_analise((select id from aluna where nome = 'Rosa Teste Entrada'), '40000000-0000-0000-0000-0000000000b2', null, '')$$),
          'trocar o consultor exige motivo');
select como(:coord, $$select validar_pre_analise((select id from aluna where nome = 'Rosa Teste Entrada'), '40000000-0000-0000-0000-0000000000b2', null, 'Perfil de clinica e com o Seis')$$);
select ok((select p.status = 'ajustada' and p.consultor_sugerido_id = :cons and p.consultor_final_id = :cons2
                  and a.consultor_id = :cons2 and a.cs_id = :cs
           from pre_analise p join aluna a on a.id = p.aluna_id where p.aluna_id = :rosa),
          'validar com troca guarda sugerido e decidido e poe a aluna na carteira');
select ok((select count(*) >= 1 from notificacao where usuario_id = :cons2 and tipo = 'carteira'), 'consultor escolhido e avisado');
select ok(conta_como(:cons2, 'select 1 from pre_analise where status = ''ajustada''') >= 1, 'consultor le a pre-analise');

rollback;
\echo 'TODOS OS TESTES DE ENTRADA PASSARAM'
