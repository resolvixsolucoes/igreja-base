-- ============================================================
-- LMS Sua Igreja — Schema SQL
-- Execute no SQL Editor do Supabase (projeto atual)
-- ============================================================

-- ── ALUNOS (perfil dos usuários da plataforma de cursos) ────
CREATE TABLE IF NOT EXISTS alunos (
  id            uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  nome          text NOT NULL,
  email         text NOT NULL,
  telefone      text,
  cep           text,
  logradouro    text,
  numero        text,
  complemento   text,
  bairro        text,
  cidade        text,
  uf            text,
  is_membro     boolean NOT NULL DEFAULT false,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── CURSOS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cursos_lms (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo                   text NOT NULL,
  descricao                text,
  descricao_longa          text,
  thumbnail_url            text,
  carga_horaria_min        int DEFAULT 0,
  nivel                    text DEFAULT 'iniciante',   -- iniciante | intermediario | avancado
  categoria                text,
  preco                    numeric(10,2) NOT NULL DEFAULT 0,
  gratuito_para_membros    boolean NOT NULL DEFAULT true,
  publicado                boolean NOT NULL DEFAULT false,
  destaque                 boolean NOT NULL DEFAULT false,
  ordem                    int NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- ── MÓDULOS (seções do curso) ────────────────────────────────
CREATE TABLE IF NOT EXISTS modulos_lms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id    uuid NOT NULL REFERENCES cursos_lms ON DELETE CASCADE,
  titulo      text NOT NULL,
  ordem       int NOT NULL DEFAULT 0
);

-- ── AULAS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS aulas_lms (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_id        uuid NOT NULL REFERENCES modulos_lms ON DELETE CASCADE,
  titulo           text NOT NULL,
  descricao        text,
  link_video       text,
  duracao_min      int DEFAULT 0,
  ordem            int NOT NULL DEFAULT 0,
  publicado        boolean NOT NULL DEFAULT true
);

-- ── MATERIAIS (por aula) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS materiais_lms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aula_id     uuid NOT NULL REFERENCES aulas_lms ON DELETE CASCADE,
  titulo      text NOT NULL,
  tipo        text DEFAULT 'pdf',   -- pdf | link | arquivo
  url         text NOT NULL,
  tamanho_bytes bigint
);

-- ── MATRÍCULAS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS matriculas_lms (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id         uuid NOT NULL REFERENCES alunos ON DELETE CASCADE,
  curso_id         uuid NOT NULL REFERENCES cursos_lms ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'ativa',    -- ativa | concluida | cancelada
  tipo_acesso      text NOT NULL DEFAULT 'pago',     -- membro | pago | gratuito
  pagamento_id     text,
  data_matricula   timestamptz NOT NULL DEFAULT now(),
  data_conclusao   timestamptz,
  UNIQUE (aluno_id, curso_id)
);

-- ── PROGRESSO POR AULA ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS progresso_aulas_lms (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula_id         uuid NOT NULL REFERENCES matriculas_lms ON DELETE CASCADE,
  aula_id              uuid NOT NULL REFERENCES aulas_lms ON DELETE CASCADE,
  concluida            boolean NOT NULL DEFAULT false,
  percentual_assistido int NOT NULL DEFAULT 0,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (matricula_id, aula_id)
);

-- ── ANOTAÇÕES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anotacoes_lms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id    uuid NOT NULL REFERENCES alunos ON DELETE CASCADE,
  aula_id     uuid NOT NULL REFERENCES aulas_lms ON DELETE CASCADE,
  conteudo    text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, aula_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE alunos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cursos_lms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE modulos_lms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE aulas_lms          ENABLE ROW LEVEL SECURITY;
ALTER TABLE materiais_lms      ENABLE ROW LEVEL SECURITY;
ALTER TABLE matriculas_lms     ENABLE ROW LEVEL SECURITY;
ALTER TABLE progresso_aulas_lms ENABLE ROW LEVEL SECURITY;
ALTER TABLE anotacoes_lms      ENABLE ROW LEVEL SECURITY;

-- Alunos: cada aluno vê/edita apenas o próprio perfil
CREATE POLICY "aluno_own" ON alunos
  FOR ALL USING (auth.uid() = id);

