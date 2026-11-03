-- CS fixo por consultor e por programa.
-- Elite, Private e In Company: um CS só para todos (tabela cs_programa).
-- Club e Pró: o CS do grupo do consultor (perfil.cs_responsavel_id).
-- Ao cadastrar a aluna, ou ao mudar consultor/programa, o CS vem da regra.
-- Quem mudar o CS na mão no mesmo salvamento vence a regra.

create table if not exists cs_programa (
    programa text primary key check (programa in ('Elite','Private','In Company')),
    cs_id    uuid references perfil(id) on delete set null
);
alter table cs_programa enable row level security;
drop policy if exists cs_programa_ler on cs_programa;
create policy cs_programa_ler on cs_programa for select to authenticated using (ativo());
drop policy if exists cs_programa_mudar on cs_programa;
create policy cs_programa_mudar on cs_programa for all to authenticated
  using (eh_coordenador()) with check (eh_coordenador());
insert into cs_programa (programa) values ('Elite'), ('Private'), ('In Company') on conflict do nothing;

create or replace function cs_da_regra(p_produto text, p_consultor uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.cs_id from cs_programa c
      where coalesce(p_produto, '') ilike '%' || c.programa || '%' and c.cs_id is not null limit 1),
    case when coalesce(p_produto, '') !~* '(elite|private|in company)'
         then (select p.cs_responsavel_id from perfil p where p.id = p_consultor) end)
$$;
revoke execute on function cs_da_regra(text, uuid) from public, anon;

create or replace function aluna_cs_regra() returns trigger
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if tg_op = 'INSERT' then
    if new.cs_id is not null then return new; end if;
  elsif not ((new.consultor_id is distinct from old.consultor_id or new.produto is distinct from old.produto)
             and new.cs_id is not distinct from old.cs_id) then
    return new;
  end if;
  v := cs_da_regra(new.produto, new.consultor_id);
  if v is not null then new.cs_id := v; end if;
  return new;
end $$;
drop trigger if exists aluna_cs_regra on aluna;
create trigger aluna_cs_regra before insert or update of consultor_id, produto, cs_id on aluna
  for each row execute function aluna_cs_regra();

-- Equipe atual (só preenche o que está vazio; a coordenação muda na tela Equipe).
do $$
declare
  cs record;
begin
  for cs in select * from (values
      ('jessica',  null::text[]),
      ('junior',   array['hiago','thiago','marcelo']),
      ('daniele',  array['daniela','andressa','keren']),
      ('rafaela',  array['vinicius','vinícius','anameli','anaméli'])) as t(cs_nome, consultores)
  loop
    if cs.consultores is null then
      update cs_programa set cs_id = (select id from perfil where papel = 'cs' and nome ilike cs.cs_nome || '%' limit 1)
       where cs_id is null;
    else
      update perfil p set cs_responsavel_id = (select id from perfil where papel = 'cs' and nome ilike cs.cs_nome || '%' limit 1)
       where p.cs_responsavel_id is null and p.papel in ('consultor','coordenador')
         and exists (select 1 from unnest(string_to_array(lower(coalesce(p.consultor_norm, p.nome)), ',')) n
                      where trim(n) = any(cs.consultores));
    end if;
  end loop;
end $$;

-- Alunas já cadastradas sem CS recebem o da regra.
update aluna set cs_id = cs_da_regra(produto, consultor_id)
 where cs_id is null and cs_da_regra(produto, consultor_id) is not null;
