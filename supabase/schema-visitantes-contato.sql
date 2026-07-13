-- =====================================================================
-- Visitantes: rastreio de contato pastoral
--
-- Adiciona dois campos:
--   - contactado          (boolean) — se o visitante já foi contactado
--   - descricao_contato   (text)    — descrição livre sobre o contato
--
-- Idempotente. Roda no SQL Editor do Supabase (Prod).
-- =====================================================================

alter table public.visitantes
  add column if not exists contactado        boolean not null default false,
  add column if not exists descricao_contato text;
