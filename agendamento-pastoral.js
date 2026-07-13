// ================================================================
//  agendamento-pastoral.js — Página pública de agendamento
//  Sua Igreja
// ================================================================
const _db = db

// ── Estado da sessão ───────────────────────────────────────────
let conselheiros     = []
let disponibilidades = []
let agendamentosOcupados = []

let conselheiroSel   = null  // { id, nome, descricao, foto_url }
let dispSel          = null  // objeto da pastoral_disponibilidade
let slotSel          = null  // '09:00'

// ================================================================
//  INIT
// ================================================================
document.addEventListener('DOMContentLoaded', async () => {
  await carregarConselheiros()
})

// ================================================================
//  HELPERS
// ================================================================
function mostrarTela(id) {
  ['tela-1','tela-2','tela-3','tela-sucesso'].forEach(t => {
    document.getElementById(t).style.display = t === id ? 'block' : 'none'
  })
}

function atualizarSteps(passo) {
  for (let i = 1; i <= 3; i++) {
    const el   = document.getElementById(`step-${i}`)
    const line = document.getElementById(`line-${i}`)
    el.className = 'step'
    if (i < passo)  { el.classList.add('done') }
    if (i === passo){ el.classList.add('active') }
    if (line) {
      line.className = 'step-line'
      if (i < passo) line.classList.add('done')
    }
  }
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
    cur += Number(intervalo)
  }
  return slots
}

function formatarData(dataStr) {
  return new Date(dataStr + 'T00:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  })
}

function formatarDataCurta(dataStr) {
  return new Date(dataStr + 'T00:00:00').toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short'
  })
}

// ================================================================
//  PASSO 1 — CONSELHEIROS
// ================================================================
async function carregarConselheiros() {
  const grid = document.getElementById('conselheiros-grid')
  grid.innerHTML = '<div class="loading">Carregando conselheiros...</div>'

  // ✅ CORREÇÃO: select explícito das colunas em vez de '*'
  // Evita conflito com a FK membro_id → membros que não tem coluna "ativo"
  const { data, error } = await _db
    .from('conselheiros')
    .select('id, nome, descricao, foto_url, ativo, membro_id')
    .eq('ativo', true)
    .order('nome')

  if (error || !data?.length) {
    grid.innerHTML = '<div class="empty">Nenhum conselheiro disponível no momento.</div>'
    return
  }

  conselheiros = data
  grid.innerHTML = ''

  data.forEach(c => {
    const inicial = (c.nome || '?')[0].toUpperCase()
    const item = document.createElement('div')
    item.className = 'conselheiro-item'
    item.dataset.id = c.id
    item.innerHTML = `
      <div class="cons-avatar">
        ${c.foto_url ? `<img src="${c.foto_url}" alt="${c.nome}" />` : inicial}
      </div>
      <div class="cons-nome">${c.nome}</div>
      ${c.descricao ? `<div class="cons-desc">${c.descricao}</div>` : ''}
    `
    item.addEventListener('click', () => selecionarConselheiro(c, item))
    grid.appendChild(item)
  })
}

function selecionarConselheiro(c, el) {
  document.querySelectorAll('.conselheiro-item').forEach(i => i.classList.remove('selecionado'))
  el.classList.add('selecionado')
  conselheiroSel = c
  document.getElementById('btn-prox-1').disabled = false
}

function irParaPasso1() {
  conselheiroSel = null
  dispSel        = null
  slotSel        = null
  document.querySelectorAll('.conselheiro-item').forEach(i => i.classList.remove('selecionado'))
  document.getElementById('btn-prox-1').disabled = true
  mostrarTela('tela-1')
  atualizarSteps(1)
}

async function irParaPasso2() {
  if (!conselheiroSel) return
  mostrarTela('tela-2')
  atualizarSteps(2)
  document.getElementById('nome-conselheiro-selecionado').textContent = conselheiroSel.nome
  document.getElementById('btn-prox-2').disabled = true
  document.getElementById('slots-section').style.display = 'none'
  dispSel  = null
  slotSel  = null
  await carregarDatasDisponiveis()
}

// ================================================================
//  PASSO 2 — DATAS E SLOTS
// ================================================================
async function carregarDatasDisponiveis() {
  const grid = document.getElementById('datas-grid')
  grid.innerHTML = '<div class="loading">Carregando datas...</div>'

  const hoje = new Date().toISOString().split('T')[0]

  const { data, error } = await _db
    .from('pastoral_disponibilidade')
    .select('*')
    .eq('conselheiro_id', conselheiroSel.id)
    .gte('data', hoje)
    .order('data')

  if (error || !data?.length) {
    grid.innerHTML = '<div class="empty">Nenhuma data disponível para este conselheiro.</div>'
    disponibilidades = []
    return
  }

  disponibilidades = data
  grid.innerHTML = ''

  data.forEach(d => {
    const pill = document.createElement('div')
    pill.className = 'data-pill'
    pill.dataset.id = d.id
    pill.innerHTML = formatarDataCurta(d.data)
    pill.addEventListener('click', () => selecionarData(d, pill))
    grid.appendChild(pill)
  })
}

