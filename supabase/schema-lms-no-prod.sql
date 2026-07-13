-- =====================================================================
-- Fase 6.1 — Schema do LMS migrado para o projeto Prod
--
-- Cria as 8 tabelas do LMS (alunos, cursos_lms, modulos_lms, aulas_lms,
-- materiais_lms, matriculas_lms, progresso_aulas_lms, anotacoes_lms) +
-- funcao preview_curso_estrutura, no projeto Prod.
--
-- A escrita (insert/update/delete) e gateada pelo modelo granular ja
-- existente: permissoes_granular(pagina='conteudos', aba='cursos', acao).
-- Helper pode_acao_conteudos(aba, acao) centraliza essa checagem.
--
-- A funcao is_lms_editor() do projeto LMS NAO e portada — substituida
-- pelo modelo granular. lms_editores tambem nao vem.
--
-- Sem dados: tabelas ficam vazias. A migracao de cursos/modulos/aulas/
-- materiais (via script JS) entra na 6.3.
--
-- Idempotente. Roda no SQL Editor do Prod (NAO no LMS).
-- =====================================================================

-- ─── Helper SECURITY DEFINER para checar permissoes_granular ───────────
-- Centraliza o gate de escrita em conteudos. Cresce sem mudar policies
-- quando a granularizacao expandir para outras abas/paginas.
create or replace function public.pode_acao_conteudos(p_aba text, p_acao text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin_prod() or exists (
    select 1 from public.permissoes_granular
    where user_id = auth.uid()
      and pagina  = 'conteudos'
      and aba     = p_aba
      and case p_acao
        when 'ver'       then ver
        when 'adicionar' then adicionar
        when 'editar'    then editar
        when 'excluir'   then excluir
        else false
      end
  );
$$;

grant execute on function public.pode_acao_conteudos(text, text) to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- TABELAS
-- ═════════════════════════════════════════════════════════════════════

-- ─── ALUNOS (perfil de usuario da plataforma de cursos) ────────────────
-- Tabela separada de `perfis` por decisao: alunos sao usuarios externos,
-- distintos dos admins/voluntarios cadastrados em perfis.
create table if not exists public.alunos (
  id            uuid primary key references auth.users on delete cascade,
  nome          text not null,
  email         text not null,
  telefone      text,
  cep           text,
  logradouro    text,
  numero        text,
  complemento   text,
  bairro        text,
  cidade        text,
  uf            text,
  is_membro     boolean not null default false,
  ativo         boolean not null default true,
  foto_url      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── CURSOS ────────────────────────────────────────────────────────────
create table if not exists public.cursos_lms (
  id                       uuid primary key default gen_random_uuid(),
  titulo                   text not null,
  descricao                text,
  descricao_longa          text,
  thumbnail_url            text,
  carga_horaria_min        int default 0,
  nivel                    text default 'iniciante',
  categoria                text,
  preco                    numeric(10,2) not null default 0,
  gratuito_para_membros    boolean not null default true,
  publicado                boolean not null default false,
  destaque                 boolean not null default false,
  ordem                    int not null default 0,
  created_at               timestamptz not null default now()
);

-- ─── MODULOS (secoes do curso) ─────────────────────────────────────────
create table if not exists public.modulos_lms (
  id          uuid primary key default gen_random_uuid(),
  curso_id    uuid not null references public.cursos_lms on delete cascade,
  titulo      text not null,
  ordem       int not null default 0
);

-- ─── AULAS ─────────────────────────────────────────────────────────────
create table if not exists public.aulas_lms (
  id               uuid primary key default gen_random_uuid(),
  modulo_id        uuid not null references public.modulos_lms on delete cascade,
  titulo           text not null,
  descricao        text,
  link_video       text,
  duracao_min      int default 0,
  ordem            int not null default 0,
  publicado        boolean not null default true
);

-- ─── MATERIAIS (por aula) ──────────────────────────────────────────────
create table if not exists public.materiais_lms (
  id            uuid primary key default gen_random_uuid(),
  aula_id       uuid not null references public.aulas_lms on delete cascade,
  titulo        text not null,
  tipo          text default 'pdf',
  url           text not null,
  tamanho_bytes bigint
);

-- ─── MATRICULAS ────────────────────────────────────────────────────────
create table if not exists public.matriculas_lms (
  id               uuid primary key default gen_random_uuid(),
  aluno_id         uuid not null references public.alunos on delete cascade,
  curso_id         uuid not null references public.cursos_lms on delete cascade,
  status           text not null default 'ativa',
  tipo_acesso      text not null default 'pago',
  pagamento_id     text,
  data_matricula   timestamptz not null default now(),
  data_conclusao   timestamptz,
  unique (aluno_id, curso_id)
);

-- ─── PROGRESSO POR AULA ────────────────────────────────────────────────
create table if not exists public.progresso_aulas_lms (
  id                   uuid primary key default gen_random_uuid(),
  matricula_id         uuid not null references public.matriculas_lms on delete cascade,
  aula_id              uuid not null references public.aulas_lms on delete cascade,
  concluida            boolean not null default false,
  percentual_assistido int not null default 0,
  updated_at           timestamptz not null default now(),
  unique (matricula_id, aula_id)
);

-- ─── ANOTACOES ─────────────────────────────────────────────────────────
create table if not exists public.anotacoes_lms (
  id          uuid primary key default gen_random_uuid(),
  aluno_id    uuid not null references public.alunos on delete cascade,
  aula_id     uuid not null references public.aulas_lms on delete cascade,
  conteudo    text not null default '',
  updated_at  timestamptz not null default now(),
  unique (aluno_id, aula_id)
);


-- ═════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═════════════════════════════════════════════════════════════════════

alter table public.alunos              enable row level security;
alter table public.cursos_lms          enable row level security;
alter table public.modulos_lms         enable row level security;
alter table public.aulas_lms           enable row level security;
alter table public.materiais_lms       enable row level security;
alter table public.matriculas_lms      enable row level security;
alter table public.progresso_aulas_lms enable row level security;
alter table public.anotacoes_lms       enable row level security;


-- ─── ALUNOS ────────────────────────────────────────────────────────────
-- Cada aluno gerencia o proprio perfil. Admin pode ler todos.
drop policy if exists alunos_own       on public.alunos;
drop policy if exists alunos_admin_all on public.alunos;
create policy alunos_own
  on public.alunos for all
  using (auth.uid() = id)
  with check (auth.uid() = id);
create policy alunos_admin_all
  on public.alunos for all
  using (public.is_admin_prod())
  with check (public.is_admin_prod());


-- ─── CURSOS ────────────────────────────────────────────────────────────
-- SELECT: publicados sao publicos; rascunhos so editores.
drop policy if exists cursos_select         on public.cursos_lms;
drop policy if exists cursos_editor_insert  on public.cursos_lms;
drop policy if exists cursos_editor_update  on public.cursos_lms;
drop policy if exists cursos_editor_delete  on public.cursos_lms;
create policy cursos_select
  on public.cursos_lms for select
  using (publicado = true or public.pode_acao_conteudos('cursos', 'ver'));
create policy cursos_editor_insert
  on public.cursos_lms for insert
  with check (public.pode_acao_conteudos('cursos', 'adicionar'));
create policy cursos_editor_update
  on public.cursos_lms for update
  using (public.pode_acao_conteudos('cursos', 'editar'))
  with check (public.pode_acao_conteudos('cursos', 'editar'));
create policy cursos_editor_delete
  on public.cursos_lms for delete
  using (public.pode_acao_conteudos('cursos', 'excluir'));


-- ─── MODULOS ───────────────────────────────────────────────────────────
-- SELECT: matriculados ativos OU editores.
-- WRITE: editor com a acao correspondente.
drop policy if exists modulos_select        on public.modulos_lms;
drop policy if exists modulos_editor_insert on public.modulos_lms;
drop policy if exists modulos_editor_update on public.modulos_lms;
drop policy if exists modulos_editor_delete on public.modulos_lms;
create policy modulos_select
  on public.modulos_lms for select
  using (
    public.pode_acao_conteudos('cursos', 'ver')
    or exists (
      select 1 from public.matriculas_lms m
      where m.aluno_id = auth.uid()
        and m.curso_id = modulos_lms.curso_id
        and m.status = 'ativa'
    )
  );
create policy modulos_editor_insert
  on public.modulos_lms for insert
  with check (public.pode_acao_conteudos('cursos', 'adicionar'));
create policy modulos_editor_update
  on public.modulos_lms for update
  using (public.pode_acao_conteudos('cursos', 'editar'))
  with check (public.pode_acao_conteudos('cursos', 'editar'));
create policy modulos_editor_delete
  on public.modulos_lms for delete
  using (public.pode_acao_conteudos('cursos', 'excluir'));


-- ─── AULAS ─────────────────────────────────────────────────────────────
drop policy if exists aulas_select        on public.aulas_lms;
drop policy if exists aulas_editor_insert on public.aulas_lms;
drop policy if exists aulas_editor_update on public.aulas_lms;
drop policy if exists aulas_editor_delete on public.aulas_lms;
create policy aulas_select
  on public.aulas_lms for select
  using (
    public.pode_acao_conteudos('cursos', 'ver')
    or exists (
      select 1 from public.matriculas_lms mt
      join public.modulos_lms mo on mo.id = aulas_lms.modulo_id
      where mt.aluno_id = auth.uid()
        and mt.curso_id = mo.curso_id
        and mt.status = 'ativa'
    )
  );
create policy aulas_editor_insert
  on public.aulas_lms for insert
  with check (public.pode_acao_conteudos('cursos', 'adicionar'));
create policy aulas_editor_update
  on public.aulas_lms for update
  using (public.pode_acao_conteudos('cursos', 'editar'))
  with check (public.pode_acao_conteudos('cursos', 'editar'));
create policy aulas_editor_delete
  on public.aulas_lms for delete
  using (public.pode_acao_conteudos('cursos', 'excluir'));


-- ─── MATERIAIS ─────────────────────────────────────────────────────────
drop policy if exists materiais_select        on public.materiais_lms;
drop policy if exists materiais_editor_insert on public.materiais_lms;
drop policy if exists materiais_editor_update on public.materiais_lms;
drop policy if exists materiais_editor_delete on public.materiais_lms;
create policy materiais_select
  on public.materiais_lms for select
  using (
    public.pode_acao_conteudos('cursos', 'ver')
    or exists (
      select 1 from public.matriculas_lms mt
      join public.aulas_lms a   on a.id  = materiais_lms.aula_id
      join public.modulos_lms mo on mo.id = a.modulo_id
      where mt.aluno_id = auth.uid()
        and mt.curso_id = mo.curso_id
        and mt.status = 'ativa'
    )
  );
create policy materiais_editor_insert
  on public.materiais_lms for insert
  with check (public.pode_acao_conteudos('cursos', 'adicionar'));
create policy materiais_editor_update
  on public.materiais_lms for update
  using (public.pode_acao_conteudos('cursos', 'editar'))
  with check (public.pode_acao_conteudos('cursos', 'editar'));
create policy materiais_editor_delete
  on public.materiais_lms for delete
  using (public.pode_acao_conteudos('cursos', 'excluir'));


-- ─── MATRICULAS ────────────────────────────────────────────────────────
-- Aluno gerencia as proprias; admin/editor pode ler todas (relatorios).
drop policy if exists matriculas_own         on public.matriculas_lms;
drop policy if exists matriculas_self_insert on public.matriculas_lms;
drop policy if exists matriculas_admin_read  on public.matriculas_lms;
create policy matriculas_own
  on public.matriculas_lms for select
  using (aluno_id = auth.uid());
create policy matriculas_self_insert
  on public.matriculas_lms for insert
  with check (aluno_id = auth.uid());
create policy matriculas_admin_read
  on public.matriculas_lms for select
  using (public.pode_acao_conteudos('cursos', 'ver'));


-- ─── PROGRESSO ─────────────────────────────────────────────────────────
-- Aluno gerencia o proprio (via matricula).
drop policy if exists progresso_own on public.progresso_aulas_lms;
create policy progresso_own
  on public.progresso_aulas_lms for all
  using (
    exists (
      select 1 from public.matriculas_lms m
      where m.id = progresso_aulas_lms.matricula_id
        and m.aluno_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.matriculas_lms m
      where m.id = progresso_aulas_lms.matricula_id
        and m.aluno_id = auth.uid()
    )
  );


-- ─── ANOTACOES ─────────────────────────────────────────────────────────
drop policy if exists anotacoes_own on public.anotacoes_lms;
create policy anotacoes_own
  on public.anotacoes_lms for all
  using (aluno_id = auth.uid())
  with check (aluno_id = auth.uid());


-- ═════════════════════════════════════════════════════════════════════
-- PREVIEW PUBLICO DO CURSO
-- =====================================================================
create or replace function public.preview_curso_estrutura(p_curso_id uuid)
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',     m.id,
      'titulo', m.titulo,
      'ordem',  m.ordem,
      'aulas',  coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',          a.id,
            'titulo',      a.titulo,
            'duracao_min', a.duracao_min,
            'ordem',       a.ordem
          ) order by a.ordem
        )
        from public.aulas_lms a
        where a.modulo_id = m.id and a.publicado = true
      ), '[]'::jsonb)
    ) order by m.ordem
  ), '[]'::jsonb)
  from public.modulos_lms m
  where m.curso_id = p_curso_id
    and exists (select 1 from public.cursos_lms c where c.id = p_curso_id and c.publicado = true);
