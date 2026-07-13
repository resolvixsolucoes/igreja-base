-- =====================================================================
-- RPC: minhas_mensagens_nao_lidas
-- Retorna contagem de mensagens não-lidas por ministério (perspectiva)
-- do usuário atual. Para admin: todos os ministérios. Para outros: só
-- ministérios em que está em ministerio_lideres.
--
-- "Não-lida" = mensagem cujo autor_ministerio_id é diferente do
-- ministério-perspectiva E created_at > ultima_leitura_at (ou sem
-- registro de leitura).
--
-- Idempotente. Roda no SQL Editor do projeto Prod.
-- =====================================================================

create or replace function public.minhas_mensagens_nao_lidas()
returns table (ministerio_id uuid, total bigint)
language sql
security invoker
stable
set search_path = public
as $$
  with meus_min as (
    select id as min_id
    from public.ministerios
    where public.is_admin_prod()
    union
    select ministerio_id as min_id
    from public.meus_ministerios_lideranca()
  ),
  msgs_relevantes as (
    select mm.min_id, msg.thread_id, msg.created_at
    from meus_min mm
    join public.comunicacao_threads t
      on t.ministerio_a_id = mm.min_id or t.ministerio_b_id = mm.min_id
    join public.comunicacao_mensagens msg
      on msg.thread_id = t.id and msg.autor_ministerio_id <> mm.min_id
  )
  select mr.min_id as ministerio_id, count(*)::bigint as total
  from msgs_relevantes mr
  left join public.comunicacao_leituras l
    on l.thread_id     = mr.thread_id
   and l.perfil_id     = auth.uid()
   and l.ministerio_id = mr.min_id
  where l.ultima_leitura_at is null
     or mr.created_at > l.ultima_leitura_at
  group by mr.min_id;
$$;

grant execute on function public.minhas_mensagens_nao_lidas() to authenticated;
