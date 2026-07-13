-- ============================================================
-- LMS Sua Igreja — Migração: materiais por aula + carga auto
-- Execute no SQL Editor do Supabase (projeto LMS)
-- ============================================================

-- ── 1) Trigger que recalcula carga_horaria_min do curso
--      a partir da soma de duracao_min das aulas ─────────────
CREATE OR REPLACE FUNCTION recalc_curso_carga_horaria()
RETURNS trigger AS $$
DECLARE
  v_curso_id uuid;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    SELECT curso_id INTO v_curso_id FROM modulos_lms WHERE id = OLD.modulo_id;
  ELSE
    SELECT curso_id INTO v_curso_id FROM modulos_lms WHERE id = NEW.modulo_id;
  END IF;

  IF v_curso_id IS NOT NULL THEN
    UPDATE cursos_lms
       SET carga_horaria_min = COALESCE((
         SELECT SUM(a.duracao_min)
         FROM aulas_lms a
         JOIN modulos_lms m ON m.id = a.modulo_id
         WHERE m.curso_id = v_curso_id
       ), 0)
     WHERE id = v_curso_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_aulas_recalc_carga ON aulas_lms;
CREATE TRIGGER trg_aulas_recalc_carga
  AFTER INSERT OR UPDATE OR DELETE ON aulas_lms
  FOR EACH ROW EXECUTE FUNCTION recalc_curso_carga_horaria();

-- ── 2) Backfill imediato (uma vez) ─────────────────────────
UPDATE cursos_lms c
   SET carga_horaria_min = COALESCE(t.total, 0)
  FROM (
    SELECT m.curso_id, SUM(a.duracao_min) AS total
      FROM aulas_lms a
      JOIN modulos_lms m ON m.id = a.modulo_id
     GROUP BY m.curso_id
  ) t
 WHERE t.curso_id = c.id;

-- ── 3) materiais_lms: campos extras opcionais ──────────────
ALTER TABLE materiais_lms
  ADD COLUMN IF NOT EXISTS descricao   text,
  ADD COLUMN IF NOT EXISTS nome_arquivo text;

CREATE INDEX IF NOT EXISTS idx_materiais_ordem ON materiais_lms (aula_id, ordem);
