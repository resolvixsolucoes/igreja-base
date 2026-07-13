// ===== ESTADO =====
let pedidos     = []
let filtroAtivo = 'Pendente'

// ===== CARREGAR =====
async function carregarPedidos() {
  const { data, error } = await db
    .from('pedidos_oracao')
    .select('*')
    .order('criado_em', { ascending: false })

  if (error) {
    console.error('Erro ao carregar pedidos:', error)
    return
  }

  pedidos = data
  atualizarContadores()
  renderCards()
}

// ===== CONTADORES =====
function atualizarContadores() {
  const total    = pedidos.length
  const pendente = pedidos.filter(p => p.status === 'Pendente').length
  const atendido = pedidos.filter(p => p.status === 'Atendido').length

  document.getElementById('cnt-total').textContent    = total
  document.getElementById('cnt-pendente').textContent = pendente
  document.getElementById('cnt-atendido').textContent = atendido
}

// ===== FILTRO =====
function setFiltro(valor) {
  filtroAtivo = valor

  document.getElementById('filtro-todos').className    = 'btn-filtro'
  document.getElementById('filtro-pendente').className = 'btn-filtro'
  document.getElementById('filtro-atendido').className = 'btn-filtro'

  if (valor === 'todos')    document.getElementById('filtro-todos').classList.add('active-todos')
  if (valor === 'Pendente') document.getElementById('filtro-pendente').classList.add('active-pendente')
  if (valor === 'Atendido') document.getElementById('filtro-atendido').classList.add('active-atendido')

  renderCards()
}

// ===== MODAL NOVO PEDIDO =====
function abrirModal() {
  document.getElementById('input-nome').value     = ''
  document.getElementById('input-telefone').value = ''
  document.getElementById('input-pedido').value   = ''
  document.getElementById('modal-overlay').classList.add('active')
}

function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('active')
}

// ===== MODAL CONFIRMAÇÃO EXCLUSÃO =====
function abrirModalExcluir(id, nome) {
  const nomeEl  = document.getElementById('excluir-nome')
  const btnEl   = document.getElementById('btn-confirmar-excluir')
  const modalEl = document.getElementById('modal-excluir')

  if (!nomeEl || !btnEl || !modalEl) {
    console.error('Elementos do modal de exclusão não encontrados!')
    return
  }

  nomeEl.textContent = nome
  btnEl.onclick      = () => excluirPedido(id)
  modalEl.classList.add('active')
}

function fecharModalExcluir() {
  const modalEl = document.getElementById('modal-excluir')
  if (modalEl) modalEl.classList.remove('active')
}

// ===== EXCLUIR PEDIDO =====
async function excluirPedido(id) {
  const btnEl = document.getElementById('btn-confirmar-excluir')

  if (btnEl) {
    btnEl.disabled    = true
    btnEl.textContent = 'Excluindo...'
  }

  const { error } = await db
    .from('pedidos_oracao')
    .delete()
    .eq('id', id)

  if (btnEl) {
    btnEl.disabled    = false
    btnEl.textContent = 'Sim, excluir'
  }

  if (error) {
    console.error('Erro ao excluir pedido:', error)
    alert('Erro ao excluir o pedido. Tente novamente.')
    return
  }

  pedidos = pedidos.filter(p => p.id !== id)
  fecharModalExcluir()
  atualizarContadores()
  renderCards()
}

// ===== SALVAR PEDIDO MANUAL =====
async function salvarPedido() {
  const nome   = document.getElementById('input-nome').value.trim()
  const pedido = document.getElementById('input-pedido').value.trim()

  if (!nome)   { alert('O nome é obrigatório!');             return }
  if (!pedido) { alert('O pedido de oração é obrigatório!'); return }

  const payload = {
    nome,
    telefone: document.getElementById('input-telefone').value.trim() || null,
    pedido,
    origem:   'Manual',
    status:   'Pendente',
  }

  const { error } = await db.from('pedidos_oracao').insert(payload)

  if (error) {
    console.error('Erro ao salvar pedido:', error)
    alert('Erro ao salvar o pedido. Tente novamente.')
    return
  }

  fecharModal()
  carregarPedidos()
}

