-- =====================================================================
-- Patch: cursos_lms ganha coluna `destaque` no Prod
--
-- A tabela cursos_lms foi criada manualmente fora do git antes da Fase 6.1.
-- O schema-lms-no-prod.sql usa `create table if not exists`, entao a tabela
-- pre-existente nao recebeu a coluna nova — quebrava o save em
-- conteudos.html com "Could not find the 'destaque' column".
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- =====================================================================

alter table public.cursos_lms
  add column if not exists destaque boolean not null default false;
