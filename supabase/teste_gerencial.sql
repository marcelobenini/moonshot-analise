-- Teste dos fechamentos e do painel gerencial (sistema_gerencial.sql).
-- Roda depois de teste_sistema.sql (usa ok, como, barrado, conta_como).

\set ON_ERROR_STOP 1
\set QUIET 1

begin;

insert into auth.users (id, email, raw_user_meta_data) values
 ('30000000-0000-0000-0000-00000000000c', 'coord9@nb.com', '{"nome":"Coord"}'),
 ('30000000-0000-0000-0000-0000000000a1', 'cs9@nb.com',    '{"nome":"CS"}'),
 ('30000000-0000-0000-0000-0000000000b1', 'cons9@nb.com',  '{"nome":"Consultor"}'),
 ('30000000-0000-0000-0000-0000000000b2', 'cons8@nb.com',  '{"nome":"Outro consultor"}'),
 ('30000000-0000-0000-0000-0000000000e1', 'gest9@nb.com',  '{"nome":"Gestao"}');
update perfil set ativo = true, papel = 'coordenador' where email = 'coord9@nb.com';
update perfil set ativo = true, papel = 'cs'          where email = 'cs9@nb.com';
update perfil set ativo = true, papel = 'consultor'   where email in ('cons9@nb.com', 'cons8@nb.com');
update perfil set ativo = true, papel = 'gestao'      where email = 'gest9@nb.com';
\set coord '''30000000-0000-0000-0000-00000000000c'''
\set cs    '''30000000-0000-0000-0000-0000000000a1'''
\set cons  '''30000000-0000-0000-0000-0000000000b1'''
\set outro '''30000000-0000-0000-0000-0000000000b2'''
\set gest  '''30000000-0000-0000-0000-0000000000e1'''

insert into aluna (nome, consultor_id, cs_id, produto) values ('Iris Teste Gerencial', :cons, :cs, 'Moonshot Pró');
\set iris '(select id from aluna where nome = ''Iris Teste Gerencial'')'
insert into contrato (aluna_id, produto, status, termino, chave) values (:iris, 'Moonshot Pró', 'ativo', '2027-01-01', 'teste-ger');
insert into card (funil_id, etapa_id, aluna_id, titulo)
values ('ascensao', (select id from etapa where funil_id = 'ascensao' and nome = 'Moonshot Pró'), :iris, 'Iris Teste Gerencial');

select ok(barrado(:cons, $$insert into fechamento (nome, produto) values ('X', 'Moonshot Private')$$),
          'consultor nao lanca fechamento');
select como(:coord, $$insert into fechamento (aluna_id, nome, produto, data_fechamento, valor_total, valor_pago, consultor_id, cs_id, chave)
                     values ((select id from aluna where nome = 'Iris Teste Gerencial'), 'Iris Teste Gerencial', 'Moonshot In Company',
                             '2026-10-01', 60000, 15000, '30000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000a1', 'teste-fech')$$);
select ok((select saldo = 45000 from fechamento where chave = 'teste-fech'), 'saldo e total menos pago');
select ok((select produto = 'Moonshot In Company' from aluna where id = :iris)
          and exists (select 1 from contrato where aluna_id = :iris and produto = 'Moonshot In Company' and chave = 'fechamento:teste-fech'),
          'fechamento cria o contrato e a ficha sobe para In Company');
select ok(exists (select 1 from card c join etapa e on e.id = c.etapa_id where c.aluna_id = :iris and c.funil_id = 'ascensao'
                  and c.fechado_em is null and e.nome = 'Moonshot In Company'),
          'o card da Ascensao vai para o degrau do fechamento');

select ok(conta_como(:cons, 'select 1 from fechamento') = 1 and conta_como(:outro, 'select 1 from fechamento') = 0,
          'consultor ve o proprio caso, o colega nao');
select ok(barrado(:cons, $$update fechamento set valor_pago = 60000$$) is false
          and (select valor_pago = 15000 from fechamento where chave = 'teste-fech'),
          'consultor nao mexe no financeiro');
select como(:cons, $$insert into fechamento_registro (fechamento_id, tipo, transcricao, resumo, status, nivel, acoes)
                    values ((select id from fechamento where chave = 'teste-fech'), 'transcricao', 'texto da reuniao',
                            'Equipe sem processo comercial', 'atencao', 2, 'Montar rotina de vendas')$$);
select ok((select status = 'atencao' and nivel = 2 and proximas_acoes = 'Montar rotina de vendas' and ultima_atualizacao is not null
           from fechamento where chave = 'teste-fech'),
          'registro do consultor atualiza status, nivel e acoes do caso');
select ok(barrado(:outro, $$insert into fechamento_registro (fechamento_id, resumo) values ((select max(id) from fechamento), 'x')$$),
          'consultor de fora nao registra no caso');

select ok(barrado(:cons, 'select painel_gerencial()'), 'painel gerencial so para a coordenacao');
select como(:coord, $$create temp table pg_teste as select painel_gerencial() as p$$);
select ok((select (p->'fechamentos'->>'qtd')::int >= 1 and (p->'fechamentos'->>'saldo')::numeric >= 45000
           and jsonb_array_length(p->'consultores') >= 2 and jsonb_array_length(p->'cs') >= 1 from pg_teste),
          'painel traz fechamentos, consultores e CS');

-- Gestao: ve os numeros e os casos, nao mexe em nada.
select ok(conta_como(:gest, 'select 1 from fechamento') >= 1 and barrado(:gest, 'select painel_gerencial()') is false,
          'gestao ve os casos e o painel gerencial');
select ok(barrado(:gest, $$insert into fechamento_registro (fechamento_id, resumo) values ((select max(id) from fechamento), 'x')$$)
          and barrado(:gest, $$insert into fechamento (nome, produto) values ('X', 'Moonshot Private')$$)
          and barrado(:gest, $$select mudar_status_aluna((select id from aluna where nome = 'Iris Teste Gerencial'), 'pausado', null, 'x')$$),
          'gestao nao registra, nao lanca fechamento e nao muda status');
select ok(conta_como(:gest, 'select 1 from aluna') >= 1 and conta_como(:gest, 'select 1 from funil') = 0,
          'gestao ve as alunas, mas nao os funis');

rollback;
\echo 'TODOS OS TESTES GERENCIAIS PASSARAM'
