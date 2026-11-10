-- Unir fichas: a versao de sistema_planilhas.sql nao conhecia as tabelas
-- criadas depois (historico, CPF, faturamento mensal, arquivos, roteiro,
-- casos do Gerencial) e o apagar da ficha removida levava tudo junto.
-- Tambem prefere o ID da planilha (MS-xxxx) ao codigo gerado pelo nome.
-- Aplicar DEPOIS de sistema_conexao.sql.

create or replace function unir_alunas(p_manter bigint, p_remover bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r aluna;
begin
  if auth.uid() is not null and not eh_coordenador() then
    raise exception 'so a coordenacao une fichas';
  end if;
  if p_manter = p_remover then return; end if;
  select * into r from aluna where id = p_remover;
  if r.id is null then raise exception 'ficha % nao existe', p_remover; end if;
  perform set_config('moonshot.silencio', 'on', true);
  update contrato set aluna_id = p_manter where aluna_id = p_remover;
  update registro_consultoria set aluna_id = p_manter where aluna_id = p_remover;
  update nota_aluna n set aluna_id = p_manter where aluna_id = p_remover
    and not exists (select 1 from nota_aluna m where m.aluna_id = p_manter and md5(m.texto) = md5(n.texto));
  update consultoria_agenda g set aluna_id = p_manter where aluna_id = p_remover
    and not exists (select 1 from consultoria_agenda h where h.aluna_id = p_manter and h.numero = g.numero);
  update demanda set aluna_id = p_manter where aluna_id = p_remover;
  update evento_participante set aluna_id = p_manter where aluna_id = p_remover;
  -- Tabelas que vieram depois: historico, documento, entrada, roteiro,
  -- faturamento mensal, arquivos e casos do Gerencial.
  update aluna_historico set aluna_id = p_manter where aluna_id = p_remover;
  update aluna_documento d set aluna_id = p_manter where aluna_id = p_remover
    and not exists (select 1 from aluna_documento e where e.aluna_id = p_manter);
  update formulario_entrada set aluna_id = p_manter where aluna_id = p_remover;
  update pre_analise x set aluna_id = p_manter where aluna_id = p_remover
    and not exists (select 1 from pre_analise y where y.aluna_id = p_manter);
  update acompanhamento x set aluna_id = p_manter where aluna_id = p_remover
    and not exists (select 1 from acompanhamento y where y.aluna_id = p_manter and y.etapa_chave = x.etapa_chave);
  update faturamento_mes x set aluna_id = p_manter where aluna_id = p_remover
    and not exists (select 1 from faturamento_mes y where y.aluna_id = p_manter and y.mes = x.mes);
  update aluna_arquivo set aluna_id = p_manter where aluna_id = p_remover;
  update fechamento set aluna_id = p_manter where aluna_id = p_remover;
  -- Card aberto duplicado no mesmo funil: o da ficha removida fecha como
  -- historico (vai para a primeira etapa final do funil).
  update card c set aluna_id = p_manter where aluna_id = p_remover
    and not (fechado_em is null and exists (select 1 from card d where d.aluna_id = p_manter
                                            and d.funil_id = c.funil_id and d.fechado_em is null));
  update card c set aluna_id = p_manter, motivo = coalesce(motivo, 'Ficha unida'),
                    etapa_id = (select id from etapa e where e.funil_id = c.funil_id and e.tipo <> 'aberta' order by ordem limit 1)
  where aluna_id = p_remover;
  -- Apaga a removida antes de copiar os campos dela (ja estao em `r`): pessoa_id e unico.
  delete from aluna where id = p_remover;
  update aluna m set
    email = coalesce(m.email, r.email), telefone = coalesce(m.telefone, r.telefone),
    telefone2 = coalesce(m.telefone2, r.telefone2, case when r.telefone is distinct from m.telefone then r.telefone end),
    empresa = coalesce(m.empresa, r.empresa), ramo = coalesce(m.ramo, r.ramo), cidade = coalesce(m.cidade, r.cidade),
    uf = coalesce(m.uf, r.uf), faturamento_mensal = coalesce(m.faturamento_mensal, r.faturamento_mensal),
    consultor_id = coalesce(m.consultor_id, r.consultor_id), cs_id = coalesce(m.cs_id, r.cs_id),
    consultor_planilha = coalesce(m.consultor_planilha, r.consultor_planilha), cs_planilha = coalesce(m.cs_planilha, r.cs_planilha),
    saude = coalesce(m.saude, r.saude), ultima_consultoria = greatest(m.ultima_consultoria, r.ultima_consultoria),
    tamanho_kit = coalesce(m.tamanho_kit, r.tamanho_kit), jaqueta = coalesce(m.jaqueta, r.jaqueta),
    link_notion = coalesce(m.link_notion, r.link_notion), cadastro_preenchido = m.cadastro_preenchido or r.cadastro_preenchido,
    acesso_plataforma = coalesce(m.acesso_plataforma, r.acesso_plataforma),
    onboarding_status = coalesce(m.onboarding_status, r.onboarding_status), grupo_avisos = coalesce(m.grupo_avisos, r.grupo_avisos),
    pessoa_id = case when r.pessoa_id < 1000000 and (m.pessoa_id is null or m.pessoa_id >= 1000000)
                     then r.pessoa_id else coalesce(m.pessoa_id, r.pessoa_id) end
  where m.id = p_manter;
  perform sincronizar_aluna(p_manter);
  update importacao_pendencia set resolvida = true
  where not resolvida and (candidatos->>'nova')::bigint in (p_manter, p_remover);
  perform set_config('moonshot.silencio', 'off', true);
end $$;
