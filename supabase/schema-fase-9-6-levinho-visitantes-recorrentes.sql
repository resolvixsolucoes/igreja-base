-- =====================================================================
-- Fase 9.6 — Levinho: visitantes recorrentes + integração com painel
--
-- Depende de: 9.2, 9.3 já aplicadas.
--
-- Objetivos:
--   1. Quando alguém faz check-in como visitante no Levinho, o
--      responsável (nome + telefone) entra na tabela `visitantes`
--      do painel (upsert por telefone).
--   2. A criança visitante fica salva em `levinho_visitantes_criancas`
--      pra ser encontrada pelo nome no próximo check-in (autocomplete).
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- =====================================================================


-- ─── 1. Tabela: crianças visitantes recorrentes ──────────────────────
create table if not exists public.levinho_visitantes_criancas (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text     not null,
  idade                 smallint not null check (idade between 0 and 12),
  responsavel_nome      text     not null,
  responsavel_telefone  text     not null,
  visitante_id          uuid references public.visitantes(id) on delete set null,
  primeiro_checkin      timestamptz not null default now(),
  ultimo_checkin        timestamptz not null default now(),
  total_checkins        int         not null default 1
);

-- Índice único por (nome normalizado, telefone só dígitos) pra upsert
create unique index if not exists uq_lvc_nome_telefone
  on public.levinho_visitantes_criancas (
    lower(translate(nome,
      'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
      'aeiouaoaeioucaeiouaoaeiouc')),
    regexp_replace(responsavel_telefone, '\D', '', 'g')
  );

create index if not exists idx_lvc_telefone
  on public.levinho_visitantes_criancas (
    regexp_replace(responsavel_telefone, '\D', '', 'g')
  );

alter table public.levinho_visitantes_criancas enable row level security;

-- SELECT: admin / líder / voluntário do levinho
drop policy if exists lvc_select on public.levinho_visitantes_criancas;
create policy lvc_select on public.levinho_visitantes_criancas
  for select to authenticated
  using (
    public.is_admin_prod()
    or public.eh_lider_levinho()
    or exists (select 1 from public.minhas_salas_levinho())
  );

-- WRITE direto na tabela: só admin/líder. Public entra via RPC SECURITY DEFINER.
drop policy if exists lvc_write on public.levinho_visitantes_criancas;
create policy lvc_write on public.levinho_visitantes_criancas
  for all to authenticated
  using      (public.is_admin_prod() or public.eh_lider_levinho())
  with check (public.is_admin_prod() or public.eh_lider_levinho());


-- ─── 2. RPC de busca: UNION filhos cadastrados + visitantes recorrentes ───
-- Mudança: adiciona `responsavel_telefone` e `origem` no retorno.
drop function if exists public.levinho_checkin_buscar_filhos(text);

create or replace function public.levinho_checkin_buscar_filhos(p_termo text)
returns table (
  filho_id              uuid,
  visitante_crianca_id  uuid,
  crianca_nome          text,
  idade                 smallint,
  responsavel_nome      text,
  responsavel_telefone  text,
  responsavel_id        uuid,
  origem                text  -- 'membro' | 'visitante'
)
language sql
security definer
stable
set search_path = public
as $$
  with norm as (
    select lower(translate(trim(p_termo),
      'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
      'aeiouaoaeioucaeiouaoaeiouc')) as t
  )
  -- (a) crianças cadastradas (filhos de membros)
  select
    f.id,
    null::uuid,
    f.nome,
    public._levinho_idade(f.data_nascimento),
    coalesce(m.nome, ''),
    null::text,
    f.membro_id,
    'membro'::text
  from public.filhos f
  left join public.membros m on m.id = f.membro_id
  cross join norm
  where f.data_nascimento is not null
    and lower(translate(f.nome,
          'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
          'aeiouaoaeioucaeiouaoaeiouc'))
        like '%' || norm.t || '%'
    and public._levinho_idade(f.data_nascimento) between 0 and 12

  union all

  -- (b) crianças visitantes recorrentes
  select
    null::uuid,
    v.id,
    v.nome,
    v.idade,
    v.responsavel_nome,
    v.responsavel_telefone,
    null::uuid,
    'visitante'::text
  from public.levinho_visitantes_criancas v
  cross join norm
  where lower(translate(v.nome,
          'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
          'aeiouaoaeioucaeiouaoaeiouc'))
        like '%' || norm.t || '%'

  order by 3
  limit 15;
$$;
grant execute on function public.levinho_checkin_buscar_filhos(text) to anon, authenticated;


-- ─── 3. RPC de registro: integra visitantes panel + cadastra recorrente ───
-- Mantém assinatura existente da Fase 9.3.
drop function if exists public.levinho_checkin_registrar(uuid, text, smallint, text, text, uuid, date);

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
  v_resp_nome    text;
  v_resp_tel     text;
  v_tel_norm     text;
  v_visitante_id uuid;
