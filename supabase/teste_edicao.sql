-- Teste da edicao pela equipe (sistema_edicao.sql).
\set ON_ERROR_STOP 1
\set QUIET 1

begin;

insert into auth.users (id, email, raw_user_meta_data) values
 ('71000000-0000-0000-0000-0000000000c1', 'conse1@nb.com', '{"nome":"Consultor Edita"}'),
 ('71000000-0000-0000-0000-0000000000c2', 'conse2@nb.com', '{"nome":"Consultor Outro"}');
update perfil set ativo = true, papel = 'consultor' where email in ('conse1@nb.com', 'conse2@nb.com');
insert into aluna (nome, produto) values ('Aluna Edicao', 'Moonshot Pró');
\set al '(select id from aluna where nome = ''Aluna Edicao'')'
insert into nota_aluna (aluna_id, texto, origem, autor_id) values (:al, 'Veio da planilha', 'planilha: banco', null);
insert into nota_aluna (aluna_id, texto, autor_id) values (:al, 'Nota do outro', '71000000-0000-0000-0000-0000000000c2');
insert into consultoria_agenda (aluna_id, numero, realizada_em) values (:al, 1, '2026-01-10');

select como('71000000-0000-0000-0000-0000000000c1', format($$update nota_aluna set texto = 'Corrigida' where aluna_id = %s and origem is not null$$, :al));
select ok((select texto = 'Corrigida' from nota_aluna where aluna_id = :al and origem is not null), 'consultor corrige anotação importada');
select como('71000000-0000-0000-0000-0000000000c1', format($$update nota_aluna set texto = 'Mexi' where aluna_id = %s and autor_id is not null$$, :al));
select ok((select texto = 'Nota do outro' from nota_aluna where aluna_id = :al and autor_id is not null), 'não mexe na anotação de outro colega');
select como('71000000-0000-0000-0000-0000000000c1', format($$delete from nota_aluna where aluna_id = %s and origem is not null$$, :al));
select ok((select count(*) = 1 from nota_aluna where aluna_id = :al), 'consultor apaga anotação importada');
select como('71000000-0000-0000-0000-0000000000c1', format($$update consultoria_agenda set realizada_em = null, situacao = 'nao_realizada', observacao = 'Faltou' where aluna_id = %s and numero = 1$$, :al));
select ok((select realizada_em is null and situacao = 'nao_realizada' and observacao = 'Faltou' from consultoria_agenda where aluna_id = :al and numero = 1),
          'consultor desmarca realizada e anota');
select ok(barrado('71000000-0000-0000-0000-0000000000c1', format($$update consultoria_agenda set situacao = 'xyz' where aluna_id = %s$$, :al)), 'situação só aceita os valores conhecidos');

rollback;
