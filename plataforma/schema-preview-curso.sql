-- ============================================================
-- LMS Sua Igreja — Migração: preview público da estrutura do curso
-- Execute no SQL Editor do Supabase (projeto LMS)
--
-- Objetivo:
--   - Permitir que qualquer visitante (logado ou não) veja módulos e
--     títulos das aulas de um curso publicado, ANTES de matricular.
--   - Manter link_video (e materiais) protegidos: só matriculados.
-- ============================================================

-- ── 1) Função SECURITY DEFINER que devolve a estrutura segura
--      (sem link_video) de um curso publicado ─────────────────
CREATE OR REPLACE FUNCTION preview_curso_estrutura(p_curso_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',     m.id,
      'titulo', m.titulo,
      'ordem',  m.ordem,
      'aulas',  COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',          a.id,
            'titulo',      a.titulo,
            'duracao_min', a.duracao_min,
            'ordem',       a.ordem
          ) ORDER BY a.ordem
        )
        FROM aulas_lms a
        WHERE a.modulo_id = m.id
          AND a.publicado = true
      ), '[]'::jsonb)
    ) ORDER BY m.ordem
  ), '[]'::jsonb)
  FROM modulos_lms m
  WHERE m.curso_id = p_curso_id
    AND EXISTS (
      SELECT 1 FROM cursos_lms c
      WHERE c.id = p_curso_id AND c.publicado = true
    );
$$;

GRANT EXECUTE ON FUNCTION preview_curso_estrutura(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
