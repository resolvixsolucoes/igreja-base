-- =====================================================================
-- Fase 9.3 — Levinho: nomenclatura, vínculo com agenda, materiais
--
-- Depende de: 9.1 (salas) e 9.2 (checkins) já aplicadas.
--
-- Mudanças:
--   1. Renomeia salas: "Levinho 0-3", "Levinho 3-6", "Levinho 6-11"
--      e ajusta faixa etária: 0-2, 3-5, 6-11.
--   2. levinho_checkins.evento_id  (FK eventos_igreja, nullable)
--   3. ministerio_escala.sala_id   (FK levinho_salas, nullable; só Levinho usa)
--   4. levinho_materiais (nova tabela; sala_id NOT NULL)
--   5. RPC levinho_checkin_registrar agora aceita p_evento_id
--   6. RPC levinho_presentes(p_data, p_evento_id) — filtro por evento
--   7. RPC levinho_eventos_disponiveis() — eventos do Levinho upcoming
--
-- Idempotente.
-- =====================================================================


-- ─── 1. Renomeia salas e atualiza faixas ─────────────────────────────
update public.levinho_salas
   set nome = 'Levinho 0~3',  idade_min = 0, idade_max = 2,  ordem = 1 where id = 1;
update public.levinho_salas
   set nome = 'Levinho 3~6',  idade_min = 3, idade_max = 5,  ordem = 2 where id = 2;
update public.levinho_salas
   set nome = 'Levinho 6~11', idade_min = 6, idade_max = 11, ordem = 3 where id = 3;


-- ─── 2. evento_id em levinho_checkins ────────────────────────────────
alter table public.levinho_checkins
  add column if not exists evento_id uuid
  references public.eventos_igreja(id) on delete set null;

create index if not exists idx_levinho_checkins_evento
  on public.levinho_checkins(evento_id) where evento_id is not null;


-- ─── 3. sala_id em ministerio_escala ─────────────────────────────────
alter table public.ministerio_escala
  add column if not exists sala_id smallint
  references public.levinho_salas(id) on delete set null;

create index if not exists idx_ministerio_escala_sala
  on public.ministerio_escala(sala_id) where sala_id is not null;


