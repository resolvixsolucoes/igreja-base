-- =====================================================================
-- Visitantes: campos adicionais para o bot WhatsApp
--
-- Adiciona colunas capturadas pelo bot de registro:
--   - email               (text)
--   - data_nascimento     (date)
--   - bairro              (text)
--   - receber_programacoes (boolean) — opt-in de comunicados
--   - origem              (text)    — 'bot_whatsapp' | 'manual' | etc.
--
-- Idempotente. Roda no SQL Editor do Supabase (Prod).
-- =====================================================================

alter table public.visitantes
  add column if not exists email                text,
  add column if not exists data_nascimento      date,
  add column if not exists bairro               text,
  add column if not exists receber_programacoes boolean not null default false,
  add column if not exists origem               text    not null default 'manual';
