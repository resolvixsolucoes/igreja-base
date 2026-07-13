-- =====================================================================
-- Permissões automáticas para líderes e voluntários de ministério
--
-- 1) Líderes (em `ministerio_lideres`) ganham acesso ao `ministerios_X`
--    inteiro (todas as abas) sem precisar de linha em permissoes_granular:
--
--      • Líder      → ver + adicionar + editar + excluir
--      • Co-Líder   → ver + adicionar + editar + excluir
--      • Coordenador→ ver  (somente)
--
-- 2) Voluntários (em `voluntarios.ministerio_ids`) ganham V/A/E/X SOMENTE
--    na aba `escala` do ministerios_X — pra gerenciarem a própria
--    disponibilidade. Botões exclusivos de liderança (Novo Evento,
--    Aceitar disponibilidade) são gateados separadamente no front via
--    `data-acao-lider`.
--
-- Implementação: a RPC get_minhas_permissoes() faz UNION das permissões
-- granulares com linhas sintéticas. Líderes usam aba='*' (wildcard),
-- voluntários usam aba='escala'. O front (temPermissaoAba) honra o
-- wildcard pra liberar qualquer aba da página.
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
  -- Permissões explícitas + sintéticas (líderes), agregadas por (pagina,aba)
  -- com bool_or pra que duas fontes nunca diminuam acesso.
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

    -- 2) Sintéticas: usuário é líder/co-líder/coordenador de algum
    --    ministério X → libera ministerios_X com aba wildcard '*'.
    --    Mapeia ministerio.nome → slug 'ministerios_<slug>'.
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

    -- 3) Sintéticas de voluntário: pra cada ministério em
    --    voluntarios.ministerio_ids do user, libera ministerios_X::escala
    --    com APENAS `ver`. A própria disponibilidade (criar/editar/
    --    excluir) é controlada por RLS na tabela `disponibilidade` e
    --    pelos botões fixos da UI (sem `data-acao`). Dar V/A/E/X aqui
    --    abriria botões admin (Novo Evento, Escalar, etc).
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
    -- voluntarios.ministerio_ids é text[]; cast pra comparar com uuid.
    join public.ministerios m  on m.id::text    = any(v.ministerio_ids)
    where pf.id = auth.uid()
  ) todas
  where pagina is not null   -- descarta ministério sem mapeamento de slug
  group by pagina, aba;
$$;

grant execute on function public.get_minhas_permissoes() to authenticated;
