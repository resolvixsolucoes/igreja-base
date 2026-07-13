-- =====================================================================
-- Financeiro F.1 — Saneamento da base
--
-- Objetivos (sem mudar UI):
--   1. valor: float -> numeric(12,2) (precisao monetaria correta)
--   2. Auditoria: criado_por/em, atualizado_por/em, excluido_por/em
--   3. Soft-delete: DELETE fisico bloqueado; exclusao via RPC dedicada
--   4. financeiro_log: trail append-only de todas as mutacoes
--   5. RLS habilitado com policies usando permissoes_granular
--
-- Idempotente: pode rodar varias vezes. Roda no SQL Editor do Prod.
--
-- ATENCAO POS-DEPLOY: RLS agora exige permissoes_granular(financeiro,
-- _default, ver=true) pra usuarios NAO-admin verem lancamentos. Admin
-- continua vendo tudo via is_admin_prod(). Se um tesoureiro nao-admin
-- precisar acessar, inserir manualmente:
--
--   insert into public.permissoes_granular
--     (user_id, pagina, aba, ver, adicionar, editar, excluir)
--   values ('<uuid_user>', 'financeiro', '_default', true, true, true, true)
--   on conflict (user_id, pagina, aba) do update
--     set ver=excluded.ver, adicionar=excluded.adicionar,
--         editar=excluded.editar, excluir=excluded.excluir;
-- =====================================================================


-- ─── Helper reutilizavel: checa permissao granular do user atual ───────
-- SECURITY DEFINER pra nao recursar em RLS de permissoes_granular.
create or replace function public.tem_perm_granular(
  p_pagina text,
  p_aba    text,
  p_acao   text
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_ok boolean;
begin
  -- admin curto-circuita
  if public.is_admin_prod() then
    return true;
  end if;

  select
    case p_acao
      when 'ver'       then ver
      when 'adicionar' then adicionar
      when 'editar'    then editar
      when 'excluir'   then excluir
      else false
    end
    into v_ok
  from public.permissoes_granular
  where user_id = auth.uid()
    and pagina  = p_pagina
    and aba     = p_aba;

  return coalesce(v_ok, false);
end;
$$;

grant execute on function public.tem_perm_granular(text,text,text) to authenticated;


-- ─── 1) Tipo correto pra valor ─────────────────────────────────────────
do $$
declare
  v_type text;
begin
  select data_type into v_type
  from information_schema.columns
  where table_schema='public' and table_name='financeiro' and column_name='valor';

  if v_type is distinct from 'numeric' then
    alter table public.financeiro
      alter column valor type numeric(12,2) using round(valor::numeric, 2);
  end if;
end $$;


-- ─── 2) Colunas de auditoria ───────────────────────────────────────────
alter table public.financeiro
  add column if not exists criado_por      uuid        references public.perfis(id),
  add column if not exists criado_em       timestamptz not null default now(),
  add column if not exists atualizado_por  uuid        references public.perfis(id),
  add column if not exists atualizado_em   timestamptz,
  add column if not exists excluido_por    uuid        references public.perfis(id),
  add column if not exists excluido_em     timestamptz;

create index if not exists financeiro_excluido_em_idx
  on public.financeiro (excluido_em)
  where excluido_em is null;


-- ─── 3) Trigger de auditoria (preenche auto) ───────────────────────────
create or replace function public.financeiro_set_audit()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    NEW.criado_por := coalesce(NEW.criado_por, auth.uid());
    NEW.criado_em  := coalesce(NEW.criado_em, now());
  elsif TG_OP = 'UPDATE' then
    NEW.atualizado_por := auth.uid();
    NEW.atualizado_em  := now();
    -- preserva campos imutaveis
    NEW.criado_por := OLD.criado_por;
    NEW.criado_em  := OLD.criado_em;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_financeiro_audit on public.financeiro;
create trigger trg_financeiro_audit
  before insert or update on public.financeiro
  for each row execute function public.financeiro_set_audit();


-- ─── 4) Tabela de log append-only ──────────────────────────────────────
create table if not exists public.financeiro_log (
  id            bigserial   primary key,
  financeiro_id uuid        not null,
  acao          text        not null check (acao in ('insert','update','delete')),
  payload_antes  jsonb,
  payload_depois jsonb,
  usuario_id    uuid        references public.perfis(id),
  criado_em     timestamptz not null default now()
);

