-- =====================================================================
-- Fase 9.4 — Levinho: check-out (retirada da criança)
--
-- Depende de 9.1, 9.2 e 9.3 já aplicadas.
--
-- Cria RPC SECURITY DEFINER pra registrar a retirada:
--   - quem chama: admin OU líder do Levinho OU voluntário com a sala
--     do checkin em levinho_voluntarios_salas
--   - exige checkin ativo (hora_saida is null)
--   - grava hora_saida, responsavel_saida_nome, retirado_por_user
--
-- Idempotente.
-- =====================================================================

create or replace function public.levinho_checkout(
  p_checkin_id           uuid,
  p_responsavel_saida    text
)
returns table (
  checkin_id   uuid,
  hora_saida   timestamptz
)
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  v_check public.levinho_checkins%rowtype;
begin
  if p_checkin_id is null then
    raise exception 'Check-in inválido.';
  end if;
  if coalesce(trim(p_responsavel_saida), '') = '' then
    raise exception 'Informe quem está retirando a criança.';
  end if;

  select * into v_check from public.levinho_checkins where id = p_checkin_id;
  if not found then
    raise exception 'Check-in não encontrado.';
  end if;
  if v_check.hora_saida is not null then
    raise exception 'Esta criança já foi retirada.';
  end if;

  -- Gate: admin OR líder OR voluntário da sala
  if not (
    public.is_admin_prod()
    or public.eh_lider_levinho()
    or v_check.sala_id in (select sala_id from public.minhas_salas_levinho())
  ) then
    raise exception 'Você não tem permissão para retirar crianças desta sala.';
  end if;

  update public.levinho_checkins
     set hora_saida             = now(),
         responsavel_saida_nome = trim(p_responsavel_saida),
         retirado_por_user      = auth.uid()
   where id = p_checkin_id;

  return query
    select v_check.id, now()::timestamptz;
end;
$$;
grant execute on function public.levinho_checkout(uuid, text) to authenticated;


-- =====================================================================
-- Validação manual:
--
--   -- 1) Voluntário da sala 1 retira um checkin da sala 1: deve dar OK.
--   --    select * from public.levinho_checkout('<checkin_id>', 'Ciclana Responsavel');
--
--   -- 2) Tentar retirar de novo: deve falhar com "já foi retirada".
--
--   -- 3) Voluntário sem a sala correta: deve falhar com "sem permissão".
-- =====================================================================
