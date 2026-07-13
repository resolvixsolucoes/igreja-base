-- =====================================================================
-- Fase 9.7 — Levinho: liberar aba "Presentes" pra todos os voluntários
--
-- Contexto:
--   - A RPC `levinho_presentes` ja permite voluntario do Levinho ler
--     presentes (filtra por `minhas_salas_levinho()`).
--   - Mas o gate de UI (aplicarGateAbasGranular) esconde a aba por falta
--     de permissao `ministerios_levinho::presentes::ver`.
--   - Voluntarios so recebem permissao sintetica na aba `escala`
--     (ver schema-perms-lideres-auto.sql).
--
-- Solucao: adicionar UNION em get_minhas_permissoes que libera
--   ministerios_levinho::presentes::ver = true
-- pra todo perfil que e voluntario do ministerio Levinho.
--
-- Apenas `ver`. Acoes (check-out etc) ja sao controladas por RLS na
-- tabela e por gates de lider no front (`data-acao-lider`).
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- =====================================================================

create or replace function public.get_minhas_permissoes()
returns table (
  pagina    text,
  aba       text,
  ver       boolean,
  adicionar boolean,
  editar    boolean,
  excluir   boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select pagina, aba,
         bool_or(ver)       as ver,
         bool_or(adicionar) as adicionar,
         bool_or(editar)    as editar,
         bool_or(excluir)   as excluir
  from (
    -- 1) Granulares (fonte original)
    select pagina, aba, ver, adicionar, editar, excluir
    from public.permissoes_granular
    where user_id = auth.uid()

    union all

    -- 2) Sinteticas: lider/co-lider/coordenador -> ministerios_X::*
    select
      case
        when m.nome ilike '%comunica%' then 'ministerios_comunicacao'
        when m.nome ilike '%integra%'  then 'ministerios_integracao'
        when m.nome ilike '%levinho%'  then 'ministerios_levinho'
        when m.nome ilike '%mídia%' or m.nome ilike '%midia%'   then 'ministerios_midia'
        when m.nome ilike '%música%' or m.nome ilike '%musica%' then 'ministerios_musica'
        when m.nome ilike '%som%'      then 'ministerios_som'
      end                                                         as pagina,
      '*'                                                         as aba,
      true                                                        as ver,
      ml.funcao in ('Líder','Co-Líder')                           as adicionar,
      ml.funcao in ('Líder','Co-Líder')                           as editar,
      ml.funcao in ('Líder','Co-Líder')                           as excluir
    from public.ministerio_lideres ml
    join public.voluntarios v  on v.id          = ml.voluntario_id
    join public.perfis      pf on pf.membro_id  = v.membro_id
    join public.ministerios m  on m.id          = ml.ministerio_id
    where pf.id = auth.uid()

    union all

    -- 3) Sinteticas de voluntario: ministerios_X::escala (ver only)
    select
      case
        when m.nome ilike '%comunica%' then 'ministerios_comunicacao'
        when m.nome ilike '%integra%'  then 'ministerios_integracao'
        when m.nome ilike '%levinho%'  then 'ministerios_levinho'
        when m.nome ilike '%mídia%' or m.nome ilike '%midia%'   then 'ministerios_midia'
        when m.nome ilike '%música%' or m.nome ilike '%musica%' then 'ministerios_musica'
        when m.nome ilike '%som%'      then 'ministerios_som'
      end       as pagina,
      'escala'  as aba,
      true, false, false, false
    from public.voluntarios v
    join public.perfis      pf on pf.membro_id  = v.membro_id
    join public.ministerios m  on m.id::text    = any(v.ministerio_ids)
    where pf.id = auth.uid()

    union all

    -- 4) NOVO: voluntario do Levinho ganha ministerios_levinho::presentes
    --    (ver only). Acoes sao gateadas por RLS / data-acao-lider.
    select
      'ministerios_levinho' as pagina,
      'presentes'           as aba,
      true, false, false, false
    from public.voluntarios v
    join public.perfis      pf on pf.membro_id = v.membro_id
    join public.ministerios m  on m.id::text   = any(v.ministerio_ids)
    where pf.id = auth.uid()
      and m.nome ilike '%levinho%'
  ) todas
  where pagina is not null
  group by pagina, aba;
$$;

grant execute on function public.get_minhas_permissoes() to authenticated;


-- =====================================================================
-- Validacao manual:
--
--   -- Como voluntario do Levinho (logado), conferir:
--   select * from public.get_minhas_permissoes()
--    where pagina = 'ministerios_levinho';
--   -- Esperado: ver linha (ministerios_levinho, presentes, ver=true).
-- =====================================================================
