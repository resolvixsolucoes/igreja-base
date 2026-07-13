-- =====================================================================
-- Comunicação entre Ministérios
--
-- Chat 1-pra-1 entre dois ministérios. Acesso só para admins do sistema
-- ou usuários presentes em `ministerio_lideres` (qualquer função:
-- Líder, Co-Líder, Coordenador) de pelo menos um dos dois ministérios
-- da thread.
--
-- Idempotente: pode rodar várias vezes.
-- Roda no SQL Editor do projeto Prod.
-- =====================================================================

-- ─── Helpers ──────────────────────────────────────────────────────────
-- SECURITY DEFINER pra evitar recursão de RLS em ministerio_lideres
-- (ver padrão em schema-fase-9-1-levinho-salas.sql).

create or replace function public.eh_lider_do_ministerio(p_ministerio uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.ministerio_lideres ml
    join public.voluntarios v  on v.id          = ml.voluntario_id
    join public.perfis      pf on pf.membro_id  = v.membro_id
    where pf.id            = auth.uid()
      and ml.ministerio_id = p_ministerio
  );
$$;
grant execute on function public.eh_lider_do_ministerio(uuid) to authenticated;

create or replace function public.eh_lider_de_algum_ministerio()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.ministerio_lideres ml
    join public.voluntarios v  on v.id          = ml.voluntario_id
    join public.perfis      pf on pf.membro_id  = v.membro_id
    where pf.id = auth.uid()
  );
$$;
grant execute on function public.eh_lider_de_algum_ministerio() to authenticated;

-- Lista (ministerio_id, funcao) em que o user atual está em ministerio_lideres.
-- funcao ∈ ('Líder','Co-Líder','Coordenador').
-- DROP necessário pra mudança no tipo de retorno (versão anterior só retornava ministerio_id).
drop function if exists public.meus_ministerios_lideranca();
create or replace function public.meus_ministerios_lideranca()
returns table (ministerio_id uuid, funcao text)
language sql
security definer
stable
set search_path = public
as $$
  select ml.ministerio_id, ml.funcao
  from public.ministerio_lideres ml
  join public.voluntarios v  on v.id          = ml.voluntario_id
  join public.perfis      pf on pf.membro_id  = v.membro_id
  where pf.id = auth.uid();
$$;
grant execute on function public.meus_ministerios_lideranca() to authenticated;


