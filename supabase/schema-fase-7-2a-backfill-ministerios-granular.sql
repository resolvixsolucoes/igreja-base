-- =====================================================================
-- Fase 7.2a — Backfill ministerios (legacy -> permissoes_granular)
--
-- Antes da 7.2a, o gate de ministerios.html olhava AUTH.permissoes
-- (tabela `permissoes`). Apos a 7.2a, o gate olha permissoes_granular
-- via temAcessoPagina('ministerios') / temPermissaoAba('ministerios',
-- '_default', acao).
--
-- A regra "ministerios.ver e cascata puramente visual" continua valida:
-- o ver da pagina geral nao concede acesso aos ministerios-X (cada um
-- tem seu proprio gate via ministerios_X). Aqui so migramos a pagina
-- geral.
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
  'ministerios' as pagina,
  '_default'    as aba,
  coalesce(p.ver,       false) as ver,
  coalesce(p.adicionar, false) as adicionar,
  coalesce(p.editar,    false) as editar,
  coalesce(p.excluir,   false) as excluir
from public.permissoes p
join public.perfis     pf on pf.id = p.user_id
where p.pagina = 'ministerios'
  and pf.role  <> 'admin'
on conflict (user_id, pagina, aba) do nothing;


-- =====================================================================
-- Validacao manual:
--
--   -- Comparar contagem antes vs depois
--   select
--     (select count(*) from public.permissoes p
--      join public.perfis pf on pf.id = p.user_id
--      where p.pagina='ministerios' and pf.role <> 'admin')   as legacy,
--     (select count(*) from public.permissoes_granular
--      where pagina='ministerios' and aba='_default')          as granular;
--
--   -- Conferir que cada user nao-admin com legacy tem granular equivalente
--   select pf.nome, pf.role,
--          p.ver, p.adicionar, p.editar, p.excluir,
--          pg.ver as g_ver, pg.adicionar as g_add,
--          pg.editar as g_edit, pg.excluir as g_excl
--   from public.permissoes p
--   join public.perfis pf on pf.id = p.user_id
--   left join public.permissoes_granular pg
--     on pg.user_id = p.user_id and pg.pagina='ministerios' and pg.aba='_default'
--   where p.pagina = 'ministerios' and pf.role <> 'admin'
--   order by pf.nome;
-- =====================================================================
