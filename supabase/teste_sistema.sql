-- Teste do sistema contra um Postgres real, papel por papel.
-- Roda num banco VAZIO, depois de schema.sql, sistema.sql, sistema_funis.sql e
-- sistema_importar.sql. Ver supabase/testar_sistema.sh.
--
-- Cada `ok(...)` derruba o arquivo inteiro se a condicao for falsa. Passar ate
-- o fim imprime "TODOS OS TESTES PASSARAM".

\set ON_ERROR_STOP 1
\set QUIET 1

create or replace function ok(cond boolean, o_que text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FALHOU: %', o_que; end if;
  raise notice 'ok  %', o_que;
end $$;

-- Executa SQL como o usuario dado e diz se a operacao foi barrada.
create or replace function barrado(usuario uuid, comando text) returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', usuario::text, true);
  execute 'set local role authenticated';
  begin
    execute comando;
  exception when others then
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);
    return true;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return false;
end $$;

-- Quantas linhas `consulta` devolve vista por `usuario`.
create or replace function conta_como(usuario uuid, consulta text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', usuario::text, true);
  execute 'set local role authenticated';
  execute 'select count(*) from (' || consulta || ') x' into n;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  return n;
end $$;

create or replace function como(usuario uuid, comando text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', usuario::text, true);
  execute 'set local role authenticated';
  execute comando;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

begin;

-- Equipe ---------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000c', 'coord@nb.com', '{"nome":"Coordenadora"}'),
 ('00000000-0000-0000-0000-0000000000a1', 'cs@nb.com',    '{"nome":"Ana CS"}'),
 ('00000000-0000-0000-0000-0000000000b1', 'carol@nb.com', '{"nome":"Carol"}'),
 ('00000000-0000-0000-0000-0000000000b2', 'bia@nb.com',   '{"nome":"Bia"}'),
 ('00000000-0000-0000-0000-0000000000d1', 'com@nb.com',   '{"nome":"Comercial"}'),
 ('00000000-0000-0000-0000-0000000000e1', 'ret@nb.com',   '{"nome":"Retencao"}'),
 ('00000000-0000-0000-0000-0000000000f1', 'novo@nb.com',  '{}');

select ok((select count(*) = 7 from perfil where not ativo), 'conta nova vira perfil inativo');

\set coord '''00000000-0000-0000-0000-00000000000c'''
\set cs    '''00000000-0000-0000-0000-0000000000a1'''
\set carol '''00000000-0000-0000-0000-0000000000b1'''
\set bia   '''00000000-0000-0000-0000-0000000000b2'''
\set com   '''00000000-0000-0000-0000-0000000000d1'''
\set ret   '''00000000-0000-0000-0000-0000000000e1'''
\set novo  '''00000000-0000-0000-0000-0000000000f1'''

update perfil set ativo = true, papel = 'coordenador' where id = :coord;
select ok(barrado(:cs, $$update perfil set papel = 'coordenador' where id = auth.uid()$$),
          'quem nao e coordenador nao se promove');
select como(:coord, $$update perfil set ativo = true, papel = 'cs' where email = 'cs@nb.com'$$);
select como(:coord, $$update perfil set ativo = true, papel = 'consultor', consultor_norm = 'carol' where email = 'carol@nb.com'$$);
select como(:coord, $$update perfil set ativo = true, papel = 'consultor', consultor_norm = 'bia' where email = 'bia@nb.com'$$);
select como(:coord, $$update perfil set ativo = true, papel = 'comercial' where email = 'com@nb.com'$$);
select como(:coord, $$update perfil set ativo = true, papel = 'retencao' where email = 'ret@nb.com'$$);
select ok((select count(*) = 6 from perfil where ativo), 'coordenacao libera a equipe');

-- Base historica -------------------------------------------------------------
insert into fonte (arquivo, sha256, tipo) values ('teste.xlsx', 'x', 'matriculas');
insert into pessoa (nome_canonico) values ('Claudia Benati'), ('Elizabeth Lima'), ('Joana Prado'), ('Marta Saida');
insert into fato_matricula (fonte_id, pessoa_id, turma, produto, consultor_norm, status, telefone, email, inicio, termino) values
 (1, 1, 'T10', 'Club', 'Carol', 'Ativo', '(11) 98888-1111', 'claudia@x.com', current_date - 200, current_date + 60),
 (1, 2, 'T10', 'Club', 'bia',   'Ativo', '11 97777-2222',   'eliz@x.com',    current_date - 300, current_date + 400),
 (1, 3, 'T11', 'Pro',  'carol', 'Ativo', null, 'joana@x.com',  current_date - 30, current_date + 330),
 (1, 4, 'T09', 'Club', 'bia',   'CANCELADO', null, 'marta@x.com',  current_date - 400, current_date - 30);
-- A aba do consultor diz Bia para a Joana: ela vence a coluna da matricula.
insert into fato_consultoria (fonte_id, pessoa_id, consultor_norm, consultorias, fat_mes, cidade) values
 (1, 1, 'carol', 2, 120000, 'Campinas'),
 (1, 3, 'bia', 0, null, null);
insert into fato_cancelamento (fonte_id, pessoa_id, aba, motivo, desfecho, data_pedido) values
 (1, 2, 'Cancelamento Atual', 'Financeiro', 'em_aberto', current_date - 3),
 (1, 4, 'Cancelamento Atual', 'Financeiro', 'saiu', current_date - 40);

select ok((select (importar_base_historica()->>'alunas')::int = 4), 'importa uma aluna por pessoa com matricula');
select ok((select (importar_base_historica()->>'alunas')::int = 0), 'importar de novo nao duplica');
select ok((select consultor_planilha = 'bia' from aluna where nome = 'Joana Prado'),
          'consultor da aba vence o da matricula');
select ok((select status_contrato = 'cancelado' from aluna where nome = 'Marta Saida'), 'status normalizado');
select ok((select e.nome = '2ª consultoria' from card c join etapa e on e.id = c.etapa_id
           join aluna a on a.id = c.aluna_id where a.nome = 'Claudia Benati' and c.funil_id = 'consultoria'),
          'ciclo importado na etapa da ultima consultoria');
select ok((select count(*) = 1 from card where funil_id = 'retencao'), 'pedido em aberto vira card de retencao');
select ok((select count(*) = 0 from notificacao), 'importacao nao dispara notificacao');

select ok(barrado(:carol, $$select vincular_equipe()$$), 'consultor nao roda vinculo de carteira');
select como(:coord, $$select vincular_equipe()$$);
select ok((select consultor_id = :carol from aluna where nome = 'Claudia Benati'), 'vinculo liga carteira ao perfil');
select ok((select responsavel_id = :bia from card c join aluna a on a.id = c.aluna_id
           where a.nome = 'Joana Prado' and funil_id = 'consultoria'), 'card do ciclo herda o consultor');

-- Visibilidade ----------------------------------------------------------------
select ok(conta_como(:novo, 'select * from aluna') = 0, 'conta inativa nao ve aluna nenhuma');
select ok(conta_como(:com, 'select * from aluna') = 4, 'contato basico visivel ao time');
select ok(conta_como(:carol, $$select * from card where funil_id = 'consultoria'$$) = 1,
          'consultor ve so a propria carteira no ciclo');
select ok(conta_como(:cs, $$select * from card where funil_id = 'consultoria'$$) = 3, 'CS le o funil de consultoria inteiro');
select ok(conta_como(:carol, $$select * from funil where id = 'comercial'$$) = 0, 'consultor nao ve o funil comercial');
select ok(conta_como(:com, $$select * from card where funil_id = 'retencao'$$) = 0, 'comercial nao ve retencao');
select ok(barrado(:carol, $$update aluna set consultor_id = auth.uid() where nome = 'Joana Prado'$$)
          or conta_como(:carol, $$select * from aluna where nome = 'Joana Prado' and consultor_id = auth.uid()$$) = 0,
          'consultor nao puxa aluna de outra carteira');
select ok(barrado(:carol, $$update aluna set consultor_id = '00000000-0000-0000-0000-0000000000b2' where nome = 'Claudia Benati'$$),
          'consultor nao repassa a propria aluna');
select ok(not barrado(:carol, $$update aluna set faturamento_mensal = 130000 where nome = 'Claudia Benati'$$),
          'consultor atualiza dado da propria aluna');

-- Registro de consultoria -----------------------------------------------------
select ok(barrado(:carol, $$insert into registro_consultoria (aluna_id, numero, saude, situacao)
                            select id, 1, 'engajada', 'x' from aluna where nome = 'Joana Prado'$$),
          'consultor nao registra consultoria de aluna alheia');
select como(:carol, $$insert into registro_consultoria (aluna_id, numero, saude, situacao, faturamento_mensal)
                      select id, 3, 'risco_saida', 'Falou em parar por caixa apertado', 125000
                      from aluna where nome = 'Claudia Benati'$$);
select ok((select e.nome = '3ª consultoria' from card c join etapa e on e.id = c.etapa_id
           join aluna a on a.id = c.aluna_id where a.nome = 'Claudia Benati' and c.funil_id = 'consultoria'),
          'card do ciclo anda sozinho com o registro');
select ok((select saude = 'risco_saida' and faturamento_mensal = 125000 and ultima_consultoria = current_date
           from aluna where nome = 'Claudia Benati'), 'registro atualiza a ficha da aluna');
select ok((select count(*) = 1 from card c join aluna a on a.id = c.aluna_id
           where c.funil_id = 'retencao' and a.nome = 'Claudia Benati' and c.fechado_em is null),
          'risco de saida abre card de retencao');
select ok((select count(*) = 1 from notificacao where usuario_id = :ret and tipo = 'risco'), 'retencao e avisada');
select ok(conta_como(:bia, 'select * from registro_consultoria') = 0, 'relato do consultor nao vaza para outra carteira');
select ok(conta_como(:com, 'select * from registro_consultoria') = 0, 'relato do consultor nao vaza para o comercial');
select ok(conta_como(:coord, 'select * from registro_consultoria') = 1, 'coordenacao le o relato');

-- Engajada e acima do corte vira sugestao, uma vez por mes.
select como(:carol, $$insert into registro_consultoria (aluna_id, numero, saude, situacao)
                      select id, 4, 'engajada', 'Retomou' from aluna where nome = 'Claudia Benati'$$);
select como(:carol, $$insert into registro_consultoria (aluna_id, numero, saude, situacao)
                      select id, 4, 'engajada', 'Seguindo' from aluna where nome = 'Claudia Benati'$$);
select ok((select count(*) = 1 from notificacao where usuario_id = :carol and tipo = 'oportunidade'),
          'sugestao de oportunidade sem repetir');

-- Onboarding -> ciclo ---------------------------------------------------------
select como(:cs, $$insert into aluna (nome, email, telefone, produto, inicio, termino, consultor_id, cs_id)
                   values ('Nova Aluna', 'nova@x.com', '11 96666-3333', 'Club', current_date, current_date + 365,
                           '00000000-0000-0000-0000-0000000000b2', auth.uid())$$);
select ok((select count(*) = 1 from possiveis_duplicatas('NOVA  ALUNA', null, null)), 'duplicata por nome, sem caixa e espaco');
select ok((select count(*) = 1 from possiveis_duplicatas('Outra', null, '+55 (11) 6666-3333')), 'duplicata por telefone sem nono digito');
select ok((select count(*) = 1 from possiveis_duplicatas('Claudia N Benati', null, null)), 'duplicata por nome parcial');
select como(:cs, $$insert into card (funil_id, etapa_id, aluna_id, titulo, responsavel_id)
                   select 'onboarding', etapa_de('onboarding', 1), id, nome, auth.uid() from aluna where nome = 'Nova Aluna'$$);
select ok(barrado(:carol, $$insert into card (funil_id, etapa_id, titulo) values ('onboarding', etapa_de('onboarding', 1), 'x')$$),
          'consultor nao cria card no onboarding');
select como(:cs, $$update card set etapa_id = etapa_de('onboarding', 8)
                   where funil_id = 'onboarding' and titulo = 'Nova Aluna'$$);
select ok((select fechado_em is not null from card where funil_id = 'onboarding' and titulo = 'Nova Aluna'),
          'etapa final fecha o card');
select ok((select responsavel_id = :bia from card where funil_id = 'consultoria' and titulo = 'Nova Aluna'),
          'aluna ativada nasce no ciclo do consultor');
select ok((select count(*) >= 1 from notificacao where usuario_id = :bia and tipo = 'carteira'), 'consultor avisado da aluna nova');
select ok((select count(*) = 2 from card_evento e join card c on c.id = e.card_id
           where c.funil_id = 'onboarding' and c.titulo = 'Nova Aluna'), 'historico registra criacao e movimento');

-- Oportunidade -> comercial -> perdida volta ----------------------------------
select como(:carol, $$insert into card (funil_id, etapa_id, aluna_id, titulo, responsavel_id, valor, dados)
                      select 'oportunidades', etapa_de('oportunidades', 1), id, nome, auth.uid(), 15000,
                             '{"produto":"Elite"}' from aluna where nome = 'Claudia Benati'$$);
select como(:carol, $$update card set etapa_id = etapa_de('oportunidades', 3) where funil_id = 'oportunidades'$$);
select ok((select count(*) = 1 from card where funil_id = 'comercial' and dados->>'produto' = 'Elite'
           and dados->>'origem' = 'consultor'), 'handoff cria card no comercial com os dados');
select ok((select count(*) = 1 from notificacao where usuario_id = :com and tipo = 'oportunidade'), 'comercial avisado');
select ok(barrado(:com, $$update card set etapa_id = etapa_de('comercial', 8) where funil_id = 'comercial'$$),
          'perdida exige motivo');
select como(:com, $$update card set etapa_id = etapa_de('comercial', 8), motivo = 'Preço' where funil_id = 'comercial'$$);
select ok((select e.nome = 'Devolvida' and c.motivo = 'Preço' from card c join etapa e on e.id = c.etapa_id
           where c.funil_id = 'oportunidades'), 'perdida devolve a oportunidade com o motivo');
select ok((select count(*) = 1 from notificacao where usuario_id = :carol and titulo = 'Oportunidade devolvida'),
          'consultor sabe que voltou');

-- Ganha atualiza produto
select como(:carol, $$insert into card (funil_id, etapa_id, aluna_id, titulo, responsavel_id, dados)
                      select 'oportunidades', etapa_de('oportunidades', 3), id, nome, auth.uid(), '{"produto":"Private"}'
                      from aluna where nome = 'Claudia Benati'$$);
select como(:com, $$update card set etapa_id = etapa_de('comercial', 7) where funil_id = 'comercial' and fechado_em is null$$);
select ok((select produto = 'Private' from aluna where nome = 'Claudia Benati'), 'ganha atualiza o produto da aluna');
select ok((select e.nome = 'Virou venda' from card c join etapa e on e.id = c.etapa_id
           where c.funil_id = 'oportunidades' and c.dados->>'produto' = 'Private'), 'oportunidade de origem fecha como ganha');

-- Retencao --------------------------------------------------------------------
select ok(barrado(:ret, $$update card set etapa_id = etapa_de('retencao', 7)
                          where funil_id = 'retencao' and titulo = 'Claudia Benati'$$), 'cancelada exige motivo');
select como(:ret, $$update card set etapa_id = etapa_de('retencao', 2) where funil_id = 'retencao' and titulo = 'Claudia Benati'$$);
select ok((select count(*) = 1 from notificacao where usuario_id = :carol and tipo = 'cancelamento'),
          'pedido de saida avisa o consultor da aluna');
select ok(conta_como(:carol, $$select * from card where funil_id = 'retencao'$$) = 1,
          'consultor ve a retencao so da propria aluna');

-- Demandas --------------------------------------------------------------------
select como(:cs, $$insert into demanda (titulo, equipe, prioridade) values ('Lista de presença do Check Point', 'consultor', 'alta')$$);
select ok((select count(*) = 2 from notificacao where tipo = 'demanda' and usuario_id in (:carol, :bia)),
          'demanda para a equipe avisa cada consultor');
select ok(conta_como(:com, 'select * from demanda') = 0, 'demanda de outra equipe nao aparece');
select como(:carol, $$insert into demanda_comentario (demanda_id, texto) select id, 'Mando até sexta' from demanda$$);
select ok((select count(*) = 1 from notificacao where usuario_id = :cs and tipo = 'comentario'), 'resposta avisa quem pediu');
select como(:carol, $$update demanda set responsavel_id = auth.uid(), status = 'concluida'$$);
select ok((select concluida_em is not null from demanda), 'concluir registra a data');
select ok((select count(*) = 1 from notificacao where usuario_id = :cs and titulo like 'Sua demanda está concluída'),
          'quem pediu sabe que foi feito');
select ok(barrado(:com, $$insert into demanda (titulo, solicitante_id) values ('x', '00000000-0000-0000-0000-0000000000a1')$$),
          'ninguem abre demanda em nome de outro');

-- Notificacoes ----------------------------------------------------------------
select ok(conta_como(:carol, 'select * from notificacao') =
          (select count(*) from notificacao where usuario_id = :carol), 'cada um ve so as proprias notificacoes');
select ok(barrado(:carol, $$insert into notificacao (usuario_id, tipo, titulo) values (auth.uid(), 'x', 'x')$$),
          'notificacao nao se insere na mao');
select ok(barrado(:carol, $$select notificar('00000000-0000-0000-0000-0000000000a1', 'x', 'Aviso falso')$$),
          'funcao de notificar nao e chamavel pela API');
select ok(barrado(:carol, $$select abrir_retencao(1, 'x')$$), 'automacao de retencao nao e chamavel pela API');

-- Rotina diaria ---------------------------------------------------------------
update aluna set cs_id = :cs where nome = 'Claudia Benati';
update card set etapa_desde = now() - interval '10 days' where funil_id = 'retencao' and titulo = 'Claudia Benati';
update aluna set ultima_consultoria = current_date - 120 where nome = 'Joana Prado';
select ok((select (rotina_diaria()->>'renovacoes_criadas')::int = 1), 'renovacao nasce 120 dias antes do termino');
select ok((select (rotina_diaria()->>'renovacoes_criadas')::int = 0), 'renovacao nao duplica');
select ok((select responsavel_id = :cs and prazo = current_date + 60 from card where funil_id = 'renovacao'),
          'renovacao vai para a CS com o termino como prazo');
select ok((select count(*) = 1 from notificacao where tipo = 'parado' and usuario_id = :coord),
          'pedido parado alerta a coordenacao, uma vez so');
-- So a Joana (120 dias). Elizabeth nunca teve registro, mas acabou de entrar no
-- sistema pela importacao: ganha os 90 dias a partir de hoje.
select ok((select count(*) = 1 from notificacao where tipo = 'sem_consultoria' and usuario_id = :bia),
          'sem consultoria ha 90 dias alerta o consultor, sem alarmar a base importada');
select como(:cs, $$update card set etapa_id = etapa_de('renovacao', 5) where funil_id = 'renovacao'$$);
select ok((select (rotina_diaria()->>'renovacoes_criadas')::int = 0), 'renovada nao renasce para o mesmo contrato');

-- Senha provisoria ------------------------------------------------------------
update perfil set trocar_senha = true where id = :carol;
select ok(conta_como(:carol, 'select * from aluna') = 0, 'senha provisoria bloqueia todo dado');
select ok(conta_como(:carol, 'select * from perfil where id = auth.uid() and trocar_senha') = 1,
          'mas a pessoa ve o proprio perfil para o app saber que precisa trocar');
-- Em dois passos: num OR so, o Postgres avalia a subconsulta antes da tentativa.
select barrado(:carol, $$update perfil set trocar_senha = false where id = auth.uid()$$);
select ok((select trocar_senha from perfil where id = :carol), 'nao da para pular a troca pela API');
update auth.users set encrypted_password = 'nova' where id = :carol;
select ok((select not trocar_senha from perfil where id = :carol), 'trocar a senha no Auth libera o acesso');
select ok(conta_como(:carol, 'select * from aluna') > 0, 'depois da troca ve os dados de novo');

-- Acompanhamento
select ok(conta_como(:carol, 'select * from vw_carteira') = 1, 'consultor ve a propria linha da carteira');
select ok(conta_como(:coord, 'select * from vw_carteira') = 2, 'coordenacao ve todas as carteiras');

rollback;
\echo 'TODOS OS TESTES PASSARAM'