$$;

grant execute on function public.preview_curso_estrutura(uuid) to anon, authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- TRIGGERS de updated_at
-- =====================================================================
create or replace function public.set_updated_at_lms()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_alunos_updated_at    on public.alunos;
drop trigger if exists trg_progresso_updated_at on public.progresso_aulas_lms;
drop trigger if exists trg_anotacoes_updated_at on public.anotacoes_lms;

create trigger trg_alunos_updated_at
  before update on public.alunos
  for each row execute function public.set_updated_at_lms();

create trigger trg_progresso_updated_at
  before update on public.progresso_aulas_lms
  for each row execute function public.set_updated_at_lms();

create trigger trg_anotacoes_updated_at
  before update on public.anotacoes_lms
  for each row execute function public.set_updated_at_lms();


-- ═════════════════════════════════════════════════════════════════════
-- INDICES de performance
-- =====================================================================
create index if not exists idx_modulos_curso        on public.modulos_lms (curso_id);
create index if not exists idx_aulas_modulo         on public.aulas_lms (modulo_id);
create index if not exists idx_materiais_aula       on public.materiais_lms (aula_id);
create index if not exists idx_matriculas_aluno     on public.matriculas_lms (aluno_id);
create index if not exists idx_matriculas_curso     on public.matriculas_lms (curso_id);
create index if not exists idx_progresso_matricula  on public.progresso_aulas_lms (matricula_id);
create index if not exists idx_anotacoes_aluno      on public.anotacoes_lms (aluno_id);


