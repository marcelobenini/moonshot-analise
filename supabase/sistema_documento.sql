-- CPF da aluna e o cruzamento de cadastros. Aplicar DEPOIS de sistema_painel.sql.
--
-- O CPF fica numa tabela propria: a ficha (aluna) todo o time le; documento so
-- a coordenacao, a CS e quem atende a aluna. Na importacao, CPF e a primeira
-- chave de identidade: vem antes de e-mail, telefone e nome.

create or replace function norm_cpf(t text) returns text
language plpgsql immutable set search_path = public as $$
-- Planilha guarda CPF como numero e perde o zero da frente: completa ate 11.
-- So vale com digito verificador certo: telefone na coluna de CPF nao passa.
declare d text := regexp_replace(coalesce(t, ''), '\D', '', 'g'); s int; v1 int; v2 int;
begin
  if d !~ '^\d{9,11}$' then return null; end if;
  d := lpad(d, 11, '0');
  if d ~ '^(\d)\1{10}$' then return null; end if;
  s := 0; for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  v1 := (s * 10) % 11 % 10;
  s := 0; for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  v2 := (s * 10) % 11 % 10;
  if v1 <> substr(d, 10, 1)::int or v2 <> substr(d, 11, 1)::int then return null; end if;
  return d;
end $$;

