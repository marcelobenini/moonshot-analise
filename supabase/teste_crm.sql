-- Teste da ficha, do acompanhamento e da passagem ao comercial (sistema_crm.sql).
-- Roda depois de teste_sistema.sql e teste_planilhas.sql (usa ok, como, barrado...).

\set ON_ERROR_STOP 1
\set QUIET 1

begin;

insert into auth.users (id, email, raw_user_meta_data) values
 ('20000000-0000-0000-0000-00000000000c', 'coord3@nb.com', '{"nome":"Coord"}'),
 ('20000000-0000-0000-0000-0000000000a1', 'cs3@nb.com',    '{"nome":"CS"}'),
 ('20000000-0000-0000-0000-0000000000b1', 'cons3@nb.com',  '{"nome":"Consultor"}'),
 ('20000000-0000-0000-0000-0000000000b2', 'cons4@nb.com',  '{"nome":"Outro consultor"}'),
 ('20000000-0000-0000-0000-0000000000d1', 'com3@nb.com',   '{"nome":"Comercial"}');
update perfil set ativo = true, papel = 'coordenador' where email = 'coord3@nb.com';
update perfil set ativo = true, papel = 'cs'          where email = 'cs3@nb.com';
update perfil set ativo = true, papel = 'consultor'   where email in ('cons3@nb.com', 'cons4@nb.com');
update perfil set ativo = true, papel = 'comercial'   where email = 'com3@nb.com';
\set coord '''20000000-0000-0000-0000-00000000000c'''
\set cs    '''20000000-0000-0000-0000-0000000000a1'''
\set cons  '''20000000-0000-0000-0000-0000000000b1'''
\set outro '''20000000-0000-0000-0000-0000000000b2'''
\set com   '''20000000-0000-0000-0000-0000000000d1'''

insert into aluna (nome, consultor_id, cs_id, produto, faturamento_mensal)
values ('Helena Teste Prado', :cons, :cs, 'Moonshot Club', 90000);
insert into contrato (aluna_id, produto, status, termino, chave)
select id, 'Moonshot Club', 'ativo', '2027-03-01', 'teste-crm' from aluna where nome = 'Helena Teste Prado';
\set helena '(select id from aluna where nome = ''Helena Teste Prado'')'

-- Status -----------------------------------------------------------------------
select ok(barrado(:cs, $$select mudar_status_aluna((select id from aluna where nome = 'Helena Teste Prado'), null, 'inadimplente', '')$$),
          'inadimplencia sem motivo e barrada');
select como(:cs, $$select mudar_status_aluna((select id from aluna where nome = 'Helena Teste Prado'), null, 'inadimplente', 'Boleto de marco em aberto')$$);
select ok((select status_financeiro = 'inadimplente' from aluna where id = :helena)
          and (select status_financeiro = 'inadimplente' from contrato where chave = 'teste-crm'),
          'inadimplencia vai para o contrato e a ficha');
select ok((select count(*) = 1 from aluna_historico where aluna_id = :helena and campo = 'status_financeiro'
           and para = 'inadimplente' and motivo = 'Boleto de marco em aberto' and autor_id = :cs),
          'historico guarda de, para, quem e por que');
select ok((select count(*) = 1 from notificacao where usuario_id = :cons and titulo like '%inadimplente%'),
          'consultor e avisado da inadimplencia');
select ok(conta_como(:cons, 'select * from vw_inadimplentes') = 1, 'e ela aparece na lista de inadimplentes');

-- Acompanhamento ------------------------------------------------------------------
select como(:cs, $$insert into nota_aluna (aluna_id, tipo, texto, canal, retorno_em, autor_id)
  values ((select id from aluna where nome = 'Helena Teste Prado'), 'contato', 'Falei sobre o boleto', 'WhatsApp', current_date + 3,
          '20000000-0000-0000-0000-0000000000a1')$$);
select ok((select ultimo_contato = current_date and proximo_contato = current_date + 3 from aluna where id = :helena),
          'contato da CS marca ultimo contato e retorno');
select como(:cs, $$insert into nota_aluna (aluna_id, tipo, texto, canal, autor_id)
  values ((select id from aluna where nome = 'Helena Teste Prado'), 'contato', 'Pagou', 'Ligação',
          '20000000-0000-0000-0000-0000000000a1')$$);
