-- Teste de minha conta (sistema_conta.sql).
\set ON_ERROR_STOP 1
\set QUIET 1
begin;
insert into auth.users (id, email, raw_user_meta_data) values
 ('73000000-0000-0000-0000-0000000000e1', 'contae1@nb.com', '{"nome":"Conta Um"}'),
 ('73000000-0000-0000-0000-0000000000e2', 'contae2@nb.com', '{"nome":"Conta Dois"}');
update perfil set ativo = true, papel = 'consultor' where email in ('contae1@nb.com', 'contae2@nb.com');
select como('73000000-0000-0000-0000-0000000000e1', $$update perfil set foto = '73000000-0000-0000-0000-0000000000e1/1.jpg' where id = '73000000-0000-0000-0000-0000000000e1'$$);
select ok((select foto is not null from perfil where id = '73000000-0000-0000-0000-0000000000e1'), 'cada um troca a própria foto');
select como('73000000-0000-0000-0000-0000000000e1', $$update perfil set foto = 'x' where id = '73000000-0000-0000-0000-0000000000e2'$$);
select ok((select foto is null from perfil where id = '73000000-0000-0000-0000-0000000000e2'), 'não troca a foto de outra pessoa');
rollback;
