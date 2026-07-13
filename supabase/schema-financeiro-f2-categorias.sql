-- =====================================================================
-- Financeiro F.2 — Categorias normalizadas
--
-- Substitui categoria (texto livre) por FK para financeiro_categorias.
-- Coluna `categoria` (texto) e mantida por compat — front grava ambos
-- por enquanto. Drop em fase futura apos confirmar nada le mais o texto.
--
-- Idempotente. Roda no SQL Editor do Prod.
-- Pre-requisito: F.1 ja aplicada (RLS + auditoria + tem_perm_granular).
-- =====================================================================


-- ─── 1) Tabela ─────────────────────────────────────────────────────────
create table if not exists public.financeiro_categorias (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  tipo      text not null check (tipo in ('entrada','saida','ambos')),
  cor       text,
  icone     text,
  ativo     boolean not null default true,
  ordem     int not null default 0,
  criado_em timestamptz not null default now()
);

-- Unique case-insensitive em nome (sem citext pra nao adicionar extensao).
create unique index if not exists financeiro_categorias_nome_uniq
  on public.financeiro_categorias (lower(nome));


-- ─── 2) Backfill de categorias a partir do texto livre existente ───────
-- O backfill so executa se a coluna texto `categoria` existir na tabela
-- (algumas instalacoes podem nao ter a coluna). Idempotente.
do $$
declare
  v_tem_coluna boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='financeiro' and column_name='categoria'
  ) into v_tem_coluna;

  if v_tem_coluna then
    -- EXECUTE adia o parsing pra runtime — sem isso o plpgsql pode
    -- reclamar de f.categoria mesmo dentro do IF.
    execute $sql$
      insert into public.financeiro_categorias (nome, tipo)
      select sub.nome, sub.tipo
      from (
        select
          initcap(trim(f.categoria)) as nome,
          case
            when bool_and(f.tipo = 'entrada') then 'entrada'
            when bool_and(f.tipo = 'saida')   then 'saida'
            else 'ambos'
          end as tipo
        from public.financeiro f
        where f.categoria is not null
          and length(trim(f.categoria)) > 0
        group by initcap(trim(f.categoria))
      ) sub
      where not exists (
        select 1 from public.financeiro_categorias c
        where lower(c.nome) = lower(sub.nome)
      )
    $sql$;
  end if;
end $$;

-- Categoria sentinela pra registros sem texto (e default futuro).
insert into public.financeiro_categorias (nome, tipo)
select 'Sem categoria', 'ambos'
where not exists (
  select 1 from public.financeiro_categorias
  where lower(nome) = 'sem categoria'
);


-- ─── 3) FK em financeiro ───────────────────────────────────────────────
alter table public.financeiro
  add column if not exists categoria_id uuid
    references public.financeiro_categorias(id);

create index if not exists financeiro_categoria_id_idx
  on public.financeiro (categoria_id);


-- ─── 4) Backfill de categoria_id ───────────────────────────────────────
-- Se a coluna texto existir, vincula pelo nome; senao, joga tudo em
-- 'Sem categoria'. Em ambos os casos so toca em linhas com FK nula.
do $$
declare
  v_tem_coluna boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='financeiro' and column_name='categoria'
  ) into v_tem_coluna;

  if v_tem_coluna then
    execute $sql$
      update public.financeiro f
      set categoria_id = c.id
      from public.financeiro_categorias c
      where f.categoria_id is null
        and lower(c.nome) = lower(
          coalesce(nullif(trim(f.categoria), ''), 'Sem categoria')
        )
    $sql$;
  else
    update public.financeiro f
    set categoria_id = c.id
    from public.financeiro_categorias c
    where f.categoria_id is null
      and lower(c.nome) = 'sem categoria';
  end if;
end $$;


-- ─── 5) RLS ────────────────────────────────────────────────────────────
alter table public.financeiro_categorias enable row level security;

-- Leitura: qualquer usuario com permissao de ver financeiro.
drop policy if exists financeiro_categorias_select on public.financeiro_categorias;
create policy financeiro_categorias_select on public.financeiro_categorias
  for select to authenticated
  using (public.tem_perm_granular('financeiro','_default','ver'));

-- Escrita (criar/editar/desativar categoria): so admin.
drop policy if exists financeiro_categorias_write on public.financeiro_categorias;
create policy financeiro_categorias_write on public.financeiro_categorias
  for all to authenticated
  using      (public.is_admin_prod())
  with check (public.is_admin_prod());


-- =====================================================================
-- Validacao manual:
--
--   -- 1) Categorias criadas a partir do legacy
--   select nome, tipo from public.financeiro_categorias order by nome;
--
--   -- 2) Lancamentos vinculados (esperado: zero linhas com categoria_id null
--   --    desde que F.1 ja tenha rodado e existam dados)
--   select count(*) filter (where categoria_id is null) as sem_fk,
--          count(*) filter (where categoria_id is not null) as com_fk
--   from public.financeiro;
--
--   -- 3) Join funciona via PostgREST embed:
--   --    db.from('financeiro').select('*, financeiro_categorias(nome,cor)')
-- =====================================================================

grant select, insert, update, delete on public.financeiro_categorias to authenticated;
