-- Gerencial: fechamentos de alto valor (In Company e Private), o acompanhamento
-- de cada caso pelos consultores e os numeros do painel da coordenacao.
-- Aplicar DEPOIS de sistema_documento.sql.
--
-- Fechamento: o que foi vendido e como sera pago (vem da planilha de
-- fechamentos). O financeiro e da coordenacao e do comercial; o consultor e a
-- CS do caso acompanham com registros (atualizacao ou transcricao de reuniao),
-- e cada registro atualiza status, nivel e proximas acoes do caso.

create table if not exists fechamento (
    id                    bigint generated always as identity primary key,
    aluna_id              bigint references aluna(id) on delete set null,
    contrato_id           bigint references contrato(id) on delete set null,
    nome                  text not null,
    produto               text not null
                          check (produto in ('Moonshot In Company','Moonshot Private','Moonshot Pró','Moonshot Elite','Moonshot Club')),
    data_fechamento       date not null default current_date,
    valor_total           numeric(14,2),
    valor_pago            numeric(14,2) not null default 0,
    saldo                 numeric(14,2) generated always as (greatest(coalesce(valor_total, 0) - valor_pago, 0)) stored,
    forma_pagamento       text,
    plano_pagamento       text,
    meio_pagamento_futuro text,
    observacao            text,
    consultor_id          uuid references perfil(id) on delete set null,
    cs_id                 uuid references perfil(id) on delete set null,
    status                text not null default 'implantacao'
                          check (status in ('implantacao','em_andamento','atencao','em_risco','concluido','cancelado')),
    nivel                 integer check (nivel between 1 and 5),
    proximas_acoes        text,
    proxima_acao_em       date,
    ultima_atualizacao    timestamptz,
    chave                 text unique,
    criado_em             timestamptz not null default now(),
    atualizado_em         timestamptz not null default now()
);
create index if not exists ix_fechamento_aluna on fechamento(aluna_id);
create index if not exists ix_fechamento_data on fechamento(data_fechamento desc);

create table if not exists fechamento_registro (
    id             bigint generated always as identity primary key,
    fechamento_id  bigint not null references fechamento(id) on delete cascade,
    autor_id       uuid default auth.uid() references perfil(id) on delete set null,
    tipo           text not null default 'atualizacao' check (tipo in ('atualizacao','transcricao')),
    data           date not null default current_date,
    transcricao    text,
    resumo         text,
    status         text check (status in ('implantacao','em_andamento','atencao','em_risco','concluido','cancelado')),
    nivel          integer check (nivel between 1 and 5),
    acoes          text,
    proxima_acao_em date,
    criado_em      timestamptz not null default now()
);
create index if not exists ix_fech_registro on fechamento_registro(fechamento_id, criado_em desc);

-- Quem acompanha o caso: coordenacao, comercial, o consultor e a CS dele ou da aluna.
create or replace function ve_fechamento(f fechamento) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_coordenador() or meu_papel() = 'comercial'
      or f.consultor_id = auth.uid() or f.cs_id = auth.uid()
      or (f.aluna_id is not null and atende_aluna(f.aluna_id))
$$;

-- Fechar In Company ou Private e subir a aluna de programa: o contrato nasce
-- (o que manda no programa da ficha) e o card da Ascensao vai para o degrau.
create or replace function fechamento_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare c bigint;
begin
  new.atualizado_em := now();
  if new.aluna_id is not null and new.contrato_id is null and new.status <> 'cancelado' then
    perform set_config('moonshot.motivo', 'Fechamento ' || new.produto, true);
    insert into contrato (aluna_id, produto, inicio, termino, plano_meses, status, forma_pagamento, observacao, chave)
    values (new.aluna_id, new.produto, new.data_fechamento, (new.data_fechamento + interval '12 months')::date, 12,
            'ativo', new.forma_pagamento, 'Fechamento ' || new.produto,
            'fechamento:' || coalesce(new.chave, md5(new.aluna_id || '|' || new.produto || '|' || new.data_fechamento)))
    on conflict (chave) do update set produto = excluded.produto
    returning id into c;
    perform set_config('moonshot.motivo', '', true);
    new.contrato_id := c;
  end if;
  return new;
end $$;
create or replace trigger tg_fechamento_antes before insert or update on fechamento
  for each row execute function fechamento_antes();

create or replace function fechamento_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare degrau text; e bigint; a aluna;
begin
  if new.aluna_id is null or new.status = 'cancelado' then return new; end if;
  if tg_op = 'UPDATE' and new.aluna_id is not distinct from old.aluna_id and new.produto = old.produto then
    return new;
  end if;
  select * into a from aluna where id = new.aluna_id;
  degrau := case when new.produto = 'Moonshot Elite' then 'Moonshot Pró' else new.produto end;
  e := (select id from etapa where funil_id = 'ascensao' and nome = degrau);
  if e is null then return new; end if;
  update card set etapa_id = e, motivo = coalesce(motivo, 'Fechamento ' || new.produto)
  where funil_id = 'ascensao' and aluna_id = new.aluna_id and fechado_em is null and etapa_id <> e;
  if not found and not exists (select 1 from card where funil_id = 'ascensao' and aluna_id = new.aluna_id and fechado_em is null) then
    insert into card (funil_id, etapa_id, aluna_id, titulo, responsavel_id, dados)
    values ('ascensao', e, a.id, a.nome, a.consultor_id, jsonb_build_object('degrau_origem', 'Fechamento ' || new.produto));
  end if;
  return new;