select ok((select proximo_contato is null from aluna where id = :helena)
          and (select bool_and(retorno_feito) from nota_aluna where aluna_id = :helena and retorno_em is not null),
          'novo contato da baixa no retorno anterior');

-- Passagem ao comercial -------------------------------------------------------------
select como(:cons, $$insert into registro_consultoria (aluna_id, consultor_id, numero, saude, situacao)
  values ((select id from aluna where nome = 'Helena Teste Prado'), '20000000-0000-0000-0000-0000000000b1', 1, 'engajada',
          'Dobrou a equipe, quer abrir segunda unidade')$$);
select ok(conta_como(:com, $$select * from registro_consultoria where situacao like 'Dobrou%'$$) = 0,
          'comercial nao ve o relato antes da passagem');
select ok(barrado(:outro, $$select enviar_ao_comercial((select id from aluna where nome = 'Helena Teste Prado'), 'Elite', null, 'x', null, null)$$),
          'consultor de outra carteira nao envia');
select ok(barrado(:cons, $$select enviar_ao_comercial((select id from aluna where nome = 'Helena Teste Prado'), 'Elite', null, ' ', null, null)$$),
          'passagem sem justificativa e barrada');
select como(:cons, $$select enviar_ao_comercial((select id from aluna where nome = 'Helena Teste Prado'), 'Elite', 120000,
  'Engajada, faturamento subiu, quer escalar', 'WhatsApp a tarde', 'Prefere falar com o socio junto')$$);
select ok((select count(*) = 1 from card c join etapa e on e.id = c.etapa_id
           where c.funil_id = 'oportunidades' and c.aluna_id = :helena and e.ordem = 3 and c.responsavel_id = :cons),
          'oportunidade fica com o consultor, em "Enviada ao comercial"');
select ok((select dados->>'justificativa' = 'Engajada, faturamento subiu, quer escalar'
                  and dados->>'observacao_consultor' = 'Prefere falar com o socio junto'
                  and dados->>'enviado_por' = 'Consultor' and origem_card_id is not null
           from card where funil_id = 'comercial' and aluna_id = :helena),
          'card do comercial nasce com justificativa, observacao e quem enviou');
select ok((select faturamento_mensal = 120000 from aluna where id = :helena), 'faturamento informado atualiza a ficha');
select ok((select count(*) = 1 from card_evento ev join card c on c.id = ev.card_id
           where c.funil_id = 'comercial' and c.aluna_id = :helena and ev.texto like 'Passagem de Consultor%socio junto'),
          'passagem fica no historico do card da comercial');
select ok(conta_como(:com, $$select * from registro_consultoria where situacao like 'Dobrou%'$$) = 1,
          'com o card aberto, comercial ve o relato do consultor');
select ok(conta_como(:com, $$select * from nota_aluna where texto = 'Pagou'$$) = 1, 'e as anotacoes');
select ok(barrado(:cons, $$select enviar_ao_comercial((select id from aluna where nome = 'Helena Teste Prado'), 'Elite', null, 'de novo', null, null)$$),
          'nao abre segundo card no comercial');
select ok(conta_como(:outro, $$select * from registro_consultoria where situacao like 'Dobrou%'$$) = 0,
          'outro consultor continua sem ver o relato');

-- Linha do tempo -------------------------------------------------------------------
select ok(conta_como(:cons, $$select distinct tipo from vw_linha_tempo
            where aluna_id = (select id from aluna where nome = 'Helena Teste Prado')$$) >= 5,
          'linha do tempo junta status, contato, consultoria, funil e contrato');
select ok(conta_como(:outro, $$select * from vw_linha_tempo where tipo = 'consultoria'
            and aluna_id = (select id from aluna where nome = 'Helena Teste Prado')$$) = 0,
          'e respeita o sigilo do relato');

-- Acessos -------------------------------------------------------------------------
select ok(barrado(:cs, $$select criar_acesso('nova@nb.com', 'Nova', 'cs')$$), 'so a coordenacao cria acesso');
select como(:coord, $$select criar_acesso('Nova.CS@nb.com ', 'Nova CS', 'cs')$$);
select ok((select papel = 'cs' and ativo and trocar_senha and nome = 'Nova CS' from perfil where email = 'nova.cs@nb.com'),
          'acesso criado ja nasce liberado, com o perfil, e obriga a trocar a senha');
