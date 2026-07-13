-- =====================================================================
-- Backfill — menu Relatórios (permissoes_granular)
--
-- A pagina nova `relatorios` tem uma aba por relatório consolidado, cada
-- uma independente da permissao original da pagina de origem (ex:
-- `relatorios::musica` != `ministerios_musica::relatorios`). Este script
-- espelha, uma unica vez, o que cada usuario ja tinha na pagina de
-- origem para a aba correspondente em `relatorios`, para ninguem perder
-- acesso no dia da migracao. Dali em diante as duas permissoes vivem
-- independentes (mesmo padrao ja usado pra outras paginas — concessoes
-- futuras sao feitas direto no modal de usuarios.html).
--
-- Idempotente: ON CONFLICT DO NOTHING. Rodadas repetidas nao sobrescrevem
-- ajustes manuais que o admin tenha feito depois pelo modal.
--
-- COMO USAR:
--  1) Rodar no SQL Editor do projeto Prod (NAO no LMS) ANTES do merge.
--  2) Validar com a query de auditoria no rodape.
-- =====================================================================

with mapa(pagina_origem, aba_origem, aba_relatorios) as (
  values
    ('financeiro',               '_default',   'financeiro'),
    ('ministerios_comunicacao',  'relatorios', 'comunicacao'),
    ('ministerios_integracao',   'relatorios', 'integracao'),
    ('ministerios_midia',        'relatorios', 'midia'),
    ('ministerios_musica',       'relatorios', 'musica'),
    ('ministerios_som',          'relatorios', 'som'),
    ('ministerios_levinho',      'relatorios', 'levinho')
)
insert into public.permissoes_granular
  (user_id, pagina, aba, ver, adicionar, editar, excluir)
select
  pg.user_id,
  'relatorios',
  mapa.aba_relatorios,
  coalesce(pg.ver,       false),
  coalesce(pg.adicionar, false),
  coalesce(pg.editar,    false),
  coalesce(pg.excluir,   false)
from public.permissoes_granular pg
join public.perfis pf on pf.id = pg.user_id
join mapa on mapa.pagina_origem = pg.pagina and mapa.aba_origem = pg.aba
where pf.role <> 'admin'
on conflict (user_id, pagina, aba) do nothing;

-- Sem backfill para `relatorios::frequencia_cultos` — é aba nova, sem
-- equivalente anterior. O admin concede manualmente pelo modal em
-- usuarios.html a quem for lançar a frequência dos cultos.


-- =====================================================================
-- Validacao manual:
--
--   select aba, count(*) as usuarios
--   from public.permissoes_granular
--   where pagina = 'relatorios'
--   group by aba
--   order by aba;
-- =====================================================================
