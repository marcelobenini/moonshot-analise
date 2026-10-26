-- Teste do CPF e do cruzamento de cadastros (sistema_documento.sql).

\set ON_ERROR_STOP 1
\set QUIET 1

begin;

create function importar_doc(tipo text, linhas jsonb) returns jsonb language plpgsql as $$
declare i bigint;
begin
  insert into importacao (tipo, arquivo) values (tipo, 'teste.xlsx') returning id into i;
  insert into importacao_linha (importacao_id, aba, linha, dados)
  select i, x->>'aba', (x->>'linha')::int, x->'dados' from jsonb_array_elements(linhas) x;
  return processar_importacao(i);
end $$;

select ok(norm_cpf('123.456.789-09') = '12345678909' and norm_cpf('9876543229') = '09876543229'
          and norm_cpf('111.111.111-11') is null and norm_cpf('abc') is null and norm_cpf('11900001234') is null,
          'CPF: so digitos, zero da frente de volta, digito verificador; repetido, telefone e lixo fora');

select importar_doc('matriculas', '[
  {"aba":"PB-DOC Out26","linha":2,"dados":{"nome":"Rosa Doc Almeida","telefone":"11 90000-7777","cpf":"123.456.789-09","tipo de plano":"Moonshot Club"}},
  {"aba":"PB-DOC Out26","linha":3,"dados":{"nome":"Tulipa Doc Barros","telefone":"11 90000-7777","tipo de plano":"Moonshot Club"}},
  {"aba":"PB-DOC Out26","linha":4,"dados":{"nome":"Rosa Doc A","email":"rosa@doc.com","cpf":"12345678909","tipo de plano":"Moonshot Pró"}},
  {"aba":"PB-DOC Out26","linha":5,"dados":{"nome":"Rosa Doc Almeida","cpf":"98765432100","tipo de plano":"Moonshot Club"}},
  {"aba":"DADOS VENDAS DOC","linha":2,"dados":{"cliente nome":"Tulipa Doc Barros","cliente email":"tulipa@doc.com","cpf":"55566677720"}},
  {"aba":"DADOS VENDAS DOC","linha":3,"dados":{"cliente nome":"Margarida Doc Sem Turma","cpf":"44455566619"}},
  {"aba":"DADOS VENDAS DOC","linha":4,"dados":{"cliente nome":"Tulipa Doc Barros","cpf":"123.456.789-09"}},
  {"aba":"DADOS VENDAS DOC","linha":6,"dados":{"cliente email":"Endereço","cliente nome":"Cliente Nome","cpf":"TELEFONE","telefone":"CPF"}},
  {"aba":"DADOS VENDAS DOC","linha":7,"dados":{"cliente email":"Rua das Flores, 10","cliente nome":"Rosa Doc Almeida","cpf":"11 90000-8888","telefone":"987.654.321-00"}}
]');

select ok((select count(*) = 3 from aluna where nome_chave like '%doc%'),
          'telefone repetido nao junta pessoas diferentes; CPF igual junta; CPF diferente separa');
select ok((select count(*) = 2 from contrato c join aluna_documento d on d.aluna_id = c.aluna_id where d.cpf = '12345678909'),
          'mesmo CPF com outro nome e outro produto cai na mesma ficha');
select ok((select count(*) = 1 from importacao_pendencia where motivo like 'Parecida com outra ficha, mas com CPF diferente%'),
          'xara com CPF diferente ganha ficha propria e fica para conferir');
select ok((select email = 'tulipa@doc.com' from aluna a join aluna_documento d on d.aluna_id = a.id where d.cpf = '55566677720'),
          'aba de vendas completa e-mail e CPF de quem ja tem ficha');
select ok((select count(*) = 0 from aluna where nome_chave like 'margarida%')
          and (select count(*) = 1 from importacao_pendencia where motivo like 'Venda sem ficha%'),
          'venda sem ficha vira pendencia, nao ficha solta');
select ok((select count(*) = 1 from importacao_pendencia where motivo = 'Venda com CPF que já está em outra ficha'),
          'CPF copiado para outra pessoa na venda nao une as fichas');
select ok((select count(*) = 1 from aluna a join aluna_documento d on d.aluna_id = a.id
           where d.cpf = '98765432100' and a.email is null and a.nome = 'Rosa Doc Almeida'),
          'tabela de vendas com CPF e telefone trocados: CPF vem da coluna certa e endereco nao vira e-mail');
select ok(conta_como((select id from perfil where papel = 'consultor' limit 1), 'select * from aluna_documento') = 0,
          'consultor sem a aluna na carteira nao ve CPF');

insert into aluna (nome, email) values ('Lirio Doc Costa', 'lirio@doc.com'), ('Lirio Doc C', 'LIRIO@doc.com');
select ok((cruzar_duplicatas()->>'fichas_unidas')::int >= 1, 'cruzamento acha a ficha repetida');
select ok((select count(*) = 1 from aluna where lower(email) = 'lirio@doc.com'), 'e une as duas, com mesmo e-mail e nome compativel');

rollback;
\echo 'TODOS OS TESTES DE DOCUMENTO PASSARAM'
