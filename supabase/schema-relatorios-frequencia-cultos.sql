-- =====================================================================
-- Relatórios — Frequência de Cultos
--
-- Adiciona o campo de presença direto em eventos_igreja (não cria tabela
-- nova) e uma RPC SECURITY DEFINER para gravá-lo, checando a permissão
-- granular da nova aba `relatorios::frequencia_cultos` sem depender de
-- policy de UPDATE em eventos_igreja.
--
-- Idempotente. Roda no SQL Editor do projeto Prod (NAO no LMS).
-- =====================================================================

alter table public.eventos_igreja
  add column if not exists total_presentes integer;

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

  if not (
    public.is_admin_prod()
    or exists (
      select 1 from public.permissoes_granular
      where user_id = auth.uid()
        and pagina = 'relatorios'
        and aba    = 'frequencia_cultos'
        and editar = true
    )
  ) then
    raise exception 'Sem permissão para lançar frequência de cultos.' using errcode = '42501';
  end if;

  update public.eventos_igreja
     set total_presentes = p_total
   where id = p_evento_id and finalidade = 'culto';

  if not found then
    raise exception 'Evento não encontrado ou não é um culto.' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.relatorios_definir_frequencia_culto(uuid, integer) to authenticated;


-- =====================================================================
-- Validação manual:
--
--   -- como admin ou usuario com relatorios::frequencia_cultos.editar=true:
--   select public.relatorios_definir_frequencia_culto('<evento_id>', 120);
--   select id, nome, data, finalidade, total_presentes
--   from public.eventos_igreja where finalidade = 'culto' order by data desc limit 10;
-- =====================================================================