create index if not exists financeiro_log_financeiro_id_idx
  on public.financeiro_log (financeiro_id);
create index if not exists financeiro_log_criado_em_idx
  on public.financeiro_log (criado_em desc);

create or replace function public.financeiro_write_log()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.financeiro_log (financeiro_id, acao, payload_depois, usuario_id)
      values (NEW.id, 'insert', to_jsonb(NEW), auth.uid());
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.financeiro_log (financeiro_id, acao, payload_antes, payload_depois, usuario_id)
      values (NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.financeiro_log (financeiro_id, acao, payload_antes, usuario_id)
      values (OLD.id, 'delete', to_jsonb(OLD), auth.uid());
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_financeiro_log on public.financeiro;
create trigger trg_financeiro_log
  after insert or update or delete on public.financeiro
  for each row execute function public.financeiro_write_log();


-- ─── 5) RPC: soft-delete (separa permissao excluir de editar) ──────────
create or replace function public.financeiro_excluir(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tem_perm_granular('financeiro','_default','excluir') then
    raise exception 'sem permissao para excluir lancamento financeiro';
  end if;

  update public.financeiro
     set excluido_em  = now(),
         excluido_por = auth.uid()
   where id = p_id
     and excluido_em is null;
end;
$$;

grant execute on function public.financeiro_excluir(uuid) to authenticated;


-- ─── 6) RLS ────────────────────────────────────────────────────────────
alter table public.financeiro      enable row level security;
alter table public.financeiro_log  enable row level security;

-- financeiro: SELECT
drop policy if exists financeiro_select on public.financeiro;
create policy financeiro_select on public.financeiro
  for select to authenticated
  using (
    excluido_em is null
    and public.tem_perm_granular('financeiro','_default','ver')
  );

-- financeiro: INSERT
drop policy if exists financeiro_insert on public.financeiro;
create policy financeiro_insert on public.financeiro
  for insert to authenticated
  with check (public.tem_perm_granular('financeiro','_default','adicionar'));

-- financeiro: UPDATE (edicao normal). Soft-delete vai via RPC SECURITY DEFINER.
drop policy if exists financeiro_update on public.financeiro;
create policy financeiro_update on public.financeiro
  for update to authenticated
  using      (excluido_em is null and public.tem_perm_granular('financeiro','_default','editar'))
  with check (excluido_em is null and public.tem_perm_granular('financeiro','_default','editar'));

-- financeiro: DELETE fisico bloqueado pra todos (so via SQL admin).
drop policy if exists financeiro_delete on public.financeiro;
create policy financeiro_delete on public.financeiro
  for delete to authenticated
  using (false);

-- financeiro_log: somente admin le. Insert vem do trigger (SECURITY INVOKER
-- mas a row e construida internamente — RLS nao bloqueia trigger interno).
drop policy if exists financeiro_log_select on public.financeiro_log;
create policy financeiro_log_select on public.financeiro_log
  for select to authenticated
  using (public.is_admin_prod());

-- Bloqueia escrita externa no log: so o trigger escreve.
drop policy if exists financeiro_log_no_write on public.financeiro_log;
create policy financeiro_log_no_write on public.financeiro_log
  for all to authenticated
  using (false) with check (false);


-- =====================================================================
-- Validacao manual (rodar separado depois do deploy):
--
--   -- 1) valor virou numeric
--   select data_type, numeric_precision, numeric_scale
--   from information_schema.columns
--   where table_schema='public' and table_name='financeiro' and column_name='valor';
--
--   -- 2) Auditoria + soft-delete colunas presentes
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='financeiro'
--     and column_name in ('criado_por','criado_em','atualizado_por',
--                         'atualizado_em','excluido_por','excluido_em');
--
--   -- 3) Policies criadas
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='financeiro';
--
--   -- 4) Insert de teste pelo app preenche criado_por automaticamente
--      e gera linha em financeiro_log.
--
--   -- 5) Soft-delete via RPC: db.rpc('financeiro_excluir',{p_id:'...'})
--      Lancamento some do select (excluido_em is not null) mas continua
--      em financeiro_log.
-- =====================================================================

grant select, insert, update, delete on public.financeiro     to authenticated;
grant select                          on public.financeiro_log to authenticated;