create table if not exists aluna_documento (
    aluna_id      bigint primary key references aluna(id) on delete cascade,
    cpf           text not null unique check (cpf ~ '^\d{11}$'),
    atualizado_em timestamptz not null default now()
);
alter table aluna_documento enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'aluna_documento' and policyname = 'doc_ler') then
    execute 'create policy doc_ler on aluna_documento for select to authenticated
             using (eh_coordenador() or meu_papel() = ''cs'' or atende_aluna(aluna_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'aluna_documento' and policyname = 'doc_mudar') then
    execute 'create policy doc_mudar on aluna_documento for all to authenticated
             using (eh_coordenador() or meu_papel() = ''cs'') with check (eh_coordenador() or meu_papel() = ''cs'')';
  end if;
end $$;

-- Acha ou cria, olhando o CPF primeiro. CPF que ja pertence a outra ficha nao
-- e copiado: vira pendencia, porque e sinal de cadastro duplicado ou digitado errado.
create or replace function garantir_aluna_doc(p_imp bigint, p_aba text, p_linha int,
                                              p_nome text, p_email text, p_fone text, p_cpf text,
                                              out aluna_id bigint, out criada boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare v_cpf text := norm_cpf(p_cpf); dono bigint; r record;
begin
  criada := false;
  if v_cpf is not null then
    select d.aluna_id into dono from aluna_documento d where d.cpf = v_cpf;
    if dono is not null then aluna_id := dono; return; end if;
  end if;
  select * into r from garantir_aluna(p_imp, p_aba, p_linha, p_nome, p_email, p_fone);
  aluna_id := r.aluna_id; criada := r.criada;
  if aluna_id is null or v_cpf is null then return; end if;
  -- A ficha achada (por e-mail, telefone ou nome) ja tem outro CPF: e outra
  -- pessoa (mae e filha no mesmo e-mail, socias no mesmo telefone, xara).
  -- Ganha ficha propria; a semelhanca fica para alguem conferir.
  if exists (select 1 from aluna_documento d where d.aluna_id = garantir_aluna_doc.aluna_id and d.cpf <> v_cpf) then
    insert into importacao_pendencia (importacao_id, aba, linha, nome, motivo, candidatos)
    values (p_imp, p_aba, p_linha, p_nome, 'Parecida com outra ficha, mas com CPF diferente: ficha separada',
            jsonb_build_object('parecida', aluna_id));
    insert into aluna (nome, email, telefone, criado_por)
    values (limpar_nome(trim(p_nome)), nullif(lower(trim(p_email)), ''), p_fone, auth.uid())
    returning id into aluna_id;
    criada := true;
  end if;
  insert into aluna_documento (aluna_id, cpf) values (aluna_id, v_cpf)
  on conflict on constraint aluna_documento_pkey do nothing;
end $$;

-- Aba de vendas: so completa quem ja tem ficha (CPF, e-mail, telefone). Venda
-- sem ficha correspondente vira pendencia, nao ficha solta sem contrato.
create or replace function vincular_documento(p_imp bigint, p_aba text, p_linha int,
                                              p_nome text, p_email text, p_fone text, p_cpf text)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare v_cpf text := norm_cpf(p_cpf); v_id bigint; r record;
begin
  if not eh_nome_de_pessoa(p_nome) then return null; end if;
  if v_cpf is not null then
    select d.aluna_id into v_id from aluna_documento d where d.cpf = v_cpf;
    -- CPF repetido na planilha para outra pessoa (copiado da linha de cima): nao une.
    if v_id is not null and not exists (select 1 from aluna where id = v_id and nomes_compativeis(nome_chave, chave_nome(p_nome))) then
      insert into importacao_pendencia (importacao_id, aba, linha, nome, motivo, candidatos)
      values (p_imp, p_aba, p_linha, trim(p_nome), 'Venda com CPF que já está em outra ficha', jsonb_build_object('parecida', v_id));
      return null;
    end if;
    if v_id is not null then return v_id; end if;
  end if;
  select * into r from achar_aluna(trim(p_nome), p_email, p_fone);
  v_id := r.aluna_id;
  if v_id is null then
    insert into importacao_pendencia (importacao_id, aba, linha, nome, motivo, candidatos)
    values (p_imp, p_aba, p_linha, trim(p_nome), 'Venda sem ficha correspondente nas turmas', r.candidatos);
    return null;
  end if;
  if v_cpf is not null then
    if exists (select 1 from aluna_documento where aluna_id = v_id and cpf <> v_cpf) then
      insert into importacao_pendencia (importacao_id, aba, linha, nome, motivo, candidatos)
      values (p_imp, p_aba, p_linha, trim(p_nome), 'Venda com CPF diferente do que já está na ficha', jsonb_build_object('parecida', v_id));
      return null;
    end if;
    insert into aluna_documento (aluna_id, cpf) values (v_id, v_cpf)
    on conflict on constraint aluna_documento_pkey do nothing;
  end if;
  return v_id;
end $$;

-- Cruzamento final: duas fichas com o mesmo e-mail ou o mesmo telefone e nome
-- compativel sao a mesma pessoa. Fica a ficha mais antiga; a outra e unida a ela.
-- Telefone repetido em muitas fichas (numero da empresa) nao conta.
create or replace function cruzar_duplicatas() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p record; n int := 0; vistos bigint[] := '{}';
begin
  if auth.uid() is not null and not eh_coordenador() then
    raise exception 'so a coordenacao cruza cadastros';
  end if;
  for p in
    with fone as (
      select norm_fone(telefone) f from aluna where norm_fone(telefone) is not null
      group by 1 having count(*) <= 2
    )
    select a.id as manter, b.id as remover, case when lower(a.email) = lower(b.email) then 'email' else 'telefone' end as por
    from aluna a join aluna b on b.id > a.id
    where nomes_compativeis(a.nome_chave, b.nome_chave)
      and ((a.email is not null and lower(a.email) = lower(b.email))
           or (norm_fone(a.telefone) = norm_fone(b.telefone) and norm_fone(a.telefone) in (select f from fone)))
      and not exists (select 1 from aluna_documento da join aluna_documento db on db.aluna_id = b.id
                      where da.aluna_id = a.id and da.cpf <> db.cpf)
    order by a.id, b.id
  loop
    if p.manter = any(vistos) or p.remover = any(vistos) then continue; end if;
    -- CPF da removida passa para a mantida antes de unir.
    if not exists (select 1 from aluna_documento where aluna_id = p.manter) then
      update aluna_documento set aluna_id = p.manter where aluna_id = p.remover;
    end if;
    perform unir_alunas(p.manter, p.remover);
    perform auditar('fichas unidas no cruzamento', p.remover::text, jsonb_build_object('mantida', p.manter, 'por', p.por));
    vistos := vistos || p.remover;
    n := n + 1;
  end loop;
  return jsonb_build_object('fichas_unidas', n);
end $$;

grant select, insert, update, delete on aluna_documento to authenticated;
revoke execute on function garantir_aluna_doc(bigint, text, integer, text, text, text, text) from public, anon, authenticated;
revoke execute on function vincular_documento(bigint, text, integer, text, text, text, text) from public, anon, authenticated;
revoke execute on function cruzar_duplicatas() from public, anon;
grant execute on function cruzar_duplicatas() to authenticated;
