-- =====================================================================
-- Fase 5.1 — permissoes_granular (projeto Prod)
--
-- Esquema unificado por user x pagina x aba x 4 acoes (V/A/E/X).
-- Substitui ao final a fragmentacao entre `permissoes` (slug-based)
-- e `ministerio_abas_permissoes` (role-based).
--
-- A tabela e helpers ficam em paralelo as estruturas antigas. As
-- proximas sub-fases (5.2+) introduzem o front em paralelo, depois
-- migram pagina a pagina, e so na 5.6 dropamos as tabelas legadas.
--
-- Idempotente: pode rodar varias vezes sem efeito acumulado.
-- Roda no SQL Editor do projeto Prod (NAO no LMS).
-- =====================================================================

-- ─── Helper SECURITY DEFINER para checar admin sem recursao de RLS ─────
-- Subquery inline em policy de tabela que depende de `perfis` cria risco
-- de recursao se um dia `perfis` tiver RLS que volte aqui. SECURITY DEFINER
-- contorna porque a funcao roda com permissoes do dono (postgres) e nao
-- dispara RLS do caller.
create or replace function public.is_admin_prod()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin_prod() to authenticated;


-- ─── Tabela ────────────────────────────────────────────────────────────
-- aba='_default' e a sentinela para paginas sem abas (ex.: 'membros',
-- 'agenda'). PK com NULL e problematica, por isso a sentinela.
create table if not exists public.permissoes_granular (
  user_id   uuid    not null references public.perfis(id) on delete cascade,
  pagina    text    not null,
  aba       text    not null default '_default',
  ver       boolean not null default false,
  adicionar boolean not null default false,
  editar    boolean not null default false,
  excluir   boolean not null default false,
  primary key (user_id, pagina, aba)
);

alter table public.permissoes_granular enable row level security;


-- ─── Policies ──────────────────────────────────────────────────────────
-- Leitura: o proprio user OU admin.
drop policy if exists permissoes_granular_select on public.permissoes_granular;
create policy permissoes_granular_select
  on public.permissoes_granular
  for select
  using (user_id = auth.uid() or public.is_admin_prod());

-- Escrita: so admin.
drop policy if exists permissoes_granular_insert on public.permissoes_granular;
create policy permissoes_granular_insert
  on public.permissoes_granular
  for insert
  with check (public.is_admin_prod());

drop policy if exists permissoes_granular_update on public.permissoes_granular;
create policy permissoes_granular_update
  on public.permissoes_granular
  for update
  using (public.is_admin_prod())
  with check (public.is_admin_prod());

drop policy if exists permissoes_granular_delete on public.permissoes_granular;
create policy permissoes_granular_delete
  on public.permissoes_granular
  for delete
  using (public.is_admin_prod());


-- ─── RPC: le todas as permissoes do user atual ─────────────────────────
-- Front chama 1x no login para popular AUTH.permissoesGranular.
-- SECURITY DEFINER evita ida ao RLS de novo (ja sabemos que e o proprio
-- user pelo auth.uid()).
create or replace function public.get_minhas_permissoes()
returns table (
  pagina    text,
  aba       text,
  ver       boolean,
  adicionar boolean,
  editar    boolean,
  excluir   boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select pagina, aba, ver, adicionar, editar, excluir
  from public.permissoes_granular
  where user_id = auth.uid();
$$;

grant execute on function public.get_minhas_permissoes() to authenticated;

grant select, insert, update, delete on public.permissoes_granular to authenticated;


-- =====================================================================
-- Validacao manual (rodar separado, NAO em transacao com o create acima):
--
--   -- 1) Tabela criada com PK correta
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema='public' and table_name='permissoes_granular'
--   order by ordinal_position;
--
--   -- 2) Policies criadas
--   select policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname='public' and tablename='permissoes_granular';
--
--   -- 3) is_admin_prod() retorna true para Bruno quando logado no app
--   --    (rodar via console do navegador apos login):
--   --    const { data } = await db.rpc('is_admin_prod'); console.log(data)
--
--   -- 4) Insert de teste (logado como admin no app):
--   --    db.from('permissoes_granular').insert({
--   --      user_id: '<uuid_user_teste>',
--   --      pagina:  'conteudos',
--   --      aba:     'pregacoes',
--   --      ver:     true
--   --    })
-- =====================================================================
