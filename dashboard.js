// ===== DASHBOARD =====
async function carregarDashboard() {
  const [membros, visitantes, mesas, voluntarios, criancas] = await Promise.all([
    db.from('membros').select('id'),
    db.from('visitantes').select('id'),
    db.from('mesas').select('id'),
    db.from('voluntarios').select('id').eq('status', 'Ativo'),
    db.from('filhos').select('id'),
  ]);

  document.getElementById('total-membros').textContent =
    membros.error ? '—' : membros.data.length;

  document.getElementById('total-visitantes').textContent =
    visitantes.error ? '—' : visitantes.data.length;

  document.getElementById('total-mesas').textContent =
    mesas.error ? '—' : mesas.data.length;

  document.getElementById('total-voluntarios').textContent =
    voluntarios.error ? '—' : voluntarios.data.length;

  document.getElementById('total-criancas').textContent =
    criancas.error ? '—' : criancas.data.length;
}

// ===== INIT =====
carregarDashboard();
