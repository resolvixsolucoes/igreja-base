-- =====================================================================
-- Fase 7.3 — Backfill agenda (legacy -> permissoes_granular)
--
-- Antes da 7.3, o gate de agenda.html olhava AUTH.permissoes (tabela
-- `permissoes`). Apos a 7.3, o gate olha permissoes_granular via
-- temAcessoPagina('agenda') / temPermissaoAba('agenda', aba, acao).
--
-- agenda.html tem 2 abas: 'eventos' e 'pastoral'. Como a tabela legacy
-- nao distingue por aba, o backfill copia o mesmo registro VAEX para
-- aba='_default' (gate da pagina). O admin marca cada aba especifica
-- depois pelo modal de usuarios.
--
-- Idempotente: ON CONFLICT DO NOTHING.
--
-- COMO USAR:
--  1) Rodar no SQL Editor do projeto Prod (NAO no LMS) ANTES do merge.
--  2) Validar com a query de auditoria no rodape.
-- =====================================================================

insert into public.permissoes_granular
  (user_id, pagina, aba, ver, adicionar, editar, excluir)
select
  p.user_id,
  'agenda'   as pagina,
  '_default' as aba,
  coalesce(p.ver,       false) as ver,
  coalesce(p.adicionar, false) as adicionar,
  coalesce(p.editar,    false) as editar,
  coalesce(p.excluir,   false) as excluir
from public.permissoes p
join public.perfis     pf on pf.id = p.user_id
where p.pagina = 'agenda'
  and pf.role  <> 'admin'
on conflict (user_id, pagina, aba) do nothing;


-- =====================================================================
-- Validacao manual:
--
--   -- Comparar contagem antes vs depois
--   select
--     (select count(*) from public.permissoes p
--      join public.perfis pf on pf.id = p.user_id
--      where p.pagina='agenda' and pf.role <> 'admin')   as legacy,
--     (select count(*) from public.permissoes_granular
--      where pagina='agenda' and aba='_default')          as granular;
-- =====================================================================
