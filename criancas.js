let criancasCache = [];
let editandoId = null;

// =============================================
// CARREGAR CRIANÇAS
// =============================================

async function carregarCriancas() {
  const { data, error } = await db
    .from('filhos')
    .select('id, nome, data_nascimento, membro_id, membros(id, nome, conjuge, estado_civil)')
    .order('nome');

  if (error) {
    console.error('Erro ao carregar crianças:', error);
    return;
  }

  criancasCache = data || [];
  renderizarTabela(criancasCache);

  await carregarPermissoesCampos('criancas')
  aplicarPermissoesCampos('criancas')
}

// =============================================
// MONTAR NOME DO(S) RESPONSÁVEL(IS)
// =============================================

function montarNomeResponsavel(crianca) {
  const responsavel = crianca.membros;
  if (!responsavel) return '—';

  const primeiroNome = (nome) => (nome || '').split(' ')[0];

  const nomePrincipal = primeiroNome(responsavel.nome);

  // Se o responsável é casado e tem cônjuge vinculado
  if (responsavel.estado_civil === 'Casado' && responsavel.conjuge) {
    const nomeConjuge = primeiroNome(responsavel.conjuge);
    return `${nomePrincipal} / ${nomeConjuge}`;
  }

  return responsavel.nome ?? '—';
}

// =============================================
// CALCULAR IDADE
// =============================================

function calcularIdade(dataNasc) {
  if (!dataNasc) return '—';
  const hoje = new Date();
  const nasc = new Date(dataNasc + 'T00:00:00');
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  if (idade < 0) return '—';
  return idade === 0 ? 'Menos de 1 ano' : `${idade} ano${idade !== 1 ? 's' : ''}`;
}

// =============================================
// RENDERIZAR TABELA
// =============================================

function renderizarTabela(lista) {
  const tbody = document.getElementById('tabela-criancas');
  tbody.innerHTML = '';

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align:center; color:#aaa; padding:30px;">
          Nenhuma criança encontrada.
        </td>
      </tr>`;
    return;
  }

  lista.forEach(c => {
    const nascimento = c.data_nascimento
      ? new Date(c.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR')
      : '—';

    const responsavel = montarNomeResponsavel(c);
    const idade = calcularIdade(c.data_nascimento);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.nome}</td>
      <td>${nascimento}</td>
      <td>${idade}</td>
      <td>${responsavel}</td>
      <td style="display:flex; gap:6px;">
        <button class="btn btn-primary" style="padding:6px 12px; font-size:12px;" data-acao="editar"
          onclick="abrirModal('${c.id}')">✏️ Editar</button>
        <button class="btn btn-danger" data-acao="excluir"
          onclick="excluirCrianca('${c.id}', '${c.nome.replace(/'/g, "\\'")}')">🗑️ Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================
// FILTRAR
// =============================================

function filtrarCriancas() {
  const termo = document.getElementById('busca-crianca').value.toLowerCase();
  const filtrados = criancasCache.filter(c =>
    c.nome.toLowerCase().includes(termo) ||
    montarNomeResponsavel(c).toLowerCase().includes(termo)
  );
  renderizarTabela(filtrados);
}

// =============================================
// MODAL EDITAR
// =============================================

function abrirModal(id) {
  const c = criancasCache.find(x => x.id === id);
  if (!c) return;

  editandoId = id;

  const responsavel = montarNomeResponsavel(c);
  document.getElementById('info-responsavel').textContent =
    `👤 Responsável: ${responsavel}`;

  document.getElementById('input-nome-crianca').value = c.nome;
  document.getElementById('input-nascimento-crianca').value = c.data_nascimento || '';

  document.getElementById('modal-crianca').classList.add('active');
}

function fecharModal() {
  document.getElementById('modal-crianca').classList.remove('active');
  editandoId = null;
}

// =============================================
// SALVAR EDIÇÃO — com validação de duplicidade
// =============================================

async function salvarEdicao() {
  const nome       = document.getElementById('input-nome-crianca').value.trim();
  const nascimento = document.getElementById('input-nascimento-crianca').value || null;

  if (!nome) {
    alert('O nome da criança é obrigatório!');
    return;
  }

  const { data: duplicados, error: errDup } = await db
    .from('filhos')
    .select('id')
    .ilike('nome', nome)
    .eq('data_nascimento', nascimento);

  if (errDup) {
    console.error('Erro ao verificar duplicidade:', errDup);
  } else {
    const outroDuplicado = (duplicados || []).find(d => d.id !== editandoId);
    if (outroDuplicado) {
      alert(`Já existe uma criança cadastrada com o nome "${nome}" e esta data de nascimento.`);
      return;
    }
  }

  const { error } = await db
    .from('filhos')
    .update({ nome, data_nascimento: nascimento })
    .eq('id', editandoId);

  if (error) {
    alert('Erro ao salvar. Tente novamente.');
    console.error(error);
    return;
  }

  fecharModal();
  carregarCriancas();
}

// =============================================
// EXCLUIR
// =============================================

async function excluirCrianca(id, nome) {
  if (!confirm(`Deseja excluir a criança "${nome}"?`)) return;

  const { error } = await db.from('filhos').delete().eq('id', id);

  if (error) {
    alert('Erro ao excluir. Tente novamente.');
    console.error(error);
    return;
  }

  carregarCriancas();
}

// =============================================
// INIT
// =============================================

;(async () => {
  await aguardarAuthReady()
  await carregarCriancas()
  aplicarGateAcoesGranular('criancas')
  document.querySelectorAll('[data-aba]').forEach(painel => {
    new MutationObserver(() => aplicarGateAcoesGranular('criancas'))
      .observe(painel, { childList: true, subtree: true })
  })
})()
