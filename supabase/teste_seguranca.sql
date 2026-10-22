-- Teste dos protocolos de seguranca (sistema_seguranca.sql).
-- Roda depois dos outros testes (usa ok, como, barrado, conta_como).

\set ON_ERROR_STOP 1
\set QUIET 1

begin;

insert into auth.users (id, email, raw_user_meta_data) values
 ('30000000-0000-0000-0000-00000000000c', 'coord4@nb.com', '{"nome":"Coord"}'),
 ('30000000-0000-0000-0000-0000000000a1', 'cs4@nb.com',    '{"nome":"CS"}');
update perfil set ativo = true, papel = 'coordenador' where email = 'coord4@nb.com';
update perfil set ativo = true, papel = 'cs' where email = 'cs4@nb.com';
\set coord '''30000000-0000-0000-0000-00000000000c'''
\set cs    '''30000000-0000-0000-0000-0000000000a1'''

create function importar_seg(tipo text, linhas jsonb) returns jsonb language plpgsql as $$
declare i bigint;
begin
  insert into importacao (tipo, arquivo) values (tipo, 'teste.xlsx') returning id into i;
  insert into importacao_linha (importacao_id, aba, linha, dados)
  select i, x->>'aba', (x->>'linha')::int, x->'dados' from jsonb_array_elements(linhas) x;
  return processar_importacao(i);
end $$;

-- Auditoria ---------------------------------------------------------------------
select como(:coord, $$select criar_acesso('auditada@nb.com', 'Auditada', 'consultor')$$);
select ok((select count(*) = 1 from auditoria where acao = 'acesso criado' and alvo = 'auditada@nb.com' and autor_id = :coord),
          'criar acesso fica no registro de seguranca, com quem criou');
select ok((select senha_provisoria_em is not null from perfil where email = 'auditada@nb.com'), 'senha provisoria guarda a hora');
select como(:coord, $$select redefinir_senha((select id from perfil where email = 'auditada@nb.com'))$$);
select ok((select count(*) = 1 from auditoria where acao = 'senha provisoria gerada' and alvo = 'auditada@nb.com'),
          'gerar senha nova fica registrado');
select ok((select count(*) = 0 from auditoria where acao = 'senha definida pela pessoa' and alvo = 'auditada@nb.com'),
          'senha gerada pela coordenacao nao conta como a pessoa ter definido');
select como(:coord, $$update perfil set ativo = false where email = 'auditada@nb.com'$$);
select ok((select count(*) = 1 from auditoria where acao = 'acesso bloqueado' and alvo = 'auditada@nb.com'), 'bloqueio fica registrado');
select como(:coord, $$update perfil set ativo = true, papel = 'cs' where email = 'auditada@nb.com'$$);
select ok((select count(*) = 1 from auditoria where acao = 'perfil alterado' and alvo = 'auditada@nb.com' and detalhe->>'para' = 'cs'),
          'troca de perfil fica registrada com de e para');
select ok(conta_como(:cs, 'select * from auditoria') = 0, 'so a coordenacao le o registro de seguranca');
select ok(conta_como(:coord, 'select * from auditoria') > 0, 'coordenacao le');
select ok(barrado(:coord, $$insert into auditoria (acao) values ('falso')$$), 'ninguem escreve no registro pelo app');
select ok(barrado(:cs, $$select auditar('falso', 'x')$$), 'nem chamando a funcao');

insert into aluna (nome) values ('Ficha Para Apagar');
select como(:coord, $$delete from aluna where nome = 'Ficha Para Apagar'$$);
select ok((select count(*) = 1 from auditoria where acao = 'ficha de aluna apagada' and alvo = 'Ficha Para Apagar'),
          'ficha apagada fica registrada');

-- Senha provisoria vence ---------------------------------------------------------
update perfil set senha_provisoria_em = now() - interval '73 hours' where email = 'auditada@nb.com';
update perfil set trocar_senha = true, senha_provisoria_em = now() - interval '73 hours' where email = 'coord4@nb.com';
select ok(expirar_senhas_provisorias() = 1, 'senha provisoria com mais de 72 horas vence');
select ok((select trocar_senha and senha_provisoria_em is null from perfil where email = 'auditada@nb.com'),
          'conta continua bloqueada ate a coordenacao gerar outra');
select ok((select trocar_senha and senha_provisoria_em is not null from perfil where email = 'coord4@nb.com'),
          'coordenacao nunca fica trancada pela expiracao');
select ok((select count(*) = 1 from auditoria where acao = 'senha provisoria vencida'), 'vencimento fica registrado');
select ok(barrado(:cs, $$select expirar_senhas_provisorias()$$), 'so a rotina vence senhas');

-- Planilha crua nao fica guardada ------------------------------------------------
update perfil set trocar_senha = false where email = 'coord4@nb.com';
select como(:coord, $$select importar_seg('cadastro', '[{"aba":"Respostas","linha":2,"dados":{"aluna":"Lia Teste Segura","e-mail":"lia@x.com"}}]')$$);
select ok((select count(*) = 0 from importacao_linha l join importacao i on i.id = l.importacao_id
           where i.status = 'processada' and l.dados <> '{}'::jsonb),
          'depois de processada, a linha crua da planilha e apagada');
select ok((select count(*) >= 1 from auditoria where acao = 'planilha importada'), 'importacao fica registrada');

rollback;
\echo 'TODOS OS TESTES DE SEGURANCA PASSARAM'
