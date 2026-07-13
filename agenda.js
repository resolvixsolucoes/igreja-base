// ================================================================
//  agenda.js — Agenda da Ministério Semente
//  Eventos gerais/ministério + Aconselhamento Pastoral
// ================================================================
const _db = db

// ── Cache ──────────────────────────────────────────────────────
let eventosCache       = []
let ministeriosCache   = []
let conselheirosCache  = []
let dispCache          = []
let agendamentosCache  = []
let membrosCache       = []

// ── Estado de edição ───────────────────────────────────────────
let editandoEventoId      = null
let editandoConselheiroId = null
let agendStatusId         = null
let agendStatusTelefone   = ''
let agendStatusNome       = ''
let agendStatusConselheiroId = null

// ── Calendário ─────────────────────────────────────────────────
let calAno    = new Date().getFullYear()
let calMes    = new Date().getMonth()
let calDiaSel = null

const MESES_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]
const DIAS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

const FINALIDADE_COR = {
  culto:        '#7c3aed',
  conferencia:  '#2563eb',
  curso:        '#d97706',
  treinamento:  '#ea580c',
  reuniao:      '#374151',
  cafe:         '#92400e',
  festividade:  '#16a34a',
  pastoral:     '#dc2626',
}

const FINALIDADE_LABEL = {
  culto:        'Culto',
  conferencia:  'Conferência',
  curso:        'Curso',
  treinamento:  'Treinamento',
  reuniao:      'Reunião',
  cafe:         'Café',
  festividade:  'Festividade',
  pastoral:     'Atendimento Pastoral',
}

function corFinalidade(finalidade) {
  return FINALIDADE_COR[finalidade] || '#6b8e4e'
}

// ================================================================
//  INIT
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Fase 7.3 — espera auth.js popular AUTH.permissoesGranular
  await aguardarAuthReady()

  await Promise.all([
    carregarMinisterios(),
    carregarEventos(),
    carregarConselheiros(),
    carregarMembros(),
  ])
  aplicarModoConselheiro()
  popularSelectsConselheiros()
  renderCalendario()
  renderPainelDia()
  atualizarBadgePastoral()

  // Fase 7.3 — gate granular reaplicado quando calendario/listas re-renderizam.
  aplicarGateAcoesGranular('agenda')
  document.querySelectorAll('[data-aba]').forEach(painel => {
    new MutationObserver(() => aplicarGateAcoesGranular('agenda'))
      .observe(painel, { childList: true, subtree: true })
  })

  document.addEventListener('click', (e) => {
    const container = document.getElementById('inp-cons-sugestoes')
    const input     = document.getElementById('inp-cons-busca')
    if (
      container &&
      input &&
      !container.contains(e.target) &&
      e.target !== input
    ) {
      container.style.display = 'none'
    }
  })
})

// ================================================================
//  ABAS
// ================================================================
function trocarAba(nome, btn) {
  document.querySelectorAll('.aba-btn').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.aba-content').forEach(c => c.classList.remove('active'))
  btn.classList.add('active')
  document.getElementById('aba-' + nome).classList.add('active')

  if (nome === 'pastoral') {
    popularSelectsConselheiros()
    carregarDisponibilidades()
    carregarAgendamentos()
  }
}

// ================================================================
//  MODO CONSELHEIRO — usuário não-admin que é conselheiro vê
//  apenas suas próprias disponibilidades e agendamentos.
// ================================================================
let meuConselheiroId = null

function aplicarModoConselheiro() {
  if (window.AUTH?.isAdmin) {
    meuConselheiroId = null
    return
  }

  // Aba "Programações" (eventos) é restrita a admin — esconde botão + painel
  // e força a aba "Aconselhamento Pastoral" como ativa.
  const btnEventos     = document.querySelector('.aba-btn[data-aba="eventos"]')
  const painelEventos  = document.getElementById('aba-eventos')
  const btnPastoral    = document.querySelector('.aba-btn[data-aba="pastoral"]')
  const painelPastoral = document.getElementById('aba-pastoral')
  if (btnEventos)    btnEventos.style.display    = 'none'
  if (painelEventos) {
    painelEventos.style.display = 'none'
    painelEventos.classList.remove('active')
  }
  if (btnPastoral && painelPastoral) {
    document.querySelectorAll('.aba-btn').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.aba-content').forEach(c => c.classList.remove('active'))
    btnPastoral.classList.add('active')
    painelPastoral.classList.add('active')
    setTimeout(() => {
      carregarDisponibilidades()
      carregarAgendamentos()
    }, 0)
  }

  // Não-admin nunca vê a seção de gerência de conselheiros
  // (Indicar/editar/excluir conselheiro é restrito a admin).
  const secaoAdmin = document.getElementById('secao-conselheiros-admin')
  if (secaoAdmin) secaoAdmin.style.display = 'none'

  const meuMembroId = window.AUTH?.membroId
  if (!meuMembroId) return
  const meu = conselheirosCache.find(c => c.membro_id === meuMembroId && c.ativo)
  if (!meu) return
  meuConselheiroId = meu.id

  const wrapDispCons = document.getElementById('wrap-filtro-conselheiro')
  if (wrapDispCons) wrapDispCons.style.display = 'none'

  const wrapAgendCons = document.getElementById('wrap-filtro-agend-conselheiro')
  if (wrapAgendCons) wrapAgendCons.style.display = 'none'
}

// ================================================================
//  CONFIRM (modal interno — substitui window.confirm que pode ser
//  bloqueado pelo navegador apos primeira dispensa)
// ================================================================
function confirmarAcao(msg, titulo = 'Confirmar') {
  return new Promise(resolve => {
    const overlay = document.getElementById('modal-confirm')
    const tit     = document.getElementById('confirm-titulo')
    const txt     = document.getElementById('confirm-msg')
    const btnOk   = document.getElementById('confirm-btn-ok')
    const btnNo   = document.getElementById('confirm-btn-cancelar')
    if (!overlay) return resolve(window.confirm(msg))

    tit.textContent = titulo
    txt.textContent = msg
    overlay.classList.add('active')

    const cleanup = (val) => {
      overlay.classList.remove('active')
      btnOk.replaceWith(btnOk.cloneNode(true))
      btnNo.replaceWith(btnNo.cloneNode(true))
      resolve(val)
    }
    document.getElementById('confirm-btn-ok')      .addEventListener('click', () => cleanup(true))
    document.getElementById('confirm-btn-cancelar').addEventListener('click', () => cleanup(false))
  })
}

// ================================================================
//  TOAST
// ================================================================
function toast(msg, cor = '#6b8e4e') {
  const t = document.createElement('div')
  t.textContent = msg
  t.style.cssText = `
    position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
    background:${cor}; color:white; padding:12px 24px;
    border-radius:12px; font-size:14px; font-weight:600;
    box-shadow:0 6px 24px rgba(0,0,0,.18); z-index:9999;
    white-space:nowrap; animation:fadeInUp .3s ease;
  `
  if (!document.getElementById('agenda-anim')) {
    const s = document.createElement('style')
    s.id = 'agenda-anim'
    s.textContent = `
      @keyframes fadeInUp {
        from { opacity:0; transform:translateX(-50%) translateY(12px); }
        to   { opacity:1; transform:translateX(-50%) translateY(0); }
      }
    `
    document.head.appendChild(s)
  }
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 3000)
}

// ================================================================
//  MINISTÉRIOS
// ================================================================
async function carregarMinisterios() {
  const { data, error } = await _db
    .from('ministerios')
    .select('id, nome, icone')
    .order('nome')
  if (error) { console.error(error); return }
  ministeriosCache = data || []
}

// ================================================================
//  MEMBROS — autocomplete
// ================================================================
async function carregarMembros() {
  const { data, error } = await _db
    .from('membros')
    .select('id, nome, foto_url, status')
    .eq('status', 'Ativo')
    .order('nome')
  if (error) { console.error(error); return }
  membrosCache = data || []
  console.log('✅ Membros carregados:', membrosCache.length)
}

function filtrarMembrosBusca() {
  const termo     = document.getElementById('inp-cons-busca').value.trim().toLowerCase()
  const container = document.getElementById('inp-cons-sugestoes')

  document.getElementById('inp-cons-membro-id').value = ''
  document.getElementById('inp-cons-nome').value      = ''

  if (!termo) {
    container.style.display = 'none'
    container.innerHTML     = ''
    return
  }

  const filtrados = membrosCache
    .filter(m => m.nome.toLowerCase().includes(termo))
    .slice(0, 8)

  if (!filtrados.length) {
    container.style.display = 'none'
    container.innerHTML     = ''
    return
  }

  container.innerHTML = ''

  filtrados.forEach(m => {
    const inicial = m.nome[0].toUpperCase()

    const item = document.createElement('div')
    item.style.cssText = `
      display: flex; align-items: center; gap: 10px;
      padding: 9px 14px; cursor: pointer; font-size: 13px;
      border-bottom: 1px solid #f0f0f0; background: white;
      transition: background .15s;
    `

    const avatar = document.createElement('div')
    avatar.style.cssText = `
      width: 32px; height: 32px; border-radius: 50%;
      background: linear-gradient(135deg, #6b8e4e, #4a6a35);
      display: flex; align-items: center; justify-content: center;
      color: white; font-weight: 700; font-size: 13px;
      flex-shrink: 0; overflow: hidden;
    `
    if (m.foto_url) {
      avatar.innerHTML = `<img src="${m.foto_url}"
        style="width:32px;height:32px;object-fit:cover;border-radius:50%;" />`
    } else {
      avatar.textContent = inicial
    }

    const label = document.createElement('span')
    label.textContent = m.nome

    item.appendChild(avatar)
    item.appendChild(label)

    item.addEventListener('mouseenter', () => { item.style.background = '#f7faee' })
    item.addEventListener('mouseleave', () => { item.style.background = 'white' })

    item.addEventListener('click', () => {
      document.getElementById('inp-cons-busca').value      = m.nome
      document.getElementById('inp-cons-membro-id').value  = m.id
      document.getElementById('inp-cons-nome').value       = m.nome
      container.style.display = 'none'
    })

    container.appendChild(item)
  })

  container.style.display = 'block'
}

