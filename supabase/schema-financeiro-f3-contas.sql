-- =====================================================================
-- Financeiro F.3 — Multi-contas + formas de pagamento
--
-- Cria infraestrutura para multiplas contas (caixa, banco, pix...) e
-- formas de pagamento. Hoje a igreja opera com 1 conta — o seed cria
-- "Conta Principal" e vincula todos os lancamentos existentes a ela,
-- mantendo o comportamento atual sem mudanca visivel obrigatoria.
--
-- Idempotente. Pre-requisito: F.1 (RLS, tem_perm_granular) e F.2.
-- =====================================================================


-- ─── 1) financeiro_contas ──────────────────────────────────────────────
create table if not exists public.financeiro_contas (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  tipo           text not null check (tipo in ('caixa','banco','pix','cartao')),
  saldo_inicial  numeric(12,2) not null default 0,
  ministerio_id  uuid references public.ministerios(id) on delete set null,
  ativo          boolean not null default true,
  ordem          int not null default 0,
  criado_em      timestamptz not null default now()
);

create unique index if not exists financeiro_contas_nome_uniq
  on public.financeiro_contas (lower(nome));


-- ─── 2) financeiro_formas_pgto ─────────────────────────────────────────
create table if not exists public.financeiro_formas_pgto (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  ativo     boolean not null default true,
  ordem     int not null default 0,
  criado_em timestamptz not null default now()
);

create unique index if not exists financeiro_formas_pgto_nome_uniq
  on public.financeiro_formas_pgto (lower(nome));


-- ─── 3) Seeds ──────────────────────────────────────────────────────────
-- Conta principal default (cria so se ainda nao existir nenhuma conta).
insert into public.financeiro_contas (nome, tipo, saldo_inicial, ordem)
select 'Conta Principal', 'caixa', 0, 0
where not exists (select 1 from public.financeiro_contas);

-- Formas de pagamento padrao
insert into public.financeiro_formas_pgto (nome, ordem)
select v.nome, v.ordem from (values
  ('Dinheiro', 0),
  ('Pix',      1),
  ('Débito',   2),
  ('Crédito',  3),
  ('TED',      4),
  ('Boleto',   5)
) as v(nome, ordem)
where not exists (
  select 1 from public.financeiro_formas_pgto f
  where lower(f.nome) = lower(v.nome)
);


-- ─── 4) FKs em financeiro ──────────────────────────────────────────────
alter table public.financeiro
  add column if not exists conta_id      uuid references public.financeiro_contas(id),
  add column if not exists forma_pgto_id uuid references public.financeiro_formas_pgto(id);

create index if not exists financeiro_conta_id_idx       on public.financeiro (conta_id);
create index if not exists financeiro_forma_pgto_id_idx  on public.financeiro (forma_pgto_id);


-- ─── 5) Backfill: vincula lancamentos sem conta a Conta Principal ──────
update public.financeiro f
set conta_id = c.id
from public.financeiro_contas c
where f.conta_id is null
  and lower(c.nome) = 'conta principal';


-- ─── 6) RLS ────────────────────────────────────────────────────────────
alter table public.financeiro_contas      enable row level security;
alter table public.financeiro_formas_pgto enable row level security;

-- Leitura: quem tem ver financeiro.
drop policy if exists financeiro_contas_select on public.financeiro_contas;
create policy financeiro_contas_select on public.financeiro_contas
  for select to authenticated
  using (public.tem_perm_granular('financeiro','_default','ver'));

drop policy if exists financeiro_formas_pgto_select on public.financeiro_formas_pgto;
create policy financeiro_formas_pgto_select on public.financeiro_formas_pgto
  for select to authenticated
  using (public.tem_perm_granular('financeiro','_default','ver'));

-- Escrita: so admin.
drop policy if exists financeiro_contas_write on public.financeiro_contas;
create policy financeiro_contas_write on public.financeiro_contas
  for all to authenticated
  using      (public.is_admin_prod())
  with check (public.is_admin_prod());

drop policy if exists financeiro_formas_pgto_write on public.financeiro_formas_pgto;
create policy financeiro_formas_pgto_write on public.financeiro_formas_pgto
  for all to authenticated
  using      (public.is_admin_prod())
  with check (public.is_admin_prod());


-- =====================================================================
-- Validacao manual:
--
--   select nome, tipo, saldo_inicial from public.financeiro_contas
--   order by ordem;
--   -- esperado: 1 linha, "Conta Principal | caixa | 0.00"
--
--   select nome from public.financeiro_formas_pgto order by ordem;
--   -- esperado: Dinheiro, Pix, Débito, Crédito, TED, Boleto
--
--   select count(*) filter (where conta_id is null)     as sem_conta,
--          count(*) filter (where conta_id is not null) as com_conta
--   from public.financeiro;
--   -- esperado: sem_conta = 0
-- =====================================================================

grant select, insert, update, delete on public.financeiro_contas      to authenticated;
grant select, insert, update, delete on public.financeiro_formas_pgto to authenticated;
