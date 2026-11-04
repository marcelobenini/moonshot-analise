-- Teste da evolucao (sistema_evolucao.sql).
\set ON_ERROR_STOP 1
\set QUIET 1

begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('72000000-0000-0000-0000-0000000000d1', 'consev@nb.com', '{"nome":"Consultor Evolucao"}'),
 ('72000000-0000-0000-0000-0000000000d2', 'gestev@nb.com', '{"nome":"Gestao Evolucao"}');
update perfil set ativo = true, papel = 'consultor' where email = 'consev@nb.com';
update perfil set ativo = true, papel = 'gestao' where email = 'gestev@nb.com';
insert into aluna (nome, produto, faturamento_mensal, consultor_id) values ('Aluna Evolucao', 'Moonshot Pró', 10000, '72000000-0000-0000-0000-0000000000d1');
\set al '(select id from aluna where nome = ''Aluna Evolucao'')'

select como('72000000-0000-0000-0000-0000000000d1', format($$insert into faturamento_mes (aluna_id, mes, faturamento, rentabilidade) values (%s, '2026-09-01', 20000, 18.5)$$, :al));
select como('72000000-0000-0000-0000-0000000000d1', format($$insert into faturamento_mes (aluna_id, mes, faturamento) values (%s, '2026-08-01', 15000)$$, :al));
select ok((select faturamento_mensal = 20000 and rentabilidade = 18.5 from aluna where id = :al), 'ficha mostra o último mês informado');
select ok(barrado('72000000-0000-0000-0000-0000000000d2', format($$insert into faturamento_mes (aluna_id, mes, faturamento) values (%s, '2026-07-01', 1)$$, :al)), 'gestão só lê o faturamento');
select ok(barrado('72000000-0000-0000-0000-0000000000d1', format($$insert into faturamento_mes (aluna_id, mes, faturamento) values (%s, '2026-07-15', 1)$$, :al)), 'mês sempre no dia 1');

insert into registro_consultoria (aluna_id, consultor_id, data, numero, saude, situacao, faturamento_mensal)
values (:al, '72000000-0000-0000-0000-0000000000d1', '2026-10-20', 1, 'engajada', 'ok', 26000);
select ok((select faturamento = 26000 from faturamento_mes where aluna_id = :al and mes = '2026-10-01')
          and (select faturamento_mensal = 26000 and rentabilidade = 18.5 from aluna where id = :al),
          'faturamento da consultoria entra no mês dela');

select como('72000000-0000-0000-0000-0000000000d1', format($$select mudar_saude_aluna(%s, 'oscilante', 'Sumiu depois da 1ª consultoria')$$, :al));
select ok((select saude = 'oscilante' from aluna where id = :al)
          and exists (select 1 from aluna_historico where aluna_id = :al and campo = 'saude' and para = 'oscilante' and motivo like 'Sumiu%')
          and exists (select 1 from nota_aluna where aluna_id = :al and tipo = 'saude'),
          'saúde muda por observação, com histórico e anotação');
select ok(barrado('72000000-0000-0000-0000-0000000000d1', format($$select mudar_saude_aluna(%s, 'engajada', '  ')$$, :al)), 'saúde sem observação é recusada');
select ok(barrado('72000000-0000-0000-0000-0000000000d2', format($$select mudar_saude_aluna(%s, 'engajada', 'x')$$, :al)), 'gestão não muda saúde');
select como('72000000-0000-0000-0000-0000000000d1', format($$select mudar_saude_aluna(%s, 'risco_saida', 'Falou em cancelar')$$, :al));
select ok(exists (select 1 from card where funil_id = 'retencao' and aluna_id = :al and fechado_em is null), 'risco de saída abre retenção');

select como('72000000-0000-0000-0000-0000000000d1', format($$insert into aluna_arquivo (aluna_id, nome, caminho, autor_id) values (%s, 'transcricao.txt', '%s/x.txt', '72000000-0000-0000-0000-0000000000d1')$$, :al, :al));
select ok(barrado('72000000-0000-0000-0000-0000000000d1', format($$insert into aluna_arquivo (aluna_id, nome, caminho, autor_id) values (%s, 'a.txt', '999999/a.txt', '72000000-0000-0000-0000-0000000000d1')$$, :al)), 'arquivo só no caminho da própria aluna');
select ok(conta_como('72000000-0000-0000-0000-0000000000d2', format('select 1 from aluna_arquivo where aluna_id = %s', :al)) = 1, 'time ativo vê o arquivo');
rollback;
