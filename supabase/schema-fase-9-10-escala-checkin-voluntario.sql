-- =====================================================================
-- Fase 9.10 — Check-in de voluntários nas programações
--
-- Adiciona registro de presença efetiva (no dia do evento) na tabela
-- ministerio_escala. NÃO confunde com:
--   - status (pendente/confirmado/recusado): confirmação prévia
--   - levinho_checkins: check-in das CRIANÇAS no Levinho
--
-- Caminhos:
--   A. Líder marca pela agenda (auth obrigatório).
--   B. Voluntário se auto-marca via link/QR usando o mesmo token de
--      confirmação (sem auth — token já é credencial pessoal).
--
-- Regras:
--   - Só permite check-in no dia do evento (timezone America/Sao_Paulo).
--   - Idempotente: re-marcar não muda checkin_em.
--   - Desmarcar exige auth (líder/admin).
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- =====================================================================


-- ─── 1. Colunas em ministerio_escala ─────────────────────────────────
alter table public.ministerio_escala
  add column if not exists checkin_em  timestamptz,
  add column if not exists checkin_por uuid references auth.users(id) on delete set null;

comment on column public.ministerio_escala.checkin_em  is
  'Quando o voluntário foi marcado como presente no evento (null = não compareceu/ainda).';
comment on column public.ministerio_escala.checkin_por is
  'Usuário que registrou o check-in. Null = auto check-in via token.';

create index if not exists idx_ministerio_escala_checkin_em
  on public.ministerio_escala(checkin_em) where checkin_em is not null;


-- ─── 2. RPC: marcar presença ─────────────────────────────────────────
-- Caminho A (líder): chama com p_escala_id, sem p_token; auth.uid() vira checkin_por.
-- Caminho B (auto):  chama com p_token (anon ok); checkin_por fica null.
create or replace function public.escala_voluntario_checkin(
  p_escala_id uuid default null,
  p_token     text default null
)
returns table (
  escala_id    uuid,
  checkin_em   timestamptz,
  evento_nome  text,
  evento_data  date,
  voluntario_nome text,
  origem       text  -- 'lider' | 'self'
)
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_escala  public.ministerio_escala%rowtype;
  v_evento  public.eventos_igreja%rowtype;
  v_vol_nome text;
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_uid     uuid := auth.uid();
  v_origem  text;
begin
  -- Resolve escala por id ou por token
  if p_token is not null and length(trim(p_token)) > 0 then
    select * into v_escala from public.ministerio_escala where token = p_token;
    v_origem := 'self';
  elsif p_escala_id is not null then
    if v_uid is null then
      raise exception 'Necessário estar autenticado.' using errcode = '28000';
    end if;
    select * into v_escala from public.ministerio_escala where id = p_escala_id;
    v_origem := 'lider';
  else
    raise exception 'Informe p_escala_id ou p_token.' using errcode = '22023';
  end if;

  if v_escala.id is null then
    raise exception 'Escala não encontrada.' using errcode = 'P0002';
  end if;

  -- Busca evento pra validar a data
  select * into v_evento from public.eventos_igreja where id = v_escala.evento_id;
  if v_evento.id is null then
    raise exception 'Evento da escala não existe mais.' using errcode = 'P0002';
  end if;

  if v_evento.data <> v_hoje then
    raise exception 'Check-in só é permitido no dia do evento (% — hoje é %).',
      to_char(v_evento.data, 'DD/MM/YYYY'), to_char(v_hoje, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  -- Idempotente
  if v_escala.checkin_em is null then
    update public.ministerio_escala
       set checkin_em  = now(),
           checkin_por = case when v_origem = 'lider' then v_uid else null end
     where id = v_escala.id
    returning * into v_escala;
  end if;

  -- Nome do voluntário (pra UI)
  select nome into v_vol_nome from public.voluntarios where id = v_escala.voluntario_id;

  return query select
    v_escala.id, v_escala.checkin_em,
    v_evento.nome, v_evento.data,
    v_vol_nome, v_origem;
end;
$$;
grant execute on function public.escala_voluntario_checkin(uuid, text)
  to anon, authenticated;


-- ─── 3. RPC: desmarcar presença (só auth) ────────────────────────────
create or replace function public.escala_voluntario_checkin_desmarcar(
  p_escala_id uuid
)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Necessário estar autenticado.' using errcode = '28000';
  end if;

  update public.ministerio_escala
     set checkin_em  = null,
         checkin_por = null
   where id = p_escala_id;
end;
$$;
grant execute on function public.escala_voluntario_checkin_desmarcar(uuid)
  to authenticated;


-- =====================================================================
-- Validação manual:
--
--   -- 1) Colunas criadas
--   select column_name, data_type
--   from information_schema.columns
--   where table_name = 'ministerio_escala'
--     and column_name in ('checkin_em', 'checkin_por');
--
--   -- 2) Tentativa fora do dia do evento (deve falhar):
--   --    select * from public.escala_voluntario_checkin(
--   --      '00000000-0000-0000-0000-000000000000'::uuid, null);
--
--   -- 3) Pegar um token e simular auto check-in:
--   --    select * from public.escala_voluntario_checkin(null, '<token>');
-- =====================================================================
