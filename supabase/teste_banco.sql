-- Teste da importacao do BANCO DE DADOS MOONSHOT (sistema_banco.sql).
\set ON_ERROR_STOP 1
\set QUIET 1

begin;

insert into auth.users (id, email, raw_user_meta_data) values
 ('70000000-0000-0000-0000-0000000000a1', 'csb1@nb.com', '{"nome":"CS Banco Um"}'),
 ('70000000-0000-0000-0000-0000000000a2', 'csb2@nb.com', '{"nome":"CS Banco Dois"}'),
 ('70000000-0000-0000-0000-0000000000b1', 'consb1@nb.com', '{"nome":"Consultor Banco"}');
update perfil set ativo = true, papel = 'cs', consultor_norm = 'Bancoum' where email = 'csb1@nb.com';
update perfil set ativo = true, papel = 'cs', consultor_norm = 'Bancodois' where email = 'csb2@nb.com';
update perfil set ativo = true, papel = 'consultor', consultor_norm = 'Bancons' where email = 'consb1@nb.com';
-- A regra mandaria a CS Dois; a planilha validada diz CS Um, e ela vence.
update perfil set cs_responsavel_id = '70000000-0000-0000-0000-0000000000a2' where email = 'consb1@nb.com';

insert into importacao (tipo, arquivo) values ('banco', 'BANCO DE DADOS MOONSHOT.xlsx');
\set imp '(select max(id) from importacao where arquivo = ''BANCO DE DADOS MOONSHOT.xlsx'')'
insert into importacao_linha (importacao_id, aba, linha, dados) values
 (:imp, 'BANCO', 1, '{"pid":9001,"nome":"Aluna Banco Um","produto":"Moonshot Pró","consultor":"Bancons","cs":"Bancoum","telefone":"11999990001","cpf":"123.456.789-01","inicio":"2025-11-25","termino":"2026-11-25","plano_meses":12,"status":"ativo","inadimplente":true,"faturamento":30000,"obs":"Aluna muito engajada","franquia":true,"entrada":"2025-11-01","entrega_plano":"2026-01-01","c":[[1,"2025-12-01"],[2,"2026-03-01"],[3,"Não realizada"],[4,"2027-06-01"]],"origem":"PRÓ linha 3"}'),
 (:imp, 'BANCO', 2, '{"pid":9002,"nome":"Empresa Banco Dois","produto":"Moonshot In Company","consultor":"Bancons","cs":"Bancoum","inicio":"2026-10-16","status":"ativo","fech":{"data":"2026-10-16","total":60000,"pago":15000,"forma":"Pix"},"origem":"IN COMPANY linha 3"}'),
 (:imp, 'BANCO', 3, '{"pid":9003,"nome":"Aluna Banco Tres","produto":"Moonshot Club","consultor":"Vinícius","status":"cancelado","origem":"CLUB linha 3"}');
select processar_importacao(:imp) as r \gset
select ok((:'r'::jsonb->>'alunas_novas')::int = 3, 'três alunas novas');
select ok((select cs_id = '70000000-0000-0000-0000-0000000000a1' and consultor_id = '70000000-0000-0000-0000-0000000000b1'
           from aluna where pessoa_id = 9001), 'consultor e CS ligados ao perfil; CS da planilha vence a regra');
select ok((select status_financeiro = 'inadimplente' and produto = 'Moonshot Pró' and faturamento_mensal = 30000
           from aluna where pessoa_id = 9001), 'inadimplência, programa e faturamento');
select ok((select count(*) = 1 from aluna_documento d join aluna a on a.id = d.aluna_id where a.pessoa_id = 9001 and d.cpf = '12345678901'),
          'CPF guardado só com dígitos, na tabela restrita');
select ok((select count(*) filter (where realizada_em is not null) = 3 and count(*) filter (where realizada_em is null) = 2
           from consultoria_agenda g join aluna a on a.id = g.aluna_id where a.pessoa_id = 9001),
          'agenda: entrada e meses passados feitos; futuro e "Não realizada" em aberto');
select ok((select ultima_consultoria = '2026-03-01' from aluna where pessoa_id = 9001), 'última consultoria = último mês passado');
select ok((select count(*) = 3 and bool_or(texto like 'Franquia%') from nota_aluna n join aluna a on a.id = n.aluna_id where a.pessoa_id = 9001), 'franquia, observação e entrega do plano viram anotação');
select ok((select e.marco_consultoria = 2 from card c join etapa e on e.id = c.etapa_id join aluna a on a.id = c.aluna_id
           where a.pessoa_id = 9001 and c.funil_id = 'consultoria'), 'card do ciclo na etapa da 2ª consultoria');
select ok((select valor_total = 60000 and saldo = 45000 from fechamento f join aluna a on a.id = f.aluna_id where a.pessoa_id = 9002),
          'fechamento com valor e saldo');
select ok((select consultor_id is null and consultor_planilha = 'Vinícius' from aluna where pessoa_id = 9003)
          and not exists (select 1 from card c join aluna a on a.id = c.aluna_id where a.pessoa_id = 9003),
          'consultor sem perfil fica pelo nome; cancelada não entra no ciclo');

-- Reimportar não duplica nem sobrescreve o que o sistema já mudou.
update aluna set faturamento_mensal = 99999 where pessoa_id = 9001;
insert into importacao (tipo, arquivo) values ('banco', 'BANCO DE DADOS MOONSHOT 2.xlsx');
insert into importacao_linha (importacao_id, aba, linha, dados)
select (select max(id) from importacao), 'BANCO', 1, '{"pid":9001,"nome":"Aluna Banco Um","produto":"Moonshot Pró","faturamento":30000,"origem":"x"}';
select processar_importacao((select max(id) from importacao)) as r2 \gset
select ok((:'r2'::jsonb->>'alunas_novas')::int = 0 and (:'r2'::jsonb->>'ja_existiam')::int = 1
          and (select faturamento_mensal = 99999 from aluna where pessoa_id = 9001)
          and (select count(*) = 1 from contrato c join aluna a on a.id = c.aluna_id where a.pessoa_id = 9001),
          'reimportar: nada duplica, nada sobrescreve');
select ok(barrado('70000000-0000-0000-0000-0000000000b1', $$select importar_banco(1)$$), 'só o sistema chama importar_banco');

rollback;
\echo 'TODOS OS TESTES DO BANCO PASSARAM'
