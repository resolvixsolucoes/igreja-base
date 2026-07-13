-- =====================================================================
-- Fase 9.5 — Levinho: relaxar filtro de eventos disponíveis
--
-- A RPC anterior só retornava eventos com ministerio_escala vinculada
-- a voluntário do Levinho. Isso quebrava quando o evento existia na
-- agenda mas ainda não tinha escala — caso comum no fluxo real.
--
-- Nova lógica: retorna todos os eventos da agenda na janela
-- [hoje-7 dias, hoje+30 dias], ordenados pelos mais próximos.
-- Janela passada serve pra revisar Presentes de cultos anteriores.
-- =====================================================================

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
  select e.id, e.nome, e.data, e.hora, e.finalidade
  from public.eventos_igreja e
  where e.data between current_date - 7 and current_date + 30
  order by
    -- futuros primeiro (asc), depois passados recentes (desc)
    case when e.data >= current_date then 0 else 1 end,
    case when e.data >= current_date then e.data end asc,
    case when e.data <  current_date then e.data end desc,
    e.hora nulls last;
$$;
grant execute on function public.levinho_eventos_disponiveis() to anon, authenticated;


-- =====================================================================
-- Validação:
--   select * from public.levinho_eventos_disponiveis();
--   -- esperado: lista os cultos/eventos da agenda na janela.
-- =====================================================================
