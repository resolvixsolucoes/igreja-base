-- =====================================================================
-- Fase 9.1 — Levinho: salinhas + filtro de avisos por sala
--
-- Objetivo: viabilizar isolamento de avisos/materiais por salinha
-- (Berçário 0-2, Jardim 3-5, Primários 6-10) sem criar slugs no manifest
-- e sem substituir a policy SELECT existente de ministerio_avisos.
--
-- O que cria:
--   1. Tabela levinho_salas (3 linhas semente, smallint PK)
--   2. Tabela levinho_voluntarios_salas (vínculo voluntário ↔ sala)
--   3. ALTER ministerio_avisos ADD COLUMN sala_id (nullable)
--   4. RPC minhas_salas_levinho() — usado no front e em policy
--   5. Função eh_lider_levinho() — helper de gate
--   6. Policy RESTRICTIVE em ministerio_avisos para filtrar por sala
--      (não substitui policy SELECT permissiva existente)
--
-- Idempotente: rodadas repetidas são seguras.
--
-- COMO USAR:
--   1) Rodar no SQL Editor do projeto Prod (NÃO no LMS).
--   2) Validar com queries do rodapé.
-- =====================================================================


-- ─── 1. Tabela: salas (semi-enum, 3 linhas fixas) ────────────────────
create table if not exists public.levinho_salas (
  id        smallint primary key,
  nome      text     not null unique,
  idade_min smallint not null,
  idade_max smallint not null,
  ordem     smallint not null default 0
);

insert into public.levinho_salas (id, nome, idade_min, idade_max, ordem) values
  (1, 'Berçário',  0, 2,  1),
  (2, 'Jardim',    3, 5,  2),
  (3, 'Primários', 6, 10, 3)
on conflict (id) do update set
  nome      = excluded.nome,
  idade_min = excluded.idade_min,
  idade_max = excluded.idade_max,
  ordem     = excluded.ordem;

alter table public.levinho_salas enable row level security;

drop policy if exists levinho_salas_select on public.levinho_salas;
create policy levinho_salas_select on public.levinho_salas
  for select to authenticated using (true);

drop policy if exists levinho_salas_write on public.levinho_salas;
create policy levinho_salas_write on public.levinho_salas
  for all to authenticated
  using      (public.is_admin_prod())
  with check (public.is_admin_prod());


-- ─── 2. Helper: é líder do Levinho? ──────────────────────────────────
-- SECURITY DEFINER pra evitar recursão de RLS em ministerio_lideres.
create or replace function public.eh_lider_levinho()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.ministerio_lideres ml
    join public.voluntarios v   on v.id          = ml.voluntario_id
    join public.perfis      pf  on pf.membro_id  = v.membro_id
    join public.ministerios m   on m.id          = ml.ministerio_id
    where pf.id = auth.uid()
      and lower(translate(m.nome,
            'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
            'aeiouaoaeioucaeiouaoaeiouc')) like 'levinho%'
  );
$$;
grant execute on function public.eh_lider_levinho() to authenticated;


-- ─── 3. Tabela: vínculo voluntário ↔ sala ────────────────────────────
create table if not exists public.levinho_voluntarios_salas (
  voluntario_id uuid     not null references public.voluntarios(id) on delete cascade,
  sala_id       smallint not null references public.levinho_salas(id),
  created_at    timestamptz not null default now(),
  primary key (voluntario_id, sala_id)
);

create index if not exists idx_lvs_sala
  on public.levinho_voluntarios_salas(sala_id);

alter table public.levinho_voluntarios_salas enable row level security;

-- SELECT: admin OU líder do Levinho OU o próprio voluntário (via perfis.membro_id)
drop policy if exists lvs_select on public.levinho_voluntarios_salas;
create policy lvs_select on public.levinho_voluntarios_salas
  for select to authenticated
  using (
    public.is_admin_prod()
    or public.eh_lider_levinho()
    or voluntario_id in (
      select v.id
      from public.voluntarios v
      join public.perfis pf on pf.membro_id = v.membro_id
      where pf.id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: só admin ou líder do Levinho
drop policy if exists lvs_write on public.levinho_voluntarios_salas;
create policy lvs_write on public.levinho_voluntarios_salas
  for all to authenticated
  using      (public.is_admin_prod() or public.eh_lider_levinho())
  with check (public.is_admin_prod() or public.eh_lider_levinho());


-- ─── 4. RPC: minhas_salas_levinho() ──────────────────────────────────
-- Retorna os ids das salas do user atual. Usado no front pra filtrar
-- queries de avisos e na policy RESTRICTIVE abaixo.
create or replace function public.minhas_salas_levinho()
returns table (sala_id smallint)
language sql
security definer
stable
set search_path = public
as $$
  select lvs.sala_id
  from public.levinho_voluntarios_salas lvs
  join public.voluntarios v  on v.id         = lvs.voluntario_id
  join public.perfis      pf on pf.membro_id = v.membro_id
  where pf.id = auth.uid();
$$;
grant execute on function public.minhas_salas_levinho() to authenticated;


-- ─── 5. ALTER ministerio_avisos: adiciona sala_id ────────────────────
alter table public.ministerio_avisos
  add column if not exists sala_id smallint
  references public.levinho_salas(id) on delete set null;

create index if not exists idx_ministerio_avisos_sala
  on public.ministerio_avisos(sala_id)
  where sala_id is not null;


-- ─── 6. Policy RESTRICTIVE pra filtrar avisos por sala ───────────────
-- Importante: RESTRICTIVE é AND'd com a policy SELECT permissiva
-- existente. Não substitui — apenas adiciona uma camada de filtro.
--
-- Regra: o user só vê o aviso se
--   (a) é admin, OU
--   (b) é líder do Levinho, OU
--   (c) o aviso não tem sala_id (geral, comportamento anterior), OU
--   (d) a sala_id está entre as salas do user.
--
-- Avisos de OUTROS ministérios sempre têm sala_id NULL → cláusula (c)
-- deixa passar. Sem regressão para outros ministérios.

drop policy if exists ministerio_avisos_filtro_sala on public.ministerio_avisos;
create policy ministerio_avisos_filtro_sala on public.ministerio_avisos
  as restrictive
  for select to authenticated
  using (
    public.is_admin_prod()
    or public.eh_lider_levinho()
    or sala_id is null
    or sala_id in (select sala_id from public.minhas_salas_levinho())
  );


-- =====================================================================
-- Validação manual (rodar separado depois de aplicar):
--
--   -- 1) Salas semeadas
--   select * from public.levinho_salas order by ordem;
--
--   -- 2) Coluna nova em ministerio_avisos
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'ministerio_avisos' and column_name = 'sala_id';
--
--   -- 3) Policies das tabelas novas + restritiva em avisos
--   select tablename, policyname, cmd, permissive
--   from pg_policies
--   where tablename in
--     ('levinho_salas','levinho_voluntarios_salas','ministerio_avisos')
--   order by tablename, policyname;
--
--   -- 4) RPC funciona (logado como user, deve retornar 0+ linhas)
--   select * from public.minhas_salas_levinho();
--
--   -- 5) Smoke: criar aviso geral e aviso só de Berçário (como admin)
--   --    e validar que voluntário sem sala vê só o geral.
-- =====================================================================

grant select, insert, update, delete on public.levinho_salas             to authenticated;
grant select, insert, update, delete on public.levinho_voluntarios_salas to authenticated;