async function selecionarData(disp, el) {
  document.querySelectorAll('.data-pill').forEach(p => p.classList.remove('selecionado'))
  el.classList.add('selecionado')
  dispSel = disp
  slotSel = null
  document.getElementById('btn-prox-2').disabled = true
  document.getElementById('data-selecionada-label').textContent = formatarDataCurta(disp.data)
  document.getElementById('slots-section').style.display = 'block'

  await carregarSlots(disp)
}

async function carregarSlots(disp) {
  const grid = document.getElementById('slots-grid')
  grid.innerHTML = '<div class="loading">Carregando horários...</div>'

  // Busca agendamentos já feitos nesta disponibilidade (não cancelados)
  const { data: agends } = await _db
    .from('pastoral_agendamentos')
    .select('slot_hora')
    .eq('disponibilidade_id', disp.id)
    .neq('status', 'cancelado')

  const ocupados = new Set((agends || []).map(a => a.slot_hora.slice(0, 5)))

  const slots = gerarSlots(disp.hora_inicio, disp.hora_fim, disp.intervalo_min)

  if (!slots.length) {
    grid.innerHTML = '<div class="empty">Nenhum horário disponível.</div>'
    return
  }

  grid.innerHTML = ''
  slots.forEach(s => {
    const ocupado = ocupados.has(s)
    const btn = document.createElement('button')
    btn.className  = `slot-btn${ocupado ? ' ocupado' : ''}`
    btn.textContent = s
    btn.disabled   = ocupado

    if (!ocupado) {
      btn.addEventListener('click', () => selecionarSlot(s, btn))
    }
    grid.appendChild(btn)
  })
}

function selecionarSlot(hora, el) {
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selecionado'))
  el.classList.add('selecionado')
  slotSel = hora
  document.getElementById('btn-prox-2').disabled = false
}

function irParaPasso3() {
  if (!dispSel || !slotSel) return
  mostrarTela('tela-3')
  atualizarSteps(3)

  document.getElementById('resumo-conselheiro').textContent = conselheiroSel.nome
  document.getElementById('resumo-data').textContent        = formatarData(dispSel.data)
  document.getElementById('resumo-hora').textContent        = slotSel

  document.getElementById('inp-nome').value     = ''
  document.getElementById('inp-telefone').value = ''
  document.getElementById('inp-motivo').value   = ''
}

// ================================================================
//  PASSO 3 — CONFIRMAR AGENDAMENTO
// ================================================================
async function confirmarAgendamento() {
  const nome     = document.getElementById('inp-nome').value.trim()
  const telefone = document.getElementById('inp-telefone').value.trim()
  const motivo   = document.getElementById('inp-motivo').value.trim()

  if (!nome)     { alert('Informe seu nome.'); return }
  if (!telefone) { alert('Informe seu telefone.'); return }

  const btn = document.getElementById('btn-confirmar')
  btn.disabled    = true
  btn.textContent = 'Aguarde...'

  // Verifica novamente se o slot ainda está livre (evita duplo agendamento)
  const { data: check } = await _db
    .from('pastoral_agendamentos')
    .select('id')
    .eq('disponibilidade_id', dispSel.id)
    .eq('slot_hora', slotSel + ':00')
    .neq('status', 'cancelado')
    .maybeSingle()

  if (check) {
    alert('Este horário acabou de ser reservado por outra pessoa. Por favor, escolha outro.')
    btn.disabled    = false
    btn.textContent = '✅ Confirmar agendamento'
    irParaPasso2()
    return
  }

  const { data: inserted, error } = await _db.from('pastoral_agendamentos').insert([{
    disponibilidade_id: dispSel.id,
    conselheiro_id:     conselheiroSel.id,
    slot_hora:          slotSel + ':00',
    nome_fiel:          nome,
    telefone_fiel:      telefone,
    motivo:             motivo || null,
    status:             'pendente',
  }]).select('id').maybeSingle()

  btn.disabled    = false
  btn.textContent = '✅ Confirmar agendamento'

  if (error) {
    // Erro de unique constraint = slot foi reservado ao mesmo tempo
    if (error.code === '23505') {
      alert('Este horário foi reservado agora mesmo por outra pessoa. Escolha outro horário.')
      irParaPasso2()
    } else {
      alert('Erro ao realizar agendamento. Tente novamente.')
      console.error(error)
    }
    return
  }

  // Notifica o conselheiro por email (fire-and-forget — falha nao bloqueia o fluxo)
  if (inserted?.id) {
    _db.functions.invoke('notify-pastoral-agendamento', {
      body: { agendamento_id: inserted.id }
    }).catch(err => console.warn('notify-pastoral falhou:', err))
  }

  // Sucesso
  document.getElementById('sucesso-resumo').textContent =
    `${conselheiroSel.nome} · ${formatarDataCurta(dispSel.data)} às ${slotSel}`

  mostrarTela('tela-sucesso')
  document.getElementById('steps').style.visibility = 'hidden'
  document.getElementById('steps').style.opacity = '0'
}

// ================================================================
//  REINICIAR
// ================================================================
function reiniciar() {
  conselheiroSel = null
  dispSel        = null
  slotSel        = null
  const steps = document.getElementById('steps')
  steps.style.visibility = ''
  steps.style.opacity    = ''
  mostrarTela('tela-1')
  atualizarSteps(1)
  document.querySelectorAll('.conselheiro-item').forEach(i => i.classList.remove('selecionado'))
  document.getElementById('btn-prox-1').disabled = true
}
