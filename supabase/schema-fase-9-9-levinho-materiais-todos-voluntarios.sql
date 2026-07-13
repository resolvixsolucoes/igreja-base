-- =====================================================================
-- Fase 9.9 — Levinho: voluntarios veem TODOS os materiais
--
-- Antes: SELECT em levinho_materiais filtrava por sala atribuida ao
-- voluntario (`minhas_salas_levinho()`). Voluntario sem vinculo de
-- sala nao via nada — mesmo apos a Fase 9.8 liberar a aba Materiais
-- na UI.
--
-- Agora: qualquer voluntario do ministerio Levinho ve materiais de
-- todas as salas. Acoes mutativas (insert/update/delete) continuam
-- restritas a admin/lider via policy de write existente.
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- =====================================================================


-- ─── 1. Helper: voluntario do Levinho? ───────────────────────────────
-- SECURITY DEFINER pra evitar recursao de RLS em voluntarios/perfis.
create or replace function public.eh_voluntario_levinho()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.voluntarios v
    join public.perfis      pf on pf.membro_id = v.membro_id
    join public.ministerios m  on m.id::text   = any(v.ministerio_ids)
    where pf.id = auth.uid()
      and lower(translate(m.nome,
            'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
            'aeiouaoaeioucaeiouaoaeiouc')) like 'levinho%'
  );
$$;
grant execute on function public.eh_voluntario_levinho() to authenticated;


-- ─── 2. Atualiza policy SELECT de levinho_materiais ──────────────────
drop policy if exists levinho_materiais_select on public.levinho_materiais;
create policy levinho_materiais_select on public.levinho_materiais
  for select to authenticated
  using (
    public.is_admin_prod()
    or public.eh_lider_levinho()
    or public.eh_voluntario_levinho()
    or sala_id in (select sala_id from public.minhas_salas_levinho())
  );

-- Write policy (insert/update/delete) permanece como na Fase 9.3:
-- so admin OR lider do Levinho.


-- =====================================================================
-- Validacao manual:
--
--   -- 1) Logado como voluntario do Levinho (sem vinculo de sala):
--   select count(*) from public.levinho_materiais;
--   -- Esperado: numero total de materiais cadastrados.
--
--   -- 2) Tentar inserir um material como voluntario:
--   insert into public.levinho_materiais (sala_id, titulo) values (1, 'teste');
--   -- Esperado: erro de RLS (permission denied).
-- =====================================================================
