-- =====================================================================
-- Fase 6.5 — policies de Storage para editores de conteudos no Prod
--
-- Habilita SELECT / INSERT / DELETE em storage.objects para os buckets
-- `conteudos-arquivos` e `playlist-capas` do projeto Prod, gateadas por
-- `public.pode_acao_conteudos('cursos', acao)` (helper SECURITY DEFINER
-- introduzido na Fase 6.1 que consulta `permissoes_granular`).
--
-- Por que SELECT alem de DELETE?
--   O Storage server faz uma leitura interna em storage.objects para
--   resolver os `prefixes` antes de deletar. Sem policy de SELECT, a
--   leitura volta vazia e o DELETE retorna { data: [], error: null }
--   (falsa-aparencia de sucesso). Com policy de SELECT, o lookup
--   resolve e a policy de DELETE finaliza a operacao. Mesmo problema
--   que travou a Fase 6.4 no projeto LMS por varias iteracoes.
--
-- INSERT vai por permissao 'adicionar' (upload de material/capa).
-- O legado `upload_autenticado 1lu00x9_0` (any authenticated, with_check=true)
-- segue ativo — ate que a housekeeping da Fase 6.7 o revise/remova.
--
-- Idempotente. Roda no SQL Editor do projeto Prod ANTES do merge da 6.5.
-- =====================================================================

drop policy if exists "conteudos_storage_select_editor" on storage.objects;
create policy "conteudos_storage_select_editor"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('conteudos-arquivos', 'playlist-capas')
    and public.pode_acao_conteudos('cursos', 'ver')
  );

drop policy if exists "conteudos_storage_insert_editor" on storage.objects;
create policy "conteudos_storage_insert_editor"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('conteudos-arquivos', 'playlist-capas')
    and public.pode_acao_conteudos('cursos', 'adicionar')
  );

drop policy if exists "conteudos_storage_delete_editor" on storage.objects;
create policy "conteudos_storage_delete_editor"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('conteudos-arquivos', 'playlist-capas')
    and public.pode_acao_conteudos('cursos', 'excluir')
  );
