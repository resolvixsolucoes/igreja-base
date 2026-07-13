-- =====================================================================
-- Fase 7.4 — Backfill 6 paginas restantes (legacy -> permissoes_granular)
--
-- Migra: visitantes, criancas, pedido_oracao, aniversariantes, mesas,
-- financeiro. Todas sem abas naturais — usa sentinela aba='_default'.
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
  p.pagina,
  '_default' as aba,
  coalesce(p.ver,       false) as ver,
  coalesce(p.adicionar, false) as adicionar,
  coalesce(p.editar,    false) as editar,
  coalesce(p.excluir,   false) as excluir
from public.permissoes p
join public.perfis     pf on pf.id = p.user_id
where p.pagina in (
        'visitantes',
        'criancas',
        'pedido_oracao',
        'aniversariantes',
        'mesas',
        'financeiro'
      )
  and pf.role <> 'admin'
on conflict (user_id, pagina, aba) do nothing;


-- =====================================================================
-- Validacao manual:
--
--   -- Por pagina: contagem legacy vs granular
--   select pagina,
--          (select count(*) from public.permissoes p2
--           join public.perfis pf2 on pf2.id = p2.user_id
--           where p2.pagina = pagina and pf2.role <> 'admin')   as legacy,
--          count(*)                                              as granular
--   from public.permissoes_granular
--   where pagina in ('visitantes','criancas','pedido_oracao',
--                    'aniversariantes','mesas','financeiro')
--     and aba = '_default'
--   group by pagina
--   order by pagina;
-- =====================================================================
