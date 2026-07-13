-- ═══════════════════════════════════════════════════════════════════════
-- SCHEMA BASE — extraído da instalação em produção
-- ═══════════════════════════════════════════════════════════════════════
-- Este arquivo cria toda a estrutura fundacional (tabelas, constraints,
-- índices, funções, triggers, RLS) sobre a qual as migrations
-- incrementais (schema-fase-*.sql, schema-financeiro-*.sql etc.) rodam.
--
-- ORDEM DE EXECUÇÃO num Supabase novo:
--   1) Este arquivo (schema-00-base.sql)  ← primeiro
--   2) Depois todos os schema-*.sql em ordem alfabética
--   3) Por último, plataforma/schema*.sql (LMS)
--
-- Idempotente: usa CREATE TABLE IF NOT EXISTS, CREATE POLICY sem IF NOT
-- EXISTS (falha se rodar duas vezes — nesse caso, DROP POLICY antes).
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- EXTENSIONS
-- ═══════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ═══════════════════════════════════════════════════════════════
-- TABLES
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public."Voluntários" (
  nome text NOT NULL,
  telefone text,
  email text,
  funcao text,
  status text,
  ministerio text
);

CREATE TABLE IF NOT EXISTS public.alunos (
  id uuid NOT NULL,
  nome text NOT NULL,
  email text NOT NULL,
  telefone text,
  cep text,
  logradouro text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  is_membro boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  apelido text,
  foto_url text
);

CREATE TABLE IF NOT EXISTS public.anotacoes_lms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  aluno_id uuid NOT NULL,
  aula_id uuid NOT NULL,
  conteudo text NOT NULL DEFAULT ''::text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aulas_lms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  modulo_id uuid NOT NULL,
  titulo text NOT NULL,
  descricao text,
  link_video text,
  duracao_min integer DEFAULT 0,
  ordem integer NOT NULL DEFAULT 0,
  publicado boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.celulas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  lider_id uuid,
  endereco text,
  bairro text,
  dia_semana text,
  horario time without time zone,
  status text DEFAULT 'ativa'::text,
  data_cadastro timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.certificados_lms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  matricula_id uuid NOT NULL,
  aluno_id uuid NOT NULL,
  curso_id uuid NOT NULL,
  codigo_validacao text NOT NULL,
  carga_horaria_min integer,
  emitido_em timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comentarios_lms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  aula_id uuid NOT NULL,
  aluno_id uuid NOT NULL,
  parent_id uuid,
  conteudo text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comunicacao_leituras (
  thread_id uuid NOT NULL,
  perfil_id uuid NOT NULL,
  ministerio_id uuid NOT NULL,
  ultima_leitura_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comunicacao_mensagens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  autor_perfil_id uuid NOT NULL,
  autor_ministerio_id uuid NOT NULL,
  texto text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comunicacao_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ministerio_a_id uuid NOT NULL,
  ministerio_b_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conselheiros (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  foto_url text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  membro_id uuid
);

CREATE TABLE IF NOT EXISTS public.conteudos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  subtipo text,
  titulo text NOT NULL,
  descricao text,
  serie text,
  categoria text,
  thumbnail_url text,
  link_externo text,
  arquivo_url text,
  arquivo_nome text,
  data_publicacao date DEFAULT CURRENT_DATE,
  publicado boolean DEFAULT false,
  destaque boolean DEFAULT false,
  criado_por uuid,
  created_at timestamp with time zone DEFAULT now(),
  autor text,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cursos_lms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  descricao_longa text,
  thumbnail_url text,
  carga_horaria_min integer DEFAULT 0,
  nivel text DEFAULT 'iniciante'::text,
  categoria text,
  preco numeric(10,2) NOT NULL DEFAULT 0,
  gratuito_para_membros boolean NOT NULL DEFAULT true,
  publicado boolean NOT NULL DEFAULT false,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  destaque boolean NOT NULL DEFAULT false,
  pagamento_url text
);

CREATE TABLE IF NOT EXISTS public.disponibilidade (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  voluntario_id uuid NOT NULL,
  ministerio_id uuid NOT NULL,
  data date NOT NULL,
  periodo text DEFAULT 'dia todo'::text,
  observacao text,
  created_at timestamp with time zone DEFAULT now(),
  evento_id uuid
);

CREATE TABLE IF NOT EXISTS public.eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  data_evento timestamp without time zone NOT NULL,
  local text,
  responsavel_id uuid,
  status text DEFAULT 'agendado'::text,
  data_cadastro timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.eventos_igreja (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  data date NOT NULL,
  hora time without time zone NOT NULL,
  tipo text NOT NULL DEFAULT 'geral'::text,
  ministerio_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  recorrencia text,
  recorrencia_serie_id uuid,
  excecoes text[] DEFAULT '{}'::text[],
  finalidade text,
  publico boolean NOT NULL DEFAULT false,
  descricao_curta text,
  link_inscricao text,
  imagem_url text,
  total_presentes_adultos integer
);

CREATE TABLE IF NOT EXISTS public.filhos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  data_nascimento date,
  membro_id uuid,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financeiro (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  membro_id uuid,
  tipo text NOT NULL,
  valor numeric(10,2) NOT NULL,
  data_pagamento date DEFAULT CURRENT_DATE,
  forma_pagamento text,
  descricao text,
  data_cadastro timestamp without time zone DEFAULT now(),
  criado_por uuid,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_por uuid,
  atualizado_em timestamp with time zone,
  excluido_por uuid,
  excluido_em timestamp with time zone,
  categoria_id uuid,
  conta_id uuid,
  forma_pgto_id uuid,
  comprovante_path text,
  observacao text,
  recorrencia_id uuid
);

