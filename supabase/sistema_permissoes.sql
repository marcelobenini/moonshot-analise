-- Quem edita a ficha da aluna. A equipe da operacao (coordenacao, CS,
-- consultores, comercial e retencao) corrige e completa qualquer ficha:
-- cadastro, agenda e dias de consultoria, contratos, notas e status.
-- A gestao so le. Continuam restritos: CPF (coordenacao e CS), a
-- redistribuicao de carteira (aluna_protege: coordenacao e CS) e a LEITURA
-- do relato de consultoria e das anotacoes de outra carteira.
-- Aplicar DEPOIS de sistema_gerencial.sql.

create or replace function edita_aluna() returns boolean
language sql stable security definer set search_path = public as $$
  select ativo() and meu_papel() in ('coordenador', 'cs', 'consultor', 'comercial', 'retencao')
$$;

alter policy aluna_mudar on aluna
  using (edita_aluna()) with check (edita_aluna());
alter policy contrato_mudar on contrato
  using (edita_aluna()) with check (edita_aluna());
alter policy agenda_ler on consultoria_agenda
  using (edita_aluna() or atende_aluna(aluna_id));
alter policy agenda_mudar on consultoria_agenda
  using (edita_aluna()) with check (edita_aluna());
alter policy regcon_criar on registro_consultoria
  with check (consultor_id = auth.uid() and edita_aluna());
alter policy nota_criar on nota_aluna
  with check (autor_id = auth.uid() and edita_aluna());

-- Mudar status pela ficha: a mesma equipe.
do $$
declare d text;
begin
  d := pg_get_functiondef('mudar_status_aluna(bigint,text,text,text)'::regprocedure);
  if position('edita_aluna()' in d) = 0 then
    d := replace(d, 'if not (eh_coordenador() or meu_papel() in (''cs'', ''retencao'') or atende_aluna(p_aluna)) then',
                    'if not edita_aluna() then');
    if position('edita_aluna()' in d) = 0 then raise exception 'mudar_status_aluna nao bateu com o esperado'; end if;
    execute d;
  end if;
end $$;

revoke execute on function edita_aluna() from public, anon;
grant execute on function edita_aluna() to authenticated;
