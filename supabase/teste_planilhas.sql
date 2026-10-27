-- Teste da importacao de planilhas (sistema_planilhas.sql), com dados
-- ficticios no formato que o navegador manda (app/src/lib/planilha.ts):
-- chaves = cabecalho normalizado, mais _1, _2... pela posicao.
-- Roda depois de teste_sistema.sql, num banco com os quatro arquivos sistema*.

\set ON_ERROR_STOP 1
\set QUIET 1

begin;

insert into auth.users (id, email, raw_user_meta_data) values
 ('10000000-0000-0000-0000-00000000000c', 'coord2@nb.com', '{"nome":"Coord"}'),
 ('10000000-0000-0000-0000-0000000000b1', 'thiago@nb.com', '{"nome":"Thiago"}');
update perfil set ativo = true, papel = 'coordenador' where email = 'coord2@nb.com';
update perfil set ativo = true, papel = 'consultor', consultor_norm = 'Thiago, Tiago' where email = 'thiago@nb.com';
\set coord '''10000000-0000-0000-0000-00000000000c'''
\set thiago '''10000000-0000-0000-0000-0000000000b1'''

create function importar(tipo text, linhas jsonb) returns jsonb language plpgsql as $$
declare i bigint;
begin
  insert into importacao (tipo, arquivo) values (tipo, 'teste.xlsx') returning id into i;
  insert into importacao_linha (importacao_id, aba, linha, dados)
  select i, x->>'aba', (x->>'linha')::int, x->'dados' from jsonb_array_elements(linhas) x;
  return processar_importacao(i);
end $$;

