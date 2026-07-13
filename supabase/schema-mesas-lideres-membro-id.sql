-- =====================================================================
-- Mesas: vincular líderes à tabela membros + auto-permissão na página mesas
--
-- 1) Adiciona colunas `lider_1_membro_id` e `lider_2_membro_id` em `mesas`,
--    referenciando `membros(id)`. O campo legacy `lider` (texto) é mantido
--    pra retrocompatibilidade e display rápido (preenchido pelo front).
--
-- 2) Estende a RPC `get_minhas_permissoes()` com um UNION extra: usuário
--    listado como lider_1 ou lider_2 de qualquer mesa ganha acesso `ver`
--    em `mesas/_default`. O gate fino (editar SOMENTE a própria mesa) é
--    feito no front via comparação de membro_id por card.
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- =====================================================================

alter table public.mesas
  add column if not exists lider_1_membro_id uuid references public.membros(id) on delete set null,
  add column if not exists lider_2_membro_id uuid references public.membros(id) on delete set null;

create index if not exists idx_mesas_lider_1 on public.mesas(lider_1_membro_id);
create index if not exists idx_mesas_lider_2 on public.mesas(lider_2_membro_id);

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

    -- 4) NOVO: líder de mesa → mesas/_default (apenas `ver`).
    --    O front restringe edição/exclusão à própria mesa via membro_id.
    select 'mesas'    as pagina,
           '_default' as aba,
           true       as ver,
           false      as adicionar,
           false      as editar,
           false      as excluir
    from public.mesas mz
    join public.perfis pf on pf.membro_id in (mz.lider_1_membro_id, mz.lider_2_membro_id)
    where pf.id = auth.uid()
  ) todas
  where pagina is not null
  group by pagina, aba;
$$;

grant execute on function public.get_minhas_permissoes() to authenticated;
