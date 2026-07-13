-- =====================================================================
-- Fase 9.13 — QR único geral pra check-in (sem evento_id no link)
--
-- O QR impresso na entrada da igreja aponta pra /checkin-evento.html
-- (sem parâmetros). A página chama esta nova RPC que devolve as escalas
-- do voluntário (autenticado) PARA HOJE. A UI decide:
--   0 escalas → mensagem "não está escalado hoje"
--   1 escala  → marca automaticamente
--   2+        → mostra picker
--
-- A RPC `escala_voluntario_checkin_por_evento` (9.11) continua existindo
-- e é usada quando o voluntário escolhe (ou quando vem de QR específico).
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- =====================================================================


create or replace function public.escala_voluntario_minhas_escalas_hoje()
returns table (
  escala_id        uuid,
  evento_id        uuid,
  evento_nome      text,
  evento_data      date,
  evento_hora      time,
  ja_marcado       boolean,
  checkin_em       timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_membro    uuid;
  v_vol       uuid;
  v_hoje      date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_uid is null then
    raise exception 'Necessário estar autenticado.' using errcode = '28000';
  end if;

  select membro_id into v_membro from public.perfis where id = v_uid;
  if v_membro is null then
    raise exception 'Seu perfil não está vinculado a um membro.' using errcode = 'P0002';
  end if;

  select id into v_vol from public.voluntarios where membro_id = v_membro;
  if v_vol is null then
    raise exception 'Você não está cadastrado como voluntário.' using errcode = 'P0002';
  end if;

  return query
    select
      me.id, e.id, e.nome, e.data, e.hora,
      (me.checkin_em is not null) as ja_marcado,
      me.checkin_em
    from public.ministerio_escala me
    join public.eventos_igreja    e on e.id = me.evento_id
    where me.voluntario_id = v_vol
      and e.data           = v_hoje
    order by e.hora nulls last;
end;
$$;
grant execute on function public.escala_voluntario_minhas_escalas_hoje() to authenticated;


-- =====================================================================
-- Validação manual:
--
--   -- como user autenticado:
--   select * from public.escala_voluntario_minhas_escalas_hoje();
-- =====================================================================
