-- ================================================================
--  Fase: Habilidades de voluntários do Ministério de Música
--  Adiciona campo habilidades[] em voluntarios e
--  funcoes[] em ministerio_escala para designação por evento
-- ================================================================

-- O que o voluntário pode fazer (Vocal, Violão, Teclado, Baixo, Guitarra, Bateria)
ALTER TABLE voluntarios
  ADD COLUMN IF NOT EXISTS habilidades text[] DEFAULT '{}';

-- O que o voluntário vai executar em um evento específico da escala
ALTER TABLE ministerio_escala
  ADD COLUMN IF NOT EXISTS funcoes text[] DEFAULT '{}';