// ================================================================
//  EVENTOS
// ================================================================
async function carregarEventos() {
  const { data, error } = await _db
    .from('eventos_igreja')
    .select('*, ministerios(nome, icone)')
    .order('data')
    .order('hora')
  if (error) { console.error(error); return }
  eventosCache = data || []
  renderCalendario()
  filtrarEventos()
}

function filtrarEventos() {
  renderPainelDia()
}

function renderEventos(lista) {
  const grid = document.getElementById('eventos-grid')
  if (!grid) return
  grid.innerHTML = ''

  if (!lista.length) {
    grid.innerHTML = '<div class="empty-state">Nenhum evento encontrado.</div>'
    return
  }

  lista.forEach(ev => {
    const dataFmt = new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    })
    const horaFmt = ev.hora ? ev.hora.slice(0, 5) : '—'
    const isMin   = ev.tipo === 'ministerio'
    const minNome = ev.ministerios ? `${ev.ministerios.icone} ${ev.ministerios.nome}` : ''

    const card = document.createElement('div')
    card.className = `evento-card${isMin ? ' ministerio' : ''}`
    card.innerHTML = `
      <div class="evento-card-header">
        <h3>${ev.nome}</h3>
        <span class="evento-tipo-badge ${isMin ? 'badge-ministerio' : 'badge-geral'}">
          ${isMin ? '✨ Ministério' : '🌐 Geral'}
        </span>
      </div>
      <div class="evento-meta">
        <span>📅 ${dataFmt}</span>
        <span>⏰ ${horaFmt}</span>
        ${isMin && minNome ? `<span>${minNome}</span>` : ''}
      </div>
      <div class="evento-actions">
        ${ev.publico ? `<button class="btn-sm btn-ver-inscricoes" data-acao="inscricoes" style="background:#eef5e2;color:#4a6a35;">📋 Inscrições</button>` : ''}
        <button class="btn-sm btn-editar-evento" data-acao="editar" style="background:#f0f4ff;color:#3b5bdb;">✏️ Editar</button>
        <button class="btn-sm btn-sm-danger btn-excluir-evento" data-acao="excluir">🗑️ Excluir</button>
      </div>
    `

    if (ev.publico) {
      card.querySelector('.btn-ver-inscricoes')
        .addEventListener('click', () => abrirModalInscricoes(ev.id, ev.nome))
    }
    card.querySelector('.btn-editar-evento')
      .addEventListener('click', () => editarEvento(ev))
    card.querySelector('.btn-excluir-evento')
      .addEventListener('click', () => excluirEvento(ev.id, ev.nome))

    grid.appendChild(card)
  })
}

// ================================================================
//  MODAL EVENTO — abrir / fechar
// ================================================================
function togglePublico() {
  const checked = document.getElementById('inp-ev-publico').checked
  const bloco   = document.getElementById('bloco-publico')
  bloco.style.display = checked ? 'flex' : 'none'
}

function abrirModalEvento() {
  editandoEventoId = null
  document.getElementById('modal-evento-titulo').textContent = '📅 Nova Programação'
  document.getElementById('inp-ev-nome').value              = ''
  document.getElementById('inp-ev-data').value              = ''
  document.getElementById('inp-ev-hora').value              = ''
  document.getElementById('inp-ev-finalidade').value        = ''
  document.getElementById('inp-ev-repeticao').value         = 'nenhuma'
  document.getElementById('inp-ev-data-fim').value          = ''
  document.getElementById('bloco-repeticao').style.display  = 'none'
  document.getElementById('bloco-repeticao-wrap').style.display = 'block'
  document.getElementById('preview-repeticao').style.display = 'none'
  document.getElementById('preview-repeticao').innerHTML    = ''
  document.getElementById('preview-repeticao').className    = 'repeticao-preview'
  document.getElementById('inp-ev-publico').checked         = false
  document.getElementById('inp-ev-descricao').value         = ''
  document.getElementById('inp-ev-imagem').value            = ''
  document.getElementById('bloco-publico').style.display    = 'none'
  document.getElementById('inp-ev-freq-adultos').value      = ''
  document.getElementById('freq-criancas-lista').innerHTML  = ''
  document.getElementById('bloco-frequencia').style.display = 'none'
  document.getElementById('modal-evento').classList.add('active')
}

function editarEvento(ev) {
  editandoEventoId = ev.id
  document.getElementById('modal-evento-titulo').textContent = '✏️ Editar Programação'
  document.getElementById('inp-ev-nome').value              = ev.nome || ''
  document.getElementById('inp-ev-data').value              = ev.data || ''
  document.getElementById('inp-ev-hora').value              = ev.hora ? ev.hora.slice(0,5) : ''
  document.getElementById('inp-ev-finalidade').value        = ev.finalidade || ''
  document.getElementById('bloco-repeticao-wrap').style.display = 'none'
  document.getElementById('bloco-repeticao').style.display  = 'none'

  const publico = !!ev.publico
  document.getElementById('inp-ev-publico').checked         = publico
  document.getElementById('inp-ev-descricao').value         = ev.descricao_curta || ''
  document.getElementById('inp-ev-imagem').value            = ev.imagem_url      || ''
  document.getElementById('bloco-publico').style.display    = publico ? 'flex' : 'none'

  document.getElementById('inp-ev-freq-adultos').value = ev.total_presentes_adultos ?? ''
  if (ev.finalidade === 'culto') {
    document.getElementById('bloco-frequencia').style.display = 'block'
    carregarFrequenciaCriancasModal(ev)
  } else {
    document.getElementById('bloco-frequencia').style.display = 'none'
  }

  document.getElementById('modal-evento').classList.add('active')
}

function fecharModalEvento() {
  document.getElementById('modal-evento').classList.remove('active')
}

// Alterna o bloco de frequência quando a finalidade muda no modal (só
// faz sentido em modo edição — evento novo ainda não teve culto pra contar).
function toggleBlocoFrequencia() {
  const finalidade = document.getElementById('inp-ev-finalidade').value
  document.getElementById('bloco-frequencia').style.display =
    (editandoEventoId && finalidade === 'culto') ? 'block' : 'none'
}

// ================================================================
//  FREQUÊNCIA — crianças por salinha (auto via check-in, ou manual)
// ================================================================
async function carregarFrequenciaCriancasModal(ev) {
  const wrap = document.getElementById('freq-criancas-lista')
  wrap.innerHTML = '<div style="font-size:12px;color:#aaa;">Carregando...</div>'

  const [autoRes, manualRes] = await Promise.all([
    _db.rpc('relatorios_criancas_por_sala', { p_evento_id: ev.id, p_data: ev.data }),
    _db.from('frequencia_cultos_criancas').select('sala_id, total_manual').eq('evento_id', ev.id),
  ])

  if (autoRes.error) {
    console.error('Erro ao carregar crianças por sala:', autoRes.error)
    wrap.innerHTML = '<div style="font-size:12px;color:#c00;">Erro ao carregar salas.</div>'
    return
  }

  const manualMap = new Map((manualRes.data || []).map(r => [r.sala_id, r.total_manual]))

  wrap.innerHTML = ''
  ;(autoRes.data || []).forEach(sala => {
    const usaCheckin = sala.total_checkin > 0
    const manual = manualMap.get(sala.sala_id)
    const linha = document.createElement('div')
    linha.style.cssText = 'display:flex;align-items:center;gap:10px;'
    linha.innerHTML = `
      <span style="flex:1;font-size:13px;color:#333;">${sala.sala_nome}</span>
      <input type="number" min="0" class="inp-freq-sala" data-sala-id="${sala.sala_id}"
        value="${usaCheckin ? sala.total_checkin : (manual ?? '')}"
        ${usaCheckin ? 'disabled' : ''}
        placeholder="—"
        style="width:90px;box-sizing:border-box;padding:8px 10px;border:1.5px solid #d0e8e6;border-radius:8px;font-size:13px;text-align:center;${usaCheckin ? 'background:#f5f5f5;' : ''}" />
      ${usaCheckin ? '<span style="font-size:11px;color:#6b8e4e;white-space:nowrap;">🔄 via check-in</span>' : '<span style="width:80px;"></span>'}
    `
    wrap.appendChild(linha)
  })
}

// ================================================================
//  REPETIÇÃO — toggle + preview
// ================================================================
function toggleRepeticao() {
  const tipo  = document.getElementById('inp-ev-repeticao').value
  const bloco = document.getElementById('bloco-repeticao')
  bloco.style.display = tipo === 'nenhuma' ? 'none' : 'block'
  document.getElementById('preview-repeticao').style.display = 'none'
  document.getElementById('preview-repeticao').innerHTML     = ''
  document.getElementById('preview-repeticao').className     = 'repeticao-preview'
}