-- Matriculas ------------------------------------------------------------------
select ok((select (importar('matriculas', '[
  {"aba":"PB-TESTE Maio26","linha":2,"dados":{"nome":"MARIA DA SILVA","telefone":"(11) 99999-0001","email":"maria@x.com",
    "tipo de plano":"Moonshot Pró","consultor estrategico":"Tiago","cs responsavel":"Junior","status":"ATIVO",
    "data de inicio do plano":"2026-05-12","data de termino do plano":"2027-05-12","periodo do plano":"12 MESES",
    "pagamento":"BOLETO TMB","acesso plataforma":"Liberado","onboarding":"Realizado","adc no grupo avisos":"SIM"}},
  {"aba":"PB-TESTE Maio26","linha":3,"dados":{"nome":"Beatriz Souza Lima","telefone":"11 98888-0002",
    "tipo de plano":"Moonshot Club","status":"ATIVO","data de termino do plano":"2027-05-12","acesso plataforma":"Liberado"}},
  {"aba":"MOONSHOT ELITE","linha":3,"dados":{"nome":"Maria da Silva","telefone":"11999990001",
    "status contrato":"Processo Cancelamento","status":"PENDENTE DE PAGAMENTO","plano":"12 MESES",
    "data de termino do plano":"2026-12-01","obs cs":"Pediu pausa em setembro"}},
  {"aba":"DADOS VENDAS NOVEMBRO25 PC","linha":4,"dados":{"cliente nome":"Nao Importa","cpf":"123"}},
  {"aba":"PB-TESTE Maio26","linha":5,"dados":{"nome":"INADIMPLENTES"}}
]')->>'contratos')::int = 3), 'matriculas: um contrato por aba de turma, abas de venda e rotulos fora');
select ok((select count(*) = 2 from aluna where email = 'maria@x.com' or nome = 'Beatriz Souza Lima'),
          'mesma aluna em duas abas e uma ficha so');
select ok((select limpar_nome('MARIA DA SILVA E SOUZA - obs') = 'Maria da Silva e Souza'
           and limpar_nome('Cláudia N. Benati (sócia)') = 'Cláudia N. Benati'),
          'nome em maiusculas vira nome proprio, sem a anotacao');
select ok((select status = 'em_cancelamento' from contrato where turma = 'MOONSHOT ELITE'),
          '"Processo Cancelamento" vira em processo de cancelamento, nao cancelada');
select ok((select status_financeiro = 'pendente' from contrato where turma = 'MOONSHOT ELITE'), 'pendente de pagamento vira financeiro pendente');
select ok((select produto = 'Moonshot Pró' and termino = '2027-05-12' from aluna where email = 'maria@x.com'),
          'ficha espelha o contrato mais recente');
select ok((select count(*) = 1 from card c join aluna a on a.id = c.aluna_id
           where c.funil_id = 'onboarding' and a.nome = 'Beatriz Souza Lima'), 'onboarding pela metade vira card da CS');
select ok((select count(*) = 0 from card c join aluna a on a.id = c.aluna_id
           where c.funil_id = 'onboarding' and a.email = 'maria@x.com'), 'onboarding completo nao vira card');
select ok((select consultor_id = :thiago from aluna where email = 'maria@x.com'), 'apelido "Tiago" liga a carteira do Thiago');
select ok((select count(*) = 1 from nota_aluna n join aluna a on a.id = n.aluna_id where a.email = 'maria@x.com' and n.tipo = 'obs_cs'),
          'OBS CS vira anotacao');
select ok((select (importar('matriculas', '[
  {"aba":"PB-TESTE Maio26","linha":2,"dados":{"nome":"MARIA DA SILVA","email":"maria@x.com","tipo de plano":"Moonshot Pró",
    "status":"ATIVO","data de termino do plano":"2027-05-12"}}]')->>'alunas_novas')::int = 0)
          and (select count(*) = 3 from contrato), 'reimportar nao duplica aluna nem contrato');

-- Consultorias ------------------------------------------------------------------
select ok((select (importar('consultorias', '[
  {"aba":"Thiago Geral","linha":3,"dados":{"aluna":"Maria Silva - Plano de ação entregue","cidade":"Campinas",
    "faturamento mes":"45000","entrada":"2026-05-26","1.consult.":"2026-06-26","2.consult.":"nov/260",
    "situacao aluna":"Faturamento subiu, quer abrir segunda unidade"}},
  {"aba":"Hiago Geral","linha":4,"dados":{"aluna":"Beatriz Lima","_3":"Inadimplente"}}
]')->>'alunas_novas')::int = 0), 'anotacao do consultor no nome e nome parcial casam com a aluna certa');
select ok((select faturamento_mensal = 45000 and cidade = 'Campinas' from aluna where email = 'maria@x.com'),
          'faturamento e cidade da aba do consultor');
select ok((select count(*) = 2 from consultoria_agenda g join aluna a on a.id = g.aluna_id where a.email = 'maria@x.com'),
          'agenda guarda so datas de verdade ("nov/260" fica de fora)');
select ok((select count(*) = 1 from nota_aluna n join aluna a on a.id = n.aluna_id where a.email = 'maria@x.com' and n.tipo = 'situacao'),
          'SITUACAO ALUNA vira anotacao sigilosa');
select ok((select bool_and(c.status_financeiro = 'inadimplente') from contrato c join aluna a on a.id = c.aluna_id
           where a.nome = 'Beatriz Souza Lima'), 'etiqueta Inadimplente da aba do Hiago marca o contrato');

-- Registro de consultoria baixa a agenda
select como(:thiago, $$insert into registro_consultoria (aluna_id, numero, saude, situacao)
                       select id, 1, 'engajada', 'ok' from aluna where email = 'maria@x.com'$$);
select ok((select realizada_em = current_date from consultoria_agenda g join aluna a on a.id = g.aluna_id
           where a.email = 'maria@x.com' and numero = 1), 'registrar a 1a consultoria da baixa na agenda');

-- Maquina de Vendas ---------------------------------------------------------------
select ok((select (importar('maquina', '[
  {"aba":"Máquina de Vendas (Jessica) V2","linha":2,"dados":{"produto":"Máquina de Vendas","nome":"Maria da Silva",
    "e-mail":"MARIA@X.COM","status do contrato":"Ativo","status financeiro":"Parcelado 12x (adimplente)",
    "forma de pagamento":"Stripe","inicio do programa":"2026-03-01"}},
  {"aba":"Maio e pós maio","linha":2,"dados":{"aluna":"Outra Pessoa","produto":"Moonshot Pró"}}
]')->>'contratos')::int = 1), 'maquina: so linhas do produto Maquina');
select ok((select produto = 'Moonshot Pró' from aluna where email = 'maria@x.com'),
          'Maquina de Vendas nao toma o lugar do Moonshot como contrato principal');

-- Cancelamentos -----------------------------------------------------------------
select ok((select (importar('cancelamentos', '[
  {"aba":"Pedido de Cancelamento ELITE E ","linha":2,"dados":{"_1":"Beatriz Souza Lima","e-mail":"bia@x.com",
    "data":"2026-09-10","prazo":"Fora do prazo","motivo do cancelamento":"Está sem caixa para pagar as parcelas",
    "status":"cancelado","reponsavel por seguir":"Marcelo"}},
  {"aba":"Downsell","linha":1,"dados":{"_1":"Maria da Silva","_2":"maria@x.com","_5":"2026-06-19","_6":"Fora do prazo",
    "_7":"Quer encerrar a mentoria","_11":"REVERTIDO","_10":"migrou para o maquina"}},
  {"aba":"Tratar com Rodolfo ","linha":1,"dados":{"_1":"4311.0"}}
]')->>'pedidos')::int = 2), 'cancelamentos: Downsell sem cabecalho lido pela posicao, aba do Rodolfo fora');
select ok((select e.nome = 'Cancelada' and c.motivo = 'Financeiro' from card c join etapa e on e.id = c.etapa_id
           join aluna a on a.id = c.aluna_id where c.funil_id = 'retencao' and a.nome = 'Beatriz Souza Lima'),
          'pedido cancelado entra fechado, com motivo na lista fechada');
select ok((select e.nome = 'Retida' and c.dados->>'proposta' = 'Downsell' from card c join etapa e on e.id = c.etapa_id
           join aluna a on a.id = c.aluna_id where c.funil_id = 'retencao' and a.email = 'maria@x.com'),
          'downsell revertido conta como retida, com a proposta registrada');
select ok((select bool_and(c.status = 'cancelado') from contrato c join aluna a on a.id = c.aluna_id
           where a.nome = 'Beatriz Souza Lima'), 'cancelamento fecha o contrato');
select ok((select (importar('cancelamentos', '[
  {"aba":"Pedido de Cancelamento ELITE E ","linha":2,"dados":{"_1":"Beatriz Souza Lima","data":"2026-09-10","status":"cancelado"}}
]')->>'pedidos')::int = 0), 'reimportar o mesmo pedido nao duplica');

-- Inadimplentes por consultor ----------------------------------------------------
select ok((select (importar('inadimplentes', '[
  {"aba":"Página1","linha":1,"dados":{"_1":"Consultor Thiago"}},
  {"aba":"Página1","linha":2,"dados":{"_1":"1","_2":"Maria da Silva / Socia Dela"}},
  {"aba":"Página1","linha":3,"dados":{"_1":"2","_2":"Pessoa Que Nao Existe"}}
]')->>'marcadas_inadimplentes')::int = 1), 'inadimplentes: socia depois da barra nao atrapalha');
select ok((select count(*) >= 1 from vw_inadimplentes v join aluna a on a.id = v.aluna_id where a.email = 'maria@x.com'),
          'aluna aparece na visao de inadimplentes');
select ok((select count(*) = 1 from importacao_pendencia where nome = 'Pessoa Que Nao Existe'), 'quem nao existe vira pendencia');

-- Evento ----------------------------------------------------------------------
select ok((select (importar('evento', '[
  {"aba":"30/10","linha":2,"dados":{"aluna":"Maria da Silva","contato":"11 99999-0001","confirmacao":"Sim",
    "programa atual":"Moonshot Pró","potencial":"45.000,00","faturamento":"BAIXO no momento, precisa estruturar"}},
  {"aba":"30/10","linha":3,"dados":{"aluna":"Joao Souza (socio Maria)","confirmacao":"Sim"}},
  {"aba":"30/10","linha":4,"dados":{"aluna":"Carla Nova (convidados não moonshot)","confirmacao":"Não"}}
]')->>'participantes')::int = 3), 'evento: uma aba vira um evento com seus convidados');
select ok((select potencial = 'baixo' and faturamento_informado = '45.000,00' from evento_participante where nome = 'Maria da Silva'),
          'colunas de potencial e faturamento trocadas sao destrocadas');
select ok((select aluna_id is not null from evento_participante where nome = 'Maria da Silva'), 'participante aluna ligada a ficha');
select ok((select tipo from evento_participante where nome like 'Joao%') = 'socio'
          and (select tipo from evento_participante where nome like 'Carla%') = 'convidado', 'socio e convidado separados de aluna');
select ok((select data = make_date(extract(year from now())::int, 10, 30) from evento limit 1), 'data do evento vem do nome da aba');

-- Kit e cadastro ------------------------------------------------------------------
select ok((select (importar('kit', '[
  {"aba":"Pijamas","linha":1,"dados":{"_1":"Beatriz Souza Lima","_2":"m"}},
  {"aba":"Pijamas","linha":2,"dados":{"_1":"Fulana","_2":"Tamanho"}}
]')->>'alunas_com_kit')::int = 1), 'kit: nome de uma palavra nao vira aluna');
select ok((select tamanho_kit = 'M' from aluna where nome = 'Beatriz Souza Lima'), 'tamanho do pijama na ficha');
select ok((select (importar('cadastro', '[
  {"aba":"Página1","linha":2,"dados":{"aluna":"Beatriz Souza Lima","consultor estrategico":"Thiago","column 2":"Rafaela",
    "link notion":"https://notion.so/x","observacao":"ok"}},
  {"aba":"Página1","linha":3,"dados":{"aluna":"Maria da Silva","e-mail":"maria@x.com","column 2":"Rafaela"}}
]')->>'cadastros')::int = 2), 'cadastro de novo membro');
select ok((select cadastro_preenchido and link_notion is not null and cs_planilha = 'Rafaela' from aluna where nome = 'Beatriz Souza Lima'),
          'cadastro marca a ficha e preenche a CS que faltava');
select ok((select cs_planilha = 'Junior' from aluna where email = 'maria@x.com'), 'mas nao troca a CS responsavel da matricula');

-- Duplicata e uniao de fichas --------------------------------------------------------
insert into aluna (nome, email) values ('Josefina Aparecida Ramalho', 'jo@x.com');
select importar('kit', '[{"aba":"Pijamas","linha":1,"dados":{"_1":"Josefina Aparecida Ramalhos Neta","_2":"G"}}]');
select ok((select count(*) = 1 from importacao_pendencia where motivo like 'Possível duplicata%'
           and nome like 'Josefina%'), 'nome parecido mas incerto cria ficha e pendencia');
select ok(barrado(:thiago, $$select unir_alunas(1, 2)$$), 'so a coordenacao une fichas');
select como(:coord, $$select unir_alunas((select id from aluna where email = 'jo@x.com'),
                                         (select id from aluna where nome like 'Josefina Aparecida Ramalhos%'))$$);
select ok((select count(*) = 1 from aluna where nome like 'Josefina%'), 'unir deixa uma ficha so');
select ok((select tamanho_kit = 'G' from aluna where email = 'jo@x.com'), 'unir completa a ficha mantida');

-- Permissoes ----------------------------------------------------------------------------
select ok(conta_como(:thiago, 'select * from importacao') = 0, 'consultor nao ve importacoes');
select ok(barrado(:thiago, $$select processar_importacao(1)$$), 'consultor nao processa importacao');
select ok(conta_como(:thiago, $$select * from nota_aluna n join aluna a on a.id = n.aluna_id where a.email = 'maria@x.com'$$) >= 1,
          'consultor le as anotacoes da propria aluna');
select ok(conta_como(:thiago, $$select * from nota_aluna n join aluna a on a.id = n.aluna_id where a.nome = 'Beatriz Souza Lima'$$) = 0,
          'e nao as de aluna de outra carteira');

rollback;
\echo 'TODOS OS TESTES DE PLANILHA PASSARAM'
