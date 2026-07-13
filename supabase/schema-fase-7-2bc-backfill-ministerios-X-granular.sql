-- =====================================================================
-- Fase 7.2b/c — Backfill ministerios-X (legacy -> permissoes_granular)
--
-- Cobre os 6 ministerios que tem subpagina propria:
--   som, musica, levinho, midia, comunicacao, integracao
--
-- Funde DUAS fontes legacy em permissoes_granular:
--   1. Tabela `permissoes` (slug-based, por user) com pagina='ministerios_X'
--      -> permissoes_granular(pagina='ministerios_X', aba='_default')
--      Esta e a "permissao geral do ministerio" (gate da pagina).
--   2. Tabela `ministerio_abas_permissoes` (role-based, por aba)
--      -> permissoes_granular(pagina='ministerios_X', aba=Y)
--      Expansao role->user: cada user com aquele role recebe a permissao.
--      Como legacy tem so (ver, editar), mapeamos:
--        ver=true   -> ver=true
--        editar=true -> adicionar=editar=excluir=true
--      Justificativa: legacy "editar" historicamente significou
--      "pode modificar tudo" — preservar a capacidade que o user tinha.
--
-- Idempotente: ON CONFLICT DO NOTHING. Rodadas repetidas nao sobrescrevem
-- ajustes manuais que o admin tenha feito depois pelo modal.
--
-- COMO USAR:
--  1) Rodar no SQL Editor do projeto Prod (NAO no LMS) ANTES do merge
--     do PR de codigo das Fases 7.2b e 7.2c.
--  2) Validar com a query de auditoria no rodape.
-- =====================================================================

-- ─── Mapeamento slug_pagina <-> chave de nome (lowercase, sem acento) ──
-- Usado nos dois INSERTs abaixo. translate() remove os acentos comuns
-- pt-BR sem precisar da extensao unaccent.
with mapa(slug_pagina, chave_nome) as (
  values
    ('ministerios_som',         'som'),
    ('ministerios_musica',      'musica'),
    ('ministerios_levinho',     'levinho'),
    ('ministerios_midia',       'midia'),
    ('ministerios_comunicacao', 'comunicacao'),
    ('ministerios_integracao',  'integracao')
)
-- ─── Fonte 1: permissoes legacy (gate da pagina) -> aba='_default' ───
insert into public.permissoes_granular
  (user_id, pagina, aba, ver, adicionar, editar, excluir)
select
  p.user_id,
  mapa.slug_pagina,
  '_default',
  coalesce(p.ver,       false),
  coalesce(p.adicionar, false),
  coalesce(p.editar,    false),
  coalesce(p.excluir,   false)
from public.permissoes p
join public.perfis     pf on pf.id = p.user_id
join mapa              on mapa.slug_pagina = p.pagina
where pf.role <> 'admin'
on conflict (user_id, pagina, aba) do nothing;


-- ─── Fonte 2: ministerio_abas_permissoes (role-based) -> abas granulares ──
with mapa(slug_pagina, chave_nome) as (
  values
    ('ministerios_som',         'som'),
    ('ministerios_musica',      'musica'),
    ('ministerios_levinho',     'levinho'),
    ('ministerios_midia',       'midia'),
    ('ministerios_comunicacao', 'comunicacao'),
    ('ministerios_integracao',  'integracao')
)
insert into public.permissoes_granular
  (user_id, pagina, aba, ver, adicionar, editar, excluir)
select
  pf.id,
  mapa.slug_pagina,
  map.aba,
  coalesce(map.ver,    false),
  coalesce(map.editar, false),  -- editar legacy -> CRUD completo
  coalesce(map.editar, false),
  coalesce(map.editar, false)
from public.perfis pf
join public.ministerio_abas_permissoes map on map.role = pf.role
join public.ministerios m  on m.id = map.ministerio_id
join mapa on lower(translate(
              m.nome,
              'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
              'aeiouaoaeioucaeiouaoaeiouc'
            )) like mapa.chave_nome || '%'
where pf.role <> 'admin'
on conflict (user_id, pagina, aba) do nothing;


-- =====================================================================
-- Validacao manual:
--
--   -- 1) Por ministerio: contagem legacy (permissoes) vs granular (_default)
--   select pagina,
--          (select count(*) from public.permissoes p2
--           join public.perfis pf2 on pf2.id = p2.user_id
--           where p2.pagina = pagina and pf2.role <> 'admin')          as legacy,
--          count(*) filter (where aba='_default')                       as granular_default
--   from public.permissoes_granular
--   where pagina in ('ministerios_som','ministerios_musica','ministerios_levinho',
--                    'ministerios_midia','ministerios_comunicacao','ministerios_integracao')
--   group by pagina
--   order by pagina;
--
--   -- 2) Por aba: amostra
--   select pagina, aba, count(*) as users
--   from public.permissoes_granular
--   where pagina like 'ministerios\_%' and aba <> '_default'
--   group by pagina, aba
--   order by pagina, aba;
--
--   -- 3) Conferir match dos nomes (deve trazer 6 linhas, uma por ministerio)
--   select m.id, m.nome,
--          lower(translate(m.nome,
--                'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
--                'aeiouaoaeioucaeiouaoaeiouc')) as nome_normalizado
--   from public.ministerios m
--   where lower(translate(m.nome,
--                'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
--                'aeiouaoaeioucaeiouaoaeiouc'))
--         ~ '^(som|musica|levinho|midia|comunicacao|integracao)';
-- =====================================================================
