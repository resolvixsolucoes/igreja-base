-- =====================================================================
-- Financeiro F.6a — Lancamentos recorrentes
--
-- Cadastra lancamentos que se repetem mensalmente (aluguel, salario,
-- internet...). Materializacao manual via RPC, gera no mes solicitado
-- evitando duplicatas (rastreio por recorrencia_id em financeiro).
--
-- Idempotente. Pre-requisitos: F.1 a F.4 aplicadas.
-- =====================================================================


-- ─── 1) Tabela financeiro_recorrencias ────────────────────────────────
create table if not exists public.financeiro_recorrencias (
  id            uuid primary key default gen_random_uuid(),
  descricao     text not null,
  tipo          text not null check (tipo in ('entrada','saida')),
  valor         numeric(12,2) not null check (valor > 0),
  categoria_id  uuid references public.financeiro_categorias(id),
  conta_id      uuid not null references public.financeiro_contas(id),
  forma_pgto_id uuid references public.financeiro_formas_pgto(id),
  dia_do_mes    int  not null check (dia_do_mes between 1 and 31),
  ativo         boolean not null default true,
  criado_por    uuid references public.perfis(id),
  criado_em     timestamptz not null default now()
);

create index if not exists financeiro_recorrencias_ativo_idx
  on public.financeiro_recorrencias (ativo);


-- ─── 2) Coluna recorrencia_id em financeiro (rastreio) ────────────────
alter table public.financeiro
  add column if not exists recorrencia_id uuid
    references public.financeiro_recorrencias(id) on delete set null;

create index if not exists financeiro_recorrencia_id_idx
  on public.financeiro (recorrencia_id);


-- ─── 3) RLS ───────────────────────────────────────────────────────────
alter table public.financeiro_recorrencias enable row level security;

drop policy if exists financeiro_rec_select on public.financeiro_recorrencias;
create policy financeiro_rec_select on public.financeiro_recorrencias
  for select to authenticated
  using (public.tem_perm_granular('financeiro','_default','ver'));

drop policy if exists financeiro_rec_write on public.financeiro_recorrencias;
create policy financeiro_rec_write on public.financeiro_recorrencias
  for all to authenticated
  using      (public.is_admin_prod())
  with check (public.is_admin_prod());


-- ─── 4) RPC: gera lancamentos das recorrencias ativas no mes ──────────
-- Idempotente: cada (recorrencia_id, ano-mes) so e materializado uma vez.
-- Dia do mes e clampado ao ultimo dia (evita 31 em fev).
create or replace function public.financeiro_gerar_recorrencias(
  p_ano int,
  p_mes int
)
returns table (
  recorrencia_id uuid,
  descricao      text,
  novo_id        uuid,
  pulado         boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r           record;
  v_ultimo    int;
  v_data      date;
  v_inserido  uuid;
begin
  if not public.is_admin_prod() then
    raise exception 'sem permissao para gerar recorrencias';
  end if;

  if p_mes < 1 or p_mes > 12 then
    raise exception 'mes invalido';
  end if;

  -- ultimo dia do mes alvo (pra clampar dia_do_mes)
  v_ultimo := extract(day from
    (date_trunc('month', make_date(p_ano, p_mes, 1)) + interval '1 month - 1 day')
  )::int;

  for r in
    select * from public.financeiro_recorrencias where ativo
  loop
    -- ja gerada nesse mes?
    if exists (
      select 1 from public.financeiro f
      where f.recorrencia_id = r.id
        and f.excluido_em is null
        and extract(year  from f.data_pagamento)::int = p_ano
        and extract(month from f.data_pagamento)::int = p_mes
    ) then
      recorrencia_id := r.id;
      descricao      := r.descricao;
      novo_id        := null;
      pulado         := true;
      return next;
      continue;
    end if;

    v_data := make_date(p_ano, p_mes, least(r.dia_do_mes, v_ultimo));

    insert into public.financeiro
      (descricao, tipo, valor, data_pagamento,
       categoria_id, conta_id, forma_pgto_id, recorrencia_id)
    values
      (r.descricao, r.tipo, r.valor, v_data,
       r.categoria_id, r.conta_id, r.forma_pgto_id, r.id)
    returning id into v_inserido;

    recorrencia_id := r.id;
    descricao      := r.descricao;
    novo_id        := v_inserido;
    pulado         := false;
    return next;
  end loop;
end;
$$;

grant execute on function public.financeiro_gerar_recorrencias(int,int) to authenticated;


-- =====================================================================
-- Validacao manual:
--
--   -- 1) Tabela criada
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='financeiro_recorrencias';
--
--   -- 2) Cadastra recorrencia teste (logado como admin):
--   --    db.from('financeiro_recorrencias').insert({...})
--
--   -- 3) Gera lancamentos do mes:
--   --    db.rpc('financeiro_gerar_recorrencias',{p_ano:2026,p_mes:5})
--   --    Re-rodar: todas viram pulado=true (idempotencia)
-- =====================================================================

grant select, insert, update, delete on public.financeiro_recorrencias to authenticated;
