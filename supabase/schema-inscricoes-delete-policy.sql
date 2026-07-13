-- Permite que usuários autenticados (admin) excluam inscrições
create policy "autenticado deleta inscricoes"
  on public.inscricoes_eventos
  for delete
  to authenticated
  using (true);
