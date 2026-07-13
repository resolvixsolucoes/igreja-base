-- =====================================================================
-- Financeiro F.6b — Fechamento mensal
--
-- Permite "fechar" um mes/ano: a partir dai, INSERT/UPDATE/DELETE em
-- lancamentos com data_pagamento naquele mes ficam bloqueados (RLS).
-- Apenas admin pode fechar/reabrir.
--
-- Idempotente. Pre-requisitos: F.1 (RLS, tem_perm_granular, RPC excluir).
-- =====================================================================


-- ─── 1) Tabela financeiro_fechamentos ─────────────────────────────────
create table if not exists public.financeiro_fechamentos (
  id          uuid primary key default gen_random_uuid(),
  ano         int  not null,
  mes         int  not null check (mes between 1 and 12),
  fechado_por uuid references public.perfis(id),
  fechado_em  timestamptz not null default now(),
  unique (ano, mes)
);

alter table public.financeiro_fechamentos enable row level security;

drop policy if exists financeiro_fech_select on public.financeiro_fechamentos;
create policy financeiro_fech_select on public.financeiro_fechamentos
  for select to authenticated
  using (public.tem_perm_granular('financeiro','_default','ver'));

-- Escrita externa bloqueada — somente via RPCs SECURITY DEFINER.
drop policy if exists financeiro_fech_no_write on public.financeiro_fechamentos;
create policy financeiro_fech_no_write on public.financeiro_fechamentos
  for all to authenticated
  using (false) with check (false);


-- ─── 2) Helper: mes fechado? ──────────────────────────────────────────
create or replace function public.financeiro_mes_fechado(p_data date)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p_data is null then false
    else exists (
      select 1 from public.financeiro_fechamentos f
      where f.ano = extract(year  from p_data)::int
        and f.mes = extract(month from p_data)::int
    )
  end;
$$;

grant execute on function public.financeiro_mes_fechado(date) to authenticated;


-- ─── 3) Policies revisadas em financeiro (bloqueia mes fechado) ───────
drop policy if exists financeiro_insert on public.financeiro;
create policy financeiro_insert on public.financeiro
  for insert to authenticated
  with check (
    public.tem_perm_granular('financeiro','_default','adicionar')
    and not public.financeiro_mes_fechado(data_pagamento)
  );

drop policy if exists financeiro_update on public.financeiro;
create policy financeiro_update on public.financeiro
  for update to authenticated
  using      (excluido_em is null
              and public.tem_perm_granular('financeiro','_default','editar')
              and not public.financeiro_mes_fechado(data_pagamento))
  with check (excluido_em is null
              and public.tem_perm_granular('financeiro','_default','editar')
              and not public.financeiro_mes_fechado(data_pagamento));


-- ─── 4) RPC excluir: rejeita se mes fechado ───────────────────────────
create or replace function public.financeiro_excluir(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data date;
begin
  if not public.tem_perm_granular('financeiro','_default','excluir') then
    raise exception 'sem permissao para excluir lancamento financeiro';
  end if;

  select data_pagamento into v_data
  from public.financeiro where id = p_id;

  if public.financeiro_mes_fechado(v_data) then
    raise exception 'mes fechado — exclusao bloqueada';
  end if;

  update public.financeiro
     set excluido_em  = now(),
         excluido_por = auth.uid()
   where id = p_id
     and excluido_em is null;
end;
$$;


-- ─── 5) RPC: fechar mes ───────────────────────────────────────────────
create or replace function public.financeiro_fechar_mes(p_ano int, p_mes int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_prod() then
    raise exception 'sem permissao para fechar mes';
  end if;
  if p_mes < 1 or p_mes > 12 then
    raise exception 'mes invalido';
  end if;

  insert into public.financeiro_fechamentos (ano, mes, fechado_por)
  values (p_ano, p_mes, auth.uid())
  on conflict (ano, mes) do nothing;
end;
$$;

grant execute on function public.financeiro_fechar_mes(int, int) to authenticated;


-- ─── 6) RPC: reabrir mes (emergencia) ─────────────────────────────────
create or replace function public.financeiro_reabrir_mes(p_ano int, p_mes int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_prod() then
    raise exception 'sem permissao para reabrir mes';
  end if;
  delete from public.financeiro_fechamentos where ano = p_ano and mes = p_mes;
end;
$$;

grant execute on function public.financeiro_reabrir_mes(int, int) to authenticated;


-- =====================================================================
-- Validacao manual:
--
--   -- 1) Fechar maio/2026 (so admin):
--   --    db.rpc('financeiro_fechar_mes', { p_ano: 2026, p_mes: 5 })
--
--   -- 2) Tentar inserir lancamento com data 2026-05-15 (deve falhar com 403):
--   --    db.from('financeiro').insert({ data_pagamento:'2026-05-15', ... })
--
--   -- 3) Inserir com data 2026-06-01 (deve passar)
--
--   -- 4) Reabrir:
--   --    db.rpc('financeiro_reabrir_mes', { p_ano: 2026, p_mes: 5 })
-- =====================================================================

-- financeiro_fechamentos: escrita exclusiva via RPC SECURITY DEFINER acima
grant select on public.financeiro_fechamentos to authenticated;
