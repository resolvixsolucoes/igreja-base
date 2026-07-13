// ================================================================
//  inscricoes.js — Gestão de inscrições de eventos públicos
// ================================================================
const _db = db

let eventoSelecionado = null
let inscricoesCache   = []

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

function fmtData(str) {
  if (!str) return '—'
  const [a, m, d] = str.split('-').map(Number)
  return `${d} de ${MESES[m-1]}. de ${a}`
}

function fmtDataHora(isoStr) {
  const d = new Date(isoStr)
  return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })
    + ' · ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
}

function enderecoComposto(ins) {
  return [
    ins.rua && ins.numero ? `${ins.rua}, ${ins.numero}` : ins.rua || null,
    ins.complemento,
    ins.bairro,
    ins.cidade,
    ins.cep ? ins.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : null,
  ].filter(Boolean).join(' — ') || '—'
}

// ================================================================
//  INIT
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  await aguardarAuthReady()
  await carregarEventos()
  criarModal()
})

// ================================================================
//  CARREGA EVENTOS PÚBLICOS
// ================================================================
async function carregarEventos() {
  const { data, error } = await _db
    .from('eventos_igreja')
    .select('id, nome, data, hora, finalidade, publico, inscricoes_eventos(count)')
    .order('data', { ascending: false })

  const lista = document.getElementById('eventos-lista')
  const total = document.getElementById('sidebar-total')

  if (error || !data) {
    lista.innerHTML = '<div class="sidebar-vazio">❌ Erro ao carregar.</div>'
    return
  }

  // Mostra: eventos públicos atualmente OU eventos com inscrições (foram públicos e já aconteceram)
  const eventos = data.filter(ev => ev.publico || (ev.inscricoes_eventos?.[0]?.count ?? 0) > 0)

  if (!eventos.length) {
    lista.innerHTML = '<div class="sidebar-vazio">Nenhum evento público cadastrado ainda.</div>'
    total.textContent = '0 eventos'
    return
  }

  total.textContent = `${eventos.length} evento${eventos.length !== 1 ? 's' : ''}`
  lista.innerHTML = ''

  eventos.forEach(ev => {
    const count = ev.inscricoes_eventos?.[0]?.count ?? 0
    const item  = document.createElement('div')
    item.className = 'evento-item'
    item.dataset.id = ev.id
    item.innerHTML = `
      <div class="evento-item-info">
        <div class="evento-item-nome">${ev.nome}${ev.publico ? '' : ' <span class="evento-nao-publico" title="Não visível no site">🔒</span>'}</div>
        <div class="evento-item-data">📅 ${fmtData(ev.data)}${ev.hora ? ' · ' + ev.hora.slice(0,5) + 'h' : ''}</div>
      </div>
      <span class="evento-item-badge ${count === 0 ? 'zero' : ''}">${count}</span>
    `
    item.addEventListener('click', () => selecionarEvento(ev, item))
    lista.appendChild(item)
  })
}

// ================================================================
//  SELECIONA EVENTO → CARREGA INSCRIÇÕES
// ================================================================
async function selecionarEvento(ev, itemEl) {
  document.querySelectorAll('.evento-item').forEach(i => i.classList.remove('ativo'))
  itemEl.classList.add('ativo')
  eventoSelecionado = ev

  const painel = document.getElementById('inscricoes-painel')
  painel.innerHTML = `
    <div class="painel-header">
      <div class="painel-header-info">
        <h2>${ev.nome}</h2>
        <p>📅 ${fmtData(ev.data)}${ev.hora ? ' · ' + ev.hora.slice(0,5) + 'h' : ''} &nbsp;·&nbsp; <span id="painel-count">⏳ carregando...</span></p>
      </div>
      <div class="painel-acoes">
        <button class="btn-imprimir" onclick="imprimirInscricoes()">🖨️ Imprimir / PDF</button>
      </div>
    </div>
    <div class="tabela-wrap" id="tabela-wrap">
      <div class="tabela-vazia">⏳ Carregando inscrições...</div>
    </div>
  `

  const { data, error } = await _db
    .from('inscricoes_eventos')
    .select('*')
    .eq('evento_id', ev.id)
    .order('created_at')

  if (error) {
    document.getElementById('tabela-wrap').innerHTML =
      '<div class="tabela-vazia">❌ Erro ao carregar inscrições.</div>'
    return
  }

  inscricoesCache = data || []
  renderTabela()
  atualizarContador()
}

