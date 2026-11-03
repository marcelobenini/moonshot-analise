-- Teste do CS fixo por consultor e por programa (sistema_cs.sql).
\set ON_ERROR_STOP 1
\set QUIET 1

begin;

insert into auth.users (id, email, raw_user_meta_data) values
 ('60000000-0000-0000-0000-0000000000a1', 'csj6@nb.com', '{"nome":"CS Jessica Seis"}'),
 ('60000000-0000-0000-0000-0000000000a2', 'csg6@nb.com', '{"nome":"CS Grupo Seis"}'),
 ('60000000-0000-0000-0000-0000000000b1', 'cons6@nb.com', '{"nome":"Consultor Seis"}'),
 ('60000000-0000-0000-0000-0000000000b2', 'cons7@nb.com', '{"nome":"Consultor Sete"}');
update perfil set ativo = true, papel = 'cs' where email in ('csj6@nb.com', 'csg6@nb.com');
update perfil set ativo = true, papel = 'consultor' where email in ('cons6@nb.com', 'cons7@nb.com');
\set csj '''60000000-0000-0000-0000-0000000000a1'''
\set csg '''60000000-0000-0000-0000-0000000000a2'''
\set c6 '''60000000-0000-0000-0000-0000000000b1'''
\set c7 '''60000000-0000-0000-0000-0000000000b2'''
update cs_programa set cs_id = :csj;
update perfil set cs_responsavel_id = :csg where id = :c6;

insert into aluna (nome, produto, consultor_id) values ('Ana CS Pro', 'Moonshot Pró', :c6);
insert into aluna (nome, produto, consultor_id) values ('Bia CS Private', 'Moonshot Private', :c6);
insert into aluna (nome, produto, consultor_id) values ('Cris CS Elite', 'Moonshot Elite', :c7);
insert into aluna (nome, produto, consultor_id) values ('Duda CS Sem grupo', 'Moonshot Club', :c7);
select ok((select cs_id = :csg from aluna where nome = 'Ana CS Pro'), 'Pró: CS do grupo do consultor');
select ok((select cs_id = :csj from aluna where nome = 'Bia CS Private'), 'Private: CS dos contratos especiais');
select ok((select cs_id = :csj from aluna where nome = 'Cris CS Elite'), 'Elite: CS dos contratos especiais');
select ok((select cs_id is null from aluna where nome = 'Duda CS Sem grupo'), 'consultor sem grupo: CS fica em branco');

update aluna set produto = 'Moonshot In Company' where nome = 'Ana CS Pro';
select ok((select cs_id = :csj from aluna where nome = 'Ana CS Pro'), 'subiu para In Company: CS muda junto');
update aluna set consultor_id = :c6 where nome = 'Duda CS Sem grupo';
select ok((select cs_id = :csg from aluna where nome = 'Duda CS Sem grupo'), 'trocou o consultor: CS do novo grupo');
update aluna set consultor_id = :c7, cs_id = :csj where nome = 'Duda CS Sem grupo';
select ok((select cs_id = :csj from aluna where nome = 'Duda CS Sem grupo'), 'CS escolhido na mão vence a regra');
select ok(barrado(:c6, $$update cs_programa set cs_id = null$$)
          and barrado(:c6, $$update perfil set cs_responsavel_id = null where id = '60000000-0000-0000-0000-0000000000b1'$$),
          'só a coordenação muda a regra de CS');

rollback;
\echo 'TODOS OS TESTES DE CS PASSARAM'
