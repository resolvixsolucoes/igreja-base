-- =====================================================================
-- GRANTs explícitos — projeto Prod (Sua Igreja)
--
-- Contexto: a partir de 30/mai/2026 novos projetos Supabase exigem
-- GRANT explícito em tabelas do schema public; a partir de 30/out/2026
-- todos os projetos existentes passam a exigir o mesmo.
--
-- Este script cobre todas as tabelas do projeto. Idempotente: GRANT
-- é seguro de rodar múltiplas vezes sem efeito acumulado.
--
-- Roda no SQL Editor do projeto Prod.
-- =====================================================================


-- ── Permissões granulares ─────────────────────────────────────────────
grant select, insert, update, delete on public.permissoes_granular to authenticated;


-- ── Comunicação entre ministérios ─────────────────────────────────────
grant select, insert, update, delete on public.comunicacao_threads   to authenticated;
grant select, insert, update, delete on public.comunicacao_mensagens to authenticated;
grant select, insert, update, delete on public.comunicacao_leituras  to authenticated;


-- ── Levinho ───────────────────────────────────────────────────────────
grant select, insert, update, delete on public.levinho_salas               to authenticated;
grant select, insert, update, delete on public.levinho_voluntarios_salas   to authenticated;
grant select, insert, update, delete on public.levinho_checkins            to authenticated;
grant select, insert, update, delete on public.levinho_materiais           to authenticated;
grant select, insert, update, delete on public.levinho_visitantes_criancas to authenticated;


-- ── Financeiro ────────────────────────────────────────────────────────
grant select, insert, update, delete on public.financeiro_categorias  to authenticated;
grant select, insert, update, delete on public.financeiro_contas       to authenticated;
grant select, insert, update, delete on public.financeiro_formas_pgto  to authenticated;
grant select, insert, update, delete on public.financeiro_recorrencias to authenticated;
-- financeiro_log: append-only via trigger; leitura direta pelo front
grant select                          on public.financeiro_log          to authenticated;
-- financeiro_fechamentos: escrita exclusiva via RPC SECURITY DEFINER
grant select                          on public.financeiro_fechamentos  to authenticated;


-- ── LMS integrado ao Prod ─────────────────────────────────────────────
-- cursos_lms: anon pode ver catálogo público (publicado=true via RLS)
grant select                          on public.cursos_lms          to anon;
grant select, insert, update, delete on public.cursos_lms          to authenticated;
grant select, insert, update, delete on public.alunos              to authenticated;
grant select, insert, update, delete on public.modulos_lms         to authenticated;
grant select, insert, update, delete on public.aulas_lms           to authenticated;
grant select, insert, update, delete on public.materiais_lms       to authenticated;
-- matriculas_lms: aluno só insere/lê; admin usa service_role
grant select, insert                  on public.matriculas_lms      to authenticated;
grant select, insert, update, delete on public.progresso_aulas_lms to authenticated;
grant select, insert, update, delete on public.anotacoes_lms       to authenticated;
grant select, insert, update, delete on public.certificados_lms    to authenticated;


-- ── Pastoral ──────────────────────────────────────────────────────────
grant select, insert, update, delete on public.pastoral_relatorios to authenticated;


-- ── Inscrições de Eventos (formulário público) ────────────────────────
-- anon envia inscrição; autenticado lê no painel
grant insert                          on public.inscricoes_eventos to anon;
grant select, insert                  on public.inscricoes_eventos to authenticated;


-- ── Central de Voluntários ────────────────────────────────────────────
grant select, insert, update, delete on public.voluntario_materiais          to authenticated;
grant select, insert, update, delete on public.voluntario_materiais_entregas to authenticated;


-- ── Tabelas pré-existentes ────────────────────────────────────────────
-- Bloco dinâmico: só aplica GRANT se a tabela existir — seguro de rodar
-- mesmo que alguma tabela ainda não exista neste ambiente.
do $$
declare
  t text;
  tabelas text[] := array[
    'financeiro',
    'perfis',
    'ministerios',
    'membros',
    'visitantes',
    'eventos_igreja',
    'voluntarios',
    'conselheiros',
    'pastoral_agendamentos',
    'ministerio_lideres',
    'ministerio_avisos',
    'ministerio_escala',
    'mesas_lideres'
  ];
begin
  foreach t in array tabelas loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format(
        'grant select, insert, update, delete on public.%I to authenticated', t
      );
    end if;
  end loop;
end $$;