function gerarDatasRepeticao(dataInicio, dataFim, tipo) {
  const datas  = []
  const fim    = new Date(dataFim + 'T00:00:00')
  let   cursor = new Date(dataInicio + 'T00:00:00')

  while (true) {
    if (tipo === 'semanal')   cursor.setDate(cursor.getDate() + 7)
    if (tipo === 'quinzenal') cursor.setDate(cursor.getDate() + 14)
    if (tipo === 'mensal')    cursor.setMonth(cursor.getMonth() + 1)

    if (cursor > fim) break

    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    datas.push(`${y}-${m}-${d}`)
  }

  return datas
}

function atualizarPreviewRepeticao() {
  const dataInicio = document.getElementById('inp-ev-data').value
  const dataFim    = document.getElementById('inp-ev-data-fim').value
  const tipo       = document.getElementById('inp-ev-repeticao').value
  const preview    = document.getElementById('preview-repeticao')

  if (tipo === 'nenhuma' || !dataInicio || !dataFim) {
    preview.style.display = 'none'
    return
  }

  if (dataFim <= dataInicio) {
    preview.className     = 'repeticao-preview erro'
    preview.style.display = 'block'
    preview.innerHTML     = '⚠️ A data final deve ser após a data inicial.'
    return
  }

  const extras = gerarDatasRepeticao(dataInicio, dataFim, tipo)
  const total  = extras.length + 1

  const tipoLabel = { semanal: 'Semanal', quinzenal: 'Quinzenal', mensal: 'Mensal' }[tipo]

  const primeiraFmt = new Date(dataInicio + 'T00:00:00')
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  const ultimaFmt = extras.length
    ? new Date(extras[extras.length - 1] + 'T00:00:00')
        .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : primeiraFmt

  preview.className     = 'repeticao-preview'
  preview.style.display = 'block'
  preview.innerHTML     = `
    🔁 <strong>${tipoLabel}</strong> &nbsp;·&nbsp;
    📦 <strong>${total} evento${total > 1 ? 's' : ''}</strong> &nbsp;·&nbsp;
    De <strong>${primeiraFmt}</strong> até <strong>${ultimaFmt}</strong>
  `
}

// ================================================================
//  SALVAR EVENTO (único ou com repetição)
// ================================================================
async function salvarEvento() {
  const nome          = document.getElementById('inp-ev-nome').value.trim()
  const data          = document.getElementById('inp-ev-data').value
  const hora          = document.getElementById('inp-ev-hora').value
  const finalidade    = document.getElementById('inp-ev-finalidade').value
  const repeticao     = document.getElementById('inp-ev-repeticao').value
  const dataFim       = document.getElementById('inp-ev-data-fim').value
  const publico   = document.getElementById('inp-ev-publico').checked
  const descricao = document.getElementById('inp-ev-descricao').value.trim() || null
  const imagemUrl = document.getElementById('inp-ev-imagem').value.trim()    || null

  if (!nome)       { alert('Informe o nome do evento.'); return }
  if (!data)       { alert('Informe a data do evento.'); return }
  if (!hora)       { alert('Informe a hora do evento.'); return }
  if (!finalidade) { alert('Selecione a finalidade da programação.'); return }

  // Em modo edição não há repetição
  if (!editandoEventoId && repeticao !== 'nenhuma') {
    if (!dataFim)        { alert('Informe a data final da repetição.'); return }
    if (dataFim <= data) { alert('A data final deve ser após a data inicial.'); return }
  }

  let todasAsDatas = [data]
  if (!editandoEventoId && repeticao !== 'nenhuma') {
    const extras = gerarDatasRepeticao(data, dataFim, repeticao)
    todasAsDatas = [data, ...extras]
  }

  const tipoLabel = {
    nenhuma:   'Único',
    semanal:   'Semanal',
    quinzenal: 'Quinzenal',
    mensal:    'Mensal',
  }[repeticao]

  const primeiraFmt = new Date(todasAsDatas[0] + 'T00:00:00')
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
  const ultimaFmt   = new Date(todasAsDatas[todasAsDatas.length - 1] + 'T00:00:00')
    .toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  const msg = repeticao === 'nenhuma'
    ? `Confirma o cadastro do evento?\n\n📌 ${nome}\n📅 ${primeiraFmt} às ${hora}`
    : `Confirma o cadastro com repetição?\n\n📌 ${nome}\n🔁 ${tipoLabel}\n📅 ${primeiraFmt} → ${ultimaFmt}\n📦 Total: ${todasAsDatas.length} evento${todasAsDatas.length > 1 ? 's' : ''}`

  if (!await confirmarAcao(msg, editandoEventoId ? 'Salvar alterações' : 'Cadastrar evento')) return

  if (editandoEventoId) {
    const payload = {
      nome, data, hora, finalidade,
      publico, descricao_curta: descricao, imagem_url: imagemUrl,
    }
    if (finalidade === 'culto') {
      const freqAdultos = document.getElementById('inp-ev-freq-adultos').value
      payload.total_presentes_adultos = freqAdultos === '' ? null : parseInt(freqAdultos, 10)
    }

    const { error } = await _db.from('eventos_igreja').update(payload).eq('id', editandoEventoId)
    if (error) { alert('Erro ao salvar alterações.'); console.error(error); return }

    if (finalidade === 'culto') {
      const salvasCriancas = Array.from(document.querySelectorAll('.inp-freq-sala:not([disabled])')).map(inp => {
        const salaId = parseInt(inp.dataset.salaId, 10)
        const valor  = inp.value === '' ? null : parseInt(inp.value, 10)
        return _db.rpc('relatorios_definir_frequencia_crianca_sala', {
          p_evento_id: editandoEventoId, p_sala_id: salaId, p_total: valor,
        })
      })
      const resultados = await Promise.all(salvasCriancas)
      const erroSala = resultados.find(r => r.error)
      if (erroSala) console.error('Erro ao salvar frequência de sala:', erroSala.error)
    }

    fecharModalEvento()
    toast('✅ Evento atualizado!')
    await carregarEventos()
    return
  }

  const payload = todasAsDatas.map(d => ({
    nome,
    data:            d,
    hora,
    tipo:            'geral',
    finalidade,
    ministerio_id:   null,
    publico,
    descricao_curta: descricao,
    imagem_url:      imagemUrl,
  }))

  const { error } = await _db.from('eventos_igreja').insert(payload)
  if (error) { alert('Erro ao salvar evento(s).'); console.error(error); return }

  fecharModalEvento()
  toast(`✅ ${payload.length} evento${payload.length > 1 ? 's' : ''} salvo${payload.length > 1 ? 's' : ''}!`)
  await carregarEventos()
}

// ================================================================
//  MODAL INSCRIÇÕES
// ================================================================
async function abrirModalInscricoes(eventoId, nomeEvento) {
  document.getElementById('modal-inscricoes-titulo').textContent = `Inscrições — ${nomeEvento}`
  document.getElementById('modal-inscricoes-total').textContent  = ''
  document.getElementById('modal-inscricoes-loading').style.display = 'block'
  document.getElementById('modal-inscricoes-vazio').style.display   = 'none'
  document.getElementById('modal-inscricoes-wrap').style.display    = 'none'
  document.getElementById('modal-inscricoes').classList.add('active')
  await carregarInscricoes(eventoId)
}

function fecharModalInscricoes() {
  document.getElementById('modal-inscricoes').classList.remove('active')
}

window.excluirInscricaoModal = async function(id, nome) {
  if (!await confirmarAcao(`Excluir a inscrição de "${nome}"?`, 'Excluir inscrição')) return
  const { error } = await _db.from('inscricoes_eventos').delete().eq('id', id)
  if (error) { toast('❌ Erro ao excluir.', '#e74c3c'); return }
  const row = document.getElementById(`insc-row-${id}`)
  if (row) row.remove()
  const tbody = document.getElementById('modal-inscricoes-tbody')
  const total = tbody ? tbody.querySelectorAll('tr').length : 0
  document.getElementById('modal-inscricoes-total').textContent =
    `${total} inscrito${total !== 1 ? 's' : ''}`
  if (total === 0) {
    document.getElementById('modal-inscricoes-wrap').style.display = 'none'
    document.getElementById('modal-inscricoes-vazio').style.display = 'block'
  }
  toast('✅ Inscrição removida.')
}

