-- =====================================================================
-- Inscrições de Eventos — armazena inscrições feitas pelo site público
--
-- anon  → pode inserir (formulário público)
-- authenticated → pode ler (painel de acompanhamento)
-- =====================================================================

create table if not exists public.inscricoes_eventos (
  id               uuid primary key default gen_random_uuid(),
  evento_id        uuid references public.eventos_igreja(id) on delete cascade,
  nome             text not null,
  data_nascimento  date,
  email            text,
  cep              text,
  rua              text,
  numero           text,
  complemento      text,
  bairro           text,
  cidade           text,
  telefone         text,
  created_at       timestamptz not null default now()
);

alter table public.inscricoes_eventos enable row level security;

create policy "publico pode inscrever"
  on public.inscricoes_eventos
  for insert
  to anon, authenticated
  with check (true);

create policy "autenticado le inscricoes"
  on public.inscricoes_eventos
  for select
  to authenticated
  using (true);

create index if not exists idx_inscricoes_evento_id
  on public.inscricoes_eventos(evento_id);

grant insert                 on public.inscricoes_eventos to anon;
grant select, insert         on public.inscricoes_eventos to authenticated;
