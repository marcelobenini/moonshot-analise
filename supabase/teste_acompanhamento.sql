-- Teste do acompanhamento do consultor (sistema_acompanhamento.sql).
\set ON_ERROR_STOP 1
\set QUIET 1

begin;

insert into auth.users (id, email, raw_user_meta_data) values
 ('50000000-0000-0000-0000-0000000000b1', 'cons5@nb.com', '{"nome":"Consultor Cinco"}'),
 ('50000000-0000-0000-0000-0000000000e1', 'gest5@nb.com', '{"nome":"Gestao Cinco"}');
update perfil set ativo = true, papel = 'consultor' where email = 'cons5@nb.com';
update perfil set ativo = true, papel = 'gestao'    where email = 'gest5@nb.com';
\set cons '''50000000-0000-0000-0000-0000000000b1'''
\set gest '''50000000-0000-0000-0000-0000000000e1'''

insert into aluna (nome, produto, consultor_id) values ('Vera Teste Acomp', 'Moonshot Private', :cons);
\set vera '(select id from aluna where nome = ''Vera Teste Acomp'')'

select ok((select count(*) = 4 from (select distinct programa from jornada_etapa) p)
          and (select count(*) from jornada_etapa where programa = 'Moonshot Private' and tipo = 'consultoria' and numero = 0) = 1,
          'quatro programas, cada um com a reuniao inicial como consultoria 0');
select como(:cons, $$insert into acompanhamento (aluna_id, etapa_chave, status, data, resumo, proximos_passos)
                    values ((select id from aluna where nome = 'Vera Teste Acomp'), 'imersao', 'feito', '2026-10-20',
                            'Imersao de dois dias com a equipe', 'Montar metas por vendedora')$$);
select ok((select ultimo_contato = '2026-10-20' from aluna where id = :vera), 'encontro feito conta como contato');
select ok(barrado(:gest, $$update acompanhamento set resumo = 'x'$$) is false
          and (select resumo = 'Imersao de dois dias com a equipe' from acompanhamento where aluna_id = :vera),
          'gestao le, mas nao edita o acompanhamento');
select ok(barrado(:cons, $$insert into jornada_etapa (programa, ordem, chave, nome, tipo) values ('X', 1, 'x', 'x', 'encontro')$$),
          'so a coordenacao mexe no roteiro');

rollback;
\echo 'TODOS OS TESTES DE ACOMPANHAMENTO PASSARAM'