async function carregarInscricoes(eventoId) {
  const { data, error } = await _db
    .from('inscricoes_eventos')
    .select('*')
    .eq('evento_id', eventoId)
    .order('created_at')

  document.getElementById('modal-inscricoes-loading').style.display = 'none'

  if (error) {
    document.getElementById('modal-inscricoes-vazio').textContent = '❌ Erro ao carregar inscrições.'
    document.getElementById('modal-inscricoes-vazio').style.display = 'block'
    return
  }

  if (!data || data.length === 0) {
    document.getElementById('modal-inscricoes-vazio').style.display = 'block'
    return
  }

  document.getElementById('modal-inscricoes-total').textContent = `${data.length} inscrito${data.length !== 1 ? 's' : ''}`
  const tbody = document.getElementById('modal-inscricoes-tbody')
  tbody.innerHTML = ''

  data.forEach((ins, i) => {
    const nasc = ins.data_nascimento
      ? new Date(ins.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR')
      : '—'
    const dt = new Date(ins.created_at).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
    const end = [
      ins.rua && ins.numero ? `${ins.rua}, ${ins.numero}` : ins.rua || null,
      ins.complemento, ins.bairro, ins.cidade,
      ins.cep ? ins.cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : null
    ].filter(Boolean).join(' — ') || '—'

    const tr = document.createElement('tr')
    tr.id = `insc-row-${ins.id}`
    tr.style.borderBottom = '1px solid #f0f0f0'
    tr.innerHTML = `
      <td style="padding:10px 12px;color:#aaa;font-size:12px;">${i + 1}</td>
      <td style="padding:10px 12px;font-weight:600;color:#242e1a;">${ins.nome}</td>
      <td style="padding:10px 12px;color:#555;">${nasc}</td>
      <td style="padding:10px 12px;color:#555;">${ins.email || '—'}</td>
      <td style="padding:10px 12px;color:#555;font-size:12px;">${end}</td>
      <td style="padding:10px 12px;color:#555;">${ins.telefone || '—'}</td>
      <td style="padding:10px 12px;color:#aaa;font-size:12px;white-space:nowrap;">${dt}</td>
      <td style="padding:10px 12px;">
        <button onclick="excluirInscricaoModal('${ins.id}','${ins.nome.replace(/'/g,"\\'")}')"
          style="padding:4px 10px;border-radius:7px;border:none;background:#ffeaea;color:#c0392b;font-size:11px;font-weight:700;cursor:pointer;">
          🗑️
        </button>
      </td>
    `
    tbody.appendChild(tr)
  })

  document.getElementById('modal-inscricoes-wrap').style.display = 'block'
}

async function excluirEvento(id, nome) {
  console.log('🔴 Tentando excluir evento ID:', id)
  if (!await confirmarAcao(`Deseja excluir o evento "${nome}"?`, 'Excluir evento')) return

  const { data, error, status } = await _db
    .from('eventos_igreja')
    .delete()
    .eq('id', id)
    .select()

  console.log('Status:', status, '| Data:', data, '| Erro:', error)

  if (error) { alert('Erro ao excluir evento.'); console.error(error); return }
  if (!data || data.length === 0) {
    console.warn('⚠️ Nenhuma linha deletada — verifique RLS no Supabase.')
    alert('Nenhuma linha foi excluída. Verifique as políticas RLS no Supabase.')
    return
  }

  toast('🗑️ Evento excluído.', '#e74c3c')
  await carregarEventos()
}

// ================================================================
//  CALENDÁRIO
// ================================================================
function renderCalendario() {
  const titulo = document.getElementById('cal-titulo')
  const grid   = document.getElementById('cal-grid')
  if (!titulo || !grid) return

  titulo.textContent = `${MESES_PT[calMes]} ${calAno}`
  grid.innerHTML = ''

  DIAS_PT.forEach(d => {
    const dow = document.createElement('div')
    dow.className   = 'cal-dow'
    dow.textContent = d
    grid.appendChild(dow)
  })

  const mesStr  = String(calMes + 1).padStart(2, '0')
  const prefixo = `${calAno}-${mesStr}-`
  const eventosPorDia = {}
  eventosCache.forEach(ev => {
    if (ev.data && ev.data.startsWith(prefixo)) {
      const dia = ev.data.slice(8, 10)
      if (!eventosPorDia[dia]) eventosPorDia[dia] = []
      eventosPorDia[dia].push(ev)
    }
  })

  const primeiroDia = new Date(calAno, calMes, 1).getDay()
  for (let i = 0; i < primeiroDia; i++) {
    const vazio = document.createElement('div')
    vazio.className = 'cal-day vazio'
    grid.appendChild(vazio)
  }

  const totalDias = new Date(calAno, calMes + 1, 0).getDate()
  const hoje      = new Date()
  const hojeStr   = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`

  for (let d = 1; d <= totalDias; d++) {
    const diaStr  = String(d).padStart(2, '0')
    const dataStr = `${calAno}-${mesStr}-${diaStr}`
    const evsDia  = eventosPorDia[diaStr] || []

    const cell = document.createElement('div')
    cell.className = 'cal-day'
    if (dataStr === hojeStr)   cell.classList.add('hoje')
    if (dataStr === calDiaSel) cell.classList.add('selecionado')

    const num = document.createElement('div')
    num.className   = 'cal-num'
    num.textContent = d
    cell.appendChild(num)

    if (evsDia.length) {
      const dots = document.createElement('div')
      dots.className = 'cal-dots'
      evsDia.slice(0, 3).forEach(ev => {
        const dot = document.createElement('span')
        dot.className        = 'cal-dot'
        dot.style.background = corFinalidade(ev.finalidade)
        dot.title            = ev.nome
        dots.appendChild(dot)
      })
      cell.appendChild(dots)
    }

    cell.addEventListener('click', () => calSelecionarDia(dataStr))
    grid.appendChild(cell)
  }

  const btnLimpar = document.getElementById('cal-limpar')
  if (btnLimpar) btnLimpar.classList.toggle('visivel', !!calDiaSel)

  renderMiniMeses()
}

function renderMiniMeses() {
  const wrap = document.getElementById('mini-meses-wrap')
  if (!wrap) return
  wrap.innerHTML = ''

  const hoje    = new Date()
  const hojeStr = hoje.getFullYear() + '-' +
    String(hoje.getMonth()+1).padStart(2,'0') + '-' +
    String(hoje.getDate()).padStart(2,'0')

  for (let m = 0; m < 12; m++) {
    const miniEl = document.createElement('div')
    miniEl.className = 'mini-mes' + (m === calMes ? ' ativo' : '')

    if (m !== calMes) {
      miniEl.addEventListener('click', () => {
        calMes    = m
        calDiaSel = null
        renderCalendario()
        renderPainelDia()
      })
    }

    const tit = document.createElement('div')
    tit.className   = 'mini-mes-titulo'
    tit.textContent = MESES_PT[m] + ' ' + calAno
    miniEl.appendChild(tit)

    const miniGrid = document.createElement('div')
    miniGrid.className = 'mini-mes-grid'

    'DSTQQSS'.split('').forEach(l => {
      const dow = document.createElement('div')
      dow.className   = 'mini-dow'
      dow.textContent = l
      miniGrid.appendChild(dow)
    })

    const primeiroDia2 = new Date(calAno, m, 1).getDay()
    for (let i = 0; i < primeiroDia2; i++) {
      miniGrid.appendChild(document.createElement('div'))
    }

    const mesStr2  = String(m + 1).padStart(2, '0')
    const prefixo2 = calAno + '-' + mesStr2 + '-'
    const diasComEvento = new Set()
    eventosCache.forEach(ev => {
      if (ev.data && ev.data.startsWith(prefixo2)) {
        diasComEvento.add(parseInt(ev.data.slice(8, 10)))
      }
    })

    const totalDias2 = new Date(calAno, m + 1, 0).getDate()
    for (let d = 1; d <= totalDias2; d++) {
      const cell   = document.createElement('div')
      const diaStr = String(d).padStart(2, '0')
      const dtStr  = calAno + '-' + mesStr2 + '-' + diaStr
      cell.className   = 'mini-dia'
      cell.textContent = d
      if (dtStr === hojeStr)    cell.classList.add('hoje-mini')
      if (diasComEvento.has(d)) cell.classList.add('tem-evento')
      miniGrid.appendChild(cell)
    }

    miniEl.appendChild(miniGrid)
    wrap.appendChild(miniEl)
  }
}

function calNavegar(delta) {
  calMes += delta
  if (calMes < 0)  { calMes = 11; calAno-- }
  if (calMes > 11) { calMes = 0;  calAno++ }
  renderCalendario()
}

function calSelecionarDia(dataStr) {
  calDiaSel = calDiaSel === dataStr ? null : dataStr
  renderCalendario()
  renderPainelDia()
}

function calLimparSelecao() {
  calDiaSel = null
  renderCalendario()
  renderPainelDia()
}

// ================================================================
//  PAINEL DO DIA
// ================================================================
async function renderPainelDia() {
  const wrap   = document.getElementById('dia-eventos-wrap')
  const titulo = document.getElementById('dia-eventos-titulo')
  const lista  = document.getElementById('dia-eventos-lista')
  if (!wrap) return

  if (!calDiaSel) {
    wrap.style.display = 'none'
    return
  }

  const evsDia  = eventosCache.filter(ev => ev.data === calDiaSel)
  const dataFmt = new Date(calDiaSel + 'T00:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  })

  titulo.textContent = dataFmt
  lista.innerHTML    = '<p style="color:#bbb;font-size:13px;padding:12px 0;">Carregando...</p>'
  wrap.style.display = 'block'

  if (!evsDia.length) {
    lista.innerHTML = `
      <p style="color:#bbb;font-size:13px;text-align:center;padding:16px 0;">
        Nenhuma programação neste dia.
      </p>`
    return
  }

  // ── Busca escalas ──────────────────────────────────────────────
  const evIds = evsDia.map(ev => ev.id)

  // ministerio_escala nao tem ministerio_id; usamos sala_id (Levinho) pra rotear.
  const { data: escalas } = await _db
    .from('ministerio_escala')
    .select('id, evento_id, status, sala_id, checkin_em, voluntarios(id, nome, telefone, ministerio_ids)')
    .in('evento_id', evIds)

  // ── Busca ministérios ──────────────────────────────────────────
  const { data: todosMinisterios } = await _db
    .from('ministerios')
    .select('id, nome, icone')

  const ministerioMap = {}
  ;(todosMinisterios || []).forEach(m => { ministerioMap[m.id] = m })

  // ── Busca salas do Levinho (para sub-agrupamento) ──────────────
  const { data: salasLevinho } = await _db
    .from('levinho_salas')
    .select('id, nome, ordem')
    .order('ordem')

  const salaMap = {}
  ;(salasLevinho || []).forEach(s => { salaMap[s.id] = s })

  // Descobre o id do ministerio Levinho (pra rotear escalas com sala_id)
  const stripAcc = s => (s || '').toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const levinhoMin = (todosMinisterios || []).find(m => stripAcc(m.nome).startsWith('levinho'))
  const levinhoMinId = levinhoMin ? levinhoMin.id : null

  // ── Busca disponibilidades pra descobrir em qual ministerio cada
  //    voluntario foi escalado (ministerio_escala nao guarda ministerio_id).
  const { data: disps } = await _db
    .from('disponibilidade')
    .select('voluntario_id, evento_id, ministerio_id')
    .in('evento_id', evIds)

  // Map: `${voluntario_id}|${evento_id}` -> Set(ministerio_ids)
  const dispMap = new Map()
  ;(disps || []).forEach(d => {
    if (!d.voluntario_id || !d.evento_id || !d.ministerio_id) return
    const k = d.voluntario_id + '|' + d.evento_id
    if (!dispMap.has(k)) dispMap.set(k, new Set())
    dispMap.get(k).add(d.ministerio_id)
  })

  // ── Busca repertório de música vinculado a esses eventos ───────
  // ALTERAÇÃO: adicionado spotify_url no select
  const { data: playlistEventos } = await _db
    .from('playlist_eventos')
    .select('evento_id, ordem, playlist_musicas(titulo, artista, tonalidade, bpm, spotify_url)')
    .in('evento_id', evIds)
    .order('ordem')

  // Agrupa músicas por evento_id
  const repertorioPorEvento = {}
  ;(playlistEventos || []).forEach(pe => {
    if (!repertorioPorEvento[pe.evento_id]) repertorioPorEvento[pe.evento_id] = []
    if (pe.playlist_musicas) {
      repertorioPorEvento[pe.evento_id].push({
        ordem:       pe.ordem,
        titulo:      pe.playlist_musicas.titulo,
        artista:     pe.playlist_musicas.artista,
        tonalidade:  pe.playlist_musicas.tonalidade,
        bpm:         pe.playlist_musicas.bpm,
        spotify_url: pe.playlist_musicas.spotify_url, // NOVO
      })
    }
  })

  // ── Agrupa escalas por evento_id ───────────────────────────────
  const escalasPorEvento = {}
  ;(escalas || []).forEach(e => {
    if (!escalasPorEvento[e.evento_id]) escalasPorEvento[e.evento_id] = []
    escalasPorEvento[e.evento_id].push(e)
  })

  lista.innerHTML = ''

  evsDia.forEach(ev => {
    const cor      = corFinalidade(ev.finalidade)
    const horaFmt  = ev.hora ? ev.hora.slice(0, 5) : '—'
    const finLabel = ev.finalidade ? (FINALIDADE_LABEL[ev.finalidade] || ev.finalidade) : ''
    const isMin    = ev.tipo === 'ministerio'
    const minNome  = ev.ministerios
      ? (ev.ministerios.icone + ' ' + ev.ministerios.nome) : ''

    const escEv      = escalasPorEvento[ev.id]     || []
    const repertorio = repertorioPorEvento[ev.id]  || []

    // ── Voluntários agrupados por ministério ───────────────────
    // Prioriza ministerio_id da própria escala (correto). Se ausente,
    // cai pro primeiro ministério do voluntário (legado).
    const porMinisterio = {}
    const semMinisterio = []

    escEv.forEach(e => {
      const vol      = e.voluntarios
      const ids      = Array.isArray(vol?.ministerio_ids) ? vol.ministerio_ids : []
      const status   = e.status
      const salaId   = e.sala_id ?? null
      const escalaId = e.id
      const checkinEm = e.checkin_em || null

      // Heuristica de roteamento (ministerio_escala nao guarda ministerio_id):
      // 1. sala_id preenchido -> Levinho.
      // 2. evento e do tipo 'ministerio' -> usa o ministerio do evento (se vol pertence).
      // 3. Cruza com disponibilidade pra ver qual ministerio aceitou esse vol.
      // 4. Fallback: primeiro ministerio do voluntario (legado).
      let minId = null

      if (salaId && levinhoMinId) {
        minId = levinhoMinId
      } else if (ev.tipo === 'ministerio' && ev.ministerio_id) {
        // So roteia pro ministerio do evento se o vol realmente pertence a ele
        // (evita encaixar voluntario que so estaria por outro motivo).
        if (!ids.length || ids.includes(ev.ministerio_id)) {
          minId = ev.ministerio_id
        }
      }

      if (!minId) {
        const dispMins = dispMap.get(vol?.id + '|' + ev.id)
        if (dispMins && dispMins.size === 1) {
          // Vol opt-in em apenas 1 ministerio pra esse evento -> certeiro.
          minId = [...dispMins][0]
        } else if (dispMins && dispMins.size > 1) {
          // Multiplo: prefere Levinho se sala_id, senao interseccao com vol.ministerio_ids
          // mantendo a ordem do voluntario (estavel).
          const inter = ids.filter(id => dispMins.has(id))
          minId = inter[0] || [...dispMins][0]
        }
      }

      if (!minId && ids.length) minId = ids[0]

      if (!minId) { semMinisterio.push({ vol, status, escalaId, checkinEm }); return }
      if (!porMinisterio[minId]) porMinisterio[minId] = { info: ministerioMap[minId], vols: [] }
      porMinisterio[minId].vols.push({ vol, status, salaId, escalaId, checkinEm })
    })

    // É hoje? (usado pra exibir botão de check-in)
    const _hojeAgenda = new Date()
    const _hojeStrAgenda = _hojeAgenda.getFullYear() + '-' +
      String(_hojeAgenda.getMonth() + 1).padStart(2, '0') + '-' +
      String(_hojeAgenda.getDate()).padStart(2, '0')
    const eventoEhHoje = ev.data === _hojeStrAgenda

    // ── HTML dos voluntários ───────────────────────────────────
    let volsHtml = ''
    if (!escEv.length) {
      volsHtml = '<p class="dia-ev-sem-escala">Nenhum voluntário escalado ainda.</p>'
    } else {
      volsHtml = '<div class="dia-ev-escalados">'

      const renderGrupo = (titulo, classe, lista, comTel) => {
        if (!lista.length) return ''
        let h = '<div class="esc-grupo' + (classe ? ' ' + classe : '') + '">'
        h += '<span class="esc-grupo-titulo">' + titulo + ' (' + lista.length + ')</span>'
        lista.forEach(({ vol, escalaId, checkinEm }) => {
          h += '<span class="esc-vol-nome">' + (vol?.nome || '—')
          if (comTel && vol?.telefone) h += ' <span class="esc-vol-tel">· ' + vol.telefone + '</span>'
          if (eventoEhHoje && escalaId) {
            h += (' ' + window.renderCheckinEscalaBadge(escalaId, checkinEm))
          }
          h += '</span>'
        })
        h += '</div>'
        return h
      }

      Object.values(porMinisterio).forEach(({ info, vols }) => {
        const minLabel = info ? (info.icone + ' ' + info.nome) : '✨ Ministério'

        volsHtml += '<div class="esc-ministerio-bloco">'
        volsHtml += '<div class="esc-ministerio-titulo">' + minLabel + '</div>'

        // Sub-agrupa por sala se algum vol tem sala_id (Levinho).
        const temSala = vols.some(v => v.salaId)
        const grupos  = []

        if (temSala) {
          const porSala = new Map()
          vols.forEach(v => {
            const k = v.salaId ?? '__sem__'
            if (!porSala.has(k)) porSala.set(k, [])
            porSala.get(k).push(v)
          })
          // Ordena por ordem da sala (definida em levinho_salas)
          const chaves = [...porSala.keys()].sort((a, b) => {
            const oa = a === '__sem__' ? 9999 : (salaMap[a]?.ordem ?? a)
            const ob = b === '__sem__' ? 9999 : (salaMap[b]?.ordem ?? b)
            return oa - ob
          })
          chaves.forEach(k => {
            const nomeSala = k === '__sem__'
              ? 'Sem sala'
              : (salaMap[k]?.nome || ('Sala ' + k))
            grupos.push({ label: '🚪 ' + nomeSala, vols: porSala.get(k) })
          })
        } else {
          grupos.push({ label: null, vols })
        }

        grupos.forEach(({ label, vols: gvols }) => {
          if (label) {
            volsHtml += '<div class="esc-sala-titulo" style="font-size:11px;font-weight:700;color:#4a6a35;margin:6px 0 2px;text-transform:uppercase;letter-spacing:0.4px;">'
              + label + ' <span style="color:#aaa;font-weight:500;">(' + gvols.length + ')</span></div>'
          }
          const confirmados = gvols.filter(v => v.status === 'confirmado')
          const pendentes   = gvols.filter(v => v.status === 'pendente')
          const recusados   = gvols.filter(v => v.status === 'recusado')
          volsHtml += renderGrupo('✅ Confirmados', '', confirmados, true)
          volsHtml += renderGrupo('⏳ Pendentes',  'esc-grupo-pend', pendentes, false)
          volsHtml += renderGrupo('❌ Recusados',  'esc-grupo-rec',  recusados, false)
        })

        volsHtml += '</div>'
      })

      if (semMinisterio.length) {
        volsHtml += '<div class="esc-ministerio-bloco">'
        volsHtml += '<div class="esc-ministerio-titulo">👤 Sem ministério</div>'
        volsHtml += '<div class="esc-grupo">'
        semMinisterio.forEach(({ vol, status, escalaId, checkinEm }) => {
          const icon = status === 'confirmado' ? '✅' : status === 'recusado' ? '❌' : '⏳'
          volsHtml += '<span class="esc-vol-nome">' + icon + ' ' + (vol?.nome || '—')
          if (eventoEhHoje && escalaId) volsHtml += (' ' + window.renderCheckinEscalaBadge(escalaId, checkinEm))
          volsHtml += '</span>'
        })
        volsHtml += '</div></div>'
      }

      const totalConf = escEv.filter(e => e.status === 'confirmado').length
      const totalPend = escEv.filter(e => e.status === 'pendente').length
      const totalRec  = escEv.filter(e => e.status === 'recusado').length
      volsHtml += '<div class="esc-totais">'
      if (totalConf) volsHtml += '<span class="pill-esc pill-conf">✅ ' + totalConf + '</span>'
      if (totalPend) volsHtml += '<span class="pill-esc pill-pend">⏳ ' + totalPend + '</span>'
      if (totalRec)  volsHtml += '<span class="pill-esc pill-rec">❌ ' + totalRec + '</span>'
      volsHtml += '</div>'

      volsHtml += '</div>'
    }

    // ── HTML do repertório de música ───────────────────────────
    // ALTERAÇÃO: adicionado botão Spotify em cada música
    let repertorioHtml = ''
    if (repertorio.length) {
      repertorioHtml = `
        <div style="margin-top:12px;border:1px solid #e8e8e8;border-radius:10px;overflow:hidden;">
          <div style="background:#f7faee;padding:8px 12px;font-size:12px;font-weight:800;
                      color:#4a6a35;border-bottom:1px solid #d0f0ee;display:flex;
                      align-items:center;gap:6px;">
            🎵 Repertório de Música
            <span style="font-size:10px;font-weight:400;color:#aaa;margin-left:4px;">
              ${repertorio.length} música${repertorio.length > 1 ? 's' : ''}
            </span>
          </div>
          <div style="padding:8px 12px;display:flex;flex-direction:column;gap:4px;">
            ${repertorio.map((m, i) => `
              <div style="display:flex;align-items:center;gap:8px;padding:4px 0;
                          border-bottom:1px solid #f5f5f5;">
                <span style="font-size:11px;color:#ccc;font-weight:700;min-width:18px;text-align:right;">
                  ${m.ordem || i + 1}.
                </span>
                <span style="font-size:13px;font-weight:600;color:#242e1a;flex:1;
                             white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${m.titulo || '—'}
                </span>
                ${m.artista ? `
                  <span style="font-size:11px;color:#888;white-space:nowrap;">
                    ${m.artista}
                  </span>` : ''}
                ${m.tonalidade ? `
                  <span style="font-size:10px;background:#eef5e2;color:#4a6a35;
                                border-radius:20px;padding:1px 7px;font-weight:700;
                                white-space:nowrap;">
                    ${m.tonalidade}
                  </span>` : ''}
                ${m.bpm ? `
                  <span style="font-size:10px;color:#bbb;white-space:nowrap;">
                    ${m.bpm} bpm
                  </span>` : ''}
                ${m.spotify_url ? `
                  <a href="${m.spotify_url}" target="_blank" rel="noopener"
                    title="Ouvir no Spotify"
                    style="display:inline-flex;align-items:center;gap:3px;background:#1DB954;
                           color:white;border-radius:20px;padding:2px 9px;font-size:10px;
                           font-weight:700;text-decoration:none;white-space:nowrap;flex-shrink:0;">
                    ▶ Spotify
                  </a>` : ''}
              </div>`).join('')}
          </div>
        </div>`
    }

    // ── Monta o item do evento ─────────────────────────────────
    const item = document.createElement('div')
    item.className = 'dia-ev-item'
    item.innerHTML =
      '<div class="dia-ev-cor" style="background:' + cor + '"></div>' +
      '<div style="flex:1;">' +
        '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
          '<div class="dia-ev-hora">' + horaFmt + '</div>' +
          '<div class="dia-ev-info">' +
            '<strong>' + ev.nome + '</strong>' +
            '<span>' + finLabel + (isMin && minNome ? ' · ' + minNome : '') + '</span>' +
          '</div>' +
          '<div style="display:flex;gap:6px;margin-left:auto;">' +
            (ev.publico ? '<button class="dia-ev-inscricoes" title="Ver Inscrições" data-acao="inscricoes" style="background:#eef5e2;color:#4a6a35;border:none;border-radius:7px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer;">📋 Inscrições</button>' : '') +
            '<button class="dia-ev-editar" title="Editar" data-acao="editar" style="background:#f0f4ff;color:#3b5bdb;border:none;border-radius:7px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer;">✏️ Editar</button>' +
            '<button class="dia-ev-excluir" title="Excluir" data-acao="excluir" style="background:#ffeaea;color:#c0392b;border:none;border-radius:7px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer;">🗑️</button>' +
          '</div>' +
        '</div>' +
        volsHtml +
        repertorioHtml +
      '</div>'

    item.querySelector('.dia-ev-editar')
      .addEventListener('click', () => editarEvento(ev))
    if (ev.publico) {
      item.querySelector('.dia-ev-inscricoes')
        .addEventListener('click', () => abrirModalInscricoes(ev.id, ev.nome))
    }
    item.querySelector('.dia-ev-excluir')
      .addEventListener('click', () => excluirEvento(ev.id, ev.nome))

    lista.appendChild(item)
  })
}

// ================================================================
//  CONSELHEIROS
// ================================================================
async function carregarConselheiros() {
  const { data, error } = await _db
    .from('conselheiros')
    .select('*')
    .order('nome')
  if (error) { console.error(error); return }
  conselheirosCache = data || []
  renderConselheiros()
}

function renderConselheiros() {
  const grid = document.getElementById('conselheiros-grid')
  grid.innerHTML = ''

  if (!conselheirosCache.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">Nenhum conselheiro cadastrado.</div>'
    return
  }

  conselheirosCache.forEach(c => {
    const inicial = (c.nome || '?')[0].toUpperCase()
    const card = document.createElement('div')
    card.className = 'conselheiro-card'
    card.innerHTML = `
      <div class="conselheiro-avatar">
        ${c.foto_url
          ? `<img src="${c.foto_url}" alt="${c.nome}" />`
          : inicial}
      </div>
      <div class="conselheiro-nome">${c.nome}</div>
      ${c.descricao ? `<div class="conselheiro-desc">${c.descricao}</div>` : ''}
      <span class="conselheiro-status ${c.ativo ? 'status-ativo' : 'status-inativo'}">
        ${c.ativo ? '✅ Ativo' : '❌ Inativo'}
      </span>
      <div class="conselheiro-actions">
        <button class="btn-sm btn-sm-danger btn-editar-cons">✏️ Editar</button>
        <button class="btn-sm btn-sm-danger btn-excluir-cons" data-acao="excluir">🗑️</button>
      </div>
    `

    card.querySelector('.btn-editar-cons')
      .addEventListener('click', () => editarConselheiro(c.id))

    card.querySelector('.btn-excluir-cons')
      .addEventListener('click', () => excluirConselheiro(c.id, c.nome))

    grid.appendChild(card)
  })
}

function popularSelectsConselheiros() {
  const filtros = [
    document.getElementById('filtro-conselheiro'),
    document.getElementById('filtro-agend-conselheiro'),
  ]
  filtros.forEach(sel => {
    if (!sel) return
    const valorAtual = sel.value
    sel.innerHTML = '<option value="">Todos</option>'
    conselheirosCache.filter(c => c.ativo).forEach(c => {
      const opt = document.createElement('option')
      opt.value       = c.id
      opt.textContent = c.nome
      sel.appendChild(opt)
    })
    sel.value = valorAtual
  })

  const selDisp = document.getElementById('inp-disp-conselheiro')
  if (selDisp) {
    const valorAtual = selDisp.value
    selDisp.innerHTML = '<option value="">Selecione...</option>'
    conselheirosCache.filter(c => c.ativo).forEach(c => {
      const opt = document.createElement('option')
      opt.value       = c.id
      opt.textContent = c.nome
      selDisp.appendChild(opt)
    })
    selDisp.value = valorAtual
  }
}

function abrirModalConselheiro() {
  editandoConselheiroId = null
  document.getElementById('modal-conselheiro-titulo').textContent = '👤 Novo Conselheiro'
  document.getElementById('inp-cons-busca').value                 = ''
  document.getElementById('inp-cons-membro-id').value             = ''
  document.getElementById('inp-cons-nome').value                  = ''
  document.getElementById('inp-cons-sugestoes').style.display     = 'none'
  document.getElementById('inp-cons-sugestoes').innerHTML         = ''
  document.getElementById('inp-cons-desc').value                  = ''
  document.getElementById('inp-cons-ativo').value                 = 'true'
  document.getElementById('modal-conselheiro').classList.add('active')
}

function editarConselheiro(id) {
  const c = conselheirosCache.find(x => x.id === id)
  if (!c) return
  editandoConselheiroId = id
  document.getElementById('modal-conselheiro-titulo').textContent = '✏️ Editar Conselheiro'
  document.getElementById('inp-cons-busca').value                 = c.nome
  document.getElementById('inp-cons-membro-id').value             = c.membro_id || ''
  document.getElementById('inp-cons-nome').value                  = c.nome
  document.getElementById('inp-cons-sugestoes').style.display     = 'none'
  document.getElementById('inp-cons-sugestoes').innerHTML         = ''
  document.getElementById('inp-cons-desc').value                  = c.descricao || ''
  document.getElementById('inp-cons-ativo').value                 = String(c.ativo)
  document.getElementById('modal-conselheiro').classList.add('active')
}

function fecharModalConselheiro() {
  document.getElementById('modal-conselheiro').classList.remove('active')
  document.getElementById('inp-cons-sugestoes').style.display = 'none'
  document.getElementById('inp-cons-sugestoes').innerHTML     = ''
  editandoConselheiroId = null
}

async function salvarConselheiro() {
  const nome     = document.getElementById('inp-cons-nome').value.trim()
  const membroId = document.getElementById('inp-cons-membro-id').value || null
  const desc     = document.getElementById('inp-cons-desc').value.trim()
  const ativo    = document.getElementById('inp-cons-ativo').value === 'true'

  if (!nome) {
    alert('Selecione um membro da lista.')
    document.getElementById('inp-cons-busca').focus()
    return
  }

  const payload = {
    nome,
    membro_id: membroId,
    descricao: desc || null,
    ativo,
  }

  let error
  if (editandoConselheiroId) {
    ;({ error } = await _db
      .from('conselheiros')
      .update(payload)
      .eq('id', editandoConselheiroId))
  } else {
    ;({ error } = await _db
      .from('conselheiros')
      .insert([payload]))
  }

  if (error) { alert('Erro ao salvar conselheiro.'); console.error(error); return }

  fecharModalConselheiro()
  toast('✅ Conselheiro salvo!')
  await carregarConselheiros()
  popularSelectsConselheiros()
}

async function excluirConselheiro(id, nome) {
  console.log('🔴 Tentando excluir conselheiro ID:', id)
  if (!await confirmarAcao(`Deseja excluir o conselheiro "${nome}"?\nTodas as disponibilidades e agendamentos serão removidos.`, 'Excluir conselheiro')) return

  const { data, error, status } = await _db
    .from('conselheiros')
    .delete()
    .eq('id', id)
    .select()

  console.log('Status:', status, '| Data:', data, '| Erro:', error)

  if (error) { alert('Erro ao excluir.'); console.error(error); return }
  if (!data || data.length === 0) {
    console.warn('⚠️ Nenhuma linha deletada — verifique RLS no Supabase.')
    alert('Nenhuma linha foi excluída. Verifique as políticas RLS no Supabase.')
    return
  }

  toast('🗑️ Conselheiro excluído.', '#e74c3c')
  await carregarConselheiros()
  popularSelectsConselheiros()
  carregarDisponibilidades()
  carregarAgendamentos()
}

// ================================================================
//  DISPONIBILIDADES
// ================================================================
async function carregarDisponibilidades() {
  const conselheiroId = meuConselheiroId
    || document.getElementById('filtro-conselheiro')?.value || ''
  const data          = document.getElementById('filtro-disp-data')?.value   || ''

  let q = _db
    .from('pastoral_disponibilidade')
    .select('*, conselheiros(nome)')
    .order('data')
    .order('hora_inicio')

  if (conselheiroId) q = q.eq('conselheiro_id', conselheiroId)
  if (data)          q = q.eq('data', data)

  const { data: disps, error } = await q
  if (error) { console.error(error); return }
  dispCache = disps || []

  await renderDisponibilidades()
}

async function renderDisponibilidades() {
  const grid = document.getElementById('disp-grid')
  grid.innerHTML = ''

  if (!dispCache.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;">Nenhuma disponibilidade encontrada.</div>'
    return
  }

  const dispIds = dispCache.map(d => d.id)
  const { data: agends } = await _db
    .from('pastoral_agendamentos')
    .select('disponibilidade_id, slot_hora, status')
    .in('disponibilidade_id', dispIds)
    .neq('status', 'cancelado')

  const ocupados = {}
  ;(agends || []).forEach(a => {
    const key = `${a.disponibilidade_id}_${a.slot_hora}`
    ocupados[key] = true
  })

  dispCache.forEach(d => {
    const dataFmt = new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR', {
      weekday: 'short', day: '2-digit', month: 'short'
    })

    const slots = gerarSlots(d.hora_inicio, d.hora_fim, d.intervalo_min)
    const slotsPills = slots.map(s => {
      const key     = `${d.id}_${s}:00`
      const ocupado = ocupados[key] || false
      return `<span class="slot-pill${ocupado ? ' ocupado' : ''}">${s}</span>`
    }).join('')

    const card = document.createElement('div')
    card.className = 'disp-card'
    card.innerHTML = `
      <div class="disp-card-header">
        <h4>👤 ${d.conselheiros?.nome || '—'}</h4>
        <button class="btn-sm btn-sm-danger btn-excluir-disp" data-acao="excluir">🗑️</button>
      </div>
      <div class="disp-meta">
        📅 ${dataFmt} &nbsp;·&nbsp;
        ⏰ ${d.hora_inicio.slice(0,5)} – ${d.hora_fim.slice(0,5)} &nbsp;·&nbsp;
        🕐 a cada ${d.intervalo_min}min
      </div>
      <div class="disp-slots">
        ${slotsPills || '<span style="color:#bbb;font-size:12px;">Sem slots</span>'}
      </div>
    `

    card.querySelector('.btn-excluir-disp')
      .addEventListener('click', () => excluirDisponibilidade(d.id))

    grid.appendChild(card)
  })
}

function gerarSlots(inicio, fim, intervalo) {
  const slots = []
  const [hI, mI] = inicio.split(':').map(Number)
  const [hF, mF] = fim.split(':').map(Number)
  let cur = hI * 60 + mI
  const end = hF * 60 + mF
  while (cur < end) {
    const h = String(Math.floor(cur / 60)).padStart(2, '0')
    const m = String(cur % 60).padStart(2, '0')
    slots.push(`${h}:${m}`)
    cur += intervalo
  }
  return slots
}

function abrirModalDisponibilidade() {
  const selCons = document.getElementById('inp-disp-conselheiro')
  const lblCons = document.getElementById('lbl-inp-disp-conselheiro')
  selCons.value = ''
  if (meuConselheiroId) {
    selCons.value = meuConselheiroId
    selCons.style.display = 'none'
    if (lblCons) lblCons.style.display = 'none'
  } else {
    selCons.style.display = ''
    if (lblCons) lblCons.style.display = ''
  }
  document.getElementById('inp-disp-data').value        = ''
  document.getElementById('inp-disp-inicio').value      = ''
  document.getElementById('inp-disp-fim').value         = ''
  document.getElementById('inp-disp-intervalo').value   = '30'
  document.getElementById('modal-disponibilidade').classList.add('active')
}

function fecharModalDisponibilidade() {
  document.getElementById('modal-disponibilidade').classList.remove('active')
}

async function salvarDisponibilidade() {
  const conselheiroId = document.getElementById('inp-disp-conselheiro').value
  const data          = document.getElementById('inp-disp-data').value
  const inicio        = document.getElementById('inp-disp-inicio').value
  const fim           = document.getElementById('inp-disp-fim').value
  const intervalo     = parseInt(document.getElementById('inp-disp-intervalo').value)

  if (!conselheiroId) { alert('Selecione o conselheiro.'); return }
  if (!data)          { alert('Informe a data.'); return }
  if (!inicio)        { alert('Informe a hora de início.'); return }
  if (!fim)           { alert('Informe a hora de término.'); return }
  if (fim <= inicio)  { alert('A hora de término deve ser após a de início.'); return }

  const { error } = await _db.from('pastoral_disponibilidade').insert([{
    conselheiro_id: conselheiroId,
    data,
    hora_inicio:    inicio,
    hora_fim:       fim,
    intervalo_min:  intervalo,
  }])

  if (error) { alert('Erro ao salvar disponibilidade.'); console.error(error); return }

  fecharModalDisponibilidade()
  toast('✅ Disponibilidade salva!')
  await carregarDisponibilidades()
}

async function excluirDisponibilidade(id) {
  console.log('🔴 Tentando excluir disponibilidade ID:', id)
  if (!await confirmarAcao('Deseja excluir esta disponibilidade?\nOs agendamentos vinculados também serão removidos.', 'Excluir disponibilidade')) return

  const { data, error, status } = await _db
    .from('pastoral_disponibilidade')
    .delete()
    .eq('id', id)
    .select()

  console.log('Status:', status, '| Data:', data, '| Erro:', error)

  if (error) { alert('Erro ao excluir.'); console.error(error); return }
  if (!data || data.length === 0) {
    console.warn('⚠️ Nenhuma linha deletada — verifique RLS no Supabase.')
    alert('Nenhuma linha foi excluída. Verifique as políticas RLS no Supabase.')
    return
  }

  toast('🗑️ Disponibilidade excluída.', '#e74c3c')
  await carregarDisponibilidades()
  await carregarAgendamentos()
}

// ================================================================
//  AGENDAMENTOS
// ================================================================
async function carregarAgendamentos() {
  const conselheiroId = meuConselheiroId
    || document.getElementById('filtro-agend-conselheiro')?.value || ''
  const status        = document.getElementById('filtro-agend-status')?.value      || ''
  const data          = document.getElementById('filtro-agend-data')?.value        || ''

  let q = _db
    .from('pastoral_agendamentos')
    .select(`
      *,
      conselheiros(nome),
      pastoral_disponibilidade(data, hora_inicio, hora_fim)
    `)
    .order('created_at', { ascending: false })

  if (conselheiroId) q = q.eq('conselheiro_id', conselheiroId)
  if (status)        q = q.eq('status', status)
  if (data) {
    const { data: dispIds } = await _db
      .from('pastoral_disponibilidade')
      .select('id')
      .eq('data', data)

    const ids = (dispIds || []).map(d => d.id)
    if (!ids.length) {
      renderAgendamentos([])
      return
    }
    q = q.in('disponibilidade_id', ids)
  }

  const { data: agends, error } = await q
  if (error) { console.error(error); return }
  agendamentosCache = agends || []
  renderAgendamentos(agendamentosCache)
  atualizarBadgePastoral()
}

async function atualizarBadgePastoral() {
  const badge = document.getElementById('badge-pastoral')
  if (!badge) return

  let q = _db
    .from('pastoral_agendamentos')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pendente')

  if (meuConselheiroId) q = q.eq('conselheiro_id', meuConselheiroId)

  const { count, error } = await q
  if (error) { console.warn('badge pastoral:', error.message); return }

  if (count && count > 0) {
    badge.textContent = String(count)
    badge.classList.add('show')
  } else {
    badge.classList.remove('show')
  }
}

function renderAgendamentos(lista) {
  const wrap = document.getElementById('agendamentos-wrap')
  wrap.innerHTML = ''

  if (!lista.length) {
    wrap.innerHTML = '<div class="empty-state">Nenhum agendamento encontrado.</div>'
    return
  }

  // Agrupa por data da disponibilidade (YYYY-MM-DD), mais recente primeiro
  const grupos = new Map()
  lista.forEach(a => {
    const chave = a.pastoral_disponibilidade?.data || 'sem-data'
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave).push(a)
  })
  const chavesOrdenadas = Array.from(grupos.keys()).sort((a, b) => {
    if (a === 'sem-data') return 1
    if (b === 'sem-data') return -1
    return a.localeCompare(b)
  })

  chavesOrdenadas.forEach(chave => {
    const items = grupos.get(chave)
    items.sort((x, y) => (x.slot_hora || '').localeCompare(y.slot_hora || ''))

    const tituloData = chave === 'sem-data'
      ? 'Sem data'
      : new Date(chave + 'T00:00:00').toLocaleDateString('pt-BR', {
          weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        })

    const header = document.createElement('div')
    header.className = 'agend-data-header'
    header.innerHTML = `<span>📅 ${tituloData}</span><span class="agend-data-count">${items.length}</span>`
    wrap.appendChild(header)

    items.forEach(a => {
      const horaFmt = a.slot_hora?.slice(0, 5) || '—'

      const card = document.createElement('div')
      card.className = 'agend-card'
      card.innerHTML = `
        <div class="agend-hora">${horaFmt}</div>
        <div class="agend-info">
          <strong>${a.nome_fiel}</strong>
          <span>📞 ${a.telefone_fiel}</span>
          ${a.motivo ? `<span style="margin-top:2px;">💬 ${a.motivo}</span>` : ''}
          <span style="margin-top:2px;">
            👤 ${a.conselheiros?.nome || '—'}
          </span>
        </div>
        <span class="agend-status ${a.status}">${
          a.status === 'confirmado' ? '✅ Confirmado'
          : a.status === 'cancelado' ? '❌ Cancelado'
          : '⏳ Pendente'
        }</span>
        <div class="agend-actions">
          <button class="btn-sm btn-agend-status" style="background:#eef5e2; color:#4a6a35;">
            ✏️ Status
          </button>
          <button class="btn-sm btn-sm-danger btn-excluir-agend" data-acao="excluir">🗑️</button>
        </div>
      `

      card.querySelector('.btn-agend-status')
        .addEventListener('click', () =>
          abrirModalAgendStatus(a.id, a.nome_fiel, horaFmt, tituloData,
            a.telefone_fiel, a.conselheiro_id))

      card.querySelector('.btn-excluir-agend')
        .addEventListener('click', () => excluirAgendamento(a.id))

      wrap.appendChild(card)
    })
  })
}

async function abrirModalAgendStatus(id, nome, hora, data, telefone, conselheiroId) {
  agendStatusId = id
  agendStatusTelefone = telefone || ''
  agendStatusNome = nome || ''
  agendStatusConselheiroId = conselheiroId || null
  document.getElementById('agend-modal-nome').textContent = nome
  document.getElementById('agend-modal-info').textContent = `📅 ${data} às ${hora}`

  document.getElementById('inp-relatorio').value = ''
  document.getElementById('relatorio-meta').textContent = ''
  document.getElementById('hist-relatorios-wrap').style.display = 'none'
  document.getElementById('hist-relatorios-lista').innerHTML = ''

  document.getElementById('modal-agend-status').classList.add('active')

  await carregarRelatorioAtual(id)
  await carregarHistoricoRelatorios(telefone, id)
}

function fecharModalAgendStatus() {
  document.getElementById('modal-agend-status').classList.remove('active')
  agendStatusId = null
  agendStatusTelefone = ''
  agendStatusNome = ''
  agendStatusConselheiroId = null
}

async function carregarRelatorioAtual(agendamentoId) {
  const { data, error } = await _db
    .from('pastoral_relatorios')
    .select('relatorio, updated_at')
    .eq('agendamento_id', agendamentoId)
    .maybeSingle()
  if (error) { console.error('relatorio atual:', error); return }
  if (!data) return
  document.getElementById('inp-relatorio').value = data.relatorio || ''
  if (data.updated_at) {
    const d = new Date(data.updated_at)
    document.getElementById('relatorio-meta').textContent =
      `Última atualização: ${d.toLocaleString('pt-BR')}`
  }
}

function normalizarTelefone(tel) {
  let d = (tel || '').replace(/\D/g, '')
  // Remove código do país BR (55) quando string tem 12 ou 13 dígitos.
  // Ex: 5531999614131 (13) → 31999614131
  //     553199614131  (12) → 3199614131
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
    d = d.slice(2)
  }
  return d
}

async function carregarHistoricoRelatorios(telefone, agendamentoIdAtual) {
  const wrap  = document.getElementById('hist-relatorios-wrap')
  const lista = document.getElementById('hist-relatorios-lista')
  wrap.style.display = ''
  lista.innerHTML = ''

  const telNorm = normalizarTelefone(telefone)
  if (!telNorm) {
    lista.innerHTML = '<div style="color:#888; font-size:12px; padding:6px;">Sem telefone registrado — não é possível buscar histórico.</div>'
    return
  }

  const { data, error } = await _db
    .from('pastoral_relatorios')
    .select('id, agendamento_id, conselheiro_id, nome_fiel, relatorio, created_at, conselheiros(nome)')
    .eq('telefone_fiel', telNorm)
    .neq('agendamento_id', agendamentoIdAtual)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('historico:', error)
    lista.innerHTML = '<div style="color:#c0392b; font-size:12px; padding:6px;">Erro ao carregar histórico.</div>'
    return
  }
  if (!data || !data.length) {
    lista.innerHTML = '<div style="color:#888; font-size:12px; padding:6px;">Nenhum atendimento anterior registrado para este telefone.</div>'
    return
  }

  data.forEach(r => {
    const dt = new Date(r.created_at).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric'
    })
    const cons = r.conselheiros?.nome || '—'
    const item = document.createElement('div')
    item.style.cssText = 'background:white; border:1px solid #e8f3f1; border-radius:8px; padding:8px 10px;'
    item.innerHTML = `
      <div style="font-size:11px; color:#888; margin-bottom:4px;">
        📅 ${dt} &nbsp;·&nbsp; 👤 ${cons}
      </div>
      <div style="font-size:13px; color:#242e1a; white-space:pre-wrap; line-height:1.4;">
        ${(r.relatorio || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}
      </div>
    `
    lista.appendChild(item)
  })
  wrap.style.display = ''
}

async function salvarRelatorio() {
  if (!agendStatusId) return
  const txt = document.getElementById('inp-relatorio').value.trim()
  if (!txt) { alert('Escreva o relatório antes de salvar.'); return }

  const payload = {
    agendamento_id: agendStatusId,
    conselheiro_id: agendStatusConselheiroId,
    telefone_fiel:  normalizarTelefone(agendStatusTelefone),
    nome_fiel:      agendStatusNome,
    relatorio:      txt,
  }

  const { error } = await _db
    .from('pastoral_relatorios')
    .upsert(payload, { onConflict: 'agendamento_id' })

  if (error) { alert('Erro ao salvar relatório.'); console.error(error); return }
  toast('✅ Relatório salvo!')
  await carregarRelatorioAtual(agendStatusId)
}

async function alterarStatusAgendamento(novoStatus) {
  if (!agendStatusId) return
  const { error } = await _db
    .from('pastoral_agendamentos')
    .update({ status: novoStatus })
    .eq('id', agendStatusId)
  if (error) { alert('Erro ao atualizar status.'); console.error(error); return }
  fecharModalAgendStatus()
  toast(`✅ Status atualizado para "${novoStatus}"!`)
  await carregarAgendamentos()
}

async function excluirAgendamento(id) {
  console.log('🔴 Tentando excluir agendamento ID:', id)
  if (!await confirmarAcao('Deseja excluir este agendamento?', 'Excluir agendamento')) return

  const { data, error, status } = await _db
    .from('pastoral_agendamentos')
    .delete()
    .eq('id', id)
    .select()

  console.log('Status:', status, '| Data:', data, '| Erro:', error)

  if (error) { alert('Erro ao excluir.'); console.error(error); return }
  if (!data || data.length === 0) {
    console.warn('⚠️ Nenhuma linha deletada — verifique RLS no Supabase.')
    alert('Nenhuma linha foi excluída. Verifique as políticas RLS no Supabase.')
    return
  }

  toast('🗑️ Agendamento excluído.', '#e74c3c')
  await carregarAgendamentos()
}
