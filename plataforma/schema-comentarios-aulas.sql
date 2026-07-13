-- ============================================================
-- LMS Sua Igreja — Comentários / Dúvidas por aula
-- Execute no SQL Editor do Supabase (projeto LMS)
-- ============================================================

CREATE TABLE IF NOT EXISTS comentarios_lms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aula_id     uuid NOT NULL REFERENCES aulas_lms ON DELETE CASCADE,
  aluno_id    uuid NOT NULL REFERENCES alunos ON DELETE CASCADE,
  parent_id   uuid REFERENCES comentarios_lms ON DELETE CASCADE,
  conteudo    text NOT NULL CHECK (length(trim(conteudo)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_aula    ON comentarios_lms (aula_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comentarios_parent  ON comentarios_lms (parent_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_aluno   ON comentarios_lms (aluno_id);

ALTER TABLE comentarios_lms ENABLE ROW LEVEL SECURITY;

-- Qualquer matriculado ativo no curso da aula pode LER os comentários da aula
CREATE POLICY "comentarios_read_matriculados" ON comentarios_lms
  FOR SELECT USING (
    EXISTS (
      SELECT 1
        FROM matriculas_lms mt
        JOIN modulos_lms mo ON mo.curso_id = mt.curso_id
        JOIN aulas_lms   a  ON a.modulo_id = mo.id
       WHERE a.id = comentarios_lms.aula_id
         AND mt.aluno_id = auth.uid()
         AND mt.status IN ('ativa','concluida')
    )
  );

-- Aluno só insere em nome próprio, e somente se matriculado na aula
CREATE POLICY "comentarios_insert_proprio" ON comentarios_lms
  FOR INSERT WITH CHECK (
    aluno_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM matriculas_lms mt
        JOIN modulos_lms mo ON mo.curso_id = mt.curso_id
        JOIN aulas_lms   a  ON a.modulo_id = mo.id
       WHERE a.id = comentarios_lms.aula_id
         AND mt.aluno_id = auth.uid()
         AND mt.status IN ('ativa','concluida')
    )
  );

-- Aluno edita/remove apenas os próprios comentários
CREATE POLICY "comentarios_update_proprio" ON comentarios_lms
  FOR UPDATE USING (aluno_id = auth.uid());

CREATE POLICY "comentarios_delete_proprio" ON comentarios_lms
  FOR DELETE USING (aluno_id = auth.uid());

-- updated_at automático
DROP TRIGGER IF EXISTS trg_comentarios_updated_at ON comentarios_lms;
CREATE TRIGGER trg_comentarios_updated_at
  BEFORE UPDATE ON comentarios_lms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- View para juntar nome do autor sem precisar de JOIN no client
-- (alunos tem RLS apenas-próprio, então view SECURITY DEFINER
--  expõe somente nome/avatar do autor de comentários visíveis)
-- ============================================================
CREATE OR REPLACE FUNCTION listar_comentarios_aula(p_aula_id uuid)
RETURNS TABLE (
  id          uuid,
  aula_id     uuid,
  aluno_id    uuid,
  parent_id   uuid,
  conteudo    text,
  created_at  timestamptz,
  updated_at  timestamptz,
  autor_nome  text
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT c.id, c.aula_id, c.aluno_id, c.parent_id, c.conteudo,
         c.created_at, c.updated_at, a.nome
    FROM comentarios_lms c
    JOIN alunos a ON a.id = c.aluno_id
   WHERE c.aula_id = p_aula_id
     AND EXISTS (
       SELECT 1
         FROM matriculas_lms mt
         JOIN modulos_lms mo ON mo.curso_id = mt.curso_id
         JOIN aulas_lms   au ON au.modulo_id = mo.id
        WHERE au.id = p_aula_id
          AND mt.aluno_id = auth.uid()
          AND mt.status IN ('ativa','concluida')
     )
   ORDER BY c.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION listar_comentarios_aula(uuid) TO authenticated;