-- ─── 4. Tabela levinho_materiais ─────────────────────────────────────
create table if not exists public.levinho_materiais (
  id            uuid primary key default gen_random_uuid(),
  sala_id       smallint not null references public.levinho_salas(id),
  titulo        text     not null,
  descricao     text,
  categoria     text,
  arquivo_url   text,
  arquivo_nome  text,
  criado_por    text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_levinho_materiais_sala
  on public.levinho_materiais(sala_id, created_at desc);

alter table public.levinho_materiais enable row level security;

drop policy if exists levinho_materiais_select on public.levinho_materiais;
create policy levinho_materiais_select on public.levinho_materiais
  for select to authenticated
  using (
    public.is_admin_prod()
    or public.eh_lider_levinho()
    or sala_id in (select sala_id from public.minhas_salas_levinho())
  );

drop policy if exists levinho_materiais_write on public.levinho_materiais;
create policy levinho_materiais_write on public.levinho_materiais
  for all to authenticated
  using      (public.is_admin_prod() or public.eh_lider_levinho())
  with check (public.is_admin_prod() or public.eh_lider_levinho());


-- ─── 5. RPC: levinho_checkin_registrar — recriar com p_evento_id ─────
-- Drop antigo (assinatura mudou), cria novo.
drop function if exists public.levinho_checkin_registrar(uuid, text, smallint, text, text, date);

create or replace function public.levinho_checkin_registrar(
  p_filho_id          uuid,
  p_crianca_nome      text,
  p_idade             smallint,
  p_responsavel_nome  text,
  p_telefone          text,
  p_evento_id         uuid default null,
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
  v_data_evento  date := p_data;
begin
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
    if p_idade is null or p_idade < 0 or p_idade > 11 then
      raise exception 'Idade inválida (0 a 11).';
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

  -- Se evento informado, usa a data do evento (não a data atual)
  if p_evento_id is not null then
    select e.data into v_data_evento
    from public.eventos_igreja e
    where e.id = p_evento_id;
    if v_data_evento is null then
      v_data_evento := p_data;
    end if;
  end if;

  -- Gera código único pro dia
  loop
    v_codigo := public._levinho_gen_codigo();
    v_tentativas := v_tentativas + 1;
    begin
      insert into public.levinho_checkins(
        filho_id, crianca_nome, crianca_idade, sala_id, data_evento, evento_id,
        responsavel_nome, responsavel_telefone, responsavel_membro_id,
        codigo_retirada
      ) values (
        p_filho_id, v_nome, v_idade, v_sala_id, v_data_evento, p_evento_id,
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
grant execute on function public.levinho_checkin_registrar(uuid, text, smallint, text, text, uuid, date)
  to anon, authenticated;


-- ─── 6. RPC: levinho_presentes recebe p_evento_id (opcional) ─────────
drop function if exists public.levinho_presentes(date);

create or replace function public.levinho_presentes(
  p_evento_id uuid default null,
  p_data      date default current_date
)
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
  eh_visitante          boolean,
  evento_id             uuid,
  evento_nome           text
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
    c.codigo_retirada, c.hora_entrada, c.hora_saida, c.eh_visitante,
    c.evento_id, e.nome
  from public.levinho_checkins c
  join public.levinho_salas    s on s.id = c.sala_id
  left join public.eventos_igreja e on e.id = c.evento_id
  where (
      (p_evento_id is not null and c.evento_id = p_evento_id)
      or (p_evento_id is null and c.data_evento = p_data)
    )
    and (
      public.is_admin_prod()
      or public.eh_lider_levinho()
      or c.sala_id in (select sala_id from public.minhas_salas_levinho())
    )
  order by s.ordem, c.hora_entrada desc;
$$;
grant execute on function public.levinho_presentes(uuid, date) to authenticated;


-- ─── 7. RPC: eventos disponíveis pra check-in ────────────────────────
-- Retorna eventos do Levinho (via ministerio_escala onde voluntário é
-- do ministério Levinho) com data >= hoje e <= hoje+30 dias.
-- Fallback: se não houver nenhum, retorna todos eventos do dia atual.
create or replace function public.levinho_eventos_disponiveis()
returns table (
  evento_id  uuid,
  nome       text,
  data       date,
  hora       time,
  finalidade text
)
language sql
security definer
stable
set search_path = public
as $$
  with min_levinho as (
    select id from public.ministerios
    where lower(translate(nome,
      'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
      'aeiouaoaeioucaeiouaoaeiouc')) like 'levinho%'
    limit 1
  ),
  eventos_levinho as (
    select distinct e.id, e.nome, e.data, e.hora, e.finalidade
    from public.eventos_igreja e
    join public.ministerio_escala me on me.evento_id = e.id
    join public.voluntarios v on v.id = me.voluntario_id
    where (select id::text from min_levinho) = any(v.ministerio_ids)
      and e.data between current_date and current_date + 30
  ),
  fallback as (
    select e.id, e.nome, e.data, e.hora, e.finalidade
    from public.eventos_igreja e
    where e.data = current_date
      and not exists (select 1 from eventos_levinho)
  )
  select * from eventos_levinho
  union all
  select * from fallback
  order by 3, 4 nulls last;
$$;
grant execute on function public.levinho_eventos_disponiveis() to anon, authenticated;


-- =====================================================================
-- Validação manual:
--
--   -- 1) Salas renomeadas
--   select id, nome, idade_min, idade_max from public.levinho_salas order by ordem;
--   -- esperado: Levinho 0-3 (0-2), Levinho 3-6 (3-5), Levinho 6-11 (6-11)
--
--   -- 2) Colunas novas
--   select column_name from information_schema.columns
--   where table_name = 'levinho_checkins' and column_name = 'evento_id';
--   select column_name from information_schema.columns
--   where table_name = 'ministerio_escala' and column_name = 'sala_id';
--
--   -- 3) Tabela materiais
--   select tablename, policyname from pg_policies where tablename = 'levinho_materiais';
--
--   -- 4) RPC eventos
--   select * from public.levinho_eventos_disponiveis();
--
--   -- 5) RPC checkin com evento (smoke)
--   select * from public.levinho_checkin_registrar(
--     null, 'Visitante', 4::smallint, 'Mãe', '11999990000', null);
-- =====================================================================

grant select, insert, update, delete on public.levinho_materiais to authenticated;
