-- ================================================================
-- Fase 8.5 — Drop das tabelas legacy de permissoes
-- ================================================================
--
-- Apos as Fases 7.x backfillarem `permissoes_granular` a partir de
-- `permissoes` (slug-based) e `ministerio_abas_permissoes` (role-based),
-- e a Fase 8.4 remover os ultimos leitores no client e nas Edge
-- Functions, estas duas tabelas viraram dead weight.
--
-- IMPORTANTE rodar no Dashboard ANTES desse drop:
--   1. Confirmar que main esta com os commits da Fase 8.5 (auth.js sem
--      load de AUTH.permissoes; ministerios.js / ministerios-X.js sem
--      branch legacy; invite-user/delete-user redeployadas).
--   2. supabase functions deploy invite-user
--   3. supabase functions deploy delete-user
--
-- Reversao (caso aparecam regressoes): point-in-time recovery do
-- Supabase. Por isso vale rodar isto e deixar 24h antes de promover
-- mais features acima.
-- ================================================================

begin;

-- Confere antes de dropar — comentado, descomente para inspecionar:
-- select count(*) from public.permissoes;
-- select count(*) from public.ministerio_abas_permissoes;

drop table if exists public.permissoes cascade;
drop table if exists public.ministerio_abas_permissoes cascade;

-- Sem `notify pgrst, 'reload schema'` aqui porque o cache do PostgREST
-- so prejudica quando ADICIONAMOS objetos. DROP nao precisa de notify.

commit;

-- Apos rodar:
-- select tablename from pg_tables
-- where schemaname='public'
--   and tablename in ('permissoes','ministerio_abas_permissoes');
-- => deve retornar 0 linhas.
