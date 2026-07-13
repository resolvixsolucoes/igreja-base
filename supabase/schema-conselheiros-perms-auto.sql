-- =====================================================================
-- Conselheiros: auto-permissão na aba Aconselhamento Pastoral
--
-- Estende `get_minhas_permissoes()` com mais um UNION: usuário cujo
-- `perfis.membro_id` aparece em `conselheiros.membro_id` (e ativo=true)
-- ganha acesso `agenda/pastoral` (ver/adicionar/editar/excluir = true).
--
-- O acesso à aba `agenda/eventos` (Programações) NÃO é concedido —
-- conselheiro só visualiza e gerencia disponibilidade + agendamentos.
-- O front-end (agenda.js) detecta o modo conselheiro pelo membro_id
-- e oculta a seção admin de "Conselheiros".
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

    -- 2) Líderes/co-líderes/coordenadores de ministério → ministerios_X/*
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

    -- 3) Voluntário → ministerios_X/escala (apenas ver)
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

    -- 4) Líder de mesa → mesas/_default (apenas ver; gate fino no front)
    select 'mesas'    as pagina,
           '_default' as aba,
           true       as ver,
           false      as adicionar,
           false      as editar,
           false      as excluir
    from public.mesas mz
    join public.perfis pf on pf.membro_id in (mz.lider_1_membro_id, mz.lider_2_membro_id)
    where pf.id = auth.uid()

    union all

    -- 5) NOVO: Conselheiro ativo → agenda/pastoral (ver+adicionar+editar+excluir).
    --    Permite cadastrar disponibilidades e gerenciar status de agendamentos
    --    recebidos. Não concede acesso à aba 'eventos' (Programações).
    --    O front (agenda.js) detecta pelo membro_id e mostra apenas a aba
    --    pastoral em modo restrito (sem seção admin de conselheiros).
    select 'agenda'   as pagina,
           'pastoral' as aba,
           true       as ver,
           true       as adicionar,
           true       as editar,
           true       as excluir
    from public.conselheiros c
    join public.perfis pf on pf.membro_id = c.membro_id
    where pf.id = auth.uid()
      and c.ativo = true
  ) todas
  where pagina is not null
  group by pagina, aba;
$$;

grant execute on function public.get_minhas_permissoes() to authenticated;

-- =====================================================================
-- Validação manual:
--
--   -- Logado como conselheiro (não-admin):
--   select * from public.get_minhas_permissoes()
--   where pagina = 'agenda';
--   -- esperado: linha (agenda, pastoral, t, t, t, t)
--   -- e NENHUMA linha (agenda, eventos)
-- =====================================================================
