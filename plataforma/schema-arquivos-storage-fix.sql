-- =====================================================================
-- Fase 6.8 tarefa 2 — fecha policy permissiva "Upload livre" no bucket
-- `arquivos` (storage.objects).
--
-- Antes: a policy "Upload livre" estava em role `public` (qualquer
-- visitante anonimo podia fazer INSERT no bucket). Bucket continua
-- public=true para leitura (anexos de avisos sao referenciados via
-- getPublicUrl() em ministerios-{levinho,comunicacao,musica,som,
-- integracao}.js — design intencional), mas escrita agora exige login.
--
-- A policy "upload_autenticado 1lu00x9_0" mencionada no plano da
-- Fase 6.8 ja nao existe no Prod (foi removida em algum cleanup
-- anterior); o gap real era essa "Upload livre".
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- =====================================================================

drop policy if exists "Upload livre" on storage.objects;

drop policy if exists "arquivos_insert_authenticated" on storage.objects;
create policy "arquivos_insert_authenticated"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'arquivos');