-- ─── Tabela: threads (conversas par-a-par) ───────────────────────────
-- Canonização: sempre ministerio_a < ministerio_b (ordem de uuid) pra
-- garantir uma única thread por par. Constraint + unique impedem duplicar.
create table if not exists public.comunicacao_threads (
  id              uuid primary key default gen_random_uuid(),
  ministerio_a_id uuid not null references public.ministerios(id) on delete cascade,
  ministerio_b_id uuid not null references public.ministerios(id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint comunicacao_threads_par_canonico check (ministerio_a_id < ministerio_b_id),
  constraint comunicacao_threads_par_unico    unique (ministerio_a_id, ministerio_b_id)
);

create index if not exists idx_comunicacao_threads_a on public.comunicacao_threads(ministerio_a_id);
create index if not exists idx_comunicacao_threads_b on public.comunicacao_threads(ministerio_b_id);

alter table public.comunicacao_threads enable row level security;

drop policy if exists comunicacao_threads_select on public.comunicacao_threads;
create policy comunicacao_threads_select on public.comunicacao_threads
  for select to authenticated
  using (
    public.is_admin_prod()
    or public.eh_lider_do_ministerio(ministerio_a_id)
    or public.eh_lider_do_ministerio(ministerio_b_id)
  );

drop policy if exists comunicacao_threads_insert on public.comunicacao_threads;
create policy comunicacao_threads_insert on public.comunicacao_threads
  for insert to authenticated
  with check (
    public.is_admin_prod()
    or public.eh_lider_do_ministerio(ministerio_a_id)
    or public.eh_lider_do_ministerio(ministerio_b_id)
  );

-- Sem update/delete pra thread no front. Admin no SQL editor se precisar.


-- ─── Tabela: mensagens ────────────────────────────────────────────────
create table if not exists public.comunicacao_mensagens (
  id                  uuid primary key default gen_random_uuid(),
  thread_id           uuid not null references public.comunicacao_threads(id) on delete cascade,
  autor_perfil_id     uuid not null references public.perfis(id),
  autor_ministerio_id uuid not null references public.ministerios(id),
  texto               text not null check (length(texto) between 1 and 4000),
  created_at          timestamptz not null default now()
);

create index if not exists idx_comunicacao_mensagens_thread
  on public.comunicacao_mensagens(thread_id, created_at);

alter table public.comunicacao_mensagens enable row level security;

-- Quem pode SELECT/INSERT mensagem é definido pela thread:
-- precisa ser admin OU líder de algum dos dois ministérios da thread.
drop policy if exists comunicacao_mensagens_select on public.comunicacao_mensagens;
create policy comunicacao_mensagens_select on public.comunicacao_mensagens
  for select to authenticated
  using (
    public.is_admin_prod()
    or exists (
      select 1 from public.comunicacao_threads t
      where t.id = thread_id
        and (
          public.eh_lider_do_ministerio(t.ministerio_a_id)
          or public.eh_lider_do_ministerio(t.ministerio_b_id)
        )
    )
  );

drop policy if exists comunicacao_mensagens_insert on public.comunicacao_mensagens;
create policy comunicacao_mensagens_insert on public.comunicacao_mensagens
  for insert to authenticated
  with check (
    autor_perfil_id = auth.uid()
    and (
      public.is_admin_prod()
      or exists (
        select 1 from public.comunicacao_threads t
        where t.id = thread_id
          and autor_ministerio_id in (t.ministerio_a_id, t.ministerio_b_id)
          and (
            public.eh_lider_do_ministerio(t.ministerio_a_id)
            or public.eh_lider_do_ministerio(t.ministerio_b_id)
          )
      )
    )
  );


-- ─── Tabela: leituras (badge de não-lido) ────────────────────────────
-- Cada user marca, por (thread, ministério-em-que-está-falando), a
-- ultima_leitura_at. O front compara com max(created_at) das mensagens
-- da thread cuja autor_ministerio_id != ministerio_id atual.
create table if not exists public.comunicacao_leituras (
  thread_id         uuid not null references public.comunicacao_threads(id) on delete cascade,
  perfil_id         uuid not null references public.perfis(id) on delete cascade,
  ministerio_id     uuid not null references public.ministerios(id) on delete cascade,
  ultima_leitura_at timestamptz not null default now(),
  primary key (thread_id, perfil_id, ministerio_id)
);

alter table public.comunicacao_leituras enable row level security;

drop policy if exists comunicacao_leituras_select on public.comunicacao_leituras;
create policy comunicacao_leituras_select on public.comunicacao_leituras
  for select to authenticated using (perfil_id = auth.uid());

drop policy if exists comunicacao_leituras_upsert on public.comunicacao_leituras;
create policy comunicacao_leituras_upsert on public.comunicacao_leituras
  for all to authenticated
  using      (perfil_id = auth.uid())
  with check (perfil_id = auth.uid());


-- ─── RPC: obter_ou_criar_thread ──────────────────────────────────────
-- Recebe dois ministerio_ids em qualquer ordem, retorna o id da thread
-- (criando se não existir). Faz a canonização aqui, então o front não
-- precisa se preocupar com ordem.
create or replace function public.obter_ou_criar_thread_comunicacao(
  p_min1 uuid,
  p_min2 uuid
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if p_min1 = p_min2 then
    raise exception 'Ministérios devem ser diferentes.';
  end if;
  if p_min1 < p_min2 then
    v_a := p_min1; v_b := p_min2;
  else
    v_a := p_min2; v_b := p_min1;
  end if;

  select id into v_id
  from public.comunicacao_threads
  where ministerio_a_id = v_a and ministerio_b_id = v_b;

  if v_id is null then
    insert into public.comunicacao_threads (ministerio_a_id, ministerio_b_id)
    values (v_a, v_b)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;
grant execute on function public.obter_ou_criar_thread_comunicacao(uuid, uuid) to authenticated;

grant select, insert, update, delete on public.comunicacao_threads   to authenticated;
grant select, insert, update, delete on public.comunicacao_mensagens to authenticated;
grant select, insert, update, delete on public.comunicacao_leituras  to authenticated;