// ===== RENDER CARDS =====
function renderCards() {
    // ── Verifica permissões de campo ──
  const salvo = sessionStorage.getItem('permissoes_campos_pedido_oracao')
  const perms = salvo ? JSON.parse(salvo) : {}
  const verTelefone = perms['*']?.ver || perms['telefone']?.ver || false
  const verPedido   = perms['*']?.ver || perms['pedido']?.ver   || false

  const busca = document.getElementById('busca-oracao').value.toLowerCase()

  const lista = pedidos.filter(p => {
    const passaFiltro = filtroAtivo === 'todos' || p.status === filtroAtivo
    const passaBusca  = p.nome.toLowerCase().includes(busca)
    return passaFiltro && passaBusca
  })

  const grid = document.getElementById('cards-grid')
  grid.innerHTML = ''

  if (lista.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <span>🙏</span>
        <strong>Nenhum pedido encontrado</strong>
        <span>Tente outro filtro ou cadastre um novo pedido.</span>
      </div>`
    return
  }

  lista.forEach(p => {
    const isPendente    = p.status === 'Pendente'
    const dataFormatada = p.criado_em
      ? new Date(p.criado_em).toLocaleDateString('pt-BR')
      : '—'
    const origemLabel = p.origem === 'Visitante' ? '🙋 Visitante' : '✍️ Manual'
    const origemClass = p.origem === 'Visitante' ? 'visitante' : 'manual'

    const card = document.createElement('div')
    card.className = `pedido-card ${isPendente ? '' : 'atendido-card'}`
    card.id        = `card-${p.id}`

    card.innerHTML = `
      <div class="card-loading" id="loading-${p.id}">⏳</div>

      <div class="pedido-card-header">
        <div>
          <div class="pedido-nome">👤 ${p.nome}</div>
          ${verTelefone ? `<div class="pedido-telefone">${p.telefone ? '📞 ' + p.telefone : 'Sem telefone'}</div>` : ''}
          <span class="badge-origem ${origemClass}">${origemLabel}</span>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="badge-status ${isPendente ? 'pendente' : 'atendido'}">
            ${isPendente ? '⏳ Pendente' : '✅ Atendido'}
          </span>
          <button
            class="btn-excluir"
            data-acao="excluir"
            title="Excluir pedido"
            data-id="${p.id}"
            data-nome="${p.nome.replace(/"/g, '&quot;')}"
            onclick="abrirModalExcluir(this.dataset.id, this.dataset.nome)"
          >🗑️</button>
        </div>
      </div>

      ${verPedido ? `<div class="pedido-texto">"${p.pedido}"</div>` : ''}

      <div class="pedido-footer">
        <span class="pedido-data">📅 ${dataFormatada}</span>
        <button
          class="btn-marcar ${isPendente ? 'pendente' : 'atendido'}"
          data-acao="editar"
          id="btn-${p.id}"
          onclick="alternarStatus('${p.id}', '${p.status}')"
        >
          ${isPendente ? '✅ Marcar como Atendido' : '↩️ Marcar como Pendente'}
        </button>
      </div>
    `
    grid.appendChild(card)
  })
}

// ===== ALTERNAR STATUS =====
async function alternarStatus(id, statusAtual) {
  const novoStatus = statusAtual === 'Pendente' ? 'Atendido' : 'Pendente'

  const loadingEl = document.getElementById(`loading-${id}`)
  const btnEl     = document.getElementById(`btn-${id}`)
  if (loadingEl) loadingEl.classList.add('show')
  if (btnEl)     btnEl.disabled = true

  const { error } = await db
    .from('pedidos_oracao')
    .update({ status: novoStatus })
    .eq('id', id)

  if (error) {
    console.error('Erro ao atualizar status:', error)
    if (loadingEl) loadingEl.classList.remove('show')
    if (btnEl)     btnEl.disabled = false
    alert('Erro ao atualizar o status. Tente novamente.')
    return
  }

  const idx = pedidos.findIndex(p => p.id === id)
  if (idx !== -1) pedidos[idx].status = novoStatus

  atualizarContadores()
  renderCards()
}

// ===== INIT =====
;(async () => {
  await aguardarAuthReady()
  await carregarPedidos()
  setFiltro('Pendente')
  await carregarPermissoesCampos('pedido_oracao')
  aplicarPermissoesCampos('pedido_oracao')
  aplicarGateAcoesGranular('pedido_oracao')
  document.querySelectorAll('[data-aba]').forEach(painel => {
    new MutationObserver(() => aplicarGateAcoesGranular('pedido_oracao'))
      .observe(painel, { childList: true, subtree: true })
  })
})()
