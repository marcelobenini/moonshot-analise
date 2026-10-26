-- Manutencao: separa fichas que a regra antiga de nome (primeiro + ultimo
-- com sobrenome comum) juntou. Recebe {pares: {pessoa: ficha_que_absorveu},
-- ref: {nome: dados da importacao refeita com a regra nova}} e move cada
-- contrato, data de agenda, nota, CPF e card para o dono certo. Nao apaga
-- linha. So o banco (postgres) executa; aplicada uma vez em out/26.
create or replace function separar_fichas(pl jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  par record; f_nome text; fid bigint; pid bigint; ref_f jsonb; ref_p jsonb; r record; n int; x jsonb;
  ids bigint[]; pids jsonb := '{}'; dono text; xe jsonb;
  campos text := 'telefone,email,empresa,ramo,cidade,uf,produto,turma,inicio,termino,status_contrato,status_financeiro,'
              || 'faturamento_mensal,funcionarios,consultor_planilha,ultima_consultoria,tamanho_kit,telefone2,forma_pagamento,'
              || 'plano_meses,contrato_assinatura,acesso_plataforma,onboarding_status,grupo_avisos,cadastro_preenchido,'
              || 'link_notion,jaqueta,cs_planilha';
begin
  -- 1. Fichas novas para quem tinha sido absorvido.
  for par in select key as p, value #>> '{}' as f from jsonb_each(pl->'pares') loop
    select array_agg(id) into ids from aluna where nome = par.f;
    if coalesce(array_length(ids, 1), 0) <> 1 then raise exception 'ficha % nao e unica: %', par.f, ids; end if;
    if exists (select 1 from aluna where nome = par.p) then raise exception 'ja existe ficha %', par.p; end if;
    ref_p := pl->'ref'->par.p;
    execute format('insert into aluna (nome,%s) select nome,%s from jsonb_populate_record(null::aluna, $1) returning id', campos, campos)
      using ref_p->'aluna' into pid;
    pids := pids || jsonb_build_object(par.p, pid);
  end loop;

  -- 2. Por ficha absorvente: cada dado volta para quem e dono, segundo a referencia.
  for f_nome in select distinct value #>> '{}' from jsonb_each(pl->'pares') loop
    select id into fid from aluna where nome = f_nome;
    ref_f := pl->'ref'->f_nome;
    execute format('update aluna set (%s) = (select %s from jsonb_populate_record(null::aluna, $1)), consultor_id = null, cs_id = null where id = $2',
                   campos, campos) using ref_f->'aluna', fid;

    -- Contratos: chave produto + turma.
    for r in select c.id, c.produto, trim(coalesce(c.turma, '')) as turma from contrato c where c.aluna_id = fid loop
      x := (select e from jsonb_array_elements(ref_f->'contratos') e where e->>'produto' = r.produto and trim(coalesce(e->>'turma','')) = r.turma limit 1);
      if x is null then
        select p.key, e into dono, xe from jsonb_each(pl->'pares') p, jsonb_array_elements(pl->'ref'->p.key->'contratos') e
          where p.value #>> '{}' = f_nome and e->>'produto' = r.produto and trim(coalesce(e->>'turma','')) = r.turma limit 1;
        if found then
          update contrato set aluna_id = (pids->>dono)::bigint where id = r.id;
          x := xe;
        end if;
      end if;
      if x is not null then
        update contrato c set inicio = j.inicio, termino = j.termino, plano_meses = j.plano_meses, status = j.status,
               status_financeiro = j.status_financeiro, forma_pagamento = j.forma_pagamento, assinatura = j.assinatura, observacao = j.observacao
        from jsonb_populate_record(null::contrato, x) j where c.id = r.id;
      end if;
    end loop;
    -- Contratos da referencia que ainda nao existem (dois contratos que tinham virado um).
    for par in select f_nome as dono, fid as id union all
               select p.key, (pids->>p.key)::bigint from jsonb_each(pl->'pares') p where p.value #>> '{}' = f_nome loop
      insert into contrato (aluna_id, produto, turma, inicio, termino, plano_meses, status, status_financeiro, forma_pagamento, assinatura, observacao, chave)
      select par.id, j.produto, j.turma, j.inicio, j.termino, j.plano_meses, j.status, j.status_financeiro, j.forma_pagamento, j.assinatura, j.observacao,
             'matricula:' || md5(par.id || '|' || j.produto || '|' || coalesce(j.turma, ''))
      from jsonb_array_elements(pl->'ref'->par.dono->'contratos') e, jsonb_populate_record(null::contrato, e) j
      where not exists (select 1 from contrato c where c.aluna_id = par.id and c.produto = j.produto and trim(coalesce(c.turma,'')) = trim(coalesce(j.turma,'')));
    end loop;

    -- Agenda: numero que a referencia nao da para a ficha volta para a pessoa.
    for r in select g.id, g.numero from consultoria_agenda g where g.aluna_id = fid
             and not exists (select 1 from jsonb_array_elements(ref_f->'agenda') e where (e->>'numero')::int = g.numero) loop
      select p.key into dono from jsonb_each(pl->'pares') p, jsonb_array_elements(pl->'ref'->p.key->'agenda') e
        where p.value #>> '{}' = f_nome and (e->>'numero')::int = r.numero
          and not exists (select 1 from consultoria_agenda g2 where g2.aluna_id = (pids->>p.key)::bigint and g2.numero = r.numero) limit 1;
      if found then update consultoria_agenda set aluna_id = (pids->>dono)::bigint where id = r.id; end if;
    end loop;
    for par in select f_nome as dono, fid as id union all
               select p.key, (pids->>p.key)::bigint from jsonb_each(pl->'pares') p where p.value #>> '{}' = f_nome loop
      insert into consultoria_agenda (aluna_id, numero, data_prevista, realizada_em, observacao)
      select par.id, j.numero, j.data_prevista, j.realizada_em, j.observacao
      from jsonb_array_elements(pl->'ref'->par.dono->'agenda') e, jsonb_populate_record(null::consultoria_agenda, e) j
      on conflict (aluna_id, numero) do update set data_prevista = excluded.data_prevista, realizada_em = excluded.realizada_em, observacao = excluded.observacao;
    end loop;

    -- Notas importadas: o texto diz de quem e.
    for par in select p.key, (pids->>p.key)::bigint as id from jsonb_each(pl->'pares') p where p.value #>> '{}' = f_nome loop
      update nota_aluna n set aluna_id = par.id
      where n.aluna_id = fid and n.origem is not null
        and (pl->'ref'->par.key->'notas') ? md5(n.texto)
        and not (ref_f->'notas') ? md5(n.texto);

      -- CPF e card que vieram da pessoa.
      update aluna_documento set aluna_id = par.id
      where aluna_id = fid and cpf = pl->'ref'->par.key->>'cpf' and cpf is distinct from ref_f->>'cpf';
      update card c set aluna_id = par.id, titulo = (select nome from aluna where id = par.id)
      where c.aluna_id = fid and c.fechado_em is null
        and not exists (select 1 from jsonb_array_elements(ref_f->'cards') e where e->>'funil' = c.funil_id)
        and exists (select 1 from jsonb_array_elements(pl->'ref'->par.key->'cards') e where e->>'funil' = c.funil_id);
      insert into card (funil_id, etapa_id, aluna_id, titulo, dados)
      select e->>'funil', et.id, par.id, (select nome from aluna where id = par.id), e->'dados'
      from jsonb_array_elements(pl->'ref'->par.key->'cards') e join etapa et on et.funil_id = e->>'funil' and et.nome = e->>'etapa'
      where not exists (select 1 from card c where c.aluna_id = par.id and c.funil_id = e->>'funil' and c.fechado_em is null);
    end loop;
  end loop;
  -- 3. O resumo do contrato na ficha so depois de tudo no lugar.
  for dono in select jsonb_object_keys(pl->'ref') loop
    execute format('update aluna set (%s) = (select %s from jsonb_populate_record(null::aluna, $1)) where nome = $2',
                   'produto,turma,inicio,termino,status_contrato,status_financeiro,plano_meses,forma_pagamento,contrato_assinatura',
                   'produto,turma,inicio,termino,status_contrato,status_financeiro,plano_meses,forma_pagamento,contrato_assinatura')
      using pl->'ref'->dono->'aluna', dono;
  end loop;
  perform auditar('fichas separadas', null, jsonb_build_object('fichas', pids));
  perform vincular_equipe();
  return pids;
end $$;
revoke execute on function separar_fichas(jsonb) from public, anon, authenticated;
