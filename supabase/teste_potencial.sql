-- Teste da pontuacao de potencial (sistema_potencial.sql).

\set ON_ERROR_STOP 1
\set QUIET 1

begin;

insert into auth.users (id, email, raw_user_meta_data) values
 ('40000000-0000-0000-0000-0000000000b1', 'cons5@nb.com', '{"nome":"Consultor"}');
update perfil set ativo = true, papel = 'consultor' where email = 'cons5@nb.com';
\set cons '''40000000-0000-0000-0000-0000000000b1'''

insert into aluna (nome, produto, faturamento_mensal, saude, ultimo_contato, status_contrato, consultor_id) values
 ('Quente Teste Um', 'Moonshot Club', 120000, 'engajada', current_date - 5, 'ativo', :cons),
 ('Fria Teste Dois', 'Moonshot Private', null, 'risco_saida', null, 'ativo', :cons),
 ('Devendo Teste Tres', 'Moonshot Club', 120000, 'engajada', current_date - 5, 'ativo', :cons);
update aluna set status_financeiro = 'inadimplente' where nome = 'Devendo Teste Tres';
insert into registro_consultoria (aluna_id, consultor_id, numero, saude, situacao)
select id, :cons, n, 'engajada', 'ok' from aluna, generate_series(1, 3) n where nome = 'Quente Teste Um';

select ok((select potencial(a) from aluna a where nome = 'Quente Teste Um') = 100,
          'engajada, porte alto, contato recente e 3 consultorias: 100');
select ok((select potencial_detalhe(a)->>'faixa' from aluna a where nome = 'Quente Teste Um') = 'quente', 'faixa quente');
select ok((select potencial(a) from aluna a where nome = 'Fria Teste Dois') < 40, 'risco de saida, sem faturamento: fria');
select ok((select potencial(a) from aluna a where nome = 'Devendo Teste Tres')
          = (select potencial(a) from aluna a where nome = 'Quente Teste Um') - 25 - 15,
          'inadimplencia tira 25 (e a outra nao tem as consultorias)');
select ok((select jsonb_array_length(potencial_detalhe(a)->'itens') >= 5 from aluna a where nome = 'Quente Teste Um'),
          'detalhe mostra de onde veio cada ponto');
select ok(conta_como(:cons, $$select potencial(a) from aluna a where nome = 'Quente Teste Um'$$) = 1,
          'quem ve a aluna ve a pontuacao');

select ok((select (painel(false)->>'ativas')::int >= 3), 'painel conta as alunas ativas');
select como(:cons, $$create temp table p_cons as select painel(true) as p$$);
select ok((select (p->>'ativas')::int = 3 and (p->'potencial'->>'quente')::int = 1
                  and (p->>'inadimplentes')::int = 1 and jsonb_array_length(p->'semanas') = 12
                  and (p->'semanas'->11->>'consultorias')::int = 3 from p_cons),
          'painel da carteira: ativas, potencial, inadimplentes e 12 semanas de atividade');

rollback;
\echo 'TODOS OS TESTES DE POTENCIAL PASSARAM'
