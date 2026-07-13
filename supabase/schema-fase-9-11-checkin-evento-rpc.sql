-- =====================================================================
-- Fase 9.11 — Check-in via QR do evento + Central de Voluntários
--
-- O QR impresso na entrada aponta pra /checkin-evento.html?evento=UUID.
-- O voluntário escaneia (já está logado), a página chama esta RPC e o
-- check-in é marcado automaticamente — identificação vem de auth.uid().
--
-- Cadeia de identificação:
--   auth.uid() → perfis.id → perfis.membro_id → voluntarios.id
--
-- Validações:
--   - precisa estar autenticado
--   - precisa estar cadastrado como voluntário
--   - precisa estar escalado neste evento
--   - precisa ser o dia do evento (timezone America/Sao_Paulo)
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- =====================================================================


create or replace function public.escala_voluntario_checkin_por_evento(
  p_evento_id uuid
)
returns table (
  escala_id        uuid,
  checkin_em       timestamptz,
  evento_nome      text,
  evento_data      date,
  evento_hora      time,
  voluntario_nome  text,
  ja_marcado       boolean
)
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_membro_id  uuid;
  v_vol_id     uuid;
  v_vol_nome   text;
  v_escala     public.ministerio_escala%rowtype;
  v_evento     public.eventos_igreja%rowtype;
  v_hoje       date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ja_marcado boolean := false;
begin
  if v_uid is null then
    raise exception 'Você precisa estar autenticado para fazer check-in.'
      using errcode = '28000';
  end if;

  if p_evento_id is null then
    raise exception 'Evento não informado.' using errcode = '22023';
  end if;

  -- Busca evento e valida data
  select * into v_evento from public.eventos_igreja where id = p_evento_id;
  if v_evento.id is null then
    raise exception 'Evento não encontrado.' using errcode = 'P0002';
  end if;

  if v_evento.data <> v_hoje then
    raise exception 'Check-in só é permitido no dia do evento (% — hoje é %).',
      to_char(v_evento.data, 'DD/MM/YYYY'), to_char(v_hoje, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  -- Resolve auth.uid → membro → voluntário
  select membro_id into v_membro_id from public.perfis where id = v_uid;
  if v_membro_id is null then
    raise exception 'Seu perfil não está vinculado a um membro. Fale com a liderança.'
      using errcode = 'P0002';
  end if;

  select id, nome into v_vol_id, v_vol_nome
  from public.voluntarios where membro_id = v_membro_id;
  if v_vol_id is null then
    raise exception 'Você não está cadastrado como voluntário.'
      using errcode = 'P0002';
  end if;

  -- Busca a escala do voluntário neste evento
  select * into v_escala
  from public.ministerio_escala
  where evento_id = p_evento_id and voluntario_id = v_vol_id
  limit 1;

  if v_escala.id is null then
    raise exception 'Você não está escalado para este evento.'
      using errcode = 'P0002';
  end if;

  -- Idempotente: se já tem check-in, só retorna sem reescrever
  if v_escala.checkin_em is not null then
    v_ja_marcado := true;
  else
    update public.ministerio_escala
       set checkin_em  = now(),
           checkin_por = v_uid
     where id = v_escala.id
    returning * into v_escala;
  end if;

  return query select
    v_escala.id, v_escala.checkin_em,
    v_evento.nome, v_evento.data, v_evento.hora,
    v_vol_nome, v_ja_marcado;
end;
$$;
grant execute on function public.escala_voluntario_checkin_por_evento(uuid)
  to authenticated;


-- =====================================================================
-- Validação manual:
--
--   -- 1) Função criada
--   select pg_get_functiondef('public.escala_voluntario_checkin_por_evento(uuid)'::regprocedure);
--
--   -- 2) Como user autenticado (via SQL Editor com role authenticated):
--   --    select * from public.escala_voluntario_checkin_por_evento('<evento_uuid>');
-- =====================================================================
