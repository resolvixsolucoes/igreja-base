-- =====================================================================
-- Fase 9.8 — Levinho: liberar aba "Materiais" pra todos os voluntarios
--
-- Mesmo padrao da Fase 9.7 (presentes), agora pra materiais:
--   - RLS de SELECT em levinho_materiais ja permite voluntario do
--     Levinho ler (admin OR lider OR sala_id in minhas_salas_levinho).
--   - Form de "Publicar material" e botao "Excluir" no front sao
--     gateados por `podeGerenciarCache` (admin/lider somente).
--   - Download e link direto pro storage publico (RLS nao aplica).
--
-- Falta liberar `ministerios_levinho::materiais::ver` no
-- get_minhas_permissoes pra que a aba apareca no sidebar/UI.
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- Esta migration substitui a 9.7 (mesma funcao, agora com `presentes`
-- E `materiais` liberados pra voluntario).
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

    -- 4) Voluntario do Levinho: ministerios_levinho::presentes (ver only)
    --    + ministerios_levinho::materiais (ver only).
    --    Acoes mutativas continuam gateadas por RLS na tabela e por
    --    `podeGerenciarCache` / `data-acao-lider` no front.
    select
      'ministerios_levinho' as pagina,
      aba_lib               as aba,
      true, false, false, false
    from public.voluntarios v
    join public.perfis      pf on pf.membro_id = v.membro_id
    join public.ministerios m  on m.id::text   = any(v.ministerio_ids)
    cross join (values ('presentes'), ('materiais')) as t(aba_lib)
    where pf.id = auth.uid()
      and m.nome ilike '%levinho%'
  ) todas
  where pagina is not null
  group by pagina, aba;
$$;

grant execute on function public.get_minhas_permissoes() to authenticated;


-- =====================================================================
-- Validacao manual (logado como voluntario do Levinho):
--
--   select * from public.get_minhas_permissoes()
--    where pagina = 'ministerios_levinho';
--   -- Esperado (ao menos):
--   --   (ministerios_levinho, escala,    true, false, false, false)
--   --   (ministerios_levinho, presentes, true, false, false, false)
--   --   (ministerios_levinho, materiais, true, false, false, false)
-- =====================================================================
