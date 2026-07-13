-- =====================================================================
-- Financeiro — Fix: dropa policies legacy duplicadas
--
-- A tabela financeiro tem policies historicas (anteriores a F.1) que
-- coexistem com as novas (financeiro_select/insert/update/delete).
-- Em alguns casos o conjunto bloqueia INSERT mesmo p/ admin.
--
-- Policies a remover (legacy):
--   - "Allow all"
--   - "acesso livre financeiro"
--   - delete_financeiro
--   - insert_financeiro
--   - select_financeiro
--   - update_financeiro
--
-- Mantemos apenas as policies da F.1:
--   - financeiro_delete  (false — soft-delete via RPC)
--   - financeiro_insert  (tem_perm adicionar)
--   - financeiro_select  (excluido_em null + tem_perm ver)
--   - financeiro_update  (excluido_em null + tem_perm editar)
--
-- Idempotente.
-- =====================================================================

drop policy if exists "Allow all"               on public.financeiro;
drop policy if exists "acesso livre financeiro" on public.financeiro;
drop policy if exists  delete_financeiro        on public.financeiro;
drop policy if exists  insert_financeiro        on public.financeiro;
drop policy if exists  select_financeiro        on public.financeiro;
drop policy if exists  update_financeiro        on public.financeiro;


-- Validacao: deve restar APENAS as 4 policies da F.1.
--
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='financeiro'
--   order by cmd, policyname;
