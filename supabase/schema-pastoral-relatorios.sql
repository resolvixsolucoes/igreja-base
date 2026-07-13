-- =====================================================================
-- Aconselhamento Pastoral: relatorios por agendamento + historico do fiel
--
-- Cada agendamento pode ter um relatorio (1:1 via unique em agendamento_id).
-- O telefone_fiel e denormalizado pra permitir lookup rapido do historico
-- desse fiel em atendimentos anteriores (mesmo se for outro conselheiro).
--
-- RLS:
--   SELECT: admin OU conselheiro responsavel do agendamento OU
--           qualquer conselheiro ativo (pra consultar historico do fiel
--           em atendimentos anteriores feitos por outros conselheiros).
--   INSERT/UPDATE: admin OU conselheiro responsavel do agendamento.
--   DELETE: admin.
--
-- Idempotente. Roda no SQL Editor do projeto Prod (e Dev).
-- =====================================================================

create table if not exists public.pastoral_relatorios (
  id              uuid primary key default gen_random_uuid(),
  agendamento_id  uuid not null references public.pastoral_agendamentos(id) on delete cascade,
  conselheiro_id  uuid references public.conselheiros(id) on delete set null,
  telefone_fiel   text not null,
  nome_fiel       text,
  relatorio       text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists ux_pastoral_relatorios_agendamento
  on public.pastoral_relatorios(agendamento_id);

create index if not exists idx_pastoral_relatorios_telefone
  on public.pastoral_relatorios(telefone_fiel);

-- updated_at automatico
create or replace function public.tg_pastoral_relatorios_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_pastoral_relatorios_touch on public.pastoral_relatorios;
create trigger trg_pastoral_relatorios_touch
  before update on public.pastoral_relatorios
  for each row execute function public.tg_pastoral_relatorios_touch();


-- ─── Helper: usuario atual e conselheiro ativo? ───────────────────────
create or replace function public.eh_conselheiro_ativo()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.conselheiros c
    join public.perfis pf on pf.membro_id = c.membro_id
    where pf.id = auth.uid()
      and c.ativo = true
  );
$$;
grant execute on function public.eh_conselheiro_ativo() to authenticated;


-- ─── Helper: o usuario atual e o conselheiro responsavel deste agendamento? ──
create or replace function public.eh_conselheiro_do_agendamento(p_agendamento uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.pastoral_agendamentos a
    join public.conselheiros c  on c.id          = a.conselheiro_id
    join public.perfis       pf on pf.membro_id  = c.membro_id
    where a.id  = p_agendamento
      and pf.id = auth.uid()
  );
$$;
grant execute on function public.eh_conselheiro_do_agendamento(uuid) to authenticated;


-- ─── RLS ──────────────────────────────────────────────────────────────
alter table public.pastoral_relatorios enable row level security;

drop policy if exists pastoral_relatorios_select on public.pastoral_relatorios;
create policy pastoral_relatorios_select on public.pastoral_relatorios
  for select to authenticated
  using (
    public.is_admin_prod()
    or public.eh_conselheiro_ativo()
  );

drop policy if exists pastoral_relatorios_insert on public.pastoral_relatorios;
create policy pastoral_relatorios_insert on public.pastoral_relatorios
  for insert to authenticated
  with check (
    public.is_admin_prod()
    or public.eh_conselheiro_do_agendamento(agendamento_id)
  );

drop policy if exists pastoral_relatorios_update on public.pastoral_relatorios;
create policy pastoral_relatorios_update on public.pastoral_relatorios
  for update to authenticated
  using (
    public.is_admin_prod()
    or public.eh_conselheiro_do_agendamento(agendamento_id)
  )
  with check (
    public.is_admin_prod()
    or public.eh_conselheiro_do_agendamento(agendamento_id)
  );

drop policy if exists pastoral_relatorios_delete on public.pastoral_relatorios;
create policy pastoral_relatorios_delete on public.pastoral_relatorios
  for delete to authenticated
  using (public.is_admin_prod());

-- ─── Helper: normaliza telefone (so digitos + remove DDI 55 se 12/13 dig) ──
create or replace function public.normalizar_telefone_br(p text)
returns text
language sql
immutable
as $$
  select case
    when length(d) in (12, 13) and left(d, 2) = '55' then substring(d from 3)
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- Backfill: normaliza telefone_fiel existente (idempotente)
update public.pastoral_relatorios
   set telefone_fiel = public.normalizar_telefone_br(telefone_fiel)
 where telefone_fiel is not null
   and telefone_fiel <> public.normalizar_telefone_br(telefone_fiel);

-- =====================================================================
-- Validacao manual:
--   select * from public.pastoral_relatorios order by created_at desc limit 5;
--
--   -- Historico de um fiel (por telefone):
--   select r.created_at, r.nome_fiel, c.nome as conselheiro, r.relatorio
--   from public.pastoral_relatorios r
--   left join public.conselheiros c on c.id = r.conselheiro_id
--   where r.telefone_fiel = '3199999999'
--   order by r.created_at desc;
-- =====================================================================

grant select, insert, update, delete on public.pastoral_relatorios to authenticated;