-- Cursos: leitura pública para cursos publicados; escrita apenas via service_role
CREATE POLICY "cursos_read_public" ON cursos_lms
  FOR SELECT USING (publicado = true);

-- Módulos e Aulas: visíveis para quem tem matrícula ativa no curso
CREATE POLICY "modulos_matriculados" ON modulos_lms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matriculas_lms m
      WHERE m.aluno_id = auth.uid()
        AND m.curso_id = modulos_lms.curso_id
        AND m.status = 'ativa'
    )
  );

CREATE POLICY "aulas_matriculados" ON aulas_lms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matriculas_lms mt
      JOIN modulos_lms mo ON mo.id = aulas_lms.modulo_id
      WHERE mt.aluno_id = auth.uid()
        AND mt.curso_id = mo.curso_id
        AND mt.status = 'ativa'
    )
  );

-- Materiais: mesmo critério das aulas
CREATE POLICY "materiais_matriculados" ON materiais_lms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM matriculas_lms mt
      JOIN aulas_lms a  ON a.id  = materiais_lms.aula_id
      JOIN modulos_lms mo ON mo.id = a.modulo_id
      WHERE mt.aluno_id = auth.uid()
        AND mt.curso_id = mo.curso_id
        AND mt.status = 'ativa'
    )
  );

-- Matrículas: aluno vê apenas as próprias
CREATE POLICY "matriculas_own" ON matriculas_lms
  FOR SELECT USING (aluno_id = auth.uid());

CREATE POLICY "matriculas_insert" ON matriculas_lms
  FOR INSERT WITH CHECK (aluno_id = auth.uid());

-- Progresso: aluno gerencia o próprio
CREATE POLICY "progresso_own" ON progresso_aulas_lms
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM matriculas_lms m
      WHERE m.id = progresso_aulas_lms.matricula_id
        AND m.aluno_id = auth.uid()
    )
  );

-- Anotações: aluno gerencia as próprias
CREATE POLICY "anotacoes_own" ON anotacoes_lms
  FOR ALL USING (aluno_id = auth.uid());

-- ============================================================
-- PREVIEW PÚBLICO DO CURSO
-- Função SECURITY DEFINER expõe módulos/títulos de aulas (sem
-- link_video) de cursos publicados a qualquer visitante.
-- ============================================================
CREATE OR REPLACE FUNCTION preview_curso_estrutura(p_curso_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE AS $$
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
        WHERE a.modulo_id = m.id AND a.publicado = true
      ), '[]'::jsonb)
    ) ORDER BY m.ordem
  ), '[]'::jsonb)
  FROM modulos_lms m
  WHERE m.curso_id = p_curso_id
    AND EXISTS (SELECT 1 FROM cursos_lms c WHERE c.id = p_curso_id AND c.publicado = true);
$$;

GRANT EXECUTE ON FUNCTION preview_curso_estrutura(uuid) TO anon, authenticated;

-- ============================================================
-- TRIGGER: atualiza updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_alunos_updated_at
  BEFORE UPDATE ON alunos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_progresso_updated_at
  BEFORE UPDATE ON progresso_aulas_lms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_anotacoes_updated_at
  BEFORE UPDATE ON anotacoes_lms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ÍNDICES para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_modulos_curso     ON modulos_lms (curso_id);
CREATE INDEX IF NOT EXISTS idx_aulas_modulo       ON aulas_lms (modulo_id);
CREATE INDEX IF NOT EXISTS idx_materiais_aula     ON materiais_lms (aula_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_aluno   ON matriculas_lms (aluno_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_curso   ON matriculas_lms (curso_id);
CREATE INDEX IF NOT EXISTS idx_progresso_matricula ON progresso_aulas_lms (matricula_id);
CREATE INDEX IF NOT EXISTS idx_anotacoes_aluno    ON anotacoes_lms (aluno_id);

-- ============================================================
-- PAGAMENTOS — ver schema-pagamentos.sql
-- ============================================================
-- Tabela pagamentos_lms registra cobranças no gateway (PagSeguro).
-- Schema completo em plataforma/schema-pagamentos.sql.
