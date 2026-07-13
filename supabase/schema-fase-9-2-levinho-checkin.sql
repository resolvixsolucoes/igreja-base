-- =====================================================================
-- Fase 9.2 — Levinho: check-in público + lista de presentes
--
-- Depende de: schema-fase-9-1-levinho-salas.sql (precisa rodar antes).
--
-- O que cria:
--   1. Tabela levinho_checkins (presença das crianças por evento/dia)
--   2. RPC levinho_checkin_buscar_filhos(p_termo)  — busca pública por nome
--   3. RPC levinho_checkin_registrar(...)         — cria checkin + código
--   4. RPC levinho_presentes(p_data)              — lista pra voluntário
--   5. RLS: anon NÃO acessa a tabela direto; só via RPCs SECURITY DEFINER
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- =====================================================================


-- ─── 1. Tabela: check-ins ────────────────────────────────────────────
create table if not exists public.levinho_checkins (
  id                       uuid primary key default gen_random_uuid(),
  filho_id                 uuid references public.filhos(id) on delete set null,
  crianca_nome             text     not null,
  crianca_idade            smallint not null,
  sala_id                  smallint not null references public.levinho_salas(id),
  data_evento              date     not null default current_date,
  responsavel_nome         text     not null,
  responsavel_telefone     text     not null,
  responsavel_membro_id    uuid references public.membros(id) on delete set null,
  codigo_retirada          text     not null,
  hora_entrada             timestamptz not null default now(),
  hora_saida               timestamptz,
  responsavel_saida_nome   text,
  retirado_por_user        uuid references public.perfis(id) on delete set null,
  eh_visitante             boolean generated always as (filho_id is null) stored
);

create unique index if not exists uq_levinho_checkins_codigo_dia
  on public.levinho_checkins(data_evento, codigo_retirada);

create index if not exists idx_levinho_checkins_data_sala
  on public.levinho_checkins(data_evento, sala_id);

create index if not exists idx_levinho_checkins_filho
  on public.levinho_checkins(filho_id) where filho_id is not null;

alter table public.levinho_checkins enable row level security;

-- SELECT: admin OR líder OR (sala_id IN minhas_salas)
drop policy if exists levinho_checkins_select on public.levinho_checkins;
create policy levinho_checkins_select on public.levinho_checkins
  for select to authenticated
  using (
    public.is_admin_prod()
    or public.eh_lider_levinho()
    or sala_id in (select sala_id from public.minhas_salas_levinho())
  );

-- INSERT/UPDATE/DELETE direto na tabela: só admin/líder.
-- O check-in público entra via RPC SECURITY DEFINER (não passa por RLS).
drop policy if exists levinho_checkins_write on public.levinho_checkins;
create policy levinho_checkins_write on public.levinho_checkins
  for all to authenticated
  using      (public.is_admin_prod() or public.eh_lider_levinho())
  with check (public.is_admin_prod() or public.eh_lider_levinho());


-- ─── 2. Helper: gerar código alfanumérico de 4 chars ─────────────────
-- Sem 0/O/1/I/L pra não confundir na hora de ditar/digitar.
create or replace function public._levinho_gen_codigo()
returns text
language plpgsql
volatile
as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  resultado text := '';
  i int;
begin
  for i in 1..4 loop
    resultado := resultado ||
      substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  end loop;
  return resultado;
end;
$$;


-- ─── 3. Helper: idade a partir de data de nascimento ─────────────────
create or replace function public._levinho_idade(p_nasc date)
returns smallint
language sql
immutable
as $$
  select extract(year from age(current_date, p_nasc))::smallint;
$$;


-- ─── 4. RPC pública: buscar filhos por nome (autocomplete) ───────────
-- Retorna até 10 resultados. Usa SECURITY DEFINER pra contornar RLS de
-- filhos/membros (apenas leitura mínima necessária pro check-in).
create or replace function public.levinho_checkin_buscar_filhos(p_termo text)
returns table (
  filho_id          uuid,
  crianca_nome      text,
  idade             smallint,
  responsavel_nome  text,
  responsavel_id    uuid
)
language sql
security definer
stable
set search_path = public
as $$
  select
    f.id,
    f.nome,
    public._levinho_idade(f.data_nascimento),
    coalesce(m.nome, ''),
    f.membro_id
  from public.filhos f
  left join public.membros m on m.id = f.membro_id
  where f.data_nascimento is not null
    and lower(translate(f.nome,
          'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
          'aeiouaoaeioucaeiouaoaeiouc'))
        like '%' || lower(translate(trim(p_termo),
          'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
          'aeiouaoaeioucaeiouaoaeiouc')) || '%'
    and public._levinho_idade(f.data_nascimento) between 0 and 12
  order by f.nome
  limit 10;
$$;
grant execute on function public.levinho_checkin_buscar_filhos(text) to anon, authenticated;


