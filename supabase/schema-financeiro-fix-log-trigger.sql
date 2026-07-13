-- =====================================================================
-- Financeiro — Fix: trigger de log precisa ser SECURITY DEFINER
--
-- A policy financeiro_log_no_write bloqueia escrita externa em
-- financeiro_log (using=false, with_check=false). O trigger que
-- popula o log roda no contexto do user (SECURITY INVOKER por
-- padrao), entao o INSERT do log e bloqueado pela RLS, fazendo
-- todo o INSERT/UPDATE/DELETE em financeiro reverter com 403.
--
-- Fix: SECURITY DEFINER faz o trigger rodar como owner (postgres),
-- contornando RLS apenas para a escrita do log.
--
-- Idempotente.
-- =====================================================================

create or replace function public.financeiro_write_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.financeiro_log (financeiro_id, acao, payload_depois, usuario_id)
      values (NEW.id, 'insert', to_jsonb(NEW), auth.uid());
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.financeiro_log (financeiro_id, acao, payload_antes, payload_depois, usuario_id)
      values (NEW.id, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    return NEW;
  elsif TG_OP = 'DELETE' then
    insert into public.financeiro_log (financeiro_id, acao, payload_antes, usuario_id)
      values (OLD.id, 'delete', to_jsonb(OLD), auth.uid());
    return OLD;
  end if;
  return null;
end;
$$;
