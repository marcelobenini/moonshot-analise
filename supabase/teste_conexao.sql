-- Teste da conexao ficha -> Gerencial (sistema_conexao.sql).
\set ON_ERROR_STOP 1
\set QUIET 1
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('74000000-0000-0000-0000-0000000000f1', 'consic@nb.com', '{"nome":"Consultor IC"}');
update perfil set ativo = true, papel = 'consultor' where email = 'consic@nb.com';
insert into aluna (nome, produto, consultor_id) values ('Aluna IC', 'Moonshot In Company', '74000000-0000-0000-0000-0000000000f1');
\set al '(select id from aluna where nome = ''Aluna IC'')'
insert into fechamento (aluna_id, nome, produto, data_fechamento, consultor_id) values (:al, 'Aluna IC', 'Moonshot In Company', '2026-10-01', '74000000-0000-0000-0000-0000000000f1');
\set caso '(select id from fechamento where nome = ''Aluna IC'')'

select como('74000000-0000-0000-0000-0000000000f1', format($$insert into registro_consultoria (aluna_id, consultor_id, data, numero, saude, situacao, proximo_passo) values (%s, '74000000-0000-0000-0000-0000000000f1', '2026-10-15', 0, 'engajada', 'Diagnóstico feito', 'Plano de 90 dias')$$, :al));
select ok((select count(*) = 1 and bool_and(resumo like 'Consultoria inicial: Diagnóstico feito' and acoes = 'Plano de 90 dias') from fechamento_registro where fechamento_id = :caso)
          and (select status = 'em_andamento' and proximas_acoes = 'Plano de 90 dias' and ultima_atualizacao is not null from fechamento where id = :caso),
          'consultoria na ficha vira registro do caso e atualiza o Gerencial');

select como('74000000-0000-0000-0000-0000000000f1', format($$insert into acompanhamento (aluna_id, etapa_chave, status, data, autor_id) values (%s, 'visita_in_loco', 'agendado', '2026-11-25', '74000000-0000-0000-0000-0000000000f1')$$, :al));
select ok((select proxima_acao_em = '2026-11-25' from fechamento where id = :caso)
          and exists (select 1 from fechamento_registro where fechamento_id = :caso and resumo like 'Visita in loco (agendado para 25/11/2026)%'),
          'visita agendada no roteiro marca a próxima data do caso');

select como('74000000-0000-0000-0000-0000000000f1', format($$update acompanhamento set status = 'feito', data = '2026-11-25', resumo = 'Visita ótima' where aluna_id = %s and etapa_chave = 'visita_in_loco'$$, :al));
select ok((select count(*) = 2 from fechamento_registro where fechamento_id = :caso)
          and exists (select 1 from fechamento_registro where fechamento_id = :caso and resumo = 'Visita in loco (feito em 25/11/2026): Visita ótima'),
          'editar na ficha edita o registro espelhado, sem duplicar');

select como('74000000-0000-0000-0000-0000000000f1', format($$insert into registro_consultoria (aluna_id, consultor_id, data, numero, saude, situacao) values (%s, '74000000-0000-0000-0000-0000000000f1', '2026-12-01', 1, 'risco_saida', 'Quer cancelar')$$, :al));
select ok((select status = 'em_risco' from fechamento where id = :caso), 'risco de saída na ficha põe o caso em risco');

delete from acompanhamento where aluna_id = :al;
select ok((select count(*) = 2 from fechamento_registro where fechamento_id = :caso), 'apagar na ficha apaga o espelho');
rollback;