end $$;
create or replace trigger tg_fechamento_depois after insert or update on fechamento
  for each row execute function fechamento_depois();

-- Cada registro do consultor atualiza o caso. Caso em risco avisa a coordenacao.
create or replace function fechamento_registro_depois() returns trigger
language plpgsql security definer set search_path = public as $$
declare f fechamento;
begin
  update fechamento set status = coalesce(new.status, status), nivel = coalesce(new.nivel, nivel),
         proximas_acoes = coalesce(nullif(trim(new.acoes), ''), proximas_acoes),
         proxima_acao_em = coalesce(new.proxima_acao_em, proxima_acao_em),
         ultima_atualizacao = now()
  where id = new.fechamento_id
  returning * into f;
  if new.status = 'em_risco' then
    perform notificar_papel('coordenador', 'risco', f.nome || ': caso em risco',
                            left(coalesce(new.resumo, new.acoes, ''), 140), '/gerencial?caso=' || f.id);
  end if;
  return new;
end $$;
create or replace trigger tg_fech_registro_depois after insert on fechamento_registro
  for each row execute function fechamento_registro_depois();

alter table fechamento enable row level security;
alter table fechamento_registro enable row level security;
do $$
declare p text[];
begin
  foreach p slice 1 in array array[
    ['fechamento', 'fech_ler', 'create policy fech_ler on fechamento for select to authenticated using (ve_fechamento(fechamento))'],
    ['fechamento', 'fech_criar', 'create policy fech_criar on fechamento for insert to authenticated with check (eh_coordenador() or meu_papel() = ''comercial'')'],
    ['fechamento', 'fech_mudar', 'create policy fech_mudar on fechamento for update to authenticated using (eh_coordenador() or meu_papel() = ''comercial'') with check (eh_coordenador() or meu_papel() = ''comercial'')'],
    ['fechamento', 'fech_apagar', 'create policy fech_apagar on fechamento for delete to authenticated using (eh_coordenador())'],
    ['fechamento_registro', 'fechreg_ler', 'create policy fechreg_ler on fechamento_registro for select to authenticated using (exists (select 1 from fechamento f where f.id = fechamento_id))'],
    ['fechamento_registro', 'fechreg_criar', 'create policy fechreg_criar on fechamento_registro for insert to authenticated with check (autor_id = auth.uid() and exists (select 1 from fechamento f where f.id = fechamento_id))'],
    ['fechamento_registro', 'fechreg_apagar', 'create policy fechreg_apagar on fechamento_registro for delete to authenticated using (eh_coordenador())']
  ] loop
    if not exists (select 1 from pg_policies where tablename = p[1] and policyname = p[2]) then
      execute p[3];
    end if;
  end loop;
end $$;
grant select, insert, update, delete on fechamento, fechamento_registro to authenticated;