CREATE TABLE IF NOT EXISTS public.financeiro_categorias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL,
  cor text,
  icone text,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financeiro_contas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL,
  saldo_inicial numeric(12,2) NOT NULL DEFAULT 0,
  ministerio_id uuid,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financeiro_fechamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ano integer NOT NULL,
  mes integer NOT NULL,
  fechado_por uuid,
  fechado_em timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financeiro_formas_pgto (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- Sequence precisa existir antes do default abaixo referenciar
CREATE SEQUENCE IF NOT EXISTS public.financeiro_log_id_seq;

CREATE TABLE IF NOT EXISTS public.financeiro_log (
  id bigint NOT NULL DEFAULT nextval('financeiro_log_id_seq'::regclass),
  financeiro_id uuid NOT NULL,
  acao text NOT NULL,
  payload_antes jsonb,
  payload_depois jsonb,
  usuario_id uuid,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financeiro_recorrencias (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  descricao text NOT NULL,
  tipo text NOT NULL,
  valor numeric(12,2) NOT NULL,
  categoria_id uuid,
  conta_id uuid NOT NULL,
  forma_pgto_id uuid,
  dia_do_mes integer NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.frequencia_cultos_criancas (
  evento_id uuid NOT NULL,
  sala_id smallint NOT NULL,
  total_manual integer,
  atualizado_por uuid,
  atualizado_em timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inscricoes_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evento_id uuid,
  nome text NOT NULL,
  data_nascimento date,
  email text,
  telefone text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  cep text,
  rua text,
  numero text,
  complemento text,
  bairro text,
  cidade text
);

CREATE TABLE IF NOT EXISTS public.levinho_checkins (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  filho_id uuid,
  crianca_nome text NOT NULL,
  crianca_idade smallint NOT NULL,
  sala_id smallint NOT NULL,
  data_evento date NOT NULL DEFAULT CURRENT_DATE,
  responsavel_nome text NOT NULL,
  responsavel_telefone text NOT NULL,
  responsavel_membro_id uuid,
  codigo_retirada text NOT NULL,
  hora_entrada timestamp with time zone NOT NULL DEFAULT now(),
  hora_saida timestamp with time zone,
  responsavel_saida_nome text,
  retirado_por_user uuid,
  eh_visitante boolean DEFAULT (filho_id IS NULL),
  evento_id uuid
);

CREATE TABLE IF NOT EXISTS public.levinho_materiais (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sala_id smallint NOT NULL,
  titulo text NOT NULL,
  descricao text,
  categoria text,
  arquivo_url text,
  arquivo_nome text,
  criado_por text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.levinho_salas (
  id smallint NOT NULL,
  nome text NOT NULL,
  idade_min smallint NOT NULL,
  idade_max smallint NOT NULL,
  ordem smallint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.levinho_visitantes_criancas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  idade smallint NOT NULL,
  responsavel_nome text NOT NULL,
  responsavel_telefone text NOT NULL,
  visitante_id uuid,
  primeiro_checkin timestamp with time zone NOT NULL DEFAULT now(),
  ultimo_checkin timestamp with time zone NOT NULL DEFAULT now(),
  total_checkins integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.levinho_voluntarios_salas (
  voluntario_id uuid NOT NULL,
  sala_id smallint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.materiais_lms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  aula_id uuid NOT NULL,
  titulo text NOT NULL,
  tipo text DEFAULT 'pdf'::text,
  url text NOT NULL,
  tamanho_bytes bigint,
  ordem integer NOT NULL DEFAULT 0,
  descricao text,
  nome_arquivo text
);

CREATE TABLE IF NOT EXISTS public.matriculas_lms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  aluno_id uuid NOT NULL,
  curso_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'ativa'::text,
  tipo_acesso text NOT NULL DEFAULT 'pago'::text,
  pagamento_id text,
  data_matricula timestamp with time zone NOT NULL DEFAULT now(),
  data_conclusao timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.membros (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text,
  data_nascimento date,
  endereco text,
  bairro text,
  cidade text,
  estado text,
  foto_url text,
  cargo text DEFAULT 'membro'::text,
  status text DEFAULT 'ativo'::text,
  data_cadastro timestamp without time zone DEFAULT now(),
  observacoes text,
  estado_civil text DEFAULT 'Solteiro'::text,
  conjuge text,
  voluntario text DEFAULT 'Não'::text,
  ministerio text,
  mesa text,
  rua text,
  numero text,
  complemento text,
  mesa_id uuid,
  ministerio_id uuid,
  ministerio_ids uuid[] DEFAULT '{}'::uuid[],
  conjuge_id uuid,
  filhos text
);

CREATE TABLE IF NOT EXISTS public.mesas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  lider text,
  horario text,
  local text,
  total_membros integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  lider_1_membro_id uuid,
  lider_2_membro_id uuid
);

CREATE TABLE IF NOT EXISTS public.ministerio_avisos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ministerio_id uuid NOT NULL,
  titulo text NOT NULL,
  texto text,
  arquivo_url text,
  arquivo_nome text,
  criado_por text,
  created_at timestamp with time zone DEFAULT now(),
  sala_id smallint
);

CREATE TABLE IF NOT EXISTS public.ministerio_escala (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL,
  voluntario_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pendente'::text,
  token uuid DEFAULT gen_random_uuid(),
  respondido_em timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  sala_id smallint,
  checkin_em timestamp with time zone,
  checkin_por uuid,
  funcoes text[] DEFAULT '{}'::text[]
);

CREATE TABLE IF NOT EXISTS public.ministerio_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ministerio_id uuid NOT NULL,
  nome text NOT NULL,
  data date NOT NULL,
  hora time without time zone,
  descricao text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ministerio_lideres (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ministerio_id uuid NOT NULL,
  voluntario_id uuid NOT NULL,
  funcao text NOT NULL DEFAULT 'Líder'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ministerio_voluntarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ministerio text NOT NULL,
  eh_lider boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ministerios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  icone text DEFAULT '✨'::text,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.modulos_lms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  curso_id uuid NOT NULL,
  titulo text NOT NULL,
  ordem integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.pagamentos_lms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  aluno_id uuid NOT NULL,
  curso_id uuid NOT NULL,
  matricula_id uuid,
  valor numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pendente'::text,
  gateway text NOT NULL DEFAULT 'pagseguro'::text,
  gateway_order_id text,
  gateway_charge_id text,
  pay_url text,
  metodo text,
  raw jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.paginas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL,
  label text NOT NULL,
  parent_key text,
  icone text,
  ordem integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pastoral_agendamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  disponibilidade_id uuid NOT NULL,
  conselheiro_id uuid NOT NULL,
  slot_hora time without time zone NOT NULL,
  nome_fiel text NOT NULL,
  telefone_fiel text NOT NULL,
  motivo text,
  status text NOT NULL DEFAULT 'pendente'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pastoral_disponibilidade (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conselheiro_id uuid NOT NULL,
  data date NOT NULL,
  hora_inicio time without time zone NOT NULL,
  hora_fim time without time zone NOT NULL,
  intervalo_min integer NOT NULL DEFAULT 30,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pastoral_relatorios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agendamento_id uuid NOT NULL,
  conselheiro_id uuid,
  telefone_fiel text NOT NULL,
  nome_fiel text,
  relatorio text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pedidos_oracao (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  pedido text NOT NULL,
  origem text DEFAULT 'Manual'::text,
  status text DEFAULT 'Pendente'::text,
  visitante_id uuid,
  criado_em timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.perfil_permissoes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  role text NOT NULL,
  pagina text NOT NULL,
  ver boolean DEFAULT false,
  adicionar boolean DEFAULT false,
  editar boolean DEFAULT false,
  excluir boolean DEFAULT false,
  exportar boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.perfil_permissoes_campos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  role text NOT NULL,
  pagina text NOT NULL,
  campo text NOT NULL,
  ver boolean DEFAULT false,
  editar boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.perfis (
  id uuid NOT NULL,
  nome text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'consulta'::text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  membro_id uuid,
  ministerio text,
  foto_url text,
  gerencia_cursos boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.permissoes_granular (
  user_id uuid NOT NULL,
  pagina text NOT NULL,
  aba text NOT NULL DEFAULT '_default'::text,
  ver boolean NOT NULL DEFAULT false,
  adicionar boolean NOT NULL DEFAULT false,
  editar boolean NOT NULL DEFAULT false,
  excluir boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.playlist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ministerio_id uuid,
  spotify_url text,
  titulo text NOT NULL,
  artista text,
  tonalidade text,
  bpm integer,
  categoria text,
  observacoes text,
  thumb_url text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.playlist_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL,
  musica_id uuid NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  ministerio_id uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.playlist_musicas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ministerio_id uuid,
  spotify_url text NOT NULL,
  thumb_url text,
  titulo text NOT NULL,
  artista text,
  tonalidade text,
  bpm integer,
  categoria text,
  observacoes text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pregacao_playlist_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  playlist_id uuid,
  conteudo_id uuid,
  ordem integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pregacao_playlists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  thumbnail_url text,
  criado_por uuid,
  ordem integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.presencas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  membro_id uuid,
  celula_id uuid,
  data_presenca date DEFAULT CURRENT_DATE,
  tipo text DEFAULT 'culto'::text,
  presente boolean DEFAULT true,
  observacoes text
);

CREATE TABLE IF NOT EXISTS public.progresso_aulas_lms (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  matricula_id uuid NOT NULL,
  aula_id uuid NOT NULL,
  concluida boolean NOT NULL DEFAULT false,
  percentual_assistido integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.visitantes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text,
  data_visita date DEFAULT CURRENT_DATE,
  como_conheceu text,
  interesse text,
  observacoes text,
  data_cadastro timestamp without time zone DEFAULT now(),
  oracao text,
  oracao_status text DEFAULT 'Pendente'::text,
  contactado boolean NOT NULL DEFAULT false,
  descricao_contato text,
  data_nascimento date,
  bairro text,
  receber_programacoes boolean NOT NULL DEFAULT false,
  origem text NOT NULL DEFAULT 'manual'::text
);

CREATE TABLE IF NOT EXISTS public.voluntario_materiais (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL,
  ministerio_id uuid,
  tipo text NOT NULL,
  titulo text NOT NULL,
  descricao text,
  arquivo_url text,
  arquivo_nome text,
  criado_por uuid,
  criado_em timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.voluntario_materiais_entregas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL,
  voluntario_id uuid NOT NULL,
  entregue_em timestamp with time zone NOT NULL DEFAULT now(),
  entregue_por uuid
);

CREATE TABLE IF NOT EXISTS public.voluntarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  email text,
  funcao text,
  status text DEFAULT 'Ativo'::text,
  ministerio text,
  created_at timestamp without time zone DEFAULT now(),
  endereco text,
  nascimento date,
  participa_mesa text DEFAULT 'nao'::text,
  mesa text,
  membro_id uuid,
  ministerio_id uuid,
  ministerio_ids text[] DEFAULT '{}'::uuid[],
  habilidades text[] DEFAULT '{}'::text[]
);

-- Faz a sequence "pertencer" à coluna (dropar a tabela dropa a sequence)
ALTER SEQUENCE public.financeiro_log_id_seq OWNED BY public.financeiro_log.id;


-- ═══════════════════════════════════════════════════════════════
-- CONSTRAINTS (PK/FK/UNIQUE/CHECK)
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.alunos ADD CONSTRAINT alunos_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.alunos ADD CONSTRAINT alunos_pkey PRIMARY KEY (id);
ALTER TABLE public.anotacoes_lms ADD CONSTRAINT anotacoes_lms_aluno_id_aula_id_key UNIQUE (aluno_id, aula_id);
ALTER TABLE public.anotacoes_lms ADD CONSTRAINT anotacoes_lms_aluno_id_fkey FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE;
ALTER TABLE public.anotacoes_lms ADD CONSTRAINT anotacoes_lms_aula_id_fkey FOREIGN KEY (aula_id) REFERENCES aulas_lms(id) ON DELETE CASCADE;
ALTER TABLE public.anotacoes_lms ADD CONSTRAINT anotacoes_lms_pkey PRIMARY KEY (id);
ALTER TABLE public.aulas_lms ADD CONSTRAINT aulas_lms_modulo_id_fkey FOREIGN KEY (modulo_id) REFERENCES modulos_lms(id) ON DELETE CASCADE;
ALTER TABLE public.aulas_lms ADD CONSTRAINT aulas_lms_pkey PRIMARY KEY (id);
ALTER TABLE public.celulas ADD CONSTRAINT celulas_lider_id_fkey FOREIGN KEY (lider_id) REFERENCES membros(id);
ALTER TABLE public.celulas ADD CONSTRAINT celulas_pkey PRIMARY KEY (id);
ALTER TABLE public.certificados_lms ADD CONSTRAINT certificados_lms_aluno_id_fkey FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE;
ALTER TABLE public.certificados_lms ADD CONSTRAINT certificados_lms_codigo_validacao_key UNIQUE (codigo_validacao);
ALTER TABLE public.certificados_lms ADD CONSTRAINT certificados_lms_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos_lms(id) ON DELETE CASCADE;
ALTER TABLE public.certificados_lms ADD CONSTRAINT certificados_lms_matricula_id_fkey FOREIGN KEY (matricula_id) REFERENCES matriculas_lms(id) ON DELETE CASCADE;
ALTER TABLE public.certificados_lms ADD CONSTRAINT certificados_lms_matricula_id_key UNIQUE (matricula_id);
ALTER TABLE public.certificados_lms ADD CONSTRAINT certificados_lms_pkey PRIMARY KEY (id);
ALTER TABLE public.comentarios_lms ADD CONSTRAINT comentarios_lms_aluno_id_fkey FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE;
ALTER TABLE public.comentarios_lms ADD CONSTRAINT comentarios_lms_aula_id_fkey FOREIGN KEY (aula_id) REFERENCES aulas_lms(id) ON DELETE CASCADE;
ALTER TABLE public.comentarios_lms ADD CONSTRAINT comentarios_lms_conteudo_check CHECK (length(TRIM(BOTH FROM conteudo)) > 0);
ALTER TABLE public.comentarios_lms ADD CONSTRAINT comentarios_lms_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES comentarios_lms(id) ON DELETE CASCADE;
ALTER TABLE public.comentarios_lms ADD CONSTRAINT comentarios_lms_pkey PRIMARY KEY (id);
ALTER TABLE public.comunicacao_leituras ADD CONSTRAINT comunicacao_leituras_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id) ON DELETE CASCADE;
ALTER TABLE public.comunicacao_leituras ADD CONSTRAINT comunicacao_leituras_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES perfis(id) ON DELETE CASCADE;
ALTER TABLE public.comunicacao_leituras ADD CONSTRAINT comunicacao_leituras_pkey PRIMARY KEY (thread_id, perfil_id, ministerio_id);
ALTER TABLE public.comunicacao_leituras ADD CONSTRAINT comunicacao_leituras_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES comunicacao_threads(id) ON DELETE CASCADE;
ALTER TABLE public.comunicacao_mensagens ADD CONSTRAINT comunicacao_mensagens_autor_ministerio_id_fkey FOREIGN KEY (autor_ministerio_id) REFERENCES ministerios(id);
ALTER TABLE public.comunicacao_mensagens ADD CONSTRAINT comunicacao_mensagens_autor_perfil_id_fkey FOREIGN KEY (autor_perfil_id) REFERENCES perfis(id);
ALTER TABLE public.comunicacao_mensagens ADD CONSTRAINT comunicacao_mensagens_pkey PRIMARY KEY (id);
ALTER TABLE public.comunicacao_mensagens ADD CONSTRAINT comunicacao_mensagens_texto_check CHECK (length(texto) >= 1 AND length(texto) <= 4000);
ALTER TABLE public.comunicacao_mensagens ADD CONSTRAINT comunicacao_mensagens_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES comunicacao_threads(id) ON DELETE CASCADE;
ALTER TABLE public.comunicacao_threads ADD CONSTRAINT comunicacao_threads_ministerio_a_id_fkey FOREIGN KEY (ministerio_a_id) REFERENCES ministerios(id) ON DELETE CASCADE;
ALTER TABLE public.comunicacao_threads ADD CONSTRAINT comunicacao_threads_ministerio_b_id_fkey FOREIGN KEY (ministerio_b_id) REFERENCES ministerios(id) ON DELETE CASCADE;
ALTER TABLE public.comunicacao_threads ADD CONSTRAINT comunicacao_threads_par_canonico CHECK (ministerio_a_id < ministerio_b_id);
ALTER TABLE public.comunicacao_threads ADD CONSTRAINT comunicacao_threads_par_unico UNIQUE (ministerio_a_id, ministerio_b_id);
ALTER TABLE public.comunicacao_threads ADD CONSTRAINT comunicacao_threads_pkey PRIMARY KEY (id);
ALTER TABLE public.conselheiros ADD CONSTRAINT conselheiros_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES membros(id) ON DELETE SET NULL;
ALTER TABLE public.conselheiros ADD CONSTRAINT conselheiros_pkey PRIMARY KEY (id);
ALTER TABLE public.conteudos ADD CONSTRAINT conteudos_pkey PRIMARY KEY (id);
ALTER TABLE public.cursos_lms ADD CONSTRAINT cursos_lms_pkey PRIMARY KEY (id);
ALTER TABLE public.disponibilidade ADD CONSTRAINT disponibilidade_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventos_igreja(id) ON DELETE CASCADE;
ALTER TABLE public.disponibilidade ADD CONSTRAINT disponibilidade_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id) ON DELETE CASCADE;
ALTER TABLE public.disponibilidade ADD CONSTRAINT disponibilidade_periodo_check CHECK (periodo = ANY (ARRAY['manhã'::text, 'tarde'::text, 'noite'::text, 'dia todo'::text]));
ALTER TABLE public.disponibilidade ADD CONSTRAINT disponibilidade_pkey PRIMARY KEY (id);
ALTER TABLE public.disponibilidade ADD CONSTRAINT disponibilidade_voluntario_evento_unique UNIQUE (voluntario_id, evento_id);
ALTER TABLE public.disponibilidade ADD CONSTRAINT disponibilidade_voluntario_id_fkey FOREIGN KEY (voluntario_id) REFERENCES voluntarios(id) ON DELETE CASCADE;
ALTER TABLE public.disponibilidade ADD CONSTRAINT disponibilidade_voluntario_id_ministerio_id_data_key UNIQUE (voluntario_id, ministerio_id, data);
ALTER TABLE public.eventos ADD CONSTRAINT eventos_pkey PRIMARY KEY (id);
ALTER TABLE public.eventos ADD CONSTRAINT eventos_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES membros(id);
ALTER TABLE public.eventos_igreja ADD CONSTRAINT eventos_igreja_finalidade_check CHECK (finalidade = ANY (ARRAY['culto'::text, 'conferencia'::text, 'curso'::text, 'treinamento'::text, 'reuniao'::text, 'cafe'::text, 'festividade'::text, 'pastoral'::text]));
ALTER TABLE public.eventos_igreja ADD CONSTRAINT eventos_igreja_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id) ON DELETE SET NULL;
ALTER TABLE public.eventos_igreja ADD CONSTRAINT eventos_igreja_pkey PRIMARY KEY (id);
ALTER TABLE public.eventos_igreja ADD CONSTRAINT eventos_igreja_recorrencia_check CHECK (recorrencia = ANY (ARRAY['semanal'::text, 'mensal'::text]));
ALTER TABLE public.eventos_igreja ADD CONSTRAINT eventos_igreja_tipo_check CHECK (tipo = ANY (ARRAY['geral'::text, 'ministerio'::text]));
ALTER TABLE public.filhos ADD CONSTRAINT filhos_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES membros(id) ON DELETE CASCADE;
ALTER TABLE public.filhos ADD CONSTRAINT filhos_pkey PRIMARY KEY (id);
ALTER TABLE public.financeiro ADD CONSTRAINT financeiro_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES perfis(id);
ALTER TABLE public.financeiro ADD CONSTRAINT financeiro_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES financeiro_categorias(id);
ALTER TABLE public.financeiro ADD CONSTRAINT financeiro_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES financeiro_contas(id);
ALTER TABLE public.financeiro ADD CONSTRAINT financeiro_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES perfis(id);
ALTER TABLE public.financeiro ADD CONSTRAINT financeiro_excluido_por_fkey FOREIGN KEY (excluido_por) REFERENCES perfis(id);
ALTER TABLE public.financeiro ADD CONSTRAINT financeiro_forma_pgto_id_fkey FOREIGN KEY (forma_pgto_id) REFERENCES financeiro_formas_pgto(id);
ALTER TABLE public.financeiro ADD CONSTRAINT financeiro_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES membros(id);
ALTER TABLE public.financeiro ADD CONSTRAINT financeiro_pkey PRIMARY KEY (id);
ALTER TABLE public.financeiro ADD CONSTRAINT financeiro_recorrencia_id_fkey FOREIGN KEY (recorrencia_id) REFERENCES financeiro_recorrencias(id) ON DELETE SET NULL;
ALTER TABLE public.financeiro_categorias ADD CONSTRAINT financeiro_categorias_pkey PRIMARY KEY (id);
ALTER TABLE public.financeiro_categorias ADD CONSTRAINT financeiro_categorias_tipo_check CHECK (tipo = ANY (ARRAY['entrada'::text, 'saida'::text, 'ambos'::text]));
ALTER TABLE public.financeiro_contas ADD CONSTRAINT financeiro_contas_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id) ON DELETE SET NULL;
ALTER TABLE public.financeiro_contas ADD CONSTRAINT financeiro_contas_pkey PRIMARY KEY (id);
ALTER TABLE public.financeiro_contas ADD CONSTRAINT financeiro_contas_tipo_check CHECK (tipo = ANY (ARRAY['caixa'::text, 'banco'::text, 'pix'::text, 'cartao'::text]));
ALTER TABLE public.financeiro_fechamentos ADD CONSTRAINT financeiro_fechamentos_ano_mes_key UNIQUE (ano, mes);
ALTER TABLE public.financeiro_fechamentos ADD CONSTRAINT financeiro_fechamentos_fechado_por_fkey FOREIGN KEY (fechado_por) REFERENCES perfis(id);
ALTER TABLE public.financeiro_fechamentos ADD CONSTRAINT financeiro_fechamentos_mes_check CHECK (mes >= 1 AND mes <= 12);
ALTER TABLE public.financeiro_fechamentos ADD CONSTRAINT financeiro_fechamentos_pkey PRIMARY KEY (id);
ALTER TABLE public.financeiro_formas_pgto ADD CONSTRAINT financeiro_formas_pgto_pkey PRIMARY KEY (id);
ALTER TABLE public.financeiro_log ADD CONSTRAINT financeiro_log_acao_check CHECK (acao = ANY (ARRAY['insert'::text, 'update'::text, 'delete'::text]));
ALTER TABLE public.financeiro_log ADD CONSTRAINT financeiro_log_pkey PRIMARY KEY (id);
ALTER TABLE public.financeiro_log ADD CONSTRAINT financeiro_log_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES perfis(id);
ALTER TABLE public.financeiro_recorrencias ADD CONSTRAINT financeiro_recorrencias_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES financeiro_categorias(id);
ALTER TABLE public.financeiro_recorrencias ADD CONSTRAINT financeiro_recorrencias_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES financeiro_contas(id);
ALTER TABLE public.financeiro_recorrencias ADD CONSTRAINT financeiro_recorrencias_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES perfis(id);
ALTER TABLE public.financeiro_recorrencias ADD CONSTRAINT financeiro_recorrencias_dia_do_mes_check CHECK (dia_do_mes >= 1 AND dia_do_mes <= 31);
ALTER TABLE public.financeiro_recorrencias ADD CONSTRAINT financeiro_recorrencias_forma_pgto_id_fkey FOREIGN KEY (forma_pgto_id) REFERENCES financeiro_formas_pgto(id);
ALTER TABLE public.financeiro_recorrencias ADD CONSTRAINT financeiro_recorrencias_pkey PRIMARY KEY (id);
ALTER TABLE public.financeiro_recorrencias ADD CONSTRAINT financeiro_recorrencias_tipo_check CHECK (tipo = ANY (ARRAY['entrada'::text, 'saida'::text]));
ALTER TABLE public.financeiro_recorrencias ADD CONSTRAINT financeiro_recorrencias_valor_check CHECK (valor > 0::numeric);
ALTER TABLE public.frequencia_cultos_criancas ADD CONSTRAINT frequencia_cultos_criancas_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES perfis(id) ON DELETE SET NULL;
ALTER TABLE public.frequencia_cultos_criancas ADD CONSTRAINT frequencia_cultos_criancas_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventos_igreja(id) ON DELETE CASCADE;
ALTER TABLE public.frequencia_cultos_criancas ADD CONSTRAINT frequencia_cultos_criancas_pkey PRIMARY KEY (evento_id, sala_id);
ALTER TABLE public.frequencia_cultos_criancas ADD CONSTRAINT frequencia_cultos_criancas_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES levinho_salas(id);
ALTER TABLE public.inscricoes_eventos ADD CONSTRAINT inscricoes_eventos_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventos_igreja(id) ON DELETE CASCADE;
ALTER TABLE public.inscricoes_eventos ADD CONSTRAINT inscricoes_eventos_pkey PRIMARY KEY (id);
ALTER TABLE public.levinho_checkins ADD CONSTRAINT levinho_checkins_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventos_igreja(id) ON DELETE SET NULL;
ALTER TABLE public.levinho_checkins ADD CONSTRAINT levinho_checkins_filho_id_fkey FOREIGN KEY (filho_id) REFERENCES filhos(id) ON DELETE SET NULL;
ALTER TABLE public.levinho_checkins ADD CONSTRAINT levinho_checkins_pkey PRIMARY KEY (id);
ALTER TABLE public.levinho_checkins ADD CONSTRAINT levinho_checkins_responsavel_membro_id_fkey FOREIGN KEY (responsavel_membro_id) REFERENCES membros(id) ON DELETE SET NULL;
ALTER TABLE public.levinho_checkins ADD CONSTRAINT levinho_checkins_retirado_por_user_fkey FOREIGN KEY (retirado_por_user) REFERENCES perfis(id) ON DELETE SET NULL;
ALTER TABLE public.levinho_checkins ADD CONSTRAINT levinho_checkins_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES levinho_salas(id);
ALTER TABLE public.levinho_materiais ADD CONSTRAINT levinho_materiais_pkey PRIMARY KEY (id);
ALTER TABLE public.levinho_materiais ADD CONSTRAINT levinho_materiais_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES levinho_salas(id);
ALTER TABLE public.levinho_salas ADD CONSTRAINT levinho_salas_nome_key UNIQUE (nome);
ALTER TABLE public.levinho_salas ADD CONSTRAINT levinho_salas_pkey PRIMARY KEY (id);
ALTER TABLE public.levinho_visitantes_criancas ADD CONSTRAINT levinho_visitantes_criancas_idade_check CHECK (idade >= 0 AND idade <= 12);
ALTER TABLE public.levinho_visitantes_criancas ADD CONSTRAINT levinho_visitantes_criancas_pkey PRIMARY KEY (id);
ALTER TABLE public.levinho_visitantes_criancas ADD CONSTRAINT levinho_visitantes_criancas_visitante_id_fkey FOREIGN KEY (visitante_id) REFERENCES visitantes(id) ON DELETE SET NULL;
ALTER TABLE public.levinho_voluntarios_salas ADD CONSTRAINT levinho_voluntarios_salas_pkey PRIMARY KEY (voluntario_id, sala_id);
ALTER TABLE public.levinho_voluntarios_salas ADD CONSTRAINT levinho_voluntarios_salas_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES levinho_salas(id);
ALTER TABLE public.levinho_voluntarios_salas ADD CONSTRAINT levinho_voluntarios_salas_voluntario_id_fkey FOREIGN KEY (voluntario_id) REFERENCES voluntarios(id) ON DELETE CASCADE;
ALTER TABLE public.materiais_lms ADD CONSTRAINT materiais_lms_aula_id_fkey FOREIGN KEY (aula_id) REFERENCES aulas_lms(id) ON DELETE CASCADE;
ALTER TABLE public.materiais_lms ADD CONSTRAINT materiais_lms_pkey PRIMARY KEY (id);
ALTER TABLE public.matriculas_lms ADD CONSTRAINT matriculas_lms_aluno_id_curso_id_key UNIQUE (aluno_id, curso_id);
ALTER TABLE public.matriculas_lms ADD CONSTRAINT matriculas_lms_aluno_id_fkey FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE;
ALTER TABLE public.matriculas_lms ADD CONSTRAINT matriculas_lms_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos_lms(id) ON DELETE CASCADE;
ALTER TABLE public.matriculas_lms ADD CONSTRAINT matriculas_lms_pkey PRIMARY KEY (id);
ALTER TABLE public.membros ADD CONSTRAINT membros_conjuge_id_fkey FOREIGN KEY (conjuge_id) REFERENCES membros(id);
ALTER TABLE public.membros ADD CONSTRAINT membros_email_key UNIQUE (email);
ALTER TABLE public.membros ADD CONSTRAINT membros_mesa_id_fkey FOREIGN KEY (mesa_id) REFERENCES mesas(id);
ALTER TABLE public.membros ADD CONSTRAINT membros_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id);
ALTER TABLE public.membros ADD CONSTRAINT membros_pkey PRIMARY KEY (id);
ALTER TABLE public.mesas ADD CONSTRAINT mesas_lider_1_membro_id_fkey FOREIGN KEY (lider_1_membro_id) REFERENCES membros(id) ON DELETE SET NULL;
ALTER TABLE public.mesas ADD CONSTRAINT mesas_lider_2_membro_id_fkey FOREIGN KEY (lider_2_membro_id) REFERENCES membros(id) ON DELETE SET NULL;
ALTER TABLE public.mesas ADD CONSTRAINT mesas_pkey PRIMARY KEY (id);
ALTER TABLE public.ministerio_avisos ADD CONSTRAINT ministerio_avisos_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id) ON DELETE CASCADE;
ALTER TABLE public.ministerio_avisos ADD CONSTRAINT ministerio_avisos_pkey PRIMARY KEY (id);
ALTER TABLE public.ministerio_avisos ADD CONSTRAINT ministerio_avisos_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES levinho_salas(id) ON DELETE SET NULL;
ALTER TABLE public.ministerio_escala ADD CONSTRAINT ministerio_escala_checkin_por_fkey FOREIGN KEY (checkin_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.ministerio_escala ADD CONSTRAINT ministerio_escala_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventos_igreja(id) ON DELETE CASCADE;
ALTER TABLE public.ministerio_escala ADD CONSTRAINT ministerio_escala_pkey PRIMARY KEY (id);
ALTER TABLE public.ministerio_escala ADD CONSTRAINT ministerio_escala_sala_id_fkey FOREIGN KEY (sala_id) REFERENCES levinho_salas(id) ON DELETE SET NULL;
ALTER TABLE public.ministerio_escala ADD CONSTRAINT ministerio_escala_status_check CHECK (status = ANY (ARRAY['pendente'::text, 'confirmado'::text, 'recusado'::text]));
ALTER TABLE public.ministerio_escala ADD CONSTRAINT ministerio_escala_token_key UNIQUE (token);
ALTER TABLE public.ministerio_escala ADD CONSTRAINT ministerio_escala_voluntario_id_fkey FOREIGN KEY (voluntario_id) REFERENCES voluntarios(id) ON DELETE CASCADE;
ALTER TABLE public.ministerio_eventos ADD CONSTRAINT ministerio_eventos_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id) ON DELETE CASCADE;
ALTER TABLE public.ministerio_eventos ADD CONSTRAINT ministerio_eventos_pkey PRIMARY KEY (id);
ALTER TABLE public.ministerio_lideres ADD CONSTRAINT ministerio_lideres_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id) ON DELETE CASCADE;
ALTER TABLE public.ministerio_lideres ADD CONSTRAINT ministerio_lideres_ministerio_id_voluntario_id_key UNIQUE (ministerio_id, voluntario_id);
ALTER TABLE public.ministerio_lideres ADD CONSTRAINT ministerio_lideres_pkey PRIMARY KEY (id);
ALTER TABLE public.ministerio_lideres ADD CONSTRAINT ministerio_lideres_voluntario_id_fkey FOREIGN KEY (voluntario_id) REFERENCES voluntarios(id) ON DELETE CASCADE;
ALTER TABLE public.ministerio_voluntarios ADD CONSTRAINT ministerio_voluntarios_pkey PRIMARY KEY (id);
ALTER TABLE public.ministerio_voluntarios ADD CONSTRAINT ministerio_voluntarios_user_id_fkey FOREIGN KEY (user_id) REFERENCES perfis(id) ON DELETE CASCADE;
ALTER TABLE public.ministerio_voluntarios ADD CONSTRAINT ministerio_voluntarios_user_id_ministerio_key UNIQUE (user_id, ministerio);
ALTER TABLE public.ministerios ADD CONSTRAINT ministerios_pkey PRIMARY KEY (id);
ALTER TABLE public.modulos_lms ADD CONSTRAINT modulos_lms_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos_lms(id) ON DELETE CASCADE;
ALTER TABLE public.modulos_lms ADD CONSTRAINT modulos_lms_pkey PRIMARY KEY (id);
ALTER TABLE public.pagamentos_lms ADD CONSTRAINT pagamentos_lms_aluno_id_fkey FOREIGN KEY (aluno_id) REFERENCES alunos(id) ON DELETE CASCADE;
ALTER TABLE public.pagamentos_lms ADD CONSTRAINT pagamentos_lms_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES cursos_lms(id) ON DELETE CASCADE;
ALTER TABLE public.pagamentos_lms ADD CONSTRAINT pagamentos_lms_matricula_id_fkey FOREIGN KEY (matricula_id) REFERENCES matriculas_lms(id) ON DELETE SET NULL;
ALTER TABLE public.pagamentos_lms ADD CONSTRAINT pagamentos_lms_pkey PRIMARY KEY (id);
ALTER TABLE public.paginas ADD CONSTRAINT paginas_key_key UNIQUE (key);
ALTER TABLE public.paginas ADD CONSTRAINT paginas_parent_key_fkey FOREIGN KEY (parent_key) REFERENCES paginas(key) ON DELETE CASCADE;
ALTER TABLE public.paginas ADD CONSTRAINT paginas_pkey PRIMARY KEY (id);
ALTER TABLE public.pastoral_agendamentos ADD CONSTRAINT pastoral_agendamentos_conselheiro_id_fkey FOREIGN KEY (conselheiro_id) REFERENCES conselheiros(id) ON DELETE CASCADE;
ALTER TABLE public.pastoral_agendamentos ADD CONSTRAINT pastoral_agendamentos_disponibilidade_id_fkey FOREIGN KEY (disponibilidade_id) REFERENCES pastoral_disponibilidade(id) ON DELETE CASCADE;
ALTER TABLE public.pastoral_agendamentos ADD CONSTRAINT pastoral_agendamentos_disponibilidade_id_slot_hora_key UNIQUE (disponibilidade_id, slot_hora);
ALTER TABLE public.pastoral_agendamentos ADD CONSTRAINT pastoral_agendamentos_pkey PRIMARY KEY (id);
ALTER TABLE public.pastoral_agendamentos ADD CONSTRAINT pastoral_agendamentos_status_check CHECK (status = ANY (ARRAY['pendente'::text, 'confirmado'::text, 'cancelado'::text]));
ALTER TABLE public.pastoral_disponibilidade ADD CONSTRAINT hora_valida CHECK (hora_fim > hora_inicio);
ALTER TABLE public.pastoral_disponibilidade ADD CONSTRAINT pastoral_disponibilidade_conselheiro_id_fkey FOREIGN KEY (conselheiro_id) REFERENCES conselheiros(id) ON DELETE CASCADE;
ALTER TABLE public.pastoral_disponibilidade ADD CONSTRAINT pastoral_disponibilidade_intervalo_min_check CHECK (intervalo_min = ANY (ARRAY[15, 30, 45, 60]));
ALTER TABLE public.pastoral_disponibilidade ADD CONSTRAINT pastoral_disponibilidade_pkey PRIMARY KEY (id);
ALTER TABLE public.pastoral_relatorios ADD CONSTRAINT pastoral_relatorios_agendamento_id_fkey FOREIGN KEY (agendamento_id) REFERENCES pastoral_agendamentos(id) ON DELETE CASCADE;
ALTER TABLE public.pastoral_relatorios ADD CONSTRAINT pastoral_relatorios_conselheiro_id_fkey FOREIGN KEY (conselheiro_id) REFERENCES conselheiros(id) ON DELETE SET NULL;
ALTER TABLE public.pastoral_relatorios ADD CONSTRAINT pastoral_relatorios_pkey PRIMARY KEY (id);
ALTER TABLE public.pedidos_oracao ADD CONSTRAINT pedidos_oracao_pkey PRIMARY KEY (id);
ALTER TABLE public.pedidos_oracao ADD CONSTRAINT pedidos_oracao_visitante_id_fkey FOREIGN KEY (visitante_id) REFERENCES visitantes(id) ON DELETE SET NULL;
ALTER TABLE public.perfil_permissoes ADD CONSTRAINT perfil_permissoes_pagina_fkey FOREIGN KEY (pagina) REFERENCES paginas(key) ON DELETE CASCADE;
ALTER TABLE public.perfil_permissoes ADD CONSTRAINT perfil_permissoes_pkey PRIMARY KEY (id);
ALTER TABLE public.perfil_permissoes ADD CONSTRAINT perfil_permissoes_role_check CHECK (role = ANY (ARRAY['admin'::text, 'lider'::text, 'secretaria'::text, 'membro'::text, 'consulta'::text]));
ALTER TABLE public.perfil_permissoes ADD CONSTRAINT perfil_permissoes_role_pagina_key UNIQUE (role, pagina);
ALTER TABLE public.perfil_permissoes_campos ADD CONSTRAINT perfil_permissoes_campos_pkey PRIMARY KEY (id);
ALTER TABLE public.perfil_permissoes_campos ADD CONSTRAINT perfil_permissoes_campos_role_pagina_campo_key UNIQUE (role, pagina, campo);
ALTER TABLE public.perfis ADD CONSTRAINT perfis_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES membros(id) ON DELETE SET NULL;
ALTER TABLE public.perfis ADD CONSTRAINT perfis_pkey PRIMARY KEY (id);
ALTER TABLE public.perfis ADD CONSTRAINT perfis_role_check CHECK (role = ANY (ARRAY['admin'::text, 'consulta'::text, 'parcial'::text, 'lider'::text, 'membro'::text]));
ALTER TABLE public.permissoes_granular ADD CONSTRAINT permissoes_granular_pkey PRIMARY KEY (user_id, pagina, aba);
ALTER TABLE public.permissoes_granular ADD CONSTRAINT permissoes_granular_user_id_fkey FOREIGN KEY (user_id) REFERENCES perfis(id) ON DELETE CASCADE;
ALTER TABLE public.playlist ADD CONSTRAINT playlist_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id) ON DELETE CASCADE;
ALTER TABLE public.playlist ADD CONSTRAINT playlist_pkey PRIMARY KEY (id);
ALTER TABLE public.playlist_eventos ADD CONSTRAINT playlist_eventos_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventos_igreja(id) ON DELETE CASCADE;
ALTER TABLE public.playlist_eventos ADD CONSTRAINT playlist_eventos_evento_id_musica_id_key UNIQUE (evento_id, musica_id);
ALTER TABLE public.playlist_eventos ADD CONSTRAINT playlist_eventos_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id) ON DELETE CASCADE;
ALTER TABLE public.playlist_eventos ADD CONSTRAINT playlist_eventos_musica_id_fkey FOREIGN KEY (musica_id) REFERENCES playlist_musicas(id) ON DELETE CASCADE;
ALTER TABLE public.playlist_eventos ADD CONSTRAINT playlist_eventos_pkey PRIMARY KEY (id);
ALTER TABLE public.playlist_musicas ADD CONSTRAINT playlist_musicas_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id) ON DELETE CASCADE;
ALTER TABLE public.playlist_musicas ADD CONSTRAINT playlist_musicas_pkey PRIMARY KEY (id);
ALTER TABLE public.pregacao_playlist_itens ADD CONSTRAINT pregacao_playlist_itens_conteudo_id_fkey FOREIGN KEY (conteudo_id) REFERENCES conteudos(id) ON DELETE CASCADE;
ALTER TABLE public.pregacao_playlist_itens ADD CONSTRAINT pregacao_playlist_itens_pkey PRIMARY KEY (id);
ALTER TABLE public.pregacao_playlist_itens ADD CONSTRAINT pregacao_playlist_itens_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES pregacao_playlists(id) ON DELETE CASCADE;
ALTER TABLE public.pregacao_playlists ADD CONSTRAINT pregacao_playlists_pkey PRIMARY KEY (id);
ALTER TABLE public.presencas ADD CONSTRAINT presencas_celula_id_fkey FOREIGN KEY (celula_id) REFERENCES celulas(id);
ALTER TABLE public.presencas ADD CONSTRAINT presencas_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES membros(id);
ALTER TABLE public.presencas ADD CONSTRAINT presencas_pkey PRIMARY KEY (id);
ALTER TABLE public.progresso_aulas_lms ADD CONSTRAINT progresso_aulas_lms_aula_id_fkey FOREIGN KEY (aula_id) REFERENCES aulas_lms(id) ON DELETE CASCADE;
ALTER TABLE public.progresso_aulas_lms ADD CONSTRAINT progresso_aulas_lms_matricula_id_aula_id_key UNIQUE (matricula_id, aula_id);
ALTER TABLE public.progresso_aulas_lms ADD CONSTRAINT progresso_aulas_lms_matricula_id_fkey FOREIGN KEY (matricula_id) REFERENCES matriculas_lms(id) ON DELETE CASCADE;
ALTER TABLE public.progresso_aulas_lms ADD CONSTRAINT progresso_aulas_lms_pkey PRIMARY KEY (id);
ALTER TABLE public.visitantes ADD CONSTRAINT visitantes_pkey PRIMARY KEY (id);
ALTER TABLE public.voluntario_materiais ADD CONSTRAINT voluntario_materiais_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.voluntario_materiais ADD CONSTRAINT voluntario_materiais_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventos_igreja(id) ON DELETE CASCADE;
ALTER TABLE public.voluntario_materiais ADD CONSTRAINT voluntario_materiais_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id) ON DELETE SET NULL;
ALTER TABLE public.voluntario_materiais ADD CONSTRAINT voluntario_materiais_pkey PRIMARY KEY (id);
ALTER TABLE public.voluntario_materiais ADD CONSTRAINT voluntario_materiais_tipo_check CHECK (tipo = ANY (ARRAY['checklist'::text, 'arquivo'::text]));
ALTER TABLE public.voluntario_materiais_entregas ADD CONSTRAINT voluntario_materiais_entregas_entregue_por_fkey FOREIGN KEY (entregue_por) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.voluntario_materiais_entregas ADD CONSTRAINT voluntario_materiais_entregas_material_id_fkey FOREIGN KEY (material_id) REFERENCES voluntario_materiais(id) ON DELETE CASCADE;
ALTER TABLE public.voluntario_materiais_entregas ADD CONSTRAINT voluntario_materiais_entregas_material_id_voluntario_id_key UNIQUE (material_id, voluntario_id);
ALTER TABLE public.voluntario_materiais_entregas ADD CONSTRAINT voluntario_materiais_entregas_pkey PRIMARY KEY (id);
ALTER TABLE public.voluntario_materiais_entregas ADD CONSTRAINT voluntario_materiais_entregas_voluntario_id_fkey FOREIGN KEY (voluntario_id) REFERENCES voluntarios(id) ON DELETE CASCADE;
ALTER TABLE public.voluntarios ADD CONSTRAINT voluntarios_membro_id_fkey FOREIGN KEY (membro_id) REFERENCES membros(id);
ALTER TABLE public.voluntarios ADD CONSTRAINT voluntarios_ministerio_id_fkey FOREIGN KEY (ministerio_id) REFERENCES ministerios(id);
ALTER TABLE public.voluntarios ADD CONSTRAINT voluntarios_pkey PRIMARY KEY (id);
