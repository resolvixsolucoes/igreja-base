-- ============================================================
-- CERTIFICADOS LMS
-- Emite certificados ao concluir 100% das aulas de um curso.
-- ============================================================

CREATE TABLE IF NOT EXISTS certificados_lms (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula_id       uuid NOT NULL UNIQUE REFERENCES matriculas_lms ON DELETE CASCADE,
  aluno_id           uuid NOT NULL REFERENCES alunos ON DELETE CASCADE,
  curso_id           uuid NOT NULL REFERENCES cursos_lms ON DELETE CASCADE,
  codigo_validacao   text NOT NULL UNIQUE,
  carga_horaria_min  int,
  emitido_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certificados_aluno ON certificados_lms (aluno_id);
CREATE INDEX IF NOT EXISTS idx_certificados_curso ON certificados_lms (curso_id);

ALTER TABLE certificados_lms ENABLE ROW LEVEL SECURITY;

-- Aluno lê os próprios certificados (uso interno na plataforma)
CREATE POLICY "certificados_own" ON certificados_lms
  FOR SELECT USING (aluno_id = auth.uid());

-- Sem policies de INSERT/UPDATE/DELETE: gravação só via função SECURITY DEFINER

-- ============================================================
-- FUNÇÃO: emitir_certificado
-- Idempotente. Verifica que todas as aulas publicadas do curso
-- estão concluídas para a matrícula do aluno chamador. Cria
-- (ou retorna) o certificado e marca a matrícula como concluída.
-- ============================================================
CREATE OR REPLACE FUNCTION emitir_certificado(p_matricula_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_aluno_id  uuid;
  v_curso_id  uuid;
  v_total     int;
  v_concl     int;
  v_carga     int;
  v_existente certificados_lms%ROWTYPE;
  v_codigo    text;
  v_novo      certificados_lms%ROWTYPE;
BEGIN
  -- Valida ownership da matrícula
  SELECT m.aluno_id, m.curso_id, c.carga_horaria_min
    INTO v_aluno_id, v_curso_id, v_carga
  FROM matriculas_lms m
  JOIN cursos_lms c ON c.id = m.curso_id
  WHERE m.id = p_matricula_id
    AND m.aluno_id = auth.uid();

  IF v_aluno_id IS NULL THEN
    RAISE EXCEPTION 'Matrícula não encontrada ou sem permissão';
  END IF;

  -- Já existe certificado? retorna o atual (idempotente)
  SELECT * INTO v_existente FROM certificados_lms
   WHERE matricula_id = p_matricula_id;

  IF FOUND THEN
    RETURN to_jsonb(v_existente);
  END IF;

  -- Conta aulas publicadas do curso e quantas concluídas pela matrícula
  SELECT COUNT(*) INTO v_total
  FROM aulas_lms a
  JOIN modulos_lms mo ON mo.id = a.modulo_id
  WHERE mo.curso_id = v_curso_id AND a.publicado = true;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'Curso não possui aulas publicadas';
  END IF;

  SELECT COUNT(*) INTO v_concl
  FROM progresso_aulas_lms p
  JOIN aulas_lms a ON a.id = p.aula_id
  JOIN modulos_lms mo ON mo.id = a.modulo_id
  WHERE p.matricula_id = p_matricula_id
    AND p.concluida = true
    AND mo.curso_id = v_curso_id
    AND a.publicado = true;

  IF v_concl < v_total THEN
    RAISE EXCEPTION 'Curso ainda não concluído (% de % aulas)', v_concl, v_total;
  END IF;

  -- Gera código curto (12 chars hex maiúsculos)
  v_codigo := upper(substring(replace(gen_random_uuid()::text, '-', '') for 12));

  INSERT INTO certificados_lms
    (matricula_id, aluno_id, curso_id, codigo_validacao, carga_horaria_min)
  VALUES
    (p_matricula_id, v_aluno_id, v_curso_id, v_codigo, v_carga)
  RETURNING * INTO v_novo;

  UPDATE matriculas_lms
     SET status = 'concluida',
         data_conclusao = COALESCE(data_conclusao, now())
   WHERE id = p_matricula_id;

  RETURN to_jsonb(v_novo);
END;
$$;

GRANT EXECUTE ON FUNCTION emitir_certificado(uuid) TO authenticated;

-- ============================================================
-- FUNÇÃO: validar_certificado (público)
-- Permite verificar autenticidade pelo código de validação,
-- sem expor IDs internos ou matrícula.
-- ============================================================
CREATE OR REPLACE FUNCTION validar_certificado(p_codigo text)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT jsonb_build_object(
    'codigo_validacao',  ce.codigo_validacao,
    'aluno_nome',        al.nome,
    'curso_titulo',      cu.titulo,
    'carga_horaria_min', ce.carga_horaria_min,
    'emitido_em',        ce.emitido_em
  )
  FROM certificados_lms ce
  JOIN alunos     al ON al.id = ce.aluno_id
  JOIN cursos_lms cu ON cu.id = ce.curso_id
  WHERE ce.codigo_validacao = upper(p_codigo);
$$;

GRANT EXECUTE ON FUNCTION validar_certificado(text) TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificados_lms TO authenticated;
