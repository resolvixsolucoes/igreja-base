// v-meu-vol-id
// ================================================================
//  ministerios-levinho.js
// ================================================================
const _db = db

// ── Cores por finalidade (agenda da Igreja) ────────────────────
const FINALIDADE_COR_ESCALA = {
  culto:        '#7c3aed',
  conferencia:  '#2563eb',
  curso:        '#d97706',
  treinamento:  '#ea580c',
  reuniao:      '#374151',
  cafe:         '#92400e',
  festividade:  '#16a34a',
  pastoral:     '#dc2626',
}
const FINALIDADE_LABEL_ESCALA = {
  culto:        'Culto',
  conferencia:  'Conferência',
  curso:        'Curso',
  treinamento:  'Treinamento',
  reuniao:      'Reunião',
  cafe:         'Café',
  festividade:  'Festividade',
  pastoral:     'Atendimento Pastoral',
}


let MINISTERIO_ID     = null
let MEU_VOLUNTARIO_ID = null
let volsCache         = []
let salasCache        = []           // [{id,nome,idade_min,idade_max,ordem}]
let volSalasCache     = new Map()    // voluntario_id -> Set(sala_id)
let podeGerenciarCache = false
let eventosCache      = []
let relatorioCache    = []
let escalaAtiva       = null
let tokenEscalaId     = null
let dispCache         = []
let dispEditandoId    = null
let dispEditandoData  = null

let calAno         = new Date().getFullYear()
let calMes         = new Date().getMonth()
let diaSelecionado = null

const MESES_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]
const DIAS_PT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

// ================================================================
//  INIT
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search)
  const token  = params.get('token')

  if (token) {
    document.getElementById('tela-principal').style.display   = 'none'
    document.getElementById('tela-confirmacao').style.display = 'flex'
    await carregarConfirmacaoToken(token)
    return
  }

  // Fase 7.2c — espera auth.js popular AUTH.permissoesGranular
  await aguardarAuthReady()

  await resolverMinisterioId()
  if (!MINISTERIO_ID) return
  window.MINISTERIO_ID_ATUAL = MINISTERIO_ID
  await resolverMeuVoluntarioId()
  await carregarSalas()
  await carregarVoluntarios()
  await ajustarPermissoes()

  // ── Gate granular (user-based) por aba e por acao ──
  aplicarGateAbasGranular('ministerios_levinho')
  aplicarGateAcoesGranular('ministerios_levinho')
  document.querySelectorAll('[data-aba]').forEach(painel => {
    new MutationObserver(() => aplicarGateAcoesGranular('ministerios_levinho'))
      .observe(painel, { childList: true, subtree: true })
  })

  // ── Ativa aba da URL ──
  ativarAbaPorURL()
})

// ================================================================
//  RESOLVE IDs
// ================================================================
async function resolverMinisterioId() {
  const tentativas = ['%levinho%', '%Levinho%', '%LEVINHO%']
  for (const termo of tentativas) {
    const { data, error } = await _db
      .from('ministerios').select('id')
      .ilike('nome', termo).maybeSingle()
    if (!error && data) { MINISTERIO_ID = data.id; return }
  }
  console.error('Ministério Levinho não encontrado.')
}

async function resolverMeuVoluntarioId() {
  const { data: { session } } = await _db.auth.getSession()
  if (!session) return

  // Busca o perfil para pegar o membro_id vinculado
  const { data: perfil } = await _db
    .from('perfis').select('id, membro_id')
    .eq('id', session.user.id).maybeSingle()

  console.log('[Sua Igreja] perfil:', perfil)

  if (!perfil?.membro_id) {
    console.log('[Sua Igreja] perfil sem membro_id')
    return
  }

  // Busca o voluntário pelo membro_id
  const { data: vol } = await _db
    .from('voluntarios').select('id')
    .eq('membro_id', perfil.membro_id).maybeSingle()

  console.log('[Sua Igreja] voluntario encontrado:', vol)
  MEU_VOLUNTARIO_ID = vol?.id || null
  console.log('[Sua Igreja] MEU_VOLUNTARIO_ID:', MEU_VOLUNTARIO_ID)
}

// ================================================================
//  PERMISSÕES
// ================================================================
async function ajustarPermissoes() {
  const pode = await usuarioPodeGerenciar()
  podeGerenciarCache = pode
  ;['btn-add-lider','btn-add-evento'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.style.display = pode ? 'inline-flex' : 'none'
  })
  const btnAvisos = document.getElementById('btn-aba-avisos')
  if (btnAvisos) btnAvisos.style.display = pode ? 'inline-flex' : 'none'
  const formAviso = document.getElementById('aviso-form-inline')
  if (formAviso) formAviso.style.display = pode ? 'block' : 'none'
  preencherSelectSalasAviso()
  if (volsCache.length) renderVols(volsCache)
}

async function usuarioPodeGerenciar() {
  // 1. Admin sempre pode
  if (window.AUTH?.isAdmin) return true

  // 2. Tem permissao granular CUD em qualquer aba
  if (window.AUTH?.permissoesGranular) {
    for (const k in window.AUTH.permissoesGranular) {
      if (k.startsWith('ministerios_levinho::')) {
        const p = window.AUTH.permissoesGranular[k]
        if (p.adicionar || p.editar || p.excluir) return true
      }
    }
  }

  // 3. Lider/Co-Lider deste ministerio (do AUTH.lideres populado em auth.js)
  if (window.AUTH?.lideres?.has?.(MINISTERIO_ID)) return true

  // 4. Fallback DB: esta na tabela ministerio_lideres
  const uid = localStorage.getItem('voluntario_id') || sessionStorage.getItem('voluntario_id')
  if (!uid || !MINISTERIO_ID) return false

  const { data } = await _db.from('ministerio_lideres').select('id')
    .eq('ministerio_id', MINISTERIO_ID).eq('voluntario_id', uid).maybeSingle()

  return !!data
}

// ================================================================
//  ABAS
// ================================================================
async function trocarAba(nome, btn) {
  // Bloqueia se não tem permissão de ver
  if (!temPermissaoAba('ministerios_levinho', nome, 'ver')) return

  document.querySelectorAll('.aba-content').forEach(el => el.classList.remove('active'))
  document.querySelectorAll('.aba-btn').forEach(el => el.classList.remove('active'))
  // ... resto do código permanece igual
  document.querySelectorAll('.aba-content').forEach(el => el.classList.remove('active'))
  document.querySelectorAll('.aba-btn').forEach(el     => el.classList.remove('active'))
  document.getElementById('aba-' + nome).classList.add('active')
  btn.classList.add('active')
  if (['lideres','escala'].includes(nome) && !volsCache.length) await carregarVoluntarios()
  if (nome === 'lideres')    await carregarLideres()
  if (nome === 'escala')     await iniciarEscala()
  if (nome === 'avisos')     await carregarAvisos()
  if (nome === 'presentes')  await iniciarPresentes()
  if (nome === 'materiais')  await iniciarMateriais()
  if (nome === 'relatorios') await iniciarRelatorios()
}

// ================================================================
//  VOLUNTÁRIOS
// ================================================================
async function carregarVoluntarios() {
  const { data, error } = await _db.from('voluntarios').select('*')
    .contains('ministerio_ids', [MINISTERIO_ID]).order('nome')
  if (error) { console.error(error); return }
  volsCache = data || []
  const total = volsCache.length
  document.getElementById('hero-badge').textContent =
    `${total} voluntário${total !== 1 ? 's' : ''}`
  await renderHeroLideres()
  await carregarVolSalas()
  renderVols(volsCache)
  await carregarAvisosDestaque()
}

async function carregarSalas() {
  const { data, error } = await _db.from('levinho_salas')
    .select('*').order('ordem')
  if (error) { console.error('[Levinho] salas:', error); return }
  salasCache = data || []
  window.salasCache = salasCache  // expõe pra escala-geral.js usar
  preencherSelectSalasAviso()
}

async function carregarVolSalas() {
  volSalasCache = new Map()
  if (!volsCache.length) return
  const ids = volsCache.map(v => v.id)
  const { data, error } = await _db.from('levinho_voluntarios_salas')
    .select('voluntario_id, sala_id').in('voluntario_id', ids)
  if (error) { console.error('[Levinho] vol_salas:', error); return }
  ;(data || []).forEach(r => {
    if (!volSalasCache.has(r.voluntario_id)) volSalasCache.set(r.voluntario_id, new Set())
    volSalasCache.get(r.voluntario_id).add(r.sala_id)
  })
}

function preencherSelectSalasAviso() {
  const sel = document.getElementById('inp-av-sala')
  if (!sel) return
  const atual = sel.value
  sel.innerHTML = '<option value="">📢 Geral (todas as salas)</option>'
  salasCache.forEach(s => {
    const opt = document.createElement('option')
    opt.value = String(s.id)
    opt.textContent = `🏷️ ${s.nome} (${s.idade_min}-${s.idade_max} anos)`
    sel.appendChild(opt)
  })
  sel.value = atual || ''
}

function nomeSala(id) {
  const s = salasCache.find(x => x.id === id)
  return s ? s.nome : '—'
}

async function renderHeroLideres() {
  const wrap = document.getElementById('hero-lideres')
  if (!wrap) return
  const { data } = await _db.from('ministerio_lideres')
    .select('funcao, voluntarios(nome)')
    .eq('ministerio_id', MINISTERIO_ID).order('created_at')
  wrap.innerHTML = (!data || !data.length) ? '' : data.map(l => `
    <div class="hero-lider-pill">
      👑 ${l.voluntarios?.nome || '—'}<span>${l.funcao}</span>
    </div>`).join('')
}

