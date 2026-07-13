-- =====================================================================
-- Financeiro F.4 — Comprovantes (Storage) + observacao
--
-- Adiciona suporte a anexar foto/PDF de comprovante a cada lancamento
-- e campo livre de observacao. Bucket privado: leitura via signed URL
-- com permissao granular.
--
-- Idempotente. Pre-requisitos: F.1 (RLS, tem_perm_granular).
-- =====================================================================


-- ─── 1) Colunas em financeiro ──────────────────────────────────────────
alter table public.financeiro
  add column if not exists comprovante_path text,
  add column if not exists observacao       text;


-- ─── 2) Bucket privado ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('financeiro-comprovantes', 'financeiro-comprovantes', false)
on conflict (id) do nothing;


-- ─── 3) Policies em storage.objects ────────────────────────────────────
-- SELECT: quem tem ver financeiro acessa o objeto (signed URL).
drop policy if exists financeiro_comp_select on storage.objects;
create policy financeiro_comp_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'financeiro-comprovantes'
    and public.tem_perm_granular('financeiro','_default','ver')
  );

-- INSERT: quem tem adicionar.
drop policy if exists financeiro_comp_insert on storage.objects;
create policy financeiro_comp_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'financeiro-comprovantes'
    and public.tem_perm_granular('financeiro','_default','adicionar')
  );

-- UPDATE: quem tem editar (raro — upsert/troca).
drop policy if exists financeiro_comp_update on storage.objects;
create policy financeiro_comp_update on storage.objects
  for update to authenticated
  using      (bucket_id = 'financeiro-comprovantes'
              and public.tem_perm_granular('financeiro','_default','editar'))
  with check (bucket_id = 'financeiro-comprovantes'
              and public.tem_perm_granular('financeiro','_default','editar'));

-- DELETE: so admin (preserva auditoria; soft-delete do lancamento mantem
-- o arquivo no bucket — limpeza fica como rotina manual se precisar).
drop policy if exists financeiro_comp_delete on storage.objects;
create policy financeiro_comp_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'financeiro-comprovantes'
    and public.is_admin_prod()
  );


-- =====================================================================
-- Validacao manual:
--
--   -- 1) Bucket privado existe
--   select id, name, public from storage.buckets where id='financeiro-comprovantes';
--
--   -- 2) Policies criadas
--   select policyname, cmd from pg_policies
--   where schemaname='storage' and tablename='objects'
--     and policyname like 'financeiro_comp_%';
--
--   -- 3) Colunas presentes
--   select column_name from information_schema.columns
--   where table_schema='public' and table_name='financeiro'
--     and column_name in ('comprovante_path','observacao');
-- =====================================================================
