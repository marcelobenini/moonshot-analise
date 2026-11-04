-- Edicao pela equipe do que veio da planilha.
-- O consultor corrige a agenda (marcar ou desmarcar realizada, data,
-- observacao, nao realizada) e as anotacoes: as importadas (sem autor) e as
-- proprias. A coordenacao edita qualquer anotacao.
-- Aplicar DEPOIS de sistema_permissoes.sql.

alter table consultoria_agenda add column if not exists situacao text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'consultoria_agenda_situacao_check') then
    alter table consultoria_agenda add constraint consultoria_agenda_situacao_check
      check (situacao is null or situacao in ('nao_realizada', 'cancelada'));
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'nota_aluna' and policyname = 'nota_mudar') then
    create policy nota_mudar on nota_aluna for update to authenticated
      using (eh_coordenador() or (edita_aluna() and (autor_id = auth.uid() or autor_id is null)))
      with check (eh_coordenador() or (edita_aluna() and (autor_id = auth.uid() or autor_id is null)));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'nota_aluna' and policyname = 'nota_apagar') then
    create policy nota_apagar on nota_aluna for delete to authenticated
      using (eh_coordenador() or (edita_aluna() and (autor_id = auth.uid() or autor_id is null)));
  end if;
end $$;
