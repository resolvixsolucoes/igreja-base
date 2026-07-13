-- =====================================================================
-- Fase 9.12 — Materiais para voluntários (Central de Voluntários)
--
-- Repasse de materiais que cada voluntário precisa receber pra atuar:
--   - Itens de checklist (camiseta, crachá, kit) → tipo='checklist'
--   - Arquivos (PDF de roteiro, escala impressa)  → tipo='arquivo'
--
-- Cada material está atrelado a um evento. Escopo opcional por
-- ministério (ex: só voluntários do Som). Entrega individual é
-- registrada em `voluntario_materiais_entregas` (UNIQUE por par).
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- =====================================================================


-- ─── 1. Tabela: voluntario_materiais ─────────────────────────────────
create table if not exists public.voluntario_materiais (
  id             uuid primary key default gen_random_uuid(),
  evento_id      uuid not null references public.eventos_igreja(id) on delete cascade,
  ministerio_id  uuid     references public.ministerios(id)        on delete set null,
  tipo           text not null check (tipo in ('checklist', 'arquivo')),
  titulo         text not null,
  descricao      text,
  arquivo_url    text,
  arquivo_nome   text,
  criado_por     uuid     references auth.users(id) on delete set null,
  criado_em      timestamptz not null default now()
);

create index if not exists idx_voluntario_materiais_evento
  on public.voluntario_materiais(evento_id);
create index if not exists idx_voluntario_materiais_min
  on public.voluntario_materiais(ministerio_id) where ministerio_id is not null;


-- ─── 2. Tabela: voluntario_materiais_entregas ────────────────────────
create table if not exists public.voluntario_materiais_entregas (
  id              uuid primary key default gen_random_uuid(),
  material_id     uuid not null references public.voluntario_materiais(id) on delete cascade,
  voluntario_id   uuid not null references public.voluntarios(id)          on delete cascade,
  entregue_em     timestamptz not null default now(),
  entregue_por    uuid references auth.users(id) on delete set null,
  unique (material_id, voluntario_id)
);

create index if not exists idx_vme_material on public.voluntario_materiais_entregas(material_id);
create index if not exists idx_vme_vol      on public.voluntario_materiais_entregas(voluntario_id);


-- ─── 3. RLS ──────────────────────────────────────────────────────────
alter table public.voluntario_materiais          enable row level security;
alter table public.voluntario_materiais_entregas enable row level security;

-- Helper: usuário pode gerenciar a Central de Voluntários?
-- Reusa a permissão granular `central_voluntarios._default` com editar=true,
-- ou is_admin_prod().
create or replace function public.pode_gerir_central_voluntarios()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_admin_prod()
    or exists (
      select 1 from public.permissoes_granular pg
      where pg.user_id = auth.uid()
        and pg.pagina  = 'central_voluntarios'
        and pg.aba     = '_default'
        and coalesce(pg.editar, false) = true
    );
$$;
grant execute on function public.pode_gerir_central_voluntarios() to authenticated;

-- SELECT: qualquer autenticado vê (a Central como um todo já é gateada
-- pela perm `ver`; aqui sem filtro adicional pra simplificar).
drop policy if exists vmat_select on public.voluntario_materiais;
create policy vmat_select on public.voluntario_materiais
  for select to authenticated using (true);

drop policy if exists vmat_write on public.voluntario_materiais;
create policy vmat_write on public.voluntario_materiais
  for all to authenticated
  using      (public.pode_gerir_central_voluntarios())
  with check (public.pode_gerir_central_voluntarios());

drop policy if exists vme_select on public.voluntario_materiais_entregas;
create policy vme_select on public.voluntario_materiais_entregas
  for select to authenticated using (true);

drop policy if exists vme_write on public.voluntario_materiais_entregas;
create policy vme_write on public.voluntario_materiais_entregas
  for all to authenticated
  using      (public.pode_gerir_central_voluntarios())
  with check (public.pode_gerir_central_voluntarios());


-- ─── 4. RPCs: marcar/desmarcar entrega ───────────────────────────────
create or replace function public.voluntario_material_marcar_entregue(
  p_material_id   uuid,
  p_voluntario_id uuid
)
returns timestamptz
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_em  timestamptz;
begin
  if v_uid is null then
    raise exception 'Necessário estar autenticado.' using errcode = '28000';
  end if;
  if not public.pode_gerir_central_voluntarios() then
    raise exception 'Sem permissão para gerir materiais.' using errcode = '42501';
  end if;

  insert into public.voluntario_materiais_entregas(material_id, voluntario_id, entregue_por)
  values (p_material_id, p_voluntario_id, v_uid)
  on conflict (material_id, voluntario_id) do nothing
  returning entregue_em into v_em;

  if v_em is null then
    select entregue_em into v_em from public.voluntario_materiais_entregas
    where material_id = p_material_id and voluntario_id = p_voluntario_id;
  end if;

  return v_em;
end;
$$;
grant execute on function public.voluntario_material_marcar_entregue(uuid, uuid) to authenticated;


create or replace function public.voluntario_material_desmarcar_entregue(
  p_material_id   uuid,
  p_voluntario_id uuid
)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Necessário estar autenticado.' using errcode = '28000';
  end if;
  if not public.pode_gerir_central_voluntarios() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  delete from public.voluntario_materiais_entregas
  where material_id = p_material_id and voluntario_id = p_voluntario_id;
end;
$$;
grant execute on function public.voluntario_material_desmarcar_entregue(uuid, uuid) to authenticated;


-- =====================================================================
-- Validação manual:
--
--   -- 1) Tabelas e policies
--   select tablename, policyname from pg_policies
--   where tablename in ('voluntario_materiais','voluntario_materiais_entregas');
--
--   -- 2) RPC marca entrega (testar como user com perm)
--   --    select public.voluntario_material_marcar_entregue('<mat>','<vol>');
-- =====================================================================

grant select, insert, update, delete on public.voluntario_materiais          to authenticated;
grant select, insert, update, delete on public.voluntario_materiais_entregas to authenticated;
