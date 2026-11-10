-- Teste de unir fichas com as tabelas novas (sistema_unir.sql).
\set ON_ERROR_STOP 1
\set QUIET 1
begin;
insert into aluna (nome, produto, pessoa_id, telefone) values ('Unir Antiga', 'Moonshot Pró', 4190, '11900000001');
insert into aluna (nome, produto, pessoa_id) values ('Unir Nova', 'Moonshot In Company', 3861649);
\set velha '(select id from aluna where nome = ''Unir Antiga'')'
\set nova '(select id from aluna where nome = ''Unir Nova'')'
insert into faturamento_mes (aluna_id, mes, faturamento) values (:velha, '2026-08-01', 30000);
insert into aluna_documento (aluna_id, cpf) values (:velha, '12345678909');
insert into aluna_arquivo (aluna_id, nome, caminho) values (:velha, 'a.txt', 'x/a.txt');
insert into acompanhamento (aluna_id, etapa_chave, status) values (:velha, 'plano_acao', 'feito');
select unir_alunas(:nova, :velha);
select ok((select count(*) = 1 from aluna where nome like 'Unir %'), 'uma ficha só');
select ok((select pessoa_id = 4190 and telefone = '11900000001' from aluna where nome = 'Unir Nova'), 'fica o ID da planilha e os dados da antiga');
select ok((select count(*) from faturamento_mes f join aluna a on a.id = f.aluna_id where a.nome = 'Unir Nova') = 1
          and (select count(*) from aluna_documento f join aluna a on a.id = f.aluna_id where a.nome = 'Unir Nova') = 1
          and (select count(*) from aluna_arquivo f join aluna a on a.id = f.aluna_id where a.nome = 'Unir Nova') = 1
          and (select count(*) from acompanhamento f join aluna a on a.id = f.aluna_id where a.nome = 'Unir Nova') = 1,
          'faturamento, CPF, arquivos e roteiro passam para a ficha mantida');
rollback;
