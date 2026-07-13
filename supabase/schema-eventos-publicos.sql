-- =====================================================================
-- Eventos Públicos — colunas para exibição no site (index.html)
--
-- Adiciona à eventos_igreja:
--   publico        → exibe o evento na landing page
--   descricao_curta → texto resumido para o card do site
--   link_inscricao  → URL de inscrição (opcional)
--   imagem_url      → imagem do evento (opcional)
--
-- A RPC eventos_publicos_site() é pública (anon) e retorna apenas
-- eventos com publico=true e data >= hoje.
-- =====================================================================

alter table public.eventos_igreja
  add column if not exists publico         boolean not null default false,
  add column if not exists descricao_curta text,
  add column if not exists link_inscricao  text,
  add column if not exists imagem_url      text;

create or replace function public.eventos_publicos_site()
returns table (
  id              uuid,
  nome            text,
  data            date,
  hora            time,
  finalidade      text,
  descricao_curta text,
  link_inscricao  text,
  imagem_url      text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    e.id, e.nome, e.data, e.hora, e.finalidade,
    e.descricao_curta, e.link_inscricao, e.imagem_url
  from public.eventos_igreja e
  where e.publico = true
    and e.data >= current_date
  order by e.data asc, e.hora asc nulls last
  limit 10;
$$;

grant execute on function public.eventos_publicos_site() to anon, authenticated;
