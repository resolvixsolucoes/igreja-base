-- =====================================================================
-- Aconselhamento Pastoral: RLS coerente nas 3 tabelas
--   conselheiros / pastoral_disponibilidade / pastoral_agendamentos
--
-- Sintoma corrigido: DELETE de agendamento retornava 200 com 0 linhas
-- afetadas (RLS bloqueando silenciosamente).
--
-- Regras:
--   conselheiros:
--     SELECT  → qualquer authenticated (precisa para autocomplete /
--                                       histórico mostrar nome do conselheiro)
--     WRITE   → admin somente
--
--   pastoral_disponibilidade:
--     SELECT  → qualquer authenticated (página pública agendamento-pastoral
--                                       precisa listar slots livres via anon;
--                                       autenticado também)
--     WRITE   → admin OU conselheiro responsavel
--
--   pastoral_agendamentos:
--     SELECT  → admin OU conselheiro ativo
--     INSERT  → qualquer (a página pública faz insert sem login)
--     UPDATE  → admin OU conselheiro responsavel
--     DELETE  → admin OU conselheiro responsavel
--
-- Idempotente. Roda no SQL Editor do Dev (e Prod).
-- =====================================================================

-- ─── Helpers (cria se nao existirem) ──────────────────────────────────
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

create or replace function public.eh_conselheiro_da_disponibilidade(p_disp uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.pastoral_disponibilidade d
    join public.conselheiros c  on c.id          = d.conselheiro_id
    join public.perfis       pf on pf.membro_id  = c.membro_id
    where d.id  = p_disp
      and pf.id = auth.uid()
  );
$$;
grant execute on function public.eh_conselheiro_da_disponibilidade(uuid) to authenticated;

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


-- ─── conselheiros ─────────────────────────────────────────────────────
alter table public.conselheiros enable row level security;

drop policy if exists conselheiros_select on public.conselheiros;
create policy conselheiros_select on public.conselheiros
  for select to authenticated, anon
  using (true);

drop policy if exists conselheiros_insert on public.conselheiros;
create policy conselheiros_insert on public.conselheiros
  for insert to authenticated
  with check (public.is_admin_prod());

drop policy if exists conselheiros_update on public.conselheiros;
create policy conselheiros_update on public.conselheiros
  for update to authenticated
  using      (public.is_admin_prod())
  with check (public.is_admin_prod());

drop policy if exists conselheiros_delete on public.conselheiros;
create policy conselheiros_delete on public.conselheiros
  for delete to authenticated
  using (public.is_admin_prod());


-- ─── pastoral_disponibilidade ─────────────────────────────────────────
alter table public.pastoral_disponibilidade enable row level security;

drop policy if exists past_disp_select on public.pastoral_disponibilidade;
create policy past_disp_select on public.pastoral_disponibilidade
  for select to authenticated, anon
  using (true);

drop policy if exists past_disp_insert on public.pastoral_disponibilidade;
create policy past_disp_insert on public.pastoral_disponibilidade
  for insert to authenticated
  with check (
    public.is_admin_prod()
    or exists (
      select 1
      from public.conselheiros c
      join public.perfis pf on pf.membro_id = c.membro_id
      where c.id = conselheiro_id
        and pf.id = auth.uid()
    )
  );

drop policy if exists past_disp_update on public.pastoral_disponibilidade;
create policy past_disp_update on public.pastoral_disponibilidade
  for update to authenticated
  using (
    public.is_admin_prod()
    or exists (
      select 1
      from public.conselheiros c
      join public.perfis pf on pf.membro_id = c.membro_id
      where c.id = conselheiro_id
        and pf.id = auth.uid()
    )
  )
  with check (
    public.is_admin_prod()
    or exists (
      select 1
      from public.conselheiros c
      join public.perfis pf on pf.membro_id = c.membro_id
      where c.id = conselheiro_id
        and pf.id = auth.uid()
    )
  );

drop policy if exists past_disp_delete on public.pastoral_disponibilidade;
create policy past_disp_delete on public.pastoral_disponibilidade
  for delete to authenticated
  using (
    public.is_admin_prod()
    or exists (
      select 1
      from public.conselheiros c
      join public.perfis pf on pf.membro_id = c.membro_id
      where c.id = conselheiro_id
        and pf.id = auth.uid()
    )
  );


-- ─── pastoral_agendamentos ────────────────────────────────────────────
alter table public.pastoral_agendamentos enable row level security;

drop policy if exists past_agend_select on public.pastoral_agendamentos;
create policy past_agend_select on public.pastoral_agendamentos
  for select to authenticated
  using (
    public.is_admin_prod()
    or public.eh_conselheiro_ativo()
  );

-- INSERT publico (pagina agendamento-pastoral.html agenda sem login).
drop policy if exists past_agend_insert on public.pastoral_agendamentos;
create policy past_agend_insert on public.pastoral_agendamentos
  for insert to authenticated, anon
  with check (true);

drop policy if exists past_agend_update on public.pastoral_agendamentos;
create policy past_agend_update on public.pastoral_agendamentos
  for update to authenticated
  using (
    public.is_admin_prod()
    or public.eh_conselheiro_do_agendamento(id)
  )
  with check (
    public.is_admin_prod()
    or public.eh_conselheiro_do_agendamento(id)
  );

drop policy if exists past_agend_delete on public.pastoral_agendamentos;
create policy past_agend_delete on public.pastoral_agendamentos
  for delete to authenticated
  using (
    public.is_admin_prod()
    or public.eh_conselheiro_do_agendamento(id)
  );

-- =====================================================================
-- Validacao manual:
--   -- Logado como admin: deve excluir
--   delete from public.pastoral_agendamentos where id = '...';
--
--   -- Verificar policies criadas:
--   select tablename, policyname, cmd
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('conselheiros','pastoral_disponibilidade','pastoral_agendamentos')
--   order by tablename, cmd;
-- =====================================================================