select ok(barrado(:coord, $$select criar_acesso('nova.cs@nb.com', 'De novo', 'cs')$$), 'e-mail repetido e barrado');
select ok(barrado(:coord, $$select criar_acesso('x@nb.com', 'X', 'chefe')$$), 'perfil inexistente e barrado');
select ok(conta_como((select id from perfil where email = 'nova.cs@nb.com'), 'select * from aluna') = 0,
          'antes de trocar a senha nao ve aluna nenhuma');
update auth.users set encrypted_password = 'trocada' where email = 'nova.cs@nb.com';
select ok(conta_como((select id from perfil where email = 'nova.cs@nb.com'), 'select * from aluna') > 0,
          'depois de trocar, ve as alunas');
select como(:coord, $$select redefinir_senha((select id from perfil where email = 'nova.cs@nb.com'))$$);
select ok((select trocar_senha from perfil where email = 'nova.cs@nb.com'), 'senha redefinida volta a ser provisoria');

select ok(not barrado(:cons, $$insert into aluna (nome, consultor_id) values ('Aluna Do Consultor', '20000000-0000-0000-0000-0000000000b1')$$),
          'consultor cadastra aluna na propria carteira');
select ok(barrado(:cons, $$insert into aluna (nome, consultor_id) values ('Aluna De Outro', '20000000-0000-0000-0000-0000000000b2')$$),
          'mas nao na carteira de outro');

-- Em processo de cancelamento: convive com a inadimplencia e abre a retencao.
select como(:cs, $$select mudar_status_aluna((select id from aluna where nome = 'Helena Teste Prado'), 'em_cancelamento', 'inadimplente', 'Pediu para sair por falta de tempo')$$);
select ok((select status_contrato = 'em_cancelamento' and status_financeiro = 'inadimplente' from aluna where id = :helena),
          'em processo de cancelamento e inadimplente vivem juntas');
select ok(exists (select 1 from card where funil_id = 'retencao' and aluna_id = :helena and fechado_em is null),
          'em processo de cancelamento abre card na retencao');

-- Ascensao: a CS sobe e desce a aluna de programa pelo funil.
update aluna set produto = 'Moonshot Club' where id = :helena;
insert into card (funil_id, etapa_id, aluna_id, titulo)
values ('ascensao', (select id from etapa where funil_id = 'ascensao' and nome = 'Moonshot Club'), :helena, 'Helena Teste Prado');
select como(:cs, $$update card set etapa_id = (select id from etapa where funil_id = 'ascensao' and nome = 'Moonshot Pró')
                 where funil_id = 'ascensao' and aluna_id = (select id from aluna where nome = 'Helena Teste Prado')$$);
select ok((select produto = 'Moonshot Pró' from aluna where id = :helena)
          and exists (select 1 from aluna_historico where aluna_id = :helena and campo = 'produto'
                      and motivo = 'Ascensão: Moonshot Club → Moonshot Pró'),
          'CS sobe a aluna no funil de ascensao e a ficha muda de programa');
select como(:cs, $$update card set etapa_id = (select id from etapa where funil_id = 'ascensao' and nome = 'Moonshot Club'), motivo = 'Sem verba'
                 where funil_id = 'ascensao' and aluna_id = (select id from aluna where nome = 'Helena Teste Prado')$$);
select ok((select produto = 'Moonshot Club' from aluna where id = :helena)
          and exists (select 1 from aluna_historico where aluna_id = :helena and campo = 'produto'
                      and motivo = 'Downsell: Moonshot Pró → Moonshot Club. Sem verba'),
          'descer de degrau e downsell, com o motivo no historico');
select como(:cs, $$select mudar_status_aluna((select id from aluna where nome = 'Helena Teste Prado'), 'ativo', null, null)$$);
select ok((select produto = 'Moonshot Club' from aluna where id = :helena)
          and (select produto = 'Moonshot Club' from contrato where chave = 'teste-crm'),
          'o contrato muda junto e mudar status nao desfaz o programa');
update aluna set produto = 'Moonshot Elite' where id = :helena;
select como(:cs, $$update card set etapa_id = (select id from etapa where funil_id = 'ascensao' and nome = 'Moonshot Pró')
                 where funil_id = 'ascensao' and aluna_id = (select id from aluna where nome = 'Helena Teste Prado')$$);
select ok((select produto = 'Moonshot Elite' from aluna where id = :helena), 'Elite no degrau do Pro continua Elite');

rollback;
\echo 'TODOS OS TESTES DE CRM PASSARAM'
