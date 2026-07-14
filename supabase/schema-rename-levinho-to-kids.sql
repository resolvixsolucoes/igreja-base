-- =====================================================================
-- Renomeia o ministério "Levinho" para "Kids" no banco (demo/produção).
-- Rode no SQL Editor do Supabase depois do deploy dos arquivos HTML/JS.
--
-- Impacto:
--   - Nome do ministério no sidebar e listagens                → "Kids"
--   - Label da página em permissoes_paginas                    → "Kids"
--   - Slug 'ministerios_levinho' é PRESERVADO (compatibilidade
--     com URLs e código legado — nada quebra)
-- =====================================================================

-- 1) Renomeia o ministério na tabela `ministerios`
update public.ministerios
   set nome = 'Kids'
 where nome ilike 'levinho';

-- 2) Renomeia o label na tabela `permissoes_paginas` (mantém o key/slug)
update public.permissoes_paginas
   set label = 'Kids'
 where key = 'ministerios_levinho';

-- Verificação (opcional — rode em uma segunda query pra conferir)
-- select id, nome from public.ministerios where nome ilike '%kids%';
-- select key, label from public.permissoes_paginas where key = 'ministerios_levinho';
