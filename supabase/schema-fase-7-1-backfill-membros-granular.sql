-- =====================================================================
-- Fase 7.1 — Backfill membros (legacy -> permissoes_granular)
--
-- Antes da Fase 7.1, o gate de membros.html olhava AUTH.permissoes
-- (tabela `permissoes`). Apos a 7.1, o gate olha permissoes_granular
-- via temAcessoPagina('membros') / temPermissaoAba('membros',
-- '_default', acao). Sem este backfill, qualquer user nao-admin com
-- permissoes.pagina='membros' perde acesso ate alguem reabrir e salvar
-- o modal dele em usuarios.html.
--
-- O que faz: copia, para cada user nao-admin com linha em
-- public.permissoes onde pagina='membros', uma linha equivalente em
-- public.permissoes_granular com aba='_default' (sentinela ja prevista
-- no schema da Fase 5.1).
--
-- Idempotente: ON CONFLICT DO NOTHING. Rodadas repetidas nao sobrescrevem
-- ajustes manuais que o admin tenha feito depois pelo modal.
--
-- COMO USAR:
--  1) Rodar no SQL Editor do projeto Prod (NAO no LMS) ANTES do merge
--     do PR de codigo da Fase 7.1.
--  2) Validar com a query de auditoria no rodape.
--  3) Mergear o PR de codigo.
-- =====================================================================

insert into public.permissoes_granular
  (user_id, pagina, aba, ver, adicionar, editar, excluir)
select
  p.user_id,
  'membros'  as pagina,
  '_default' as aba,
  coalesce(p.ver,       false) as ver,
  coalesce(p.adicionar, false) as adicionar,
  coalesce(p.editar,    false) as editar,
  coalesce(p.excluir,   false) as excluir
from public.permissoes p
join public.perfis     pf on pf.id = p.user_id
where p.pagina = 'membros'
  and pf.role  <> 'admin'
on conflict (user_id, pagina, aba) do nothing;


-- =====================================================================
-- Validacao manual (rodar separado para conferir o resultado):
--
--   -- 1) Comparar contagem antes vs depois
--   select
--     (select count(*) from public.permissoes p
--      join public.perfis pf on pf.id = p.user_id
--      where p.pagina='membros' and pf.role <> 'admin')      as legacy,
--     (select count(*) from public.permissoes_granular
--      where pagina='membros' and aba='_default')             as granular;
--
--   -- 2) Conferir que cada user nao-admin com legacy tem granular
--   select pf.nome, pf.role, p.ver, p.adicionar, p.editar, p.excluir,
--          pg.ver as g_ver, pg.adicionar as g_add,
--          pg.editar as g_edit, pg.excluir as g_excl
--   from public.permissoes p
--   join public.perfis pf on pf.id = p.user_id
--   left join public.permissoes_granular pg
--     on pg.user_id = p.user_id and pg.pagina='membros' and pg.aba='_default'
--   where p.pagina = 'membros' and pf.role <> 'admin'
--   order by pf.nome;
--
--   -- 3) Verificar fail-closed: users sem legacy nao receberam granular
--   --    (so users com legacy.membros entram no insert acima).
-- =====================================================================
