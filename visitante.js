// ===== ESTADO =====
let visitantes = []
let editandoId = null

// ===== CARREGAR VISITANTES =====
async function carregarVisitantes() {
  const { data, error } = await db
    .from('visitantes')
    .select('id, nome, telefone, como_conheceu, data_visita, contactado, descricao_contato')
    .order('nome')

  if (error) {
    console.error('Erro ao carregar visitantes:', error)
    return
  }

  visitantes = data
  renderizarVisitantes(visitantes)

  await carregarPermissoesCampos('visitantes')
  aplicarPermissoesCampos('visitantes')
}

// ===== RENDERIZAR TABELA =====
function renderizarVisitantes(lista) {
  const tbody = document.getElementById('tabela-visitantes')
  tbody.innerHTML = ''

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;color:#aaa;padding:32px;">
          Nenhum visitante encontrado.
        </td>
      </tr>`
    return
  }

  lista.forEach(v => {
    const tr = document.createElement('tr')
    const badge = v.contactado
      ? `<button type="button" class="badge-contato sim" title="${(v.descricao_contato ?? 'Clique para editar o contato').replace(/"/g, '&quot;')}" onclick="event.stopPropagation(); abrirModalContato('${v.id}')">✅ Sim</button>`
      : `<button type="button" class="badge-contato nao" title="Clique para marcar como contactado" onclick="event.stopPropagation(); abrirModalContato('${v.id}')">⏳ Não</button>`
    tr.innerHTML = `
      <td>${v.nome}</td>
      <td>${v.telefone ? `<a href="https://wa.me/55${v.telefone.replace(/\D/g, '')}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:6px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>${v.telefone}</a>` : '—'}</td>
      <td>${v.como_conheceu ?? '—'}</td>
      <td>${v.data_visita ? v.data_visita.split('-').reverse().join('/') : '—'}</td>
      <td>${badge}</td>
      <td>
        <div class="acoes-cell">
          <button class="btn-acao editar" data-acao="editar" onclick="editarVisitante('${v.id}')">✏️ Editar</button>
          <button class="btn-acao excluir" data-acao="excluir" onclick="excluirVisitante('${v.id}')">🗑️ Excluir</button>
        </div>
      </td>
    `
    tbody.appendChild(tr)
  })
}

// ===== FILTRAR =====
function filtrarVisitantes() {
  const busca = document.getElementById('busca-visitante').value.toLowerCase()
  const filtrados = visitantes.filter(v =>
    v.nome.toLowerCase().includes(busca) ||
    (v.como_conheceu ?? '').toLowerCase().includes(busca)
  )
  renderizarVisitantes(filtrados)
}

// ===== ABRIR MODAL =====
function abrirModal() {
  editandoId = null
  document.getElementById('modal-titulo').textContent   = 'Novo Visitante'
  document.getElementById('input-nome').value           = ''
  document.getElementById('input-telefone').value       = ''
  document.getElementById('input-como-conheceu').value  = ''
  document.getElementById('input-data').value           = ''
  document.getElementById('input-oracao').value         = ''
  document.getElementById('modal-overlay').classList.add('active')
}

// ===== TOGGLE DESCRIÇÃO CONTATO =====
function toggleDescricaoContato() {
  const check = document.getElementById('input-contactado')
  const desc  = document.getElementById('input-descricao-contato')
  if (!check || !desc) return
  desc.disabled = !check.checked
}

// ===== MODAL CONTATO =====
let contatoEditandoId = null

function abrirModalContato(id) {
  const v = visitantes.find(v => v.id === id)
  if (!v) return
  contatoEditandoId = id
  document.getElementById('modal-contato-nome').textContent = v.nome
  document.getElementById('input-contactado').checked      = !!v.contactado
  document.getElementById('input-descricao-contato').value = v.descricao_contato ?? ''
  toggleDescricaoContato()
  document.getElementById('modal-contato-overlay').classList.add('active')
}

function fecharModalContato() {
  document.getElementById('modal-contato-overlay').classList.remove('active')
  contatoEditandoId = null
}

async function salvarContato() {
  if (!contatoEditandoId) return
  const contactado = document.getElementById('input-contactado').checked
  const descricaoContato = document.getElementById('input-descricao-contato').value.trim() || null

  const { error } = await db
    .from('visitantes')
    .update({
      contactado,
      descricao_contato: contactado ? descricaoContato : null,
    })
    .eq('id', contatoEditandoId)

  if (error) {
    alert('Erro ao atualizar contato!')
    console.error(error)
    return
  }

  fecharModalContato()
  carregarVisitantes()
}

// ===== FECHAR MODAL =====
function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('active')
}

// ===== EDITAR =====
function editarVisitante(id) {
  const v = visitantes.find(v => v.id === id)
  if (!v) return

  editandoId = id
  document.getElementById('modal-titulo').textContent   = 'Editar Visitante'
  document.getElementById('input-nome').value           = v.nome
  document.getElementById('input-telefone').value       = v.telefone      ?? ''
  document.getElementById('input-como-conheceu').value  = v.como_conheceu ?? ''
  document.getElementById('input-data').value           = v.data_visita   ?? ''
  document.getElementById('input-oracao').value         = '' // oração não é editável aqui
  document.getElementById('modal-overlay').classList.add('active')
}

// ===== SALVAR =====
async function salvarVisitante() {
  const nome     = document.getElementById('input-nome').value.trim()
  const telefone = document.getElementById('input-telefone').value.trim() || null
  const oracao   = document.getElementById('input-oracao').value.trim()   || null

  if (!nome) {
    alert('O nome é obrigatório!')
    return
  }

  const payload = {
    nome,
    telefone,
    como_conheceu: document.getElementById('input-como-conheceu').value.trim() || null,
    data_visita:   document.getElementById('input-data').value || null,
  }

  if (editandoId) {
    const { error } = await db
      .from('visitantes')
      .update(payload)
      .eq('id', editandoId)

    if (error) {
      alert('Erro ao atualizar visitante!')
      console.error(error)
      return
    }

  } else {
    const { data: visitanteData, error: errVisitante } = await db
      .from('visitantes')
      .insert(payload)
      .select('id')
      .single()

    if (errVisitante) {
      alert('Erro ao cadastrar visitante!')
      console.error(errVisitante)
      return
    }

    if (oracao) {
      const { error: errOracao } = await db
        .from('pedidos_oracao')
        .insert({
          nome,
          telefone,
          pedido:       oracao,
          origem:       'Visitante',
          status:       'Pendente',
          visitante_id: visitanteData.id,
        })

      if (errOracao) {
        console.error('⚠️ Visitante salvo, mas erro ao gravar pedido de oração:', errOracao)
      }
    }
  }

  fecharModal()
  carregarVisitantes()
}

// ===== EXCLUIR =====
async function excluirVisitante(id) {
  if (!confirm('Deseja excluir este visitante?')) return

  const { error } = await db
    .from('visitantes')
    .delete()
    .eq('id', id)

  if (error) {
    alert('Erro ao excluir visitante!')
    console.error(error)
    return
  }

  carregarVisitantes()
}

// ===== INIT =====
;(async () => {
  await aguardarAuthReady()
  await carregarVisitantes()
  aplicarGateAcoesGranular('visitantes')
  document.querySelectorAll('[data-aba]').forEach(painel => {
    new MutationObserver(() => aplicarGateAcoesGranular('visitantes'))
      .observe(painel, { childList: true, subtree: true })
  })
})()