function renderVols(lista) {
  const tbody = document.getElementById('tbody-voluntarios')
  tbody.innerHTML = ''
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">
      Nenhum voluntário neste ministério.</td></tr>`
    return
  }
  lista.forEach(v => {
    const nasc = v.nascimento
      ? new Date(v.nascimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
    const mesa = v.participa_mesa === 'sim' ? `✅ ${v.mesa || 'Sim'}` : '—'
    const tr   = document.createElement('tr')
    tr.innerHTML = `
      <td>${v.nome}</td><td>${v.telefone || '—'}</td><td>${v.endereco || '—'}</td>
      <td>${nasc}</td><td>${mesa}</td>
      <td>${renderVolSalasCell(v.id)}</td>
      <td><span class="badge ${v.status === 'Ativo' ? 'badge-ativo' : 'badge-inativo'}">
        ${v.status}</span></td>`
    tbody.appendChild(tr)
  })
}

function renderVolSalasCell(volId) {
  const ids = volSalasCache.get(volId) || new Set()
  const editavel = podeGerenciarCache
  const chips = salasCache
    .filter(s => ids.has(s.id))
    .map(s => editavel
      ? `<span class="vol-sala-chip">${escapeHtml(s.nome)}<button title="Remover" onclick="removerVolSala('${volId}', ${s.id})">✕</button></span>`
      : `<span class="sala-badge sala-${s.id}">${escapeHtml(s.nome)}</span>`
    ).join('')
  const restantes = salasCache.filter(s => !ids.has(s.id))
  let addUI = ''
  if (editavel && restantes.length) {
    const opts = restantes.map(s =>
      `<option value="${s.id}">${escapeHtml(s.nome)} (${s.idade_min}-${s.idade_max})</option>`
    ).join('')
    addUI = `<select class="vol-sala-add" onchange="adicionarVolSala('${volId}', this)">
      <option value="">+ sala</option>${opts}</select>`
  }
  if (!chips && !addUI) return '<span style="color:#bbb;font-size:11px;">—</span>'
  return `<div class="vol-salas-cell">${chips}${addUI}</div>`
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
}

async function adicionarVolSala(volId, selEl) {
  const salaId = parseInt(selEl.value, 10)
  if (!salaId) return
  const { error } = await _db.from('levinho_voluntarios_salas')
    .insert([{ voluntario_id: volId, sala_id: salaId }])
  if (error) {
    if (error.code !== '23505') {
      alert('Erro ao designar sala: ' + error.message)
      console.error(error); return
    }
  }
  if (!volSalasCache.has(volId)) volSalasCache.set(volId, new Set())
  volSalasCache.get(volId).add(salaId)
  renderVols(volsCache)
}

async function removerVolSala(volId, salaId) {
  if (!confirm('Remover este voluntário da sala?')) return
  const { error } = await _db.from('levinho_voluntarios_salas')
    .delete().eq('voluntario_id', volId).eq('sala_id', salaId)
  if (error) { alert('Erro ao remover: ' + error.message); console.error(error); return }
  volSalasCache.get(volId)?.delete(salaId)
  renderVols(volsCache)
}

function filtrarVols() {
  const t = document.getElementById('busca-vol').value.toLowerCase()
  renderVols(volsCache.filter(v =>
    v.nome.toLowerCase().includes(t) || (v.telefone || '').includes(t)))
}

// ================================================================
//  LÍDERES
// ================================================================
function abrirFormLider() {
  const sel = document.getElementById('sel-lider-vol')
  sel.innerHTML = '<option value="">— Selecione um voluntário —</option>'
  const ativos = volsCache.filter(v => v.status === 'Ativo')
  if (!ativos.length) {
    sel.innerHTML = '<option value="">Nenhum voluntário ativo</option>'
  } else {
    ativos.forEach(v => {
      const opt = document.createElement('option')
      opt.value = v.id
      opt.textContent = v.nome + (v.telefone ? ` · ${v.telefone}` : '')
      sel.appendChild(opt)
    })
  }
  document.getElementById('sel-lider-funcao').value = 'Líder'
  document.getElementById('lider-form-inline').classList.add('open')
  document.getElementById('btn-add-lider').style.display = 'none'
  setTimeout(() => sel.focus(), 100)
}

function fecharFormLider() {
  document.getElementById('lider-form-inline').classList.remove('open')
  document.getElementById('btn-add-lider').style.display = 'inline-flex'
}

async function carregarLideres() {
  if (!volsCache.length) await carregarVoluntarios()
  const { data, error } = await _db.from('ministerio_lideres')
    .select('*, voluntarios(nome)').eq('ministerio_id', MINISTERIO_ID).order('created_at')
  if (error) { console.error(error); return }
  const wrap = document.getElementById('lideres-wrap')
  wrap.innerHTML = ''
  if (!data || !data.length) {
    wrap.innerHTML = `<div style="width:100%;text-align:center;padding:40px 20px;color:#bbb;">
      <div style="font-size:48px;margin-bottom:12px;">👑</div>
      <p style="font-size:15px;">Nenhum líder designado ainda.</p>
      <p style="font-size:13px;margin-top:6px;">Clique em <strong>+ Designar Líder</strong>.</p>
    </div>`
    return
  }
  data.forEach(l => {
    const card = document.createElement('div')
    card.className = 'lider-card'
    card.innerHTML = `
      <button class="btn-rm-lider" data-acao="excluir" onclick="removerLider('${l.id}')">✕</button>
      <div class="lider-icon">👑</div>
      <div class="lider-nome">${l.voluntarios?.nome || '—'}</div>
      <span class="lider-funcao">${l.funcao}</span>`
    wrap.appendChild(card)
  })
  await renderHeroLideres()
}

async function salvarLider() {
  const sel           = document.getElementById('sel-lider-vol')
  const voluntario_id = sel.value
  const funcao        = document.getElementById('sel-lider-funcao').value
  if (!voluntario_id) { alert('Selecione um voluntário.'); sel.focus(); return }
  const btn = document.getElementById('btn-salvar-lider')
  btn.disabled = true; btn.textContent = 'Salvando...'
  const { error } = await _db.from('ministerio_lideres').upsert(
    [{ ministerio_id: MINISTERIO_ID, voluntario_id, funcao }],
    { onConflict: 'ministerio_id,voluntario_id' })
  if (error) {
    btn.disabled = false; btn.textContent = '💾 Salvar'
    alert('Erro ao salvar líder.'); console.error(error); return
  }
  const vol = volsCache.find(v => v.id === voluntario_id)
  if (vol?.membro_id)
    await _db.from('perfis').update({ role: 'lider' }).eq('id', vol.membro_id)
  btn.disabled = false; btn.textContent = '💾 Salvar'
  fecharFormLider(); await carregarLideres()
}

async function removerLider(id) {
  if (!confirm('Remover este líder?')) return
  const { data: liderData } = await _db.from('ministerio_lideres')
    .select('voluntario_id').eq('id', id).single()
  const { error } = await _db.from('ministerio_lideres').delete().eq('id', id)
  if (error) { alert('Erro ao remover.'); console.error(error); return }
  if (liderData?.voluntario_id) {
    const vol = volsCache.find(v => v.id === liderData.voluntario_id)
    if (vol?.membro_id)
      await _db.from('perfis').update({ role: 'membro' }).eq('id', vol.membro_id)
  }
  await carregarLideres()
}

// ================================================================
//  ESCALA — INIT
// ================================================================
async function iniciarEscala() {
  await carregarEventos()
  await carregarDisponibilidades()
  renderCalendario()
  renderDisponibilidadesMes()
}

// ================================================================
//  CALENDÁRIO
// ================================================================
function mudarMes(delta) {
  calMes += delta
  if (calMes < 0)  { calMes = 11; calAno-- }
  if (calMes > 11) { calMes = 0;  calAno++ }
  diaSelecionado = null
  document.getElementById('dia-painel').style.display         = 'none'
  document.getElementById('todos-eventos-wrap').style.display = 'block'
  renderCalendario()
  carregarDisponibilidades().then(() => renderDisponibilidadesMes())
}

function renderCalendario() {
  document.getElementById('cal-titulo').textContent = `${MESES_PT[calMes]} ${calAno}`
  const grid = document.getElementById('cal-grid')
  grid.innerHTML = ''
  DIAS_PT.forEach(d => {
    const el = document.createElement('div')
    el.className = 'cal-dow'; el.textContent = d; grid.appendChild(el)
  })
  const hoje      = new Date()
  const primDia   = new Date(calAno, calMes, 1).getDay()
  const totalDias = new Date(calAno, calMes + 1, 0).getDate()
  const eventosPorDia = {}
  eventosCache.forEach(ev => {
    if (!ev.data) return
    const d = new Date(ev.data + 'T00:00:00')
    if (d.getFullYear() === calAno && d.getMonth() === calMes) {
      const dia = d.getDate()
      if (!eventosPorDia[dia]) eventosPorDia[dia] = []
      eventosPorDia[dia].push(ev)
    }
  })
  for (let i = 0; i < primDia; i++) {
    const el = document.createElement('div')
    el.className = 'cal-day vazio'; grid.appendChild(el)
  }
  for (let dia = 1; dia <= totalDias; dia++) {
    const el     = document.createElement('div'); el.className = 'cal-day'
    const isHoje = dia === hoje.getDate() && calMes === hoje.getMonth() && calAno === hoje.getFullYear()
    const isSel  = diaSelecionado && diaSelecionado.dia === dia
      && diaSelecionado.mes === calMes && diaSelecionado.ano === calAno
    const evsDia = eventosPorDia[dia] || []
    if (isHoje) el.classList.add('hoje')
    if (isSel)  el.classList.add('selecionado')
    if (evsDia.length) el.classList.add('tem-evento')
    const numEl = document.createElement('div')
    numEl.className = 'cal-day-num'; numEl.textContent = dia; el.appendChild(numEl)
        evsDia.slice(0, 3).forEach(ev => {
      const pill = document.createElement('div')
      pill.className   = 'cal-ev-mini' + (ev._geral ? ' cal-ev-geral' : '')
      pill.textContent = ev.nome
      const cor = ev.finalidade ? FINALIDADE_COR_ESCALA[ev.finalidade] : null
      if (cor) {
        pill.style.background = cor + '22'
        pill.style.color      = cor
        pill.style.borderLeft = '3px solid ' + cor
      }
      if (ev._geral) pill.title = '📅 Agenda da Igreja'
      el.appendChild(pill)
    })
    if (evsDia.length > 3) {
      const mais = document.createElement('div')
      mais.className   = 'cal-ev-mini'
      mais.textContent = '+' + (evsDia.length - 3) + ' mais'
      el.appendChild(mais)
    }
    el.addEventListener('click', () => selecionarDia(dia))
    grid.appendChild(el)
  }
}

async function selecionarDia(dia) {
  diaSelecionado = { dia, mes: calMes, ano: calAno }
  renderCalendario()
  const dataStr = `${calAno}-${String(calMes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
  const dataFmt = new Date(dataStr + 'T00:00:00').toLocaleDateString('pt-BR',
    { weekday:'long', day:'2-digit', month:'long', year:'numeric' })
  document.getElementById('dia-painel-titulo').textContent    = `🧒 ${dataFmt}`
  document.getElementById('dia-painel').style.display         = 'block'
  document.getElementById('todos-eventos-wrap').style.display = 'none'
  document.getElementById('inp-ev-data').value                = dataStr
  await renderEventosDia(eventosCache.filter(ev => ev.data === dataStr))
  renderDisponibilidadesDia(dataStr)
}

// ================================================================
//  EVENTOS
// ================================================================
async function carregarEventos() {
  const [resMin, resGeral] = await Promise.all([
    _db.from('eventos_igreja')
      .select('*')
      .eq('ministerio_id', MINISTERIO_ID)
      .eq('tipo', 'ministerio')
      .order('data', { ascending: false }),
    _db.from('eventos_igreja')
      .select('*')
      .eq('tipo', 'geral')
      .order('data', { ascending: false })
  ])

  if (resMin.error)   console.error('Erro eventos ministério:', resMin.error)
  if (resGeral.error) console.error('Erro eventos gerais:', resGeral.error)

  const evMin   = resMin.data   || []
  const evGeral = (resGeral.data || []).map(ev => ({ ...ev, _geral: true }))

  eventosCache = [...evMin, ...evGeral]
  await renderEventos(evMin)
}

async function renderEventos(eventos) {
  const wrap = document.getElementById('eventos-wrap')
  wrap.innerHTML = ''
  if (!eventos.length) {
    wrap.innerHTML = '<div class="empty-state">Nenhum evento cadastrado ainda.</div>'
    return
  }
  const pode = await usuarioPodeGerenciar()
  for (const ev of eventos) {
    const { data: escalaRaw } = await _db.from('ministerio_escala')
      .select('id, voluntario_id, status, token, sala_id, checkin_em, voluntarios(nome, telefone)').eq('evento_id', ev.id)
    const volIds = new Set(volsCache.map(v => v.id))
    const escala = (escalaRaw || []).filter(e => volIds.has(e.voluntario_id))
    wrap.appendChild(buildEventoCard(ev, escala || [], true, pode))
  }
}

async function renderEventosDia(eventos) {
  const wrap = document.getElementById('eventos-do-dia')
  wrap.innerHTML = ''
  if (!eventos.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:24px;">
      📭 Nenhum evento neste dia.<br/>
      <span style="font-size:13px;">Clique em <strong>+ Novo Evento neste dia</strong>.</span>
    </div>`
    return
  }
  const pode = await usuarioPodeGerenciar()
  for (const ev of eventos) {
    const { data: escalaRaw } = await _db.from('ministerio_escala')
      .select('id, voluntario_id, status, token, sala_id, checkin_em, voluntarios(nome, telefone)').eq('evento_id', ev.id)
    const volIds = new Set(volsCache.map(v => v.id))
    const escala = (escalaRaw || []).filter(e => volIds.has(e.voluntario_id))
    wrap.appendChild(buildEventoCard(ev, escala || [], false, pode))
  }
}

function buildEventoCard(ev, esc, showDate = false, pode = false) {
  const confirmados = esc.filter(e => e.status === 'confirmado').length
  const pendentes   = esc.filter(e => e.status === 'pendente').length
  const recusados   = esc.filter(e => e.status === 'recusado').length
  const hora        = ev.hora ? ` · ${ev.hora.slice(0,5)}` : ''
  const dataFmt     = showDate && ev.data
    ? new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR') + hora
    : hora || 'Dia todo'
  const card = document.createElement('div')
  card.className = 'evento-card'
  // ── Footer para eventos gerais ─────────────────────────────
  let _footerGeralHtml = ''
  if (ev._geral || ev.tipo === 'geral') {
    const _minha = esc.find(e => e.voluntario_id === MEU_VOLUNTARIO_ID)
    if (_minha) {
      const _nEsc  = (_minha.voluntarios?.nome || '').replace(/'/g, "\\'")
      const _dEsc  = (ev.data || '').replace(/'/g, "\\'")
      const _nEv   = ev.nome.replace(/'/g, "\\'")
      const _label = _minha.status === 'confirmado' ? '✅ Confirmado'
                   : _minha.status === 'recusado'   ? '❌ Recusado'
                   : '⏳ Confirmar presença'
      _footerGeralHtml = '<button class="btn btn-primary" style="font-size:12px;" ' +
        'onclick="abrirModalStatus(\'' + _minha.id + '\',\'' + _nEv + '\',\'' + _dEsc + '\',\'' + _nEsc + '\',true)">' +
        _label + '</button>'
    } else if (pode) {
      const _nEv = ev.nome.replace(/'/g, "\\'")
      const _dEv = (ev.data || '').replace(/'/g, "\\'")
      _footerGeralHtml = '<button class="btn btn-secondary" style="font-size:12px;" ' +
        'data-acao-lider onclick="abrirModalEscalaGeral(\'' + ev.id + '\',\'' + _nEv + '\',\'' + _dEv + '\')">' +
        '👥 Escalar Voluntários</button>'
    }
  }
  card.innerHTML = `
    <div class="evento-head">
      <div>
        <h3>🧒 ${ev.nome}</h3>
        ${ev.descricao ? `<p class="evento-desc">${ev.descricao}</p>` : ''}
      </div>
      <span class="evento-data-badge">${dataFmt}</span>
    </div>
    <div class="escala-itens">
      ${esc.length
        ? renderEscalaItensAgrupado(esc, ev, pode)
        : `<p style="color:#bbb;font-size:13px;text-align:center;">Nenhum voluntário escalado.</p>`
      }
    </div>
    <div class="evento-footer">
      <div class="escala-resumo">
        <span class="pill pill-confirmado">✅ ${confirmados}</span>
        <span class="pill pill-pendente">⏳ ${pendentes}</span>
        <span class="pill pill-recusado">❌ ${recusados}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        ${_footerGeralHtml}
        ${pode && !(ev._geral || ev.tipo === 'geral') ? `<button class="btn btn-danger" data-acao="excluir"
          style="font-size:12px;padding:6px 12px;"
          onclick="excluirEvento('${ev.id}')">🗑️ Excluir evento</button>` : ''}
      </div>
    </div>`
  return card
}

function renderEscalaItensAgrupado(esc, ev, pode) {
  // Agrupa por sala (mantém ordem das salas; "sem sala" no fim)
  const grupos = new Map()
  ;(salasCache || []).forEach(s => grupos.set(s.id, { sala: s, itens: [] }))
  grupos.set(null, { sala: null, itens: [] })
  esc.forEach(e => {
    const key = e.sala_id ?? null
    if (!grupos.has(key)) grupos.set(key, { sala: { id: key, nome: nomeSala(key) }, itens: [] })
    grupos.get(key).itens.push(e)
  })
  let html = ''
  for (const [, grupo] of grupos) {
    if (!grupo.itens.length) continue
    const titulo = grupo.sala
      ? `<div class="escala-sala-titulo">🏷️ ${escapeHtml(grupo.sala.nome)} <span class="escala-sala-count">${grupo.itens.length}</span></div>`
      : `<div class="escala-sala-titulo escala-sala-titulo-sem">⚠️ Sem sala designada <span class="escala-sala-count">${grupo.itens.length}</span></div>`
    html += titulo
    html += grupo.itens.map(e => renderEscalaItem(e, ev, pode)).join('')
  }
  return html
}

function renderEscalaItem(e, ev, pode) {
  const ehMeu = e.voluntario_id === MEU_VOLUNTARIO_ID
  const evNomeSafe = (ev.nome || '').replace(/'/g, "\\'")
  const volNome    = e.voluntarios?.nome || '—'
  const volNomeSafe = volNome.replace(/'/g, "\\'")
  const btnExcluir = pode
    ? `<button title="Remover da escala" style="padding:3px 8px;font-size:11px;"
        class="btn btn-danger" data-acao="excluir"
        onclick="removerEscala('${e.id}','${volNomeSafe}','${evNomeSafe}')">🗑️</button>`
    : ''
  const btnEditar = (pode || ehMeu)
    ? `<button class="btn btn-secondary" style="padding:4px 10px;font-size:11px;"
        onclick="abrirModalStatus('${e.id}','${evNomeSafe}','${ev.data}','${volNomeSafe}',${ehMeu})">✏️</button>`
    : ''
  const _url = e.token ? (location.origin + location.pathname + '?token=' + e.token) : ''
  const _dataFmt2 = ev.data ? new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR') : ''
  const _wMsg = _url ? encodeURIComponent(
    'Olá ' + volNome + '! Você foi escalado(a) para servir em *' +
    ev.nome + '* no dia *' + _dataFmt2 + '*.\n\nConfirme sua presença:\n' + _url
  ) : ''
  const _telVol = e.voluntarios?.telefone || ''
  const _btnWpp = (pode && e.status === 'pendente' && _url)
    ? `<a href="${window.linkWhatsApp(_telVol, _wMsg)}" target="_blank" title="WhatsApp"
        style="padding:3px 8px;font-size:11px;background:#25D366;color:white;
          border-radius:6px;text-decoration:none;white-space:nowrap;">📱</a>
       <button onclick="copiarTextoGeral('${_url}', this)" title="Copiar link"
        style="padding:3px 8px;font-size:11px;background:#f0fffe;
          border:1px solid #2BBFB3;color:#2BBFB3;border-radius:6px;cursor:pointer;">🔗</button>`
    : ''
  // Chip de sala editável (admin/líder pode trocar)
  const opcoesSalas = (salasCache || []).map(s => {
    const sel = e.sala_id === s.id ? ' selected' : ''
    return `<option value="${s.id}"${sel}>${escapeHtml(s.nome)}</option>`
  }).join('')
  const chipSala = pode
    ? `<select onchange="atualizarSalaEscala('${e.id}', this.value)"
         style="padding:2px 6px;border:1px solid #c0e8e6;border-radius:6px;font-size:11px;background:#f0fffe;color:#1a9e93;font-weight:700;">
         <option value="">— sala —</option>${opcoesSalas}
       </select>`
    : (e.sala_id ? `<span class="sala-badge sala-${e.sala_id}">${escapeHtml(nomeSala(e.sala_id))}</span>` : '')
  return `
    <div class="escala-item">
      <div>
        <span class="escala-item-nome">${escapeHtml(volNome)}</span>
        ${window.spanTelWhatsApp(e.voluntarios?.telefone)}
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        ${chipSala}
        <span class="pill pill-${e.status}">
          ${e.status === 'confirmado' ? '✅ Confirmado'
            : e.status === 'recusado'  ? '❌ Recusado' : '⏳ Pendente'}
        </span>
        ${window.renderCheckinEscalaBadgeIfHoje(e, ev, pode, ehMeu)}
        ${_btnWpp}
        ${btnEditar}
        ${btnExcluir}
      </div>
    </div>`
}

async function atualizarSalaEscala(escalaId, salaVal) {
  const sala_id = salaVal ? parseInt(salaVal, 10) : null
  const { error } = await _db.from('ministerio_escala')
    .update({ sala_id }).eq('id', escalaId)
  if (error) { alert('Erro ao atualizar sala: ' + error.message); return }
  await carregarEventos()
  if (diaSelecionado) {
    const ds = `${diaSelecionado.ano}-${String(diaSelecionado.mes+1).padStart(2,'0')}-${String(diaSelecionado.dia).padStart(2,'0')}`
    await renderEventosDia(eventosCache.filter(e => e.data === ds))
  }
}

function abrirModalEvento() {
  ;['inp-ev-nome','inp-ev-hora','inp-ev-desc'].forEach(id =>
    document.getElementById(id).value = '')
  if (!diaSelecionado) document.getElementById('inp-ev-data').value = ''
  document.getElementById('links-gerados').style.display = 'none'
  document.getElementById('lista-links').innerHTML = ''
  const wrap = document.getElementById('check-vols')
  wrap.innerHTML = ''
  const opcoesSalas = (salasCache || [])
    .map(s => `<option value="${s.id}">${escapeHtml(s.nome)}</option>`).join('')
  volsCache.filter(v => v.status === 'Ativo').forEach(v => {
    const minhasSalas = volSalasCache.get(v.id) || new Set()
    const sugerida = (salasCache || []).find(s => minhasSalas.has(s.id))
    const opcoesSel = (salasCache || []).map(s => {
      const sel = sugerida && sugerida.id === s.id ? ' selected' : ''
      return `<option value="${s.id}"${sel}>${escapeHtml(s.nome)}</option>`
    }).join('')
    const lbl = document.createElement('label')
    lbl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 0;flex-wrap:wrap;'
    lbl.innerHTML = `
      <input type="checkbox" class="chk-vol" value="${v.id}" data-nome="${v.nome.replace(/"/g,'')}" />
      <span style="flex:1;">${escapeHtml(v.nome)}
        ${v.telefone ? `<span style="color:#aaa;font-size:12px;">· ${escapeHtml(v.telefone)}</span>` : ''}
      </span>
      <select class="sel-sala-novo" data-vol-id="${v.id}"
        style="padding:3px 6px;border:1px solid #c0e8e6;border-radius:6px;font-size:12px;background:#f0fffe;color:#1a9e93;">
        <option value="">— sala —</option>${opcoesSel}
      </select>`
    wrap.appendChild(lbl)
  })
  document.getElementById('btn-salvar-evento').disabled    = false
  document.getElementById('btn-salvar-evento').textContent = 'Salvar'
  document.getElementById('modal-evento').classList.add('active')
}

function fecharModalEvento() {
  document.getElementById('modal-evento').classList.remove('active')
}

function toggleTodos() {
  const checks = document.querySelectorAll('.chk-vol')
  const todos  = [...checks].every(c => c.checked)
  checks.forEach(c => c.checked = !todos)
}

async function salvarEvento() {
  const nome = document.getElementById('inp-ev-nome').value.trim()
  const data = document.getElementById('inp-ev-data').value
  if (!nome || !data) { alert('Informe nome e data do evento.'); return }
  const hora      = document.getElementById('inp-ev-hora').value || null
  const descricao = document.getElementById('inp-ev-desc').value.trim() || null
  const btn       = document.getElementById('btn-salvar-evento')
  btn.disabled = true; btn.textContent = 'Salvando...'
  const { data: ev, error } = await _db.from('eventos_igreja')
    .insert([{ ministerio_id: MINISTERIO_ID, nome, data, hora, tipo: 'ministerio' }])
    .select().single()
  if (error) {
    alert('Erro ao criar evento.'); console.error(error)
    btn.disabled = false; btn.textContent = 'Salvar'; return
  }
  const selecionados = [...document.querySelectorAll('.chk-vol:checked')]
    .map(c => {
      const sel = document.querySelector(`.sel-sala-novo[data-vol-id="${c.value}"]`)
      const salaVal = sel ? sel.value : ''
      return { id: c.value, nome: c.dataset.nome, sala_id: salaVal ? parseInt(salaVal, 10) : null }
    })
  let escalaInserida = []
  if (selecionados.length) {
    const { data: ins, error: errEsc } = await _db.from('ministerio_escala')
      .insert(selecionados.map(v => ({
        evento_id: ev.id, voluntario_id: v.id, status: 'pendente', sala_id: v.sala_id
      }))).select()
    if (errEsc) console.error(errEsc)
    escalaInserida = ins || []
  }
  if (escalaInserida.length) {
    const base    = `${location.origin}${location.pathname}?token=`
    const listDiv = document.getElementById('lista-links')
    listDiv.innerHTML = ''
    escalaInserida.forEach(esc => {
      const vol = selecionados.find(v => v.id === esc.voluntario_id)
      const url = base + esc.token
      const box = document.createElement('div')
      box.className = 'link-box'
      box.innerHTML = `
        <span style="flex:1;"><strong>${vol?.nome || 'Voluntário'}</strong><br/>
        <span style="color:#888;font-size:11px;">${url}</span></span>
        <button class="btn-copiar" onclick="copiarTexto('${url}', this)">📋 Copiar</button>`
      listDiv.appendChild(box)
    })
    document.getElementById('links-gerados').style.display = 'block'
  }
  btn.textContent = '✅ Salvo!'
  await carregarEventos(); renderCalendario()
  if (diaSelecionado) {
    const ds = `${diaSelecionado.ano}-${String(diaSelecionado.mes+1).padStart(2,'0')}-${String(diaSelecionado.dia).padStart(2,'0')}`
    await renderEventosDia(eventosCache.filter(e => e.data === ds))
    await renderDisponibilidadesDia(ds)
  }
}


// ── Remover voluntário da escala ────────────────────────────
async function removerEscala(escalaId, volNome, evNome) {
  if (!confirm('Remover ' + volNome + ' da escala de "' + evNome + '"?')) return
  const { error } = await _db.from('ministerio_escala').delete().eq('id', escalaId)
  if (error) { alert('Erro ao remover.'); console.error(error); return }
  await carregarEventos(); renderCalendario()
  if (diaSelecionado) {
    const ds = diaSelecionado.ano + '-' +
      String(diaSelecionado.mes + 1).padStart(2,'0') + '-' +
      String(diaSelecionado.dia).padStart(2,'0')
    await renderEventosDia(eventosCache.filter(e => e.data === ds))
    await renderDisponibilidadesDia(ds)
  }
}

async function excluirEvento(id) {
  const ev = eventosCache.find(e => e.id === id)
  if (ev && (ev._geral || ev.tipo === 'geral')) {
    alert('Eventos gerais (cadastrados pela Agenda) não podem ser excluídos pelo ministério.')
    return
  }
  if (!confirm('Excluir este evento e toda a escala?')) return
  await _db.from('ministerio_escala').delete().eq('evento_id', id)
  await _db.from('eventos_igreja').delete().eq('id', id)
  await carregarEventos(); renderCalendario()
  if (diaSelecionado) {
    const ds = `${diaSelecionado.ano}-${String(diaSelecionado.mes+1).padStart(2,'0')}-${String(diaSelecionado.dia).padStart(2,'0')}`
    await renderEventosDia(eventosCache.filter(e => e.data === ds))
    await renderDisponibilidadesDia(ds)
  }
}

async function copiarLinks(eventoId, btn) {
  const { data } = await _db.from('ministerio_escala')
    .select('token, voluntarios(nome)').eq('evento_id', eventoId)
  if (!data || !data.length) { alert('Nenhum voluntário escalado.'); return }
  const base = `${location.origin}${location.pathname}?token=`
  const txt  = data.map(e =>
    `${e.voluntarios?.nome || 'Voluntário'}:\n${base}${e.token}`).join('\n\n')
  await navigator.clipboard.writeText(txt)
  btn.textContent = '✅ Copiado!'
  setTimeout(() => btn.textContent = '🔗 Copiar links', 2500)
}

function copiarTexto(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    btn.textContent = '✅'
    setTimeout(() => btn.textContent = '📋 Copiar', 2000)
  })
}

// ================================================================
//  MODAL STATUS ESCALA
// ================================================================
function abrirModalStatus(escalaId, eventoNome, eventoData, volNome, ehMeu = false) {
  escalaAtiva = escalaId
  document.getElementById('mse-nome').textContent = eventoNome
  document.getElementById('mse-data').textContent =
    new Date(eventoData + 'T00:00:00').toLocaleDateString('pt-BR', { dateStyle: 'long' })
  document.getElementById('mse-vol').textContent = `Voluntário: ${volNome}`
  const botoesAdmin = document.getElementById('mse-btns-admin')
  const botoesVol   = document.getElementById('mse-btns-voluntario')
  if (botoesAdmin) botoesAdmin.style.display = ehMeu ? 'none' : 'flex'
  if (botoesVol)   botoesVol.style.display   = ehMeu ? 'flex' : 'none'
  document.getElementById('modal-status-escala').classList.add('active')
}

function fecharModalStatus() {
  document.getElementById('modal-status-escala').classList.remove('active')
  escalaAtiva = null
}

async function alterarStatus(novoStatus) {
  if (!escalaAtiva) return
  const { error } = await _db.from('ministerio_escala')
    .update({ status: novoStatus, respondido_em: new Date().toISOString() })
    .eq('id', escalaAtiva)
  if (error) { alert('Erro ao alterar status.'); console.error(error); return }
  fecharModalStatus()
  await carregarEventos(); renderCalendario()
  if (diaSelecionado) {
    const ds = `${diaSelecionado.ano}-${String(diaSelecionado.mes+1).padStart(2,'0')}-${String(diaSelecionado.dia).padStart(2,'0')}`
    await renderEventosDia(eventosCache.filter(e => e.data === ds))
    await renderDisponibilidadesDia(ds)
  }
}

// ================================================================
//  CONFIRMAÇÃO POR TOKEN
// ================================================================
async function carregarConfirmacaoToken(token) {
  const { data, error } = await _db.from('ministerio_escala')
    .select('id, status, eventos_igreja(nome, data), voluntarios(nome)')
    .eq('token', token).maybeSingle()
  if (error || !data) {
    document.getElementById('conf-icon').textContent        = '❌'
    document.getElementById('conf-evento-nome').textContent = 'Link inválido ou expirado.'
    document.getElementById('confirm-btns').style.display   = 'none'
    return
  }
  tokenEscalaId = data.id
  const ev      = data.eventos_igreja
  const dataFmt = ev?.data
    ? new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR', { dateStyle: 'long' }) : ''
  document.getElementById('conf-evento-nome').textContent = ev?.nome || 'Evento'
  document.getElementById('conf-evento-data').textContent = dataFmt
  document.getElementById('conf-evento-desc').textContent = ev?.descricao
    || `Olá, ${data.voluntarios?.nome || 'voluntário'}! Confirme sua presença:`
  if (data.status !== 'pendente') {
    document.getElementById('conf-icon').textContent =
      data.status === 'confirmado' ? '✅' : '❌'
    document.getElementById('confirm-btns').innerHTML =
      `<p style="color:#888;font-size:15px;">Você já respondeu: <strong>${data.status}</strong></p>`
  }
}

async function responderEscala(status) {
  if (!tokenEscalaId) return
  await _db.from('ministerio_escala')
    .update({ status, respondido_em: new Date().toISOString() }).eq('id', tokenEscalaId)
  document.getElementById('conf-icon').textContent =
    status === 'confirmado' ? '✅' : '❌'
  document.getElementById('conf-evento-nome').textContent =
    status === 'confirmado' ? 'Presença confirmada!' : 'Ausência registrada.'
  document.getElementById('conf-evento-data').textContent = ''
  document.getElementById('conf-evento-desc').textContent = 'Obrigado por responder!'
  document.getElementById('confirm-btns').style.display   = 'none'
}

// ================================================================
//  DISPONIBILIDADE
// ================================================================
async function carregarDisponibilidades() {
  const dataIni = `${calAno}-${String(calMes+1).padStart(2,'0')}-01`
  const dataFim = `${calAno}-${String(calMes+1).padStart(2,'0')}-${new Date(calAno, calMes+1, 0).getDate()}`
  const { data, error } = await _db.from('disponibilidade')
    .select('*, voluntarios(nome), eventos_igreja(nome, hora)')
    .eq('ministerio_id', MINISTERIO_ID)
    .gte('data', dataIni).lte('data', dataFim)
  if (error) { console.error(error); return }
  dispCache = data || []
}

// ================================================================
//  ACEITAR DISPONIBILIDADE → escalar direto como confirmado
// ================================================================
async function aceitarDisponibilidade(dispId, voluntarioId, eventoId, btnEl) {
  const pode = await usuarioPodeGerenciar()
  if (!pode) return

  btnEl.disabled = true
  btnEl.textContent = '⏳'

  const { data: jaEscalado } = await _db.from('ministerio_escala')
    .select('id, status').eq('evento_id', eventoId).eq('voluntario_id', voluntarioId).maybeSingle()

  let errEscala
  if (jaEscalado) {
    const { error } = await _db.from('ministerio_escala')
      .update({ status: 'confirmado', respondido_em: new Date().toISOString() })
      .eq('id', jaEscalado.id)
    errEscala = error
  } else {
    const { error } = await _db.from('ministerio_escala')
      .insert({ evento_id: eventoId, voluntario_id: voluntarioId, status: 'confirmado', respondido_em: new Date().toISOString() })
    errEscala = error
  }

  if (errEscala) {
    console.error('Erro ao escalar:', errEscala)
    alert('Erro ao escalar voluntário.')
    btnEl.disabled = false
    btnEl.textContent = '✅ Escalar'
    return
  }

  btnEl.textContent = '✔ Escalado'
  btnEl.style.background = '#D1FAE5'
  btnEl.style.color = '#065F46'
  btnEl.style.border = '1px solid #6EE7B7'
  btnEl.disabled = true

  await carregarEventos()
  renderCalendario()
  if (diaSelecionado) {
    const ds = diaSelecionado.ano + '-' +
      String(diaSelecionado.mes + 1).padStart(2,'0') + '-' +
      String(diaSelecionado.dia).padStart(2,'0')
    await renderEventosDia(eventosCache.filter(e => e.data === ds))
    await renderDisponibilidadesDia(ds)
  }
}

function renderDisponibilidadesMes() {
  const wrap = document.getElementById('disponibilidade-mes-wrap')
  if (!wrap) return
  const porDia = {}
  dispCache.forEach(d => {
    if (!porDia[d.data]) porDia[d.data] = []
    porDia[d.data].push(d)
  })
  const dias = Object.keys(porDia).sort()
  if (!dias.length) {
    wrap.innerHTML = `<p style="color:#bbb;font-size:13px;text-align:center;padding:20px;">
      Nenhuma disponibilidade registrada este mês.</p>`
    return
  }
  wrap.innerHTML = dias.map(data => {
    const dataFmt = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR',
      { weekday:'short', day:'2-digit', month:'short' })
    const items = porDia[data].map(d => {
      const ehMeu = d.voluntario_id === MEU_VOLUNTARIO_ID
      return `
        <div class="disp-item">
          <span class="disp-nome">${d.voluntarios?.nome || '—'}</span>
          <span class="disp-periodo badge-periodo">${d.periodo}</span>
          ${d.observacao ? `<span class="disp-obs">${d.observacao}</span>` : ''}
          ${ehMeu ? `
            <div class="disp-acoes">
              <button class="btn-disp-editar"
                onclick="abrirModalDisponibilidade('${data}','${d.id}','${d.periodo}',
                \`${(d.observacao||'').replace(/`/g,"'")}\`)">✏️</button>
              <button class="btn-disp-excluir"
                onclick="excluirDisponibilidade('${d.id}')">🗑️</button>
            </div>` : ''}
        </div>`
    }).join('')
    return `<div class="disp-dia-group">
      <div class="disp-dia-titulo">📅 ${dataFmt}</div>${items}</div>`
  }).join('')
}

async function renderDisponibilidadesDia(dataStr) {
  const wrap = document.getElementById('disponibilidade-dia-wrap')
  if (!wrap) return

  const dispDia = dispCache.filter(d => d.data === dataStr)

  if (!dispDia.length) {
    wrap.innerHTML = '<p style="color:#bbb;font-size:13px;text-align:center;">Nenhuma disponibilidade registrada.</p>'
    return
  }

  // Agrupa por evento
  const porEvento = {}
  dispDia.forEach(d => {
    const evId = d.evento_id || '_sem_evento'
    if (!porEvento[evId]) porEvento[evId] = { ev: d.eventos_igreja, vols: [] }
    porEvento[evId].vols.push(d)
  })

  const podeGer = await usuarioPodeGerenciar()

  // Busca escala atual de todos os eventos do dia para saber quem já está confirmado
  const evIdsDia = Object.keys(porEvento).filter(id => id !== '_sem_evento')
  let escalaConfirmadaMap = {} // voluntario_id+evento_id → status
  if (podeGer && evIdsDia.length) {
    const { data: escDia } = await _db.from('ministerio_escala')
      .select('voluntario_id, evento_id, status')
      .in('evento_id', evIdsDia)
    ;(escDia || []).forEach(e => {
      escalaConfirmadaMap[e.voluntario_id + '_' + e.evento_id] = e.status
    })
  }

  wrap.innerHTML = ''
  Object.entries(porEvento).forEach(([evId, { ev, vols }]) => {
    const evNome = ev?.nome || (evId === '_sem_evento' ? 'Disponível no dia' : '—')
    const evHora = ev?.hora ? ' · ' + ev.hora.slice(0,5) : ''
    const bloco  = document.createElement('div')
    bloco.style.cssText = 'margin-bottom:10px;border:1px solid #e8e8e8;border-radius:10px;overflow:hidden;'
    bloco.innerHTML =
      '<div style="background:#f8f8f8;padding:7px 12px;font-size:12px;font-weight:800;color:#1a2e2d;border-bottom:1px solid #eee;">' +
        '📋 ' + evNome + '<span style="color:#2BBFB3;font-weight:400;">' + evHora + '</span>' +
      '</div>' +
      '<div style="padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px;">' +
        vols.map(d => {
          const ehMeu = d.voluntario_id === MEU_VOLUNTARIO_ID
          const statusEscala = escalaConfirmadaMap[d.voluntario_id + '_' + evId]
          const jaConfirmado = statusEscala === 'confirmado'
          let btnEscalar = ''
          if (podeGer && evId !== '_sem_evento') {
            if (jaConfirmado) {
              btnEscalar = '<span style="font-size:11px;padding:2px 10px;border-radius:20px;' +
                'background:#D1FAE5;color:#065F46;border:1px solid #6EE7B7;font-weight:600;">✔ Escalado</span>'
            } else {
              btnEscalar = '<button data-acao-lider onclick="aceitarDisponibilidade(\'' + d.id + '\',\'' + d.voluntario_id + '\',\'' + evId + '\', this)"' +
                ' style="font-size:11px;padding:2px 10px;border-radius:20px;cursor:pointer;' +
                'background:#f0fffe;color:#1a9e93;border:1px solid #2BBFB3;font-weight:600;">✅ Escalar</button>'
            }
          }
          const btnsMeus = ehMeu
            ? '<button title="Editar minha disponibilidade" onclick="abrirModalDisponibilidade(\'' + d.data + '\')" ' +
              'style="font-size:11px;padding:2px 7px;border-radius:6px;cursor:pointer;background:#fff;border:1px solid #2BBFB3;color:#1a9e93;">✏️</button>' +
              '<button title="Excluir minha disponibilidade" onclick="excluirDisponibilidade(\'' + d.id + '\')" ' +
              'style="font-size:11px;padding:2px 7px;border-radius:6px;cursor:pointer;background:#fff;border:1px solid #ef4444;color:#ef4444;">🗑️</button>'
            : ''
          return '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;' +
            'background:' + (ehMeu ? '#e8faf9' : '#f5f5f5') + ';' +
            'color:' + (ehMeu ? '#1a9e93' : '#555') + ';">' +
            (d.voluntarios?.nome || '—') +
            (ehMeu ? ' <span style="font-size:10px;">✓ eu</span>' : '') +
            '</span>' + btnEscalar + btnsMeus + '</div>'
        }).join('') +
      '</div>'
    wrap.appendChild(bloco)
  })
}

function abrirModalDisponibilidade(data) {
  if (!MEU_VOLUNTARIO_ID) {
    alert('Seu usuário não está vinculado a um voluntário. Contate o administrador.')
    return
  }
  dispEditandoData = data
  const dataFmt = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR',
    { weekday: 'long', day: '2-digit', month: 'long' })
  document.getElementById('modal-disp-titulo').textContent    = '✅ Confirmar disponibilidade'
  document.getElementById('modal-disp-subtitulo').textContent = dataFmt

  // Mostra eventos do dia para o voluntário marcar disponibilidade
  const eventosHoje = eventosCache.filter(ev => ev.data === data)
  const wrap        = document.getElementById('modal-disp-eventos')
  const semEv       = document.getElementById('modal-disp-sem-eventos')
  wrap.innerHTML    = ''

  if (!eventosHoje.length) {
    wrap.style.display  = 'none'
    semEv.style.display = 'block'
    document.getElementById('btn-salvar-disp').style.display = 'none'
  } else {
    wrap.style.display  = 'flex'
    semEv.style.display = 'none'
    document.getElementById('btn-salvar-disp').style.display = ''

    // Busca disponibilidades já registradas pelo voluntário neste dia
    const jaConfirmados = new Set(
      dispCache
        .filter(d => d.data === data && d.voluntario_id === MEU_VOLUNTARIO_ID)
        .map(d => d.evento_id)
    )

    eventosHoje.forEach(ev => {
      const horaFmt  = ev.hora ? ev.hora.slice(0, 5) : ''
      const jaMarc   = jaConfirmados.has(ev.id)
      const item     = document.createElement('label')
      item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 14px;' +
        'border:2px solid ' + (jaMarc ? '#2BBFB3' : '#e8e8e8') + ';border-radius:10px;cursor:pointer;' +
        'background:' + (jaMarc ? '#f0fffe' : 'white') + ';transition:all .2s;'
      item.innerHTML =
        '<input type="checkbox" class="chk-disp-ev" value="' + ev.id + '"' +
        (jaMarc ? ' checked' : '') +
        ' style="accent-color:#2BBFB3;width:18px;height:18px;flex-shrink:0;" />' +
        '<div style="flex:1;">' +
          '<strong style="font-size:14px;color:#1a2e2d;">' + ev.nome + '</strong>' +
          (horaFmt ? '<span style="font-size:12px;color:#2BBFB3;margin-left:8px;">⏰ ' + horaFmt + '</span>' : '') +
        '</div>'
      item.addEventListener('change', () => {
        item.style.borderColor = item.querySelector('input').checked ? '#2BBFB3' : '#e8e8e8'
        item.style.background  = item.querySelector('input').checked ? '#f0fffe' : 'white'
      })
      wrap.appendChild(item)
    })
  }

  document.getElementById('modal-disponibilidade').classList.add('active')
}

function fecharModalDisponibilidade() {
  document.getElementById('modal-disponibilidade').classList.remove('active')
  dispEditandoId = null; dispEditandoData = null
}

async function salvarDisponibilidade() {
  if (!MEU_VOLUNTARIO_ID || !dispEditandoData) return

  const checks    = [...document.querySelectorAll('.chk-disp-ev')]
  const marcados  = checks.filter(c => c.checked).map(c => c.value)
  const desmarcados = checks.filter(c => !c.checked).map(c => c.value)

  const btn = document.getElementById('btn-salvar-disp')
  btn.disabled = true; btn.textContent = 'Salvando...'

  // Remove disponibilidades desmarcadas
  if (desmarcados.length) {
    await _db.from('disponibilidade')
      .delete()
      .eq('voluntario_id', MEU_VOLUNTARIO_ID)
      .eq('data', dispEditandoData)
      .in('evento_id', desmarcados)
  }

  // Insere disponibilidades marcadas (ignora duplicatas)
  if (marcados.length) {
    const rows = marcados.map(evId => ({
      voluntario_id: MEU_VOLUNTARIO_ID,
      ministerio_id: MINISTERIO_ID,
      data:          dispEditandoData,
      evento_id:     evId,
      periodo:       'dia todo',
    }))
    const { error: errUpsert } = await _db.from('disponibilidade')
      .upsert(rows, { onConflict: 'voluntario_id,evento_id', ignoreDuplicates: false })
    if (errUpsert) {
      console.error('Erro ao salvar disponibilidade:', errUpsert)
      alert('Erro ao salvar disponibilidade: ' + errUpsert.message)
      btn.disabled = false; btn.textContent = '✅ Confirmar'
      return
    }
  }

  btn.disabled = false; btn.textContent = '✅ Confirmar'
  fecharModalDisponibilidade()
  await carregarDisponibilidades()
  renderCalendario()
  renderDisponibilidadesMes()
  if (diaSelecionado) {
    const ds = diaSelecionado.ano + '-' +
      String(diaSelecionado.mes + 1).padStart(2,'0') + '-' +
      String(diaSelecionado.dia).padStart(2,'0')
    await renderDisponibilidadesDia(ds)
  }
}

async function excluirDisponibilidade(id) {
  if (!confirm('Remover sua disponibilidade neste dia?')) return
  const { error } = await _db.from('disponibilidade').delete().eq('id', id)
  if (error) { alert('Erro ao excluir.'); console.error(error); return }
  await carregarDisponibilidades()
  renderDisponibilidadesMes()
  if (diaSelecionado) {
    const ds = `${diaSelecionado.ano}-${String(diaSelecionado.mes+1).padStart(2,'0')}-${String(diaSelecionado.dia).padStart(2,'0')}`
    await renderDisponibilidadesDia(ds)
  }
}

// ================================================================
//  AVISOS
// ================================================================
async function carregarAvisosDestaque() {
  const { data } = await _db.from('ministerio_avisos').select('*')
    .eq('ministerio_id', MINISTERIO_ID)
    .order('created_at', { ascending: false }).limit(5)
  const antigo = document.getElementById('avisos-destaque-section')
  if (antigo) antigo.remove()
  if (!data || !data.length) return
  const section = document.createElement('div')
  section.id = 'avisos-destaque-section'
  section.className = 'avisos-destaque-wrap'
  section.innerHTML = `<div class="avisos-destaque-titulo">📢 Avisos do Ministério</div>`
  data.forEach(a => {
    const dataFmt  = new Date(a.created_at).toLocaleDateString('pt-BR',
      { day:'2-digit', month:'long', year:'numeric' })
    const isImagem = a.arquivo_url &&
      /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(a.arquivo_url)
    const card = document.createElement('div')
    card.className = 'aviso-destaque-card'
    card.onclick   = () => abrirAvisoExpandido(a)
    card.innerHTML = `
      ${isImagem ? `<img class="aviso-destaque-img" src="${a.arquivo_url}"
        alt="${a.titulo}" onerror="this.style.display='none'" />` : ''}
      <div class="aviso-destaque-body">
        <h3>📢 ${a.titulo}</h3>
        <div class="aviso-destaque-meta">${badgeSalaHtml(a.sala_id)} 📅 ${dataFmt}${a.criado_por ? ` · ✍️ ${a.criado_por}` : ''}</div>
        ${a.texto ? `<div class="aviso-destaque-texto">${a.texto}</div>` : ''}
        <div class="aviso-destaque-rodape">Clique para ler completo →</div>
      </div>`
    section.appendChild(card)
  })
  const hero = document.querySelector('.ministerio-hero')
  hero.parentNode.insertBefore(section, hero.nextSibling)
}

function abrirAvisoExpandido(aviso) {
  const isImagem = aviso.arquivo_url &&
    /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(aviso.arquivo_url)
  const imgWrap = document.getElementById('modal-av-imagem-wrap')
  const img     = document.getElementById('modal-av-imagem')
  if (isImagem) { img.src = aviso.arquivo_url; imgWrap.style.display = 'block' }
  else          { imgWrap.style.display = 'none'; img.src = '' }
  const dataFmt = new Date(aviso.created_at).toLocaleDateString('pt-BR',
    { day:'2-digit', month:'long', year:'numeric' })
  document.getElementById('modal-av-titulo').textContent = aviso.titulo
  document.getElementById('modal-av-meta').textContent   =
    `📅 ${dataFmt}${aviso.criado_por ? ` · ✍️ ${aviso.criado_por}` : ''}`
  document.getElementById('modal-av-texto').textContent  = aviso.texto || ''
  const overlay = document.getElementById('modal-aviso-expandido')
  overlay.classList.add('active')
  overlay.onclick = e => { if (e.target === overlay) fecharAvisoExpandido() }
}

function fecharAvisoExpandido() {
  document.getElementById('modal-aviso-expandido').classList.remove('active')
}

async function carregarAvisos() {
  const { data, error } = await _db.from('ministerio_avisos').select('*')
    .eq('ministerio_id', MINISTERIO_ID).order('created_at', { ascending: false })
  if (error) { console.error(error); return }
  const wrap = document.getElementById('avisos-wrap')
  wrap.innerHTML = ''
  if (!data || !data.length) {
    wrap.innerHTML = '<div class="empty-state">Nenhum aviso publicado ainda.</div>'
    await carregarAvisosDestaque(); return
  }
  data.forEach(a => {
    const dataFmt  = new Date(a.created_at).toLocaleDateString('pt-BR',
      { day:'2-digit', month:'long', year:'numeric' })
    const isImagem = a.arquivo_url &&
      /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(a.arquivo_url)
    const div = document.createElement('div')
    div.className = 'aviso-card'
    div.innerHTML = `
      <div class="aviso-head">
        <h3>📢 ${a.titulo}</h3>
        <button class="btn-rm-aviso" data-acao="excluir" onclick="excluirAviso('${a.id}')">🗑️</button>
      </div>
      <div class="aviso-meta">${badgeSalaHtml(a.sala_id)} 📅 ${dataFmt}${a.criado_por ? ` · ✍️ ${a.criado_por}` : ''}</div>
      ${isImagem ? `<img src="${a.arquivo_url}" alt="Imagem"
        style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;margin:10px 0;"
        onerror="this.style.display='none'" />` : ''}
      ${a.texto ? `<div class="aviso-texto">${a.texto.replace(/\n/g,'<br/>')}</div>` : ''}
      ${a.arquivo_url && !isImagem
        ? `<a class="aviso-anexo" href="${a.arquivo_url}" target="_blank">
             📎 ${a.arquivo_nome || 'Ver anexo'}</a>` : ''}`
    wrap.appendChild(div)
  })
  await carregarAvisosDestaque()
}

function previewArquivo(input) {
  const nome = input.files[0]?.name || ''
  document.getElementById('upload-preview').textContent = nome ? `📎 ${nome}` : ''
}

function limparFormAviso() {
  ;['inp-av-titulo','inp-av-texto','inp-av-autor'].forEach(id =>
    document.getElementById(id).value = '')
  const selSala = document.getElementById('inp-av-sala')
  if (selSala) selSala.value = ''
  document.getElementById('inp-av-arquivo').value       = ''
  document.getElementById('upload-preview').textContent = ''
}

function badgeSalaHtml(salaId) {
  if (!salaId) return `<span class="sala-badge sala-geral">📢 Geral</span>`
  const s = salasCache.find(x => x.id === salaId)
  return s
    ? `<span class="sala-badge sala-${s.id}">🏷️ ${escapeHtml(s.nome)}</span>`
    : ''
}

async function salvarAviso() {
  const titulo     = document.getElementById('inp-av-titulo').value.trim()
  const texto      = document.getElementById('inp-av-texto').value.trim()
  const criado_por = document.getElementById('inp-av-autor').value.trim()
  const salaSel    = document.getElementById('inp-av-sala')?.value || ''
  const sala_id    = salaSel ? parseInt(salaSel, 10) : null
  const file       = document.getElementById('inp-av-arquivo').files[0]
  if (!titulo) { alert('Informe o título do aviso.'); return }
  let arquivo_url = null, arquivo_nome = null
  if (file) {
    const ext  = file.name.split('.').pop()
    const path = `ministerios/${MINISTERIO_ID}/avisos/${Date.now()}.${ext}`
    const { error: errUp } = await _db.storage.from('arquivos')
      .upload(path, file, { upsert: true })
    if (errUp) { alert(`Erro ao enviar arquivo: ${errUp.message}`); return }
    const { data: urlData } = _db.storage.from('arquivos').getPublicUrl(path)
    arquivo_url = urlData?.publicUrl || null; arquivo_nome = file.name
  }
  const { error } = await _db.from('ministerio_avisos').insert([{
    ministerio_id: MINISTERIO_ID, titulo, sala_id,
    texto: texto || null, arquivo_url, arquivo_nome, criado_por: criado_por || null
  }])
  if (error) { alert('Erro ao publicar aviso.'); console.error(error); return }
  limparFormAviso(); await carregarAvisos()
}

async function excluirAviso(id) {
  if (!confirm('Excluir este aviso?')) return
  await _db.from('ministerio_avisos').delete().eq('id', id)
  await carregarAvisos()
}

// ================================================================
//  PRESENTES (check-in das crianças)
// ================================================================
async function iniciarPresentes() {
  const inp = document.getElementById('presentes-data')
  if (!inp.value) {
    inp.value = new Date().toISOString().slice(0, 10)
  }
  // Botão de limpar só pra admin/líder
  const btn = document.getElementById('btn-limpar-checkins')
  if (btn) btn.style.display = podeGerenciarCache ? 'inline-flex' : 'none'
  await carregarPresentes()
}

async function limparCheckinsDoDia() {
  const dataSel = document.getElementById('presentes-data').value
  if (!dataSel) { alert('Selecione uma data primeiro.'); return }
  const dataFmt = new Date(dataSel + 'T00:00:00').toLocaleDateString('pt-BR')

  // Conta antes de mostrar a confirmação
  const { count } = await _db.from('levinho_checkins')
    .select('*', { count: 'exact', head: true })
    .eq('data_evento', dataSel)

  if (!count) { alert(`Não há check-ins em ${dataFmt}.`); return }

  if (!confirm(`Apagar ${count} check-in(s) de ${dataFmt}?\n\nEssa ação não pode ser desfeita.`)) return
  // Confirmação dupla pra evitar acidentes
  const txt = prompt(`Para confirmar, digite a data ${dataFmt}:`)
  if (txt !== dataFmt) { alert('Data não confere. Cancelado.'); return }

  const { error } = await _db.from('levinho_checkins')
    .delete().eq('data_evento', dataSel)
  if (error) { alert('Erro: ' + error.message); console.error(error); return }
  alert(`✅ ${count} check-in(s) de ${dataFmt} apagado(s).`)
  await carregarPresentes()
}

async function carregarPresentes() {
  const dataSel = document.getElementById('presentes-data').value
  const wrap = document.getElementById('presentes-wrap')
  const stats = document.getElementById('presentes-stats')
  if (!dataSel) {
    wrap.innerHTML = '<div class="empty-state">Selecione uma data.</div>'
    stats.innerHTML = ''
    return
  }

  wrap.innerHTML = '<div class="empty-state">⏳ Carregando...</div>'
  stats.innerHTML = ''

  // 1) Check-ins do dia
  const { data: linhas, error } = await _db.rpc('levinho_presentes', { p_data: dataSel })

  // 2) Escala dos voluntários nos eventos desse dia (para mostrar quem está servindo)
  const { data: eventosDia } = await _db.from('eventos_igreja')
    .select('id').eq('data', dataSel)
  const eventoIds = (eventosDia || []).map(e => e.id)
  let escalaPorSala = new Map()  // sala_id -> [{nome, status}]
  if (eventoIds.length) {
    const { data: escalados } = await _db.from('ministerio_escala')
      .select('sala_id, status, voluntarios(nome)').in('evento_id', eventoIds)
    const volIds = new Set(volsCache.map(v => v.id))
    ;(escalados || []).forEach(e => {
      if (!e.voluntarios?.nome) return
      // só voluntários do Levinho (filtra ruido de outras escalas no mesmo evento)
      const key = e.sala_id ?? null
      if (!escalaPorSala.has(key)) escalaPorSala.set(key, [])
      escalaPorSala.get(key).push({ nome: e.voluntarios.nome, status: e.status })
    })
  }
  window._escalaPorSalaCache = escalaPorSala
  if (error) {
    console.error(error)
    wrap.innerHTML = `<div class="empty-state">Erro: ${escapeHtml(error.message)}</div>`
    return
  }
  const temEscalados = [...escalaPorSala.values()].some(arr => arr.length)
  const linhasArr = Array.isArray(linhas) ? linhas : []
  if (!linhasArr.length && !temEscalados) {
    wrap.innerHTML = '<div class="empty-state">Nenhuma criança presente nem voluntários escalados nesta data.</div>'
    return
  }

  // Stats + indicador dos eventos do dia
  const total = linhasArr.length
  const ativos = linhasArr.filter(l => !l.hora_saida).length
  const saidos = total - ativos
  const visitantes = linhasArr.filter(l => l.eh_visitante).length
  const eventos = [...new Set(linhasArr.map(l => l.evento_nome).filter(Boolean))]
  const eventoLine = eventos.length
    ? `<div style="width:100%;font-size:13px;color:#1a9e93;font-weight:700;margin-bottom:6px;">📅 ${escapeHtml(eventos.join(' · '))}</div>`
    : ''
  stats.innerHTML = `
    ${eventoLine}
    <div class="stat-box"><div class="stat-num">${total}</div><div class="stat-label">Total no dia</div></div>
    <div class="stat-box verde"><div class="stat-num">${ativos}</div><div class="stat-label">Presentes agora</div></div>
    <div class="stat-box"><div class="stat-num">${saidos}</div><div class="stat-label">Já retiradas</div></div>
    <div class="stat-box amarelo"><div class="stat-num">${visitantes}</div><div class="stat-label">Visitantes</div></div>`

  // Agrupa por sala — começa com todas as salas em ordem
  const porSala = new Map()
  ;(salasCache || []).forEach(s => porSala.set(s.id, { nome: s.nome, itens: [] }))
  linhasArr.forEach(l => {
    if (!porSala.has(l.sala_id)) porSala.set(l.sala_id, { nome: l.sala_nome, itens: [] })
    porSala.get(l.sala_id).itens.push(l)
  })

  wrap.innerHTML = ''
  for (const [salaId, grupo] of porSala) {
    // Se não tem checkin nem escalado nessa sala, pula
    const escNessaSala = window._escalaPorSalaCache?.get(salaId) || []
    if (!grupo.itens.length && !escNessaSala.length) continue
    const sec = document.createElement('div')
    sec.className = 'presentes-grupo'
    const ativosSala = grupo.itens.filter(i => !i.hora_saida).length
    const escalados = (window._escalaPorSalaCache?.get(salaId) || [])
    const escaladosHtml = escalados.length
      ? `<div style="font-size:12px;font-weight:600;color:#555;text-transform:none;letter-spacing:0;margin-top:4px;">
           👥 Voluntários: ${escalados.map(e => {
             const ic = e.status === 'confirmado' ? '✅' : e.status === 'recusado' ? '❌' : '⏳'
             return `${ic} ${escapeHtml(e.nome)}`
           }).join(' · ')}
         </div>`
      : `<div style="font-size:12px;color:#bbb;text-transform:none;letter-spacing:0;margin-top:4px;font-style:italic;">
           Nenhum voluntário escalado para esta sala neste dia.
         </div>`
    sec.innerHTML = `
      <div class="presentes-grupo-titulo" style="flex-direction:column;align-items:flex-start;">
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
          <span>🏷️ ${escapeHtml(grupo.nome)}</span>
          <span class="presentes-grupo-count">${ativosSala} presentes / ${grupo.itens.length} total</span>
        </div>
        ${escaladosHtml}
      </div>`
    grupo.itens.forEach(i => {
      const horaEnt = new Date(i.hora_entrada).toLocaleTimeString('pt-BR',
        { hour: '2-digit', minute: '2-digit' })
      const horaSai = i.hora_saida
        ? new Date(i.hora_saida).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : null
      const telLimpo = (i.responsavel_telefone || '').replace(/\D/g, '')
      const card = document.createElement('div')
      card.className = 'presente-card' + (i.hora_saida ? ' saiu' : '')
      const dadosRetirada = {
        id: i.checkin_id,
        nome: i.crianca_nome,
        codigo: i.codigo_retirada,
        responsavel: i.responsavel_nome,
        sala: i.sala_nome
      }
      card.dataset.checkin = JSON.stringify(dadosRetirada)
      const acoes = i.hora_saida
        ? `<div style="font-size:11px;color:#888;font-weight:700;">✅ retirada às ${horaSai}</div>`
        : `<button class="btn btn-primary" style="font-size:12px;padding:6px 14px;"
             onclick='abrirRetirada(this.closest(".presente-card").dataset.checkin)'>👋 Retirar</button>`
      card.innerHTML = `
        <div class="presente-info">
          <div class="presente-nome">
            🧒 ${escapeHtml(i.crianca_nome)} · ${i.crianca_idade}a
            ${i.eh_visitante ? '<span class="pill-vis">VISITANTE</span>' : ''}
          </div>
          <div class="presente-meta">
            👤 ${escapeHtml(i.responsavel_nome)} ·
            ${telLimpo ? `<a href="tel:${telLimpo}">📞 ${escapeHtml(i.responsavel_telefone)}</a>` : escapeHtml(i.responsavel_telefone || '—')}
          </div>
          <div class="presente-meta">
            ⏰ Entrada ${horaEnt}${horaSai ? ` · Saída ${horaSai}` : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <div class="presente-codigo" title="Código de retirada">${escapeHtml(i.codigo_retirada)}</div>
          ${acoes}
        </div>`
      sec.appendChild(card)
    })
    wrap.appendChild(sec)
  }
}

// ───────── Modal de retirada ─────────
let _retiradaAtual = null

function abrirRetirada(jsonStr) {
  try {
    _retiradaAtual = JSON.parse(jsonStr)
  } catch(e) { console.error(e); return }
  document.getElementById('retirada-resumo').innerHTML = `
    <div style="font-weight:700;font-size:15px;">🧒 ${escapeHtml(_retiradaAtual.nome)}</div>
    <div style="font-size:13px;color:#888;">🏷️ ${escapeHtml(_retiradaAtual.sala)}</div>`
  document.getElementById('retirada-codigo').textContent = _retiradaAtual.codigo
  document.getElementById('inp-retirada-resp').value = _retiradaAtual.responsavel || ''
  document.getElementById('retirada-erro').style.display = 'none'
  const btn = document.getElementById('btn-confirmar-retirada')
  btn.disabled = false; btn.textContent = '✅ Confirmar retirada'
  document.getElementById('modal-retirada').classList.add('active')
  setTimeout(() => document.getElementById('inp-retirada-resp').focus(), 80)
}

function fecharRetirada() {
  document.getElementById('modal-retirada').classList.remove('active')
  _retiradaAtual = null
}

async function confirmarRetirada() {
  if (!_retiradaAtual) return
  const resp = document.getElementById('inp-retirada-resp').value.trim()
  const erro = document.getElementById('retirada-erro')
  erro.style.display = 'none'
  if (!resp) {
    erro.textContent = 'Informe quem está retirando.'
    erro.style.display = 'block'; return
  }
  const btn = document.getElementById('btn-confirmar-retirada')
  btn.disabled = true; btn.textContent = '⏳ Registrando...'

  const { error } = await _db.rpc('levinho_checkout', {
    p_checkin_id: _retiradaAtual.id,
    p_responsavel_saida: resp
  })
  if (error) {
    console.error(error)
    erro.textContent = error.message || 'Erro ao registrar retirada.'
    erro.style.display = 'block'
    btn.disabled = false; btn.textContent = '✅ Confirmar retirada'
    return
  }
  fecharRetirada()
  await carregarPresentes()
}

// ================================================================
//  MATERIAIS (por sala)
// ================================================================
async function iniciarMateriais() {
  // Form só pra admin/líder
  const form = document.getElementById('material-form-inline')
  if (form) form.style.display = podeGerenciarCache ? 'block' : 'none'
  preencherSelectSalasMaterial()
  await carregarMateriais()
}

function preencherSelectSalasMaterial() {
  const sel = document.getElementById('inp-mat-sala')
  if (!sel) return
  sel.innerHTML = '<option value="">— escolha a sala —</option>'
  salasCache.forEach(s => {
    const opt = document.createElement('option')
    opt.value = String(s.id)
    opt.textContent = s.nome
    sel.appendChild(opt)
  })
}

function limparFormMaterial() {
  ;['inp-mat-titulo','inp-mat-descricao'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = ''
  })
  const cat = document.getElementById('inp-mat-categoria'); if (cat) cat.value = ''
  const sala = document.getElementById('inp-mat-sala'); if (sala) sala.value = ''
  const file = document.getElementById('inp-mat-arquivo'); if (file) file.value = ''
  const prev = document.getElementById('mat-upload-preview'); if (prev) prev.textContent = ''
}

async function salvarMaterial() {
  const sala_id   = parseInt(document.getElementById('inp-mat-sala').value, 10)
  const titulo    = document.getElementById('inp-mat-titulo').value.trim()
  const descricao = document.getElementById('inp-mat-descricao').value.trim()
  const categoria = document.getElementById('inp-mat-categoria').value
  const file      = document.getElementById('inp-mat-arquivo').files[0]

  if (!sala_id) { alert('Escolha a sala.'); return }
  if (!titulo)  { alert('Informe o título.'); return }

  let arquivo_url = null, arquivo_nome = null
  if (file) {
    const ext  = file.name.split('.').pop()
    const path = `ministerios/${MINISTERIO_ID}/materiais/sala-${sala_id}/${Date.now()}.${ext}`
    const { error: errUp } = await _db.storage.from('arquivos')
      .upload(path, file, { upsert: true })
    if (errUp) { alert(`Erro ao enviar arquivo: ${errUp.message}`); return }
    const { data: urlData } = _db.storage.from('arquivos').getPublicUrl(path)
    arquivo_url  = urlData?.publicUrl || null
    arquivo_nome = file.name
  }

  const criadoPor = window.AUTH?.perfil?.nome || null
  const { error } = await _db.from('levinho_materiais').insert([{
    sala_id, titulo,
    descricao: descricao || null,
    categoria: categoria || null,
    arquivo_url, arquivo_nome,
    criado_por: criadoPor
  }])
  if (error) { alert('Erro: ' + error.message); console.error(error); return }
  limparFormMaterial()
  await carregarMateriais()
}

async function carregarMateriais() {
  const wrap = document.getElementById('materiais-wrap')
  if (!wrap) return
  wrap.innerHTML = '<div class="empty-state">⏳ Carregando...</div>'

  const { data, error } = await _db.from('levinho_materiais')
    .select('*').order('sala_id').order('created_at', { ascending: false })
  if (error) {
    wrap.innerHTML = `<div class="empty-state">Erro: ${escapeHtml(error.message)}</div>`
    return
  }

  // Agrupa por sala
  const porSala = new Map()
  salasCache.forEach(s => porSala.set(s.id, { sala: s, itens: [] }))
  ;(data || []).forEach(m => {
    if (!porSala.has(m.sala_id)) porSala.set(m.sala_id, { sala: { id: m.sala_id, nome: nomeSala(m.sala_id) }, itens: [] })
    porSala.get(m.sala_id).itens.push(m)
  })

  // Se voluntário sem permissão e sem nenhuma sala visível, não mostra nada
  let teveAlgum = false
  wrap.innerHTML = ''
  for (const [, grupo] of porSala) {
    // Se voluntário não-líder não tem materiais nessa sala, pula
    if (!podeGerenciarCache && !grupo.itens.length) continue
    teveAlgum = teveAlgum || grupo.itens.length > 0

    const sec = document.createElement('div')
    sec.className = 'presentes-grupo'
    sec.innerHTML = `<div class="presentes-grupo-titulo">
      <span>🏷️ ${escapeHtml(grupo.sala.nome)}</span>
      <span class="presentes-grupo-count">${grupo.itens.length} material${grupo.itens.length === 1 ? '' : 'is'}</span>
    </div>`

    if (!grupo.itens.length) {
      const vazio = document.createElement('div')
      vazio.className = 'empty-state'
      vazio.style.padding = '14px'
      vazio.textContent = 'Nenhum material publicado nesta sala ainda.'
      sec.appendChild(vazio)
    } else {
      grupo.itens.forEach(m => {
        const dataFmt = new Date(m.created_at).toLocaleDateString('pt-BR',
          { day:'2-digit', month:'short', year:'numeric' })
        const isImg = m.arquivo_url && /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(m.arquivo_url)
        const card = document.createElement('div')
        card.className = 'aviso-card'
        card.innerHTML = `
          <div class="aviso-head">
            <h3>📚 ${escapeHtml(m.titulo)}</h3>
            ${podeGerenciarCache
              ? `<button class="btn-rm-aviso" data-acao="excluir" onclick="excluirMaterial('${m.id}')">🗑️</button>`
              : ''}
          </div>
          <div class="aviso-meta">
            ${m.categoria ? `<span class="sala-badge">${escapeHtml(m.categoria)}</span>` : ''}
            📅 ${dataFmt}${m.criado_por ? ` · ✍️ ${escapeHtml(m.criado_por)}` : ''}
          </div>
          ${isImg ? `<img src="${m.arquivo_url}" alt=""
            style="width:100%;max-height:240px;object-fit:cover;border-radius:10px;margin:10px 0;"
            onerror="this.style.display='none'" />` : ''}
          ${m.descricao ? `<div class="aviso-texto">${escapeHtml(m.descricao).replace(/\n/g,'<br/>')}</div>` : ''}
          ${m.arquivo_url && !isImg
            ? `<a class="aviso-anexo" href="${m.arquivo_url}" target="_blank">
                 📎 ${escapeHtml(m.arquivo_nome || 'Baixar arquivo')}</a>` : ''}`
        sec.appendChild(card)
      })
    }
    wrap.appendChild(sec)
  }

  if (!wrap.children.length) {
    wrap.innerHTML = '<div class="empty-state">Nenhum material disponível para suas salas ainda.</div>'
  }
}

async function excluirMaterial(id) {
  if (!confirm('Excluir este material?')) return
  const { error } = await _db.from('levinho_materiais').delete().eq('id', id)
  if (error) { alert('Erro: ' + error.message); console.error(error); return }
  await carregarMateriais()
}

// ================================================================
//  RELATÓRIOS
// ================================================================
async function iniciarRelatorios() {
  if (!volsCache.length) await carregarVoluntarios()
  const sel = document.getElementById('filtro-evento')
  sel.innerHTML = '<option value="">Todos</option>'
  eventosCache.forEach(ev => {
    const opt = document.createElement('option')
    opt.value = ev.id
    opt.textContent = `${ev.nome} (${new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR')})`
    sel.appendChild(opt)
  })
  // Popula dropdown de sala no relatório de presença
  const selSala = document.getElementById('rp-sala')
  if (selSala && selSala.options.length <= 1) {
    salasCache.forEach(s => {
      const opt = document.createElement('option')
      opt.value = String(s.id)
      opt.textContent = s.nome
      selSala.appendChild(opt)
    })
  }
  await gerarRelatorio()
}

function trocarRelatorio(qual) {
  const aEsc = document.getElementById('rel-escala-wrap')
  const aPre = document.getElementById('rel-presenca-wrap')
  const bEsc = document.getElementById('btn-rel-escala')
  const bPre = document.getElementById('btn-rel-presenca')
  if (qual === 'presenca') {
    aEsc.style.display = 'none'; aPre.style.display = 'block'
    bEsc.classList.remove('btn-primary'); bEsc.classList.add('btn-secondary')
    bPre.classList.remove('btn-secondary'); bPre.classList.add('btn-primary')
    if (!document.getElementById('rp-ini').value) {
      const fim = new Date()
      const ini = new Date(); ini.setDate(ini.getDate() - 30)
      document.getElementById('rp-ini').value = ini.toISOString().slice(0,10)
      document.getElementById('rp-fim').value = fim.toISOString().slice(0,10)
    }
    gerarRelatorioPresenca()
  } else {
    aEsc.style.display = 'block'; aPre.style.display = 'none'
    bPre.classList.remove('btn-primary'); bPre.classList.add('btn-secondary')
    bEsc.classList.remove('btn-secondary'); bEsc.classList.add('btn-primary')
  }
}

let _presencaCache = []

async function gerarRelatorioPresenca() {
  const ini = document.getElementById('rp-ini').value
  const fim = document.getElementById('rp-fim').value
  const sala = document.getElementById('rp-sala').value
  const status = document.getElementById('rp-status').value
  const tbody = document.getElementById('tbody-relatorio-presenca')
  const stats = document.getElementById('rp-stats')
  if (!ini || !fim) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">Selecione o intervalo de datas.</td></tr>`
    stats.innerHTML = ''
    return
  }
  let q = _db.from('levinho_checkins')
    .select('*, levinho_salas(nome), eventos_igreja(nome)')
    .gte('data_evento', ini).lte('data_evento', fim)
    .order('data_evento', { ascending: false }).order('hora_entrada', { ascending: false })
  if (sala) q = q.eq('sala_id', parseInt(sala, 10))
  const { data, error } = await q
  if (error) {
    console.error(error)
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">Erro: ${escapeHtml(error.message)}</td></tr>`
    stats.innerHTML = ''
    return
  }
  let lista = data || []
  if (status === 'presente')   lista = lista.filter(r => !r.hora_saida)
  if (status === 'retirada')   lista = lista.filter(r =>  r.hora_saida)
  if (status === 'visitante')  lista = lista.filter(r =>  r.eh_visitante)

  _presencaCache = lista
  renderRelatorioPresenca(lista)
}

function renderRelatorioPresenca(lista) {
  const tbody = document.getElementById('tbody-relatorio-presenca')
  const stats = document.getElementById('rp-stats')
  const total = lista.length
  const ativos = lista.filter(r => !r.hora_saida).length
  const visitantes = lista.filter(r => r.eh_visitante).length
  const eventos = new Set(lista.map(r => r.evento_id).filter(Boolean)).size
  stats.innerHTML = `
    <div class="stat-box"><div class="stat-num">${total}</div><div class="stat-label">Check-ins</div></div>
    <div class="stat-box verde"><div class="stat-num">${total - ativos}</div><div class="stat-label">Retiradas</div></div>
    <div class="stat-box amarelo"><div class="stat-num">${ativos}</div><div class="stat-label">Sem retirada</div></div>
    <div class="stat-box"><div class="stat-num">${visitantes}</div><div class="stat-label">Visitantes</div></div>
    <div class="stat-box"><div class="stat-num">${eventos}</div><div class="stat-label">Eventos</div></div>`

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-state">Nenhum check-in no intervalo.</td></tr>`
    return
  }
  tbody.innerHTML = ''
  lista.forEach(r => {
    const dataFmt = new Date(r.data_evento + 'T00:00:00').toLocaleDateString('pt-BR')
    const horaEnt = new Date(r.hora_entrada).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
    const horaSai = r.hora_saida
      ? new Date(r.hora_saida).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
      : '—'
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${dataFmt}</td>
      <td>${escapeHtml(r.eventos_igreja?.nome || '—')}</td>
      <td><span class="sala-badge sala-${r.sala_id}">${escapeHtml(r.levinho_salas?.nome || nomeSala(r.sala_id))}</span></td>
      <td>${escapeHtml(r.crianca_nome)} ${r.eh_visitante ? '<span class="pill-vis">V</span>' : ''}</td>
      <td>${r.crianca_idade}a</td>
      <td>${escapeHtml(r.responsavel_nome)}</td>
      <td>${escapeHtml(r.responsavel_telefone || '')}</td>
      <td>${horaEnt}</td>
      <td>${horaSai}</td>
      <td>${escapeHtml(r.responsavel_saida_nome || '—')}</td>`
    tbody.appendChild(tr)
  })
}

function exportarPresencaCSV() {
  if (!_presencaCache.length) { alert('Nenhum dado para exportar.'); return }
  const linhas = [
    ['Data','Evento','Sala','Criança','Visitante','Idade','Responsável','Telefone','Entrada','Saída','Retirada por'],
    ..._presencaCache.map(r => [
      r.data_evento,
      r.eventos_igreja?.nome || '',
      r.levinho_salas?.nome || '',
      r.crianca_nome,
      r.eh_visitante ? 'sim' : 'não',
      r.crianca_idade,
      r.responsavel_nome,
      r.responsavel_telefone || '',
      r.hora_entrada ? new Date(r.hora_entrada).toLocaleString('pt-BR') : '',
      r.hora_saida ? new Date(r.hora_saida).toLocaleString('pt-BR') : '',
      r.responsavel_saida_nome || ''
    ])
  ]
  const csv  = linhas.map(l => l.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `levinho-presenca-${Date.now()}.csv`; a.click()
  URL.revokeObjectURL(url)
}

async function gerarRelatorio() {
  const ini    = document.getElementById('filtro-ini').value
  const fim    = document.getElementById('filtro-fim').value
  const evId   = document.getElementById('filtro-evento').value
  const status = document.getElementById('filtro-status').value
  const ids    = eventosCache.map(e => e.id)
  if (!ids.length) { renderStats([]); renderRelatorio([]); return }
  let q = _db.from('ministerio_escala')
    .select('*, voluntarios(nome), eventos_igreja(nome, data)')
    .in('evento_id', ids).order('created_at', { ascending: false })
  if (evId)   q = q.eq('evento_id', evId)
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) { console.error(error); return }
  const volIds = new Set(volsCache.map(v => v.id))
  relatorioCache = (data || []).filter(r => {
    if (!volIds.has(r.voluntario_id)) return false
    const d = r.eventos_igreja?.data
    if (ini && d && d < ini) return false
    if (fim && d && d > fim) return false
    return true
  })
  renderStats(relatorioCache); renderRelatorio(relatorioCache)
}

function renderStats(lista) {
  const total = lista.length
  const conf  = lista.filter(r => r.status === 'confirmado').length
  const rec   = lista.filter(r => r.status === 'recusado').length
  const pend  = lista.filter(r => r.status === 'pendente').length
  const taxa  = total ? Math.round((conf / total) * 100) : 0
  document.getElementById('stats-row').innerHTML = `
    <div class="stat-box"><div class="stat-num">${total}</div><div class="stat-label">Total escalados</div></div>
    <div class="stat-box verde"><div class="stat-num">${conf}</div><div class="stat-label">Confirmados</div></div>
    <div class="stat-box vermelho"><div class="stat-num">${rec}</div><div class="stat-label">Recusados</div></div>
    <div class="stat-box amarelo"><div class="stat-num">${pend}</div><div class="stat-label">Pendentes</div></div>
    <div class="stat-box"><div class="stat-num">${taxa}%</div><div class="stat-label">Taxa de confirmação</div></div>`
}

function renderRelatorio(lista) {
  const tbody = document.getElementById('tbody-relatorio')
  tbody.innerHTML = ''
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Nenhum registro encontrado.</td></tr>`
    return
  }
  lista.forEach(r => {
    const dataEv = r.eventos_igreja?.data
      ? new Date(r.eventos_igreja.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
    const resp   = r.respondido_em
      ? new Date(r.respondido_em).toLocaleDateString('pt-BR') : '—'
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${r.eventos_igreja?.nome || '—'}</td><td>${dataEv}</td>
      <td>${r.voluntarios?.nome || '—'}</td>
      <td><span class="pill pill-${r.status}">
        ${r.status === 'confirmado' ? '✅ Confirmado'
          : r.status === 'recusado' ? '❌ Recusado' : '⏳ Pendente'}
      </span></td>
      <td>${resp}</td>`
    tbody.appendChild(tr)
  })
}

function exportarCSV() {
  if (!relatorioCache.length) { alert('Nenhum dado para exportar.'); return }
  const linhas = [
    ['Evento','Data','Voluntário','Status','Respondido em'],
    ...relatorioCache.map(r => [
      r.eventos_igreja?.nome || '',
      r.eventos_igreja?.data
        ? new Date(r.eventos_igreja.data + 'T00:00:00').toLocaleDateString('pt-BR') : '',
      r.voluntarios?.nome || '', r.status,
      r.respondido_em ? new Date(r.respondido_em).toLocaleDateString('pt-BR') : ''
    ])
  ]
  const csv  = linhas.map(l => l.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `levinho-escala-${Date.now()}.csv`; a.click()
  URL.revokeObjectURL(url)
}

function exportarPDF() {
  if (!relatorioCache.length) { alert('Nenhum dado para exportar.'); return }
  const { jsPDF } = window.jspdf
  const doc       = new jsPDF()
  doc.setFontSize(16)
  doc.text('Relatório de Escala — Ministério Levinho', 14, 20)
  doc.setFontSize(10)
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 28)
  doc.autoTable({
    startY: 34,
    head: [['Evento','Data','Voluntário','Status','Respondido em']],
    body: relatorioCache.map(r => [
      r.eventos_igreja?.nome || '—',
      r.eventos_igreja?.data
        ? new Date(r.eventos_igreja.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—',
      r.voluntarios?.nome || '—', r.status,
      r.respondido_em ? new Date(r.respondido_em).toLocaleDateString('pt-BR') : '—'
    ]),
    headStyles: { fillColor: [251, 146, 60] },
    alternateRowStyles: { fillColor: [255, 247, 237] },
    styles: { fontSize: 10 }
  })
  doc.save(`levinho-escala-${Date.now()}.pdf`)
}

function ativarAbaPorURL() {
  const params = new URLSearchParams(window.location.search)
  const aba = params.get('aba')
  if (aba && typeof trocarAba === 'function') {
    const btn = document.querySelector('[data-aba="' + aba + '"]')
    if (btn) trocarAba(aba, btn)
  }
}

// ativarAbaPorURL é chamado no init principal após carregamento completo