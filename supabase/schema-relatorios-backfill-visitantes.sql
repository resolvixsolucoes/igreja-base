-- =====================================================================
-- Backfill — aba Visitantes do menu Relatórios (permissoes_granular)
--
-- Espelha, uma unica vez, quem ja tem acesso a pagina Visitantes
-- (visitantes::_default) para a aba nova relatorios::visitantes.
-- Mesmo padrao usado em schema-relatorios-backfill-granular.sql.
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
  pg.user_id,
  'relatorios',
  'visitantes',
  coalesce(pg.ver,       false),
  coalesce(pg.adicionar, false),
  coalesce(pg.editar,    false),
  coalesce(pg.excluir,   false)
from public.permissoes_granular pg
join public.perfis pf on pf.id = pg.user_id
where pg.pagina = 'visitantes' and pg.aba = '_default'
  and pf.role <> 'admin'
on conflict (user_id, pagina, aba) do nothing;


-- =====================================================================
-- Validacao manual:
--
--   select aba, count(*) as usuarios
--   from public.permissoes_granular
--   where pagina = 'relatorios'
--   group by aba
--   order by aba;
--
-- Nota: as permissoes orfas das 6 abas de ministerio removidas
-- (relatorios::comunicacao, integracao, midia, musica, som, levinho)
-- nao sao apagadas por este script — ficam inertes no banco (o front
-- nao renderiza mais essas abas). Limpeza e opcional, nao urgente:
--
--   -- delete from public.permissoes_granular
--   -- where pagina = 'relatorios'
--   --   and aba in ('comunicacao','integracao','midia','musica','som','levinho');
-- =====================================================================
