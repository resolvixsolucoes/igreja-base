-- ============================================================
-- PAGAMENTOS LMS — registro de cobranças no gateway (PagSeguro)
-- ============================================================
-- Cada linha representa uma tentativa de pagamento de um curso
-- por um aluno. Status é atualizado via webhook do gateway.

CREATE TABLE IF NOT EXISTS pagamentos_lms (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id           uuid NOT NULL REFERENCES alunos       ON DELETE CASCADE,
  curso_id           uuid NOT NULL REFERENCES cursos_lms   ON DELETE CASCADE,
  matricula_id       uuid REFERENCES matriculas_lms       ON DELETE SET NULL,
  valor              numeric(10,2) NOT NULL,
  status             text NOT NULL DEFAULT 'pendente',
                     -- pendente | aprovado | recusado | cancelado | reembolsado
  gateway            text NOT NULL DEFAULT 'pagseguro',
  gateway_order_id   text,        -- id retornado pelo PagSeguro (checkout/order)
  gateway_charge_id  text,        -- id da cobrança específica (quando paga)
  pay_url            text,        -- URL hospedada de checkout
  metodo             text,        -- pix | credit_card | boleto | debit_card
  raw                jsonb,       -- payload completo da última resposta/webhook
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_aluno    ON pagamentos_lms (aluno_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_curso    ON pagamentos_lms (curso_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_status   ON pagamentos_lms (status);
CREATE INDEX IF NOT EXISTS idx_pagamentos_gw_order ON pagamentos_lms (gateway_order_id);

ALTER TABLE pagamentos_lms ENABLE ROW LEVEL SECURITY;

-- Aluno vê apenas seus próprios pagamentos
DROP POLICY IF EXISTS "pagamentos_own_select" ON pagamentos_lms;
CREATE POLICY "pagamentos_own_select" ON pagamentos_lms
  FOR SELECT USING (aluno_id = auth.uid());

-- Inserts/updates apenas via Edge Function (service_role bypassa RLS)
-- Não criamos política de INSERT/UPDATE pra usuário comum.

-- Trigger pra updated_at
CREATE OR REPLACE FUNCTION pagamentos_lms_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pagamentos_lms_updated ON pagamentos_lms;
CREATE TRIGGER trg_pagamentos_lms_updated
  BEFORE UPDATE ON pagamentos_lms
  FOR EACH ROW EXECUTE FUNCTION pagamentos_lms_set_updated_at();

-- ============================================================
-- Link de pagamento PagBank por curso (caminho "Pagamento por Link")
-- Admin cola aqui o link gerado no painel PagBank.
-- ============================================================
ALTER TABLE cursos_lms
  ADD COLUMN IF NOT EXISTS pagamento_url text;