-- ---------------------------------------------------------------------------
-- Painel gerencial: so coordenacao. Fechamentos, consultores, contratos por
-- produto e a atuacao das CS por produto, em uma chamada.
-- ---------------------------------------------------------------------------
create or replace function painel_gerencial() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not eh_coordenador() then raise exception 'so a coordenacao ve o painel gerencial'; end if;
  with vivas as (
    select * from aluna where status_contrato not in ('cancelado','encerrado')
  ), fech as (
    select * from fechamento where status <> 'cancelado'
  ), consultores as (
    select p.id, p.nome from perfil p where p.ativo and p.papel = 'consultor'
  ), css as (
    select p.id, p.nome from perfil p where p.ativo and p.papel = 'cs'
  ), ret as (
    select a.cs_id, coalesce(a.produto, 'Sem produto') as produto, e.tipo
    from card c join etapa e on e.id = c.etapa_id join aluna a on a.id = c.aluna_id
    where c.funil_id = 'retencao' and c.fechado_em >= now() - interval '90 days'
  )
  select jsonb_build_object(
    'fechamentos', jsonb_build_object(
      'qtd', (select count(*) from fech),
      'contratado', (select coalesce(sum(valor_total), 0) from fech),
      'pago', (select coalesce(sum(valor_pago), 0) from fech),
      'saldo', (select coalesce(sum(saldo), 0) from fech),
      'sem_valor', (select count(*) from fech where valor_total is null),
      'por_produto', (select coalesce(jsonb_agg(x order by x->>'produto'), '[]') from (
          select jsonb_build_object('produto', produto, 'qtd', count(*), 'contratado', coalesce(sum(valor_total), 0),
                                    'pago', sum(valor_pago), 'saldo', sum(saldo)) x
          from fech group by produto) t),
      'por_mes', (select coalesce(jsonb_agg(x order by x->>'mes'), '[]') from (
          select jsonb_build_object('mes', to_char(data_fechamento, 'YYYY-MM'), 'qtd', count(*),
                                    'contratado', coalesce(sum(valor_total), 0), 'pago', sum(valor_pago)) x
          from fech group by to_char(data_fechamento, 'YYYY-MM')) t),
      'por_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (
          select status, count(*) n from fechamento group by status) t),
      'sem_atualizacao_30d', (select count(*) from fech where status not in ('concluido')
                                and coalesce(ultima_atualizacao, criado_em) < now() - interval '30 days')
    ),
    'consultores', (select coalesce(jsonb_agg(x order by x->>'nome'), '[]') from (
      select jsonb_build_object(
        'id', p.id, 'nome', p.nome,
        'carteira', (select count(*) from vivas a where a.consultor_id = p.id),
        'por_produto', (select coalesce(jsonb_object_agg(produto, n), '{}') from (
            select coalesce(produto, 'Sem produto') produto, count(*) n from vivas a where a.consultor_id = p.id group by 1) t),
        'consultorias_30d', (select count(*) from registro_consultoria r where r.consultor_id = p.id and r.realizada
                               and r.data >= current_date - 30),
        'sem_consultoria', (select count(*) from vivas a where a.consultor_id = p.id and a.status_contrato = 'ativo'
                              and coalesce(a.ultima_consultoria, greatest(a.criado_em::date, coalesce(a.inicio, a.criado_em::date)))
                                  < current_date - param('dias_sem_consultoria')::int),
        'em_risco', (select count(*) from vivas a where a.consultor_id = p.id and a.saude in ('risco_saida','sem_contato')),
        'inadimplentes', (select count(*) from vivas a where a.consultor_id = p.id and a.status_financeiro = 'inadimplente'),
        'oportunidades_90d', (select count(*) from card c where c.funil_id = 'comercial' and c.dados->>'consultor_origem' = p.id::text
                                and c.criado_em >= now() - interval '90 days'),
        'oportunidades_ganhas_90d', (select count(*) from card c join etapa e on e.id = c.etapa_id
                                       where c.funil_id = 'comercial' and c.dados->>'consultor_origem' = p.id::text
                                         and e.tipo = 'ganha' and c.fechado_em >= now() - interval '90 days'),
        'fechamentos', (select count(*) from fech f where f.consultor_id = p.id),
        'fechamentos_valor', (select coalesce(sum(valor_total), 0) from fech f where f.consultor_id = p.id)) x
      from consultores p) t),
    'contratos', (select coalesce(jsonb_agg(x order by x->>'produto'), '[]') from (
      select jsonb_build_object(
        'produto', coalesce(produto, 'Sem produto'),
        'ativos', count(*) filter (where status_contrato = 'ativo'),
        'em_cancelamento', count(*) filter (where status_contrato = 'em_cancelamento'),
        'parados', count(*) filter (where status_contrato in ('pausado','bloqueado','pendente')),
        'cancelados', count(*) filter (where status_contrato = 'cancelado'),
        'encerrados', count(*) filter (where status_contrato = 'encerrado'),
        'inadimplentes', count(*) filter (where status_financeiro = 'inadimplente' and status_contrato not in ('cancelado','encerrado')),
        'vencendo_60d', count(*) filter (where status_contrato not in ('cancelado','encerrado')
                                           and termino between current_date and current_date + 60)) x
      from aluna group by coalesce(produto, 'Sem produto')) t),
    'cs', (select coalesce(jsonb_agg(x order by x->>'nome', x->>'produto'), '[]') from (
      select jsonb_build_object(
        'id', p.id, 'nome', p.nome, 'produto', pr.produto,
        'alunas', count(a.id),
        'contato_30d', count(a.id) filter (where a.ultimo_contato >= current_date - 30),
        'sem_contato_30d', count(a.id) filter (where a.ultimo_contato is null or a.ultimo_contato < current_date - 30),
        'em_risco', count(a.id) filter (where a.saude in ('risco_saida','sem_contato') or a.status_contrato = 'em_cancelamento'),
        'retidas_90d', (select count(*) from ret where ret.cs_id = p.id and ret.produto = pr.produto and ret.tipo = 'ganha'),
        'perdidas_90d', (select count(*) from ret where ret.cs_id = p.id and ret.produto = pr.produto and ret.tipo = 'perdida')) x
      from css p
      join lateral (select distinct coalesce(produto, 'Sem produto') produto from vivas where cs_id = p.id) pr on true
      left join vivas a on a.cs_id = p.id and coalesce(a.produto, 'Sem produto') = pr.produto
      group by p.id, p.nome, pr.produto) t)
  ) into r;
  return r;
end $$;

revoke execute on function painel_gerencial() from public, anon;
grant execute on function painel_gerencial() to authenticated;
revoke execute on function fechamento_antes() from public, anon, authenticated;
revoke execute on function fechamento_depois() from public, anon, authenticated;
revoke execute on function fechamento_registro_depois() from public, anon, authenticated;
