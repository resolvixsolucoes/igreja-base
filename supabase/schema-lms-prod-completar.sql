-- =====================================================================
-- Fase 6.x — completa o que faltou no port LMS -> Prod
--
-- O schema-lms-no-prod.sql portou apenas a versao BASE das 8 tabelas
-- (sem migracoes posteriores que rodaram so no projeto LMS). Audit
-- contra o codigo atual identificou as omissoes abaixo. Tudo idempotente.
--
-- Roda no SQL Editor do projeto Prod.
-- =====================================================================

-- ── 1) materiais_lms: colunas extras (vieram de schema-materiais-aulas.sql)
alter table public.materiais_lms
  add column if not exists descricao    text,
  add column if not exists nome_arquivo text;

create index if not exists idx_materiais_ordem
  on public.materiais_lms (aula_id, ordem);

-- ── 2) Trigger que recalcula cursos_lms.carga_horaria_min ao mexer em aulas
create or replace function public.recalc_curso_carga_horaria()
returns trigger
language plpgsql
security definer
as $$
declare
  v_curso_id uuid;
begin
  if (tg_op = 'DELETE') then
    select curso_id into v_curso_id from public.modulos_lms where id = old.modulo_id;
  else
    select curso_id into v_curso_id from public.modulos_lms where id = new.modulo_id;
  end if;

  if v_curso_id is not null then
    update public.cursos_lms
       set carga_horaria_min = coalesce((
         select sum(a.duracao_min)
           from public.aulas_lms a
           join public.modulos_lms m on m.id = a.modulo_id
          where m.curso_id = v_curso_id
       ), 0)
     where id = v_curso_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_aulas_recalc_carga on public.aulas_lms;
create trigger trg_aulas_recalc_carga
  after insert or update or delete on public.aulas_lms
  for each row execute function public.recalc_curso_carga_horaria();

-- Backfill imediato dos cursos existentes
update public.cursos_lms c
   set carga_horaria_min = coalesce(t.total, 0)
  from (
    select m.curso_id, sum(a.duracao_min) as total
      from public.aulas_lms a
      join public.modulos_lms m on m.id = a.modulo_id
     group by m.curso_id
  ) t
 where t.curso_id = c.id;

-- ── 3) preview_curso_estrutura: usada por curso.html para anon ver
--      modulos+aulas (sem link_video) antes de matricular.
create or replace function public.preview_curso_estrutura(p_curso_id uuid)
returns jsonb
language sql
security definer
stable
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
        where a.modulo_id = m.id
          and a.publicado = true
      ), '[]'::jsonb)
    ) order by m.ordem
  ), '[]'::jsonb)
  from public.modulos_lms m
  where m.curso_id = p_curso_id
    and exists (
      select 1 from public.cursos_lms c
      where c.id = p_curso_id and c.publicado = true
    );
$$;

grant execute on function public.preview_curso_estrutura(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