-- ─── 5. RPC pública: registrar check-in ──────────────────────────────
-- Se p_filho_id for fornecido: usa filhos.nome e idade calculada.
-- Senão: visitante — exige p_crianca_nome e p_idade.
-- Sempre exige nome do responsável e telefone.
-- Retorna o código gerado, sala destinada e id do checkin.
create or replace function public.levinho_checkin_registrar(
  p_filho_id          uuid,
  p_crianca_nome      text,
  p_idade             smallint,
  p_responsavel_nome  text,
  p_telefone          text,
  p_data              date default current_date
)
returns table (
  checkin_id   uuid,
  codigo       text,
  sala_id      smallint,
  sala_nome    text,
  crianca_nome text,
  idade        smallint
)
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_filho        public.filhos%rowtype;
  v_idade        smallint;
  v_nome         text;
  v_sala_id      smallint;
  v_sala_nome    text;
  v_responsavel_membro uuid;
  v_codigo       text;
  v_id           uuid;
  v_tentativas   int := 0;
begin
  -- Sanidade
  if coalesce(trim(p_responsavel_nome), '') = '' then
    raise exception 'Nome do responsável é obrigatório.';
  end if;
  if coalesce(trim(p_telefone), '') = '' then
    raise exception 'Telefone do responsável é obrigatório.';
  end if;

  -- Resolve criança
  if p_filho_id is not null then
    select * into v_filho from public.filhos where id = p_filho_id;
    if not found or v_filho.data_nascimento is null then
      raise exception 'Criança não encontrada.';
    end if;
    v_idade := public._levinho_idade(v_filho.data_nascimento);
    v_nome  := v_filho.nome;
    v_responsavel_membro := v_filho.membro_id;
  else
    if coalesce(trim(p_crianca_nome), '') = '' then
      raise exception 'Nome da criança é obrigatório.';
    end if;
    if p_idade is null or p_idade < 0 or p_idade > 12 then
      raise exception 'Idade inválida (0 a 12).';
    end if;
    v_idade := p_idade;
    v_nome  := trim(p_crianca_nome);
    v_responsavel_membro := null;
  end if;

  -- Acha sala pela idade
  select s.id, s.nome into v_sala_id, v_sala_nome
  from public.levinho_salas s
  where v_idade between s.idade_min and s.idade_max
  order by s.ordem
  limit 1;

  if v_sala_id is null then
    raise exception 'Nenhuma salinha cobre a idade % anos.', v_idade;
  end if;

  -- Gera código único pro dia (até 20 tentativas)
  loop
    v_codigo := public._levinho_gen_codigo();
    v_tentativas := v_tentativas + 1;
    begin
      insert into public.levinho_checkins(
        filho_id, crianca_nome, crianca_idade, sala_id, data_evento,
        responsavel_nome, responsavel_telefone, responsavel_membro_id,
        codigo_retirada
      ) values (
        p_filho_id, v_nome, v_idade, v_sala_id, p_data,
        trim(p_responsavel_nome), trim(p_telefone), v_responsavel_membro,
        v_codigo
      ) returning id into v_id;
      exit;
    exception when unique_violation then
      if v_tentativas >= 20 then
        raise exception 'Não foi possível gerar código único — tente novamente.';
      end if;
    end;
  end loop;

  return query select v_id, v_codigo, v_sala_id, v_sala_nome, v_nome, v_idade;
end;
$$;
grant execute on function public.levinho_checkin_registrar(uuid, text, smallint, text, text, date)
  to anon, authenticated;


-- ─── 6. RPC: lista de presentes (voluntário/líder/admin) ─────────────
-- Filtra por salas do user (RLS já cobre, mas a RPC simplifica a query
-- e expõe só o que voluntário precisa ver).
create or replace function public.levinho_presentes(p_data date default current_date)
returns table (
  checkin_id            uuid,
  crianca_nome          text,
  crianca_idade         smallint,
  sala_id               smallint,
  sala_nome             text,
  responsavel_nome      text,
  responsavel_telefone  text,
  codigo_retirada       text,
  hora_entrada          timestamptz,
  hora_saida            timestamptz,
  eh_visitante          boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    c.id, c.crianca_nome, c.crianca_idade,
    c.sala_id, s.nome,
    c.responsavel_nome, c.responsavel_telefone,
    c.codigo_retirada, c.hora_entrada, c.hora_saida, c.eh_visitante
  from public.levinho_checkins c
  join public.levinho_salas    s on s.id = c.sala_id
  where c.data_evento = p_data
    and (
      public.is_admin_prod()
      or public.eh_lider_levinho()
      or c.sala_id in (select sala_id from public.minhas_salas_levinho())
    )
  order by s.ordem, c.hora_entrada desc;
$$;
grant execute on function public.levinho_presentes(date) to authenticated;


-- =====================================================================
-- Validação manual:
--
--   -- 1) Tabela criada com policies
--   select tablename, policyname, cmd, permissive
--   from pg_policies where tablename = 'levinho_checkins';
--
--   -- 2) Buscar filho (anon-callable) — testar pelo SQL Editor:
--   select * from public.levinho_checkin_buscar_filhos('joa');
--
--   -- 3) Registrar checkin (smoke):
--   select * from public.levinho_checkin_registrar(
--     null, 'Fulano Teste', 4::smallint, 'Ciclana Responsavel', '11999990000');
--
--   -- 4) Lista de presentes (logado como voluntário):
--   select * from public.levinho_presentes(current_date);
--
--   -- 5) Conferir que anon NÃO consegue ler a tabela direto:
--   --    no console do navegador SEM login:
--   --    db.from('levinho_checkins').select('*')   -> deve dar 0 linhas / erro RLS
-- =====================================================================

grant select, insert, update, delete on public.levinho_checkins to authenticated;
