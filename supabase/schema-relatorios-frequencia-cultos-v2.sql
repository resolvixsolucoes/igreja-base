-- =====================================================================
-- Relatórios — Frequência de Cultos v2
--
-- Ajustes pedidos após a primeira versão:
--  1) Renomeia eventos_igreja.total_presentes -> total_presentes_adultos
--     (rename idempotente, preserva dado já lançado em produção).
--  2) Separa a contagem de crianças por salinha do Levinho, com
--     preferência automática pelos check-ins do dia quando existirem,
--     caindo para lançamento manual enquanto o check-in não for usado.
--  3) A gravação passa a poder ser feita tanto por quem edita o evento
--     na Agenda quanto por quem tem a permissão granular de Relatórios
--     (helper pode_editar_frequencia_cultos()).
--
-- Idempotente. Roda no SQL Editor do projeto Prod (NAO no LMS), DEPOIS
-- de schema-relatorios-frequencia-cultos.sql (v1) já ter rodado.
-- =====================================================================

-- ─── 1) Rename da coluna (preserva dados) ──────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'eventos_igreja' and column_name = 'total_presentes'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'eventos_igreja' and column_name = 'total_presentes_adultos'
  ) then
    alter table public.eventos_igreja rename column total_presentes to total_presentes_adultos;
  end if;
end $$;

alter table public.eventos_igreja
  add column if not exists total_presentes_adultos integer;


-- ─── 2) Tabela de crianças por salinha (lançamento manual) ─────────────
create table if not exists public.frequencia_cultos_criancas (
  evento_id      uuid        not null references public.eventos_igreja(id) on delete cascade,
  sala_id        smallint    not null references public.levinho_salas(id),
  total_manual   integer,
  atualizado_por uuid        references public.perfis(id) on delete set null,
  atualizado_em  timestamptz not null default now(),
  primary key (evento_id, sala_id)
);

alter table public.frequencia_cultos_criancas enable row level security;

-- Leitura aberta (mesmo padrão de levinho_salas) — é só contagem, sem
-- dado sensível. Escrita direta só admin; a escrita real passa pela RPC
-- abaixo (SECURITY DEFINER, ignora RLS e faz seu próprio gate).
drop policy if exists frequencia_cultos_criancas_select on public.frequencia_cultos_criancas;
create policy frequencia_cultos_criancas_select
  on public.frequencia_cultos_criancas
  for select to authenticated
  using (true);

drop policy if exists frequencia_cultos_criancas_write on public.frequencia_cultos_criancas;
create policy frequencia_cultos_criancas_write
  on public.frequencia_cultos_criancas
  for all to authenticated
  using      (public.is_admin_prod())
  with check (public.is_admin_prod());

grant select on public.frequencia_cultos_criancas to authenticated;


-- ─── 3) Helper de permissão — usado pelas RPCs de escrita abaixo ───────
-- Libera quem já pode editar evento na Agenda OU quem tem a aba
-- relatorios::frequencia_cultos com editar=true (mesma ideia do v1,
-- agora compartilhada entre os dois pontos de entrada: Agenda e Relatórios).
create or replace function public.pode_editar_frequencia_cultos()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.is_admin_prod()
    or exists (
      select 1 from public.permissoes_granular
      where user_id = auth.uid() and pagina = 'agenda' and aba = '_default' and editar = true
    )
    or exists (
      select 1 from public.permissoes_granular
      where user_id = auth.uid() and pagina = 'relatorios' and aba = 'frequencia_cultos' and editar = true
    );
$$;

grant execute on function public.pode_editar_frequencia_cultos() to authenticated;


-- ─── 4) RPC — define adultos/salão (substitui a v1, mesma assinatura) ──
create or replace function public.relatorios_definir_frequencia_culto(
  p_evento_id uuid,
  p_total     integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_total is not null and p_total < 0 then
    raise exception 'Total de presentes não pode ser negativo.' using errcode = '22023';
  end if;

  if not public.pode_editar_frequencia_cultos() then
    raise exception 'Sem permissão para lançar frequência de cultos.' using errcode = '42501';
  end if;

  update public.eventos_igreja
     set total_presentes_adultos = p_total
   where id = p_evento_id and finalidade = 'culto';

  if not found then
    raise exception 'Evento não encontrado ou não é um culto.' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.relatorios_definir_frequencia_culto(uuid, integer) to authenticated;


-- ─── 5) RPC — define/upserta o total manual de uma sala num evento ─────
create or replace function public.relatorios_definir_frequencia_crianca_sala(
  p_evento_id uuid,
  p_sala_id   smallint,
  p_total     integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_total is not null and p_total < 0 then
    raise exception 'Total de presentes não pode ser negativo.' using errcode = '22023';
  end if;

  if not public.pode_editar_frequencia_cultos() then
    raise exception 'Sem permissão para lançar frequência de cultos.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.eventos_igreja where id = p_evento_id and finalidade = 'culto') then
    raise exception 'Evento não encontrado ou não é um culto.' using errcode = 'P0002';
  end if;

  insert into public.frequencia_cultos_criancas (evento_id, sala_id, total_manual, atualizado_por, atualizado_em)
  values (p_evento_id, p_sala_id, p_total, auth.uid(), now())
  on conflict (evento_id, sala_id) do update
    set total_manual   = excluded.total_manual,
        atualizado_por = excluded.atualizado_por,
        atualizado_em  = now();
end;
$$;

grant execute on function public.relatorios_definir_frequencia_crianca_sala(uuid, smallint, integer) to authenticated;


-- ─── 6) RPC — contagem automática por sala via check-ins do Levinho ────
-- SECURITY DEFINER pra ignorar a RLS de levinho_checkins (que só libera
-- admin/líder/voluntário da sala) — é só contagem agregada, sem nome de
-- criança nem dado sensível, então libera pra qualquer authenticated.
-- Casa por evento_id quando existir; cai pra data_evento quando o
-- check-in for antigo/solto (mesmo fallback da RPC levinho_presentes).
create or replace function public.relatorios_criancas_por_sala(
  p_evento_id uuid,
  p_data      date
)
returns table (
  sala_id       smallint,
  sala_nome     text,
  total_checkin bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.nome, count(c.id)
  from public.levinho_salas s
  left join public.levinho_checkins c
    on c.sala_id = s.id
   and (c.evento_id = p_evento_id or (c.evento_id is null and c.data_evento = p_data))
  group by s.id, s.nome, s.ordem
  order by s.ordem;
$$;

grant execute on function public.relatorios_criancas_por_sala(uuid, date) to authenticated;


-- =====================================================================
-- Validação manual:
--
--   select id, nome, data, total_presentes_adultos
--   from public.eventos_igreja where finalidade = 'culto' order by data desc limit 5;
--
--   select * from public.relatorios_criancas_por_sala('<evento_id>', '<data>');
--
--   select public.relatorios_definir_frequencia_culto('<evento_id>', 120);
--   select public.relatorios_definir_frequencia_crianca_sala('<evento_id>', 1, 8);
-- =====================================================================