begin
  if coalesce(trim(p_responsavel_nome), '') = '' then
    raise exception 'Nome do responsável é obrigatório.';
  end if;
  if coalesce(trim(p_telefone), '') = '' then
    raise exception 'Telefone do responsável é obrigatório.';
  end if;

  v_resp_nome := trim(p_responsavel_nome);
  v_resp_tel  := trim(p_telefone);
  v_tel_norm  := regexp_replace(v_resp_tel, '\D', '', 'g');

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

  -- Se evento informado, usa a data do evento
  if p_evento_id is not null then
    select e.data into v_data_evento
    from public.eventos_igreja e
    where e.id = p_evento_id;
    if v_data_evento is null then
      v_data_evento := p_data;
    end if;
  end if;

  -- Gera código único e insere o checkin
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
        v_resp_nome, v_resp_tel, v_responsavel_membro,
        v_codigo
      ) returning id into v_id;
      exit;
    exception when unique_violation then
      if v_tentativas >= 20 then
        raise exception 'Não foi possível gerar código único — tente novamente.';
      end if;
    end;
  end loop;

  -- Se for visitante: integra no painel de visitantes + cadastra recorrência
  if p_filho_id is null then
    -- (a) upsert do responsável em `visitantes` (match por telefone normalizado)
    if v_tel_norm <> '' then
      select id into v_visitante_id
      from public.visitantes
      where regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = v_tel_norm
      order by data_visita desc nulls last
      limit 1;
    end if;

    if v_visitante_id is null then
      insert into public.visitantes(nome, telefone, como_conheceu, data_visita)
      values (v_resp_nome, v_resp_tel, 'Check-in Levinho', v_data_evento)
      returning id into v_visitante_id;
    else
      update public.visitantes
         set data_visita = v_data_evento,
             nome = case
               when coalesce(nome, '') = '' then v_resp_nome else nome
             end,
             telefone = case
               when coalesce(telefone, '') = '' then v_resp_tel else telefone
             end
       where id = v_visitante_id;
    end if;

    -- (b) upsert da criança visitante (chave: nome normalizado + telefone)
    insert into public.levinho_visitantes_criancas(
      nome, idade, responsavel_nome, responsavel_telefone,
      visitante_id, primeiro_checkin, ultimo_checkin, total_checkins
    ) values (
      v_nome, v_idade, v_resp_nome, v_resp_tel,
      v_visitante_id, now(), now(), 1
    )
    on conflict (
      lower(translate(nome,
        'áéíóúãõâêîôûçÁÉÍÓÚÃÕÂÊÎÔÛÇ',
        'aeiouaoaeioucaeiouaoaeiouc')),
      regexp_replace(responsavel_telefone, '\D', '', 'g')
    ) do update set
      ultimo_checkin   = now(),
      total_checkins   = public.levinho_visitantes_criancas.total_checkins + 1,
      idade            = excluded.idade,
      responsavel_nome = excluded.responsavel_nome,
      visitante_id     = coalesce(public.levinho_visitantes_criancas.visitante_id, excluded.visitante_id);
  end if;

  return query select v_id, v_codigo, v_sala_id, v_sala_nome, v_nome, v_idade;
end;
$$;
grant execute on function public.levinho_checkin_registrar(uuid, text, smallint, text, text, uuid, date)
  to anon, authenticated;


-- =====================================================================
-- Validação manual:
--
--   -- 1) Cria visitante via RPC (anon-callable):
--   select * from public.levinho_checkin_registrar(
--     null, 'Fulano Teste', 4::smallint, 'Ciclana Responsavel', '(31) 99999-0001');
--
--   -- 2) Confere que apareceu no painel de visitantes:
--   select id, nome, telefone, como_conheceu, data_visita
--     from public.visitantes
--    where telefone like '%99999-0001%';
--
--   -- 3) Confere que a criança ficou cadastrada como recorrente:
--   select * from public.levinho_visitantes_criancas
--    where responsavel_telefone like '%99999-0001%';
--
--   -- 4) Busca encontra a criança visitante por nome (anon-callable):
--   select * from public.levinho_checkin_buscar_filhos('pedrin');
--
--   -- 5) Segundo check-in da mesma criança incrementa total_checkins:
--   select * from public.levinho_checkin_registrar(
--     null, 'Fulano Teste', 4::smallint, 'Ciclana Responsavel', '(31) 99999-0001');
--   select total_checkins from public.levinho_visitantes_criancas
--    where responsavel_telefone like '%99999-0001%';
--   -- esperado: 2
-- =====================================================================

grant select, insert, update, delete on public.levinho_visitantes_criancas to authenticated;