-- ═════════════════════════════════════════════════════════════════════
-- GRANTS
-- =====================================================================
grant select                          on public.cursos_lms          to anon;
grant select, insert, update, delete on public.cursos_lms          to authenticated;
grant select, insert, update, delete on public.alunos              to authenticated;
grant select, insert, update, delete on public.modulos_lms         to authenticated;
grant select, insert, update, delete on public.aulas_lms           to authenticated;
grant select, insert, update, delete on public.materiais_lms       to authenticated;
grant select, insert                  on public.matriculas_lms      to authenticated;
grant select, insert, update, delete on public.progresso_aulas_lms to authenticated;
grant select, insert, update, delete on public.anotacoes_lms       to authenticated;


-- ═════════════════════════════════════════════════════════════════════
-- VALIDACAO
-- =====================================================================
-- 1) Tabelas criadas
--   select table_name from information_schema.tables
--   where table_schema='public'
--     and table_name in ('alunos','cursos_lms','modulos_lms','aulas_lms',
--                        'materiais_lms','matriculas_lms',
--                        'progresso_aulas_lms','anotacoes_lms');
--
-- 2) Helper de gate
--   select public.pode_acao_conteudos('cursos','editar');
--
-- 3) Policies criadas (4 por tabela de conteudo + variantes em alunos/matriculas)
--   select tablename, count(*) from pg_policies
--   where schemaname='public' and tablename like '%_lms'
--   group by tablename;
