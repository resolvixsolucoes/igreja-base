// ================================================================
//  levinho-checkin.js — página pública de check-in das crianças
//  Sem auth.js. Usa apenas RPCs SECURITY DEFINER (anon-callable).
// ================================================================

const _db = db

let escolha = null     // { filho_id?, crianca_nome, idade, responsavel_sugerido? }
let eventoSel = null   // { evento_id, nome, data, hora? }
let buscaTimer = null

document.addEventListener('DOMContentLoaded', async () => {
  const inp = document.getElementById('inp-busca')
  inp.addEventListener('input', () => {
    clearTimeout(buscaTimer)
    buscaTimer = setTimeout(buscar, 220)
  })
  await carregarEventos()
})

// ───────── Etapa 0: detecta evento do dia automaticamente ─────────
async function carregarEventos() {
  const wrap = document.getElementById('eventos-lista')
  const hoje = new Date().toISOString().slice(0, 10)

  const { data, error } = await _db.rpc('levinho_eventos_disponiveis')
  if (error) {
    console.error(error)
    // Mesmo com erro, deixa o pai seguir (sem vínculo)
    eventoSel = null
    irParaBusca()
    return
  }

  // Filtra só os de hoje
  const doDia = (data || []).filter(ev => ev.data === hoje)

  if (doDia.length === 0) {
    // Sem evento hoje — segue sem vincular
    eventoSel = null
    irParaBusca()
    return
  }
  if (doDia.length === 1) {
    escolherEvento(doDia[0])
    return
  }

  // 2+ eventos hoje: pai escolhe
  document.getElementById('etapa-evento').style.display = 'block'
  document.getElementById('etapa-busca').style.display  = 'none'
  wrap.innerHTML = ''
  doDia.forEach(ev => {
    const div = document.createElement('div')
    div.className = 'res-item'
    div.onclick = () => escolherEvento(ev)
    const horaTxt = ev.hora ? ev.hora.slice(0,5) : ''
    div.innerHTML = `
      <div>
        <div class="res-nome">📅 ${escapeHtml(ev.nome)}</div>
        <div class="res-meta">${horaTxt ? `🕐 ${horaTxt}` : 'Hoje'}</div>
      </div>
      <div style="color:#6b8e4e;font-size:18px;">→</div>`
    wrap.appendChild(div)
  })
}

function escolherEvento(ev) {
  eventoSel = ev
  irParaBusca()
}

function irParaBusca() {
  document.getElementById('etapa-evento').style.display = 'none'
  document.getElementById('etapa-busca').style.display  = 'block'
  const resumo = document.getElementById('evento-resumo')
  if (eventoSel) {
    const dataFmt = new Date(eventoSel.data + 'T00:00:00').toLocaleDateString('pt-BR',
      { weekday: 'long', day: '2-digit', month: 'long' })
    resumo.textContent = `📅 ${eventoSel.nome} · ${dataFmt}`
  } else {
    resumo.textContent = ''
  }
  document.getElementById('inp-busca').focus()
}

// ───────── Busca por nome ─────────
async function buscar() {
  const termo = document.getElementById('inp-busca').value.trim()
  const wrap  = document.getElementById('resultados-wrap')
  if (termo.length < 2) { wrap.innerHTML = ''; return }

  wrap.innerHTML = '<div class="loading">⏳ Buscando...</div>'
  const { data, error } = await _db.rpc('levinho_checkin_buscar_filhos', { p_termo: termo })
  if (error) {
    console.error(error)
    wrap.innerHTML = '<div class="empty-busca">Erro ao buscar. Tente novamente.</div>'
    return
  }
  if (!data || !data.length) {
    wrap.innerHTML = '<div class="empty-busca">Nenhuma criança encontrada com este nome.</div>'
    return
  }
  wrap.innerHTML = ''
  data.forEach(r => {
    const div = document.createElement('div')
    div.className = 'res-item'
    div.onclick = () => escolherFilho(r)
    const idadeTxt = r.idade === 0 ? 'Menos de 1 ano' : `${r.idade} ano${r.idade !== 1 ? 's' : ''}`
    const respMeta = r.responsavel_nome ? ` · 👤 ${escapeHtml(r.responsavel_nome)}` : ''
    const tagVisit = r.origem === 'visitante' ? ' <span style="font-size:11px;color:#b8860b;background:#fff8e1;padding:2px 6px;border-radius:6px;margin-left:4px;">visitante</span>' : ''
    div.innerHTML = `
      <div>
        <div class="res-nome">🧒 ${escapeHtml(r.crianca_nome)}${tagVisit}</div>
        <div class="res-meta">${idadeTxt}${respMeta}</div>
      </div>
      <div style="color:#6b8e4e;font-size:18px;">→</div>`
    wrap.appendChild(div)
  })
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]))
}

// ───────── Escolha de filho cadastrado ─────────
function escolherFilho(r) {
  escolha = {
    filho_id:                  r.filho_id,
    crianca_nome:              r.crianca_nome,
    idade:                     r.idade,
    responsavel_sugerido:      r.responsavel_nome || '',
    responsavel_tel_sugerido:  r.responsavel_telefone || ''
  }
  irParaResponsavel()
}

// ───────── Visitante ─────────
function abrirVisitante() {
  document.getElementById('etapa-busca').style.display      = 'none'
  document.getElementById('etapa-visitante').style.display  = 'block'
  setTimeout(() => document.getElementById('vis-nome').focus(), 50)
}

function voltarBusca() {
  document.getElementById('etapa-visitante').style.display = 'none'
  document.getElementById('etapa-busca').style.display     = 'block'
  document.getElementById('inp-busca').focus()
}