// ================================================================
//  RENDERIZA TABELA (compacta — detalhes no modal)
// ================================================================
function renderTabela() {
  const wrap = document.getElementById('tabela-wrap')
  if (!wrap) return

  if (!inscricoesCache.length) {
    wrap.innerHTML = '<div class="tabela-vazia">Nenhuma inscrição ainda.</div>'
    return
  }

  const linhas = inscricoesCache.map((ins, i) => `
    <tr>
      <td class="td-nome">${ins.nome}</td>
      <td style="color:#555;">${ins.telefone ? `<a href="https://wa.me/55${ins.telefone.replace(/\D/g,'')}" target="_blank" style="color:#25d366;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>${ins.telefone}</a>` : '—'}</td>
      <td class="td-num" style="color:#bbb;">${i + 1}</td>
      <td style="font-size:11px;color:#aaa;white-space:nowrap;">${fmtDataHora(ins.created_at)}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn-ver-insc" onclick="verInscricao('${ins.id}')">👁️ Ver detalhes</button>
          <button class="btn-excluir-insc" onclick="excluirInscricao('${ins.id}', '${ins.nome.replace(/'/g,"\\'")}')">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('')

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>Telefone</th>
          <th>#</th>
          <th>Inscrito em</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
    </table>
  `
}

function atualizarContador() {
  const el = document.getElementById('painel-count')
  if (el) {
    const n = inscricoesCache.length
    el.textContent = `${n} inscrito${n !== 1 ? 's' : ''}`
  }
  if (eventoSelecionado) {
    const item = document.querySelector(`.evento-item[data-id="${eventoSelecionado.id}"] .evento-item-badge`)
    if (item) {
      item.textContent = inscricoesCache.length
      item.className = `evento-item-badge${inscricoesCache.length === 0 ? ' zero' : ''}`
    }
  }
}

// ================================================================
//  MODAL DE DETALHES
// ================================================================
function criarModal() {
  if (document.getElementById('modal-inscricao')) return
  const m = document.createElement('div')
  m.id = 'modal-inscricao'
  m.innerHTML = `
    <div class="modal-backdrop" onclick="fecharModalInscricao()"></div>
    <div class="modal-box" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3 id="modal-titulo">Dados do Inscrito</h3>
        <button class="modal-fechar" onclick="fecharModalInscricao()">✕</button>
      </div>
      <div class="modal-body" id="modal-body"></div>
    </div>
  `
  document.body.appendChild(m)
}

window.verInscricao = function(id) {
  const ins = inscricoesCache.find(i => i.id === id)
  if (!ins) return

  document.getElementById('modal-titulo').textContent = ins.nome

  const campo = (label, valor) => `
    <div class="modal-campo">
      <span class="modal-label">${label}</span>
      <span class="modal-valor">${valor || '—'}</span>
    </div>
  `

  const end = enderecoComposto(ins)

  document.getElementById('modal-body').innerHTML = `
    <div class="modal-secao">
      ${campo('Nome completo', ins.nome)}
      ${campo('Data de nascimento', ins.data_nascimento ? fmtData(ins.data_nascimento) : null)}
      ${campo('Telefone', ins.telefone)}
      ${campo('E-mail', ins.email)}
    </div>
    <div class="modal-secao">
      <div class="modal-secao-titulo">Endereço</div>
      ${campo('CEP', ins.cep ? ins.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : null)}
      ${campo('Rua / N°', ins.rua ? `${ins.rua}${ins.numero ? ', ' + ins.numero : ''}` : null)}
      ${campo('Complemento', ins.complemento)}
      ${campo('Bairro', ins.bairro)}
      ${campo('Cidade', ins.cidade)}
    </div>
    <div class="modal-secao modal-secao-rodape">
      ${campo('Inscrito em', fmtDataHora(ins.created_at))}
    </div>
    <div class="modal-acoes">
      <button class="btn-excluir-insc" onclick="fecharModalInscricao(); excluirInscricao('${ins.id}', '${ins.nome.replace(/'/g,"\\'")}')">
        🗑️ Excluir inscrição
      </button>
    </div>
  `

  document.getElementById('modal-inscricao').classList.add('aberto')
}

window.fecharModalInscricao = function() {
  document.getElementById('modal-inscricao')?.classList.remove('aberto')
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') fecharModalInscricao()
})

// ================================================================
//  EXCLUIR INSCRIÇÃO
// ================================================================
window.excluirInscricao = async function(id, nome) {
  if (!confirm(`Excluir a inscrição de "${nome}"?`)) return

  const { error } = await _db
    .from('inscricoes_eventos')
    .delete()
    .eq('id', id)

  if (error) { alert('Erro ao excluir. Tente novamente.'); return }

  inscricoesCache = inscricoesCache.filter(i => i.id !== id)
  renderTabela()
  atualizarContador()
}

// ================================================================
//  IMPRIMIR / PDF
// ================================================================
window.imprimirInscricoes = function() {
  if (!eventoSelecionado) return

  const linhas = inscricoesCache.map((ins, i) => `
    <tr>
      <td class="col-num">${i + 1}</td>
      <td class="col-nome">${ins.nome}</td>
      <td class="col-nascimento">${ins.data_nascimento ? fmtData(ins.data_nascimento) : '—'}</td>
      <td class="col-telefone">${ins.telefone ? `<a href="https://wa.me/55${ins.telefone.replace(/\D/g,'')}" target="_blank" style="color:#25d366;text-decoration:none;display:inline-flex;align-items:center;gap:4px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>${ins.telefone}</a>` : '—'}</td>
      <td class="col-email">${ins.email || '—'}</td>
      <td class="col-endereco">${enderecoComposto(ins)}</td>
    </tr>
  `).join('')

  const agora = new Date().toLocaleDateString('pt-BR', {
    day:'2-digit', month:'long', year:'numeric'
  }) + ' às ' + new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })

  document.getElementById('print-area').innerHTML = `
    <div class="print-topo">
      <div class="print-logo-bloco">
        <img src="logo-escura.png" alt="Ministério Semente" class="print-logo" />
      </div>
      <div class="print-evento-info">
        <h1>${eventoSelecionado.nome}</h1>
        <p>
          📅 ${fmtData(eventoSelecionado.data)}${eventoSelecionado.hora ? ' · ' + eventoSelecionado.hora.slice(0,5) + 'h' : ''}
          &nbsp;·&nbsp;
          <strong>${inscricoesCache.length} inscrito${inscricoesCache.length !== 1 ? 's' : ''}</strong>
        </p>
        <p class="print-gerado">Gerado em ${agora}</p>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="col-num">#</th>
          <th class="col-nome">Nome</th>
          <th class="col-nascimento">Nascimento</th>
          <th class="col-telefone">Telefone</th>
          <th class="col-email">E-mail</th>
          <th class="col-endereco">Endereço</th>
        </tr>
      </thead>
      <tbody>
        ${linhas || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:20px;">Nenhuma inscrição.</td></tr>'}
      </tbody>
    </table>
    <div class="print-rodape">
      Ministério Semente &nbsp;·&nbsp; Lista de Inscrições &nbsp;·&nbsp; ${eventoSelecionado.nome}
    </div>
  `

  window.print()
}
