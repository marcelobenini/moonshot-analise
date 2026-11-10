-- Ficha da aluna -> caso do Gerencial (In Company e Private).
-- O consultor preenche uma vez, na ficha ou no Acompanhamento: o registro de
-- consultoria e cada etapa do roteiro (visita, plano, devolutiva...) viram
-- automaticamente um registro do caso aberto da aluna no Gerencial, e o caso
-- atualiza status, proximas acoes e proxima data. Editar ou apagar na ficha
-- edita ou apaga o registro espelhado.
-- Aplicar DEPOIS de sistema_conta.sql.

alter table fechamento_registro add column if not exists origem text;
create unique index if not exists ux_fechreg_origem on fechamento_registro(origem) where origem is not null;

-- O caso de alto valor em curso da aluna (o mais recente).
create or replace function caso_aberto(p_aluna bigint) returns bigint
language sql stable security definer set search_path = public as $$
  select id from fechamento
  where aluna_id = p_aluna and produto in ('Moonshot In Company', 'Moonshot Private')
    and status not in ('cancelado', 'concluido')
  order by data_fechamento desc, id desc limit 1
$$;
revoke execute on function caso_aberto(bigint) from public, anon;
grant execute on function caso_aberto(bigint) to authenticated;

-- Agora o registro atualiza o caso tambem quando e editado.
create or replace trigger tg_fech_registro_depois after insert or update on fechamento_registro
  for each row execute function fechamento_registro_depois();

-- Nome da etapa no roteiro do programa da aluna.
create or replace function nome_etapa(p_aluna bigint, p_chave text, p_numero integer) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select j.nome from jornada_etapa j join aluna a on a.id = p_aluna
      where j.programa = case when a.produto = 'Moonshot Elite' then 'Moonshot Pró' else a.produto end
        and ((p_chave is not null and j.chave = p_chave) or (p_chave is null and j.numero = p_numero))
      limit 1),
    case when p_numero = 0 then 'Consultoria inicial' when p_numero is not null then p_numero || 'ª consultoria' else p_chave end)
$$;

create or replace function regcon_para_caso() returns trigger
language plpgsql security definer set search_path = public as $$
declare caso bigint; o text;
begin
  o := 'regcon:' || coalesce(new.id, old.id);
  if tg_op = 'DELETE' then
    delete from fechamento_registro where origem = o;
    return old;
  end if;
  caso := caso_aberto(new.aluna_id);
  if caso is null then return new; end if;
  insert into fechamento_registro (fechamento_id, autor_id, tipo, data, resumo, status, acoes, origem)
  values (caso, new.consultor_id, 'atualizacao', new.data,
          case when new.numero is null then 'Contato' else nome_etapa(new.aluna_id, null, new.numero) end
            || case when new.realizada then '' else ' (não realizada)' end || ': ' || new.situacao,
          case new.saude when 'risco_saida' then 'em_risco' when 'sem_contato' then 'atencao'
                         when 'oscilante' then 'atencao' else 'em_andamento' end,
          nullif(trim(new.proximo_passo), ''), o)
  on conflict (origem) where origem is not null do update
    set data = excluded.data, resumo = excluded.resumo, status = excluded.status, acoes = excluded.acoes;
  return new;
end $$;
create or replace trigger tg_regcon_para_caso after insert or update or delete on registro_consultoria
  for each row execute function regcon_para_caso();
revoke execute on function regcon_para_caso() from public, anon, authenticated;

create or replace function acomp_para_caso() returns trigger
language plpgsql security definer set search_path = public as $$
declare caso bigint; o text; quando text;
begin
  o := 'acomp:' || coalesce(new.id, old.id);
  if tg_op = 'DELETE' then
    delete from fechamento_registro where origem = o;
    return old;
  end if;
  caso := caso_aberto(new.aluna_id);
  if caso is null then return new; end if;
  quando := case new.status
    when 'feito' then 'feito' || coalesce(' em ' || to_char(new.data, 'DD/MM/YYYY'), '')
    when 'agendado' then 'agendado' || coalesce(' para ' || to_char(new.data, 'DD/MM/YYYY'), '')
    else 'não se aplica' end;
  insert into fechamento_registro (fechamento_id, autor_id, tipo, data, resumo, acoes, proxima_acao_em, origem)
  values (caso, coalesce(new.autor_id, auth.uid()), 'atualizacao',
          case when new.status = 'feito' and new.data is not null then new.data else current_date end,
          nome_etapa(new.aluna_id, new.etapa_chave, null) || ' (' || quando || ')' || coalesce(': ' || nullif(trim(new.resumo), ''), ''),
          nullif(trim(new.proximos_passos), ''),
          coalesce(new.proxima_data, case when new.status = 'agendado' then new.data end), o)
  on conflict (origem) where origem is not null do update
    set data = excluded.data, resumo = excluded.resumo, acoes = excluded.acoes, proxima_acao_em = excluded.proxima_acao_em;
  return new;
end $$;
create or replace trigger tg_acomp_para_caso after insert or update or delete on acompanhamento
  for each row execute function acomp_para_caso();
revoke execute on function acomp_para_caso() from public, anon, authenticated;