function confirmarVisitante() {
  const nome  = document.getElementById('vis-nome').value.trim()
  const idade = parseInt(document.getElementById('vis-idade').value, 10)
  if (!nome)                  { alert('Informe o nome da criança.'); return }
  if (isNaN(idade) || idade < 0 || idade > 12) {
    alert('Informe uma idade entre 0 e 12.'); return
  }
  escolha = { filho_id: null, crianca_nome: nome, idade, responsavel_sugerido: '' }
  irParaResponsavel()
}

// ───────── Etapa 2: responsável ─────────
function irParaResponsavel() {
  document.getElementById('etapa-busca').style.display      = 'none'
  document.getElementById('etapa-visitante').style.display  = 'none'
  document.getElementById('etapa-responsavel').style.display = 'block'

  const idadeTxt = escolha.idade === 0 ? 'Menos de 1 ano' : `${escolha.idade} ano${escolha.idade !== 1 ? 's' : ''}`
  const tipoTxt  = escolha.filho_id ? 'cadastrada' : 'visitante'
  document.getElementById('escolhido-resumo').innerHTML = `
    <div>
      <div class="who">🧒 ${escapeHtml(escolha.crianca_nome)}</div>
      <div class="meta">${idadeTxt} · ${tipoTxt}</div>
    </div>
    <button class="trocar" onclick="trocarCrianca()">trocar</button>`

  if (escolha.responsavel_sugerido) {
    document.getElementById('resp-nome').value = escolha.responsavel_sugerido
  }
  if (escolha.responsavel_tel_sugerido) {
    document.getElementById('resp-tel').value = escolha.responsavel_tel_sugerido
  }
  setTimeout(() => {
    const temNome = !!escolha.responsavel_sugerido
    const temTel  = !!escolha.responsavel_tel_sugerido
    const el = (temNome && !temTel)
      ? document.getElementById('resp-tel')
      : (temNome && temTel)
        ? document.getElementById('btn-finalizar')
        : document.getElementById('resp-nome')
    el.focus()
  }, 50)
}

function trocarCrianca() {
  document.getElementById('etapa-responsavel').style.display = 'none'
  document.getElementById('resp-nome').value = ''
  document.getElementById('resp-tel').value  = ''
  escolha = null
  if (document.getElementById('vis-nome').value || document.getElementById('vis-idade').value) {
    abrirVisitante()
  } else {
    voltarBusca()
  }
}

async function finalizarCheckin() {
  const nome = document.getElementById('resp-nome').value.trim()
  const tel  = document.getElementById('resp-tel').value.trim()
  const erro = document.getElementById('erro-checkin')
  erro.classList.remove('show')

  if (!nome) { erro.textContent = 'Informe o seu nome.'; erro.classList.add('show'); return }
  if (tel.replace(/\D/g, '').length < 8) {
    erro.textContent = 'Informe um telefone válido.'; erro.classList.add('show'); return
  }

  const btn = document.getElementById('btn-finalizar')
  btn.disabled = true
  btn.textContent = '⏳ Registrando...'

  const { data, error } = await _db.rpc('levinho_checkin_registrar', {
    p_filho_id:         escolha.filho_id,
    p_crianca_nome:     escolha.crianca_nome,
    p_idade:            escolha.idade,
    p_responsavel_nome: nome,
    p_telefone:         tel,
    p_evento_id:        eventoSel?.evento_id || null
  })

  btn.disabled = false
  btn.textContent = '✅ Confirmar check-in'

  if (error) {
    console.error(error)
    erro.textContent = error.message || 'Erro ao registrar check-in.'
    erro.classList.add('show')
    return
  }
  const r = Array.isArray(data) ? data[0] : data
  if (!r) {
    erro.textContent = 'Resposta inesperada do servidor.'
    erro.classList.add('show')
    return
  }
  mostrarSucesso(r)
}

// ───────── Etapa 3: sucesso ─────────
function mostrarSucesso(r) {
  document.getElementById('etapa-responsavel').style.display = 'none'
  document.getElementById('etapa-sucesso').style.display     = 'block'
  document.getElementById('suc-nome').textContent   = `✨ ${r.crianca_nome} fez check-in!`
  document.getElementById('suc-sala').textContent   = `🏷️ Sala ${r.sala_nome}`
  document.getElementById('suc-codigo').textContent = r.codigo

  const resp = document.getElementById('resp-nome')?.value?.trim() || ''
  document.getElementById('etiq-nome').textContent          = r.crianca_nome
  document.getElementById('etiq-sala').textContent          = `Sala ${r.sala_nome}`
  document.getElementById('etiq-codigo').textContent        = r.codigo
  document.getElementById('etiq-resp').textContent          = resp ? `Resp: ${resp}` : ''
  document.getElementById('etiq-canhoto-nome').textContent  = r.crianca_nome
  document.getElementById('etiq-canhoto-codigo').textContent = r.codigo
}

function imprimirEtiqueta() {
  window.print()
}

function novoCheckin() {
  escolha = null
  document.getElementById('inp-busca').value      = ''
  document.getElementById('vis-nome').value       = ''
  document.getElementById('vis-idade').value      = ''
  document.getElementById('resp-nome').value      = ''
  document.getElementById('resp-tel').value       = ''
  document.getElementById('resultados-wrap').innerHTML = ''
  document.getElementById('etapa-sucesso').style.display    = 'none'
  // Mantém o evento selecionado (mesmo culto) — só pula a etapa de busca
  irParaBusca()
}

function voltarOuFechar() {
  if (window.opener) { window.close(); return }
  if (history.length > 1) { history.back() } else { window.close() }
}
