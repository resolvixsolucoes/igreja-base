// ================================================================
//  escala-geral.js — Escalar voluntários em eventos gerais
// ================================================================

// Helpers WhatsApp (compartilhados pelas páginas de ministérios)
window.telParaWhatsApp = window.telParaWhatsApp || function(tel){
  const d = String(tel || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('55')) return d
  if (d.length === 10 || d.length === 11) return '55' + d
  return d
}
window.linkWhatsApp = window.linkWhatsApp || function(tel, msgEncoded){
  const num = window.telParaWhatsApp(tel)
  const base = num ? ('https://wa.me/' + num) : 'https://wa.me/'
  return msgEncoded ? (base + '?text=' + msgEncoded) : base
}
// Renderiza um telefone como link clicável que abre conversa no WhatsApp
window.spanTelWhatsApp = window.spanTelWhatsApp || function(tel){
  const t = String(tel || '').trim()
  if (!t) return '<span class="escala-item-tel"></span>'
  const safe = t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const href = window.linkWhatsApp(t, '')
  return '<a class="escala-item-tel" href="' + href + '" target="_blank" rel="noopener" ' +
         'style="text-decoration:none;color:inherit;cursor:pointer;" title="Abrir conversa no WhatsApp">' +
         safe + '</a>'
}

// ─── Check-in de voluntário (compartilhado por agenda + ministérios) ─
window.renderCheckinEscalaBadge = window.renderCheckinEscalaBadge || function(escalaId, checkinEm) {
  if (checkinEm) {
    const hora = new Date(checkinEm).toLocaleTimeString('pt-BR',
      { hour: '2-digit', minute: '2-digit' })
    return '<button class="esc-checkin esc-checkin-feito" ' +
           'data-escala-id="' + escalaId + '" ' +
           'onclick="desmarcarCheckinEscala(\'' + escalaId + '\', this)" ' +
           'title="Desmarcar check-in" ' +
           'style="padding:3px 9px;font-size:11px;background:#D1FAE5;' +
           'color:#065F46;border:1px solid #6EE7B7;border-radius:8px;cursor:pointer;' +
           'font-weight:700;white-space:nowrap;">✓ ' + hora + '</button>'
  }
  return '<button class="esc-checkin" ' +
         'data-escala-id="' + escalaId + '" ' +
         'onclick="marcarCheckinEscala(\'' + escalaId + '\', this)" ' +
         'title="Marcar presença" ' +
         'style="padding:3px 9px;font-size:11px;background:#fff;' +
         'color:#1a9e93;border:1px solid #2BBFB3;border-radius:8px;cursor:pointer;' +
         'font-weight:600;white-space:nowrap;">Check-in</button>'
}

window.marcarCheckinEscala = window.marcarCheckinEscala || async function(escalaId, btn) {
  if (!escalaId) return
  if (btn) { btn.disabled = true; btn.textContent = '⏳' }
  const { data, error } = await _db.rpc('escala_voluntario_checkin',
    { p_escala_id: escalaId, p_token: null })
  if (error) {
    alert('Erro ao marcar check-in: ' + (error.message || error))
    if (btn) { btn.disabled = false; btn.textContent = 'Check-in' }
    return
  }
  const reg = Array.isArray(data) ? data[0] : data
  if (btn && reg?.checkin_em) {
    btn.outerHTML = window.renderCheckinEscalaBadge(escalaId, reg.checkin_em)
  }
}

window.desmarcarCheckinEscala = window.desmarcarCheckinEscala || async function(escalaId, btn) {
  if (!escalaId) return
  if (!confirm('Desmarcar check-in deste voluntário?')) return
  if (btn) { btn.disabled = true; btn.textContent = '⏳' }
  const { error } = await _db.rpc('escala_voluntario_checkin_desmarcar',
    { p_escala_id: escalaId })
  if (error) {
    alert('Erro ao desmarcar: ' + (error.message || error))
    if (btn) btn.disabled = false
    return
  }
  if (btn) btn.outerHTML = window.renderCheckinEscalaBadge(escalaId, null)
}

// Helper: data de hoje no formato YYYY-MM-DD (timezone local).
window.hojeStrLocal = window.hojeStrLocal || function() {
  const d = new Date()
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

// Renderiza o botão de check-in apenas quando faz sentido:
// usuário pode marcar (líder ou o próprio voluntário) E é o dia do evento.
window.renderCheckinEscalaBadgeIfHoje = window.renderCheckinEscalaBadgeIfHoje || function(e, ev, pode, ehMeu) {
  if (!e || !ev || !e.id) return ''
  if (!(pode || ehMeu)) return ''
  if (ev.data !== window.hojeStrLocal()) return ''
  return window.renderCheckinEscalaBadge(e.id, e.checkin_em || null)
}


let _evGeralAtual   = null
let _escalaAtualMap = {}   // voluntario_id → registro da escala

async function abrirModalEscalaGeral(evId, evNome, evData) {
  _evGeralAtual   = { id: evId, nome: evNome, data: evData }
  _escalaAtualMap = {}

  document.getElementById('escala-geral-evento-nome').textContent = evNome
  document.getElementById('escala-geral-evento-data').textContent = evData
    ? new Date(evData + 'T00:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
      })
    : ''

  // Esconde seção de links
  const linksWrap = document.getElementById('escala-geral-links-wrap')
  if (linksWrap) linksWrap.style.display = 'none'

  if (typeof volsCache !== 'undefined' && !volsCache.length) {
    await carregarVoluntarios()
  }

  // Busca escala atual do evento
  const { data: jaEscalados } = await _db
    .from('ministerio_escala')
    .select('id, voluntario_id, status, token, sala_id')
    .eq('evento_id', evId)

  ;(jaEscalados || []).forEach(e => { _escalaAtualMap[e.voluntario_id] = e })

  const wrap = document.getElementById('check-vols-geral')
  wrap.innerHTML = ''

  // Salas do Levinho (só aparece dropdown se a página exposer salasCache)
  const temSalas = Array.isArray(window.salasCache) && window.salasCache.length > 0
  const salas = temSalas ? window.salasCache : []

  const vols = typeof volsCache !== 'undefined' ? volsCache : []
  vols.filter(v => v.status === 'Ativo').forEach(v => {
    const jaEsc = _escalaAtualMap[v.id]
    const statusBadge = jaEsc
      ? (jaEsc.status === 'confirmado'
          ? ' <span style="color:#16a34a;font-size:11px;font-weight:700;">✅ Confirmado</span>'
          : jaEsc.status === 'recusado'
            ? ' <span style="color:#dc2626;font-size:11px;font-weight:700;">❌ Recusado</span>'
            : ' <span style="color:#f59e0b;font-size:11px;font-weight:700;">⏳ Pendente</span>')
      : ''

    let salaDropdown = ''
    if (temSalas) {
      const opcoes = salas.map(s => {
        const sel = jaEsc && jaEsc.sala_id === s.id ? ' selected' : ''
        return `<option value="${s.id}"${sel}>${s.nome}</option>`
      }).join('')
      salaDropdown =
        '<select class="sel-sala-vol" data-vol-id="' + v.id + '"' +
        (jaEsc ? ' disabled' : '') +
        ' style="margin-left:8px;padding:3px 6px;border:1px solid #c0e8e6;border-radius:6px;font-size:12px;background:#f0fffe;color:#1a9e93;">' +
        '<option value="">— sala —</option>' + opcoes + '</select>'
    }

    const item = document.createElement('div')
    item.className = 'vol-ev-item'
    item.style.cssText = 'border-bottom:1px solid #f5f5f5;'

    const lbl = document.createElement('label')
    lbl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer;flex-wrap:wrap;margin:0;'
    lbl.innerHTML =
      '<input type="checkbox" class="chk-vol-geral" value="' + v.id + '"' +
      ' data-nome="' + v.nome.replace(/"/g, '') + '"' +
      (jaEsc ? ' checked disabled' : '') +
      ' style="accent-color:#2BBFB3;flex-shrink:0;" />' +
      '<span style="flex:1;font-size:14px;color:#333;">' + v.nome +
      (v.telefone ? ' <span style="color:#aaa;font-size:12px;">· ' + v.telefone + '</span>' : '') +
      statusBadge + '</span>' + salaDropdown
    item.appendChild(lbl)

    const habs = window.HABILIDADES_MUSICA
    if (habs && habs.length && !jaEsc) {
      const vHabs = v.habilidades || []
      const funcoesEl = document.createElement('div')
      funcoesEl.className = 'vol-ev-funcoes'
      funcoesEl.style.cssText = 'padding:8px 14px 10px;background:#fafafa;'
      funcoesEl.innerHTML =
        '<p style="font-size:12px;font-weight:600;color:#555;margin:0 0 8px;">🎵 Vai executar neste evento:</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
        habs.map(function(h) {
          var chk = vHabs.includes(h.id)
          return '<label style="display:flex;align-items:center;gap:5px;padding:4px 10px;margin:0;' +
            'border:1px solid ' + h.cor + '40;border-radius:20px;cursor:pointer;' +
            'background:' + (chk ? h.cor + '18' : '#fff') + ';font-size:12px;font-weight:600;color:' + h.cor + ';">' +
            '<input type="checkbox" class="chk-funcao-vol-geral" value="' + h.id + '"' + (chk ? ' checked' : '') +
            ' style="accent-color:' + h.cor + ';">' +
            h.label + '</label>'
        }).join('') +
        '</div>'
      item.appendChild(funcoesEl)
    }

    wrap.appendChild(item)
  })

  document.getElementById('btn-salvar-escala-geral').disabled    = false
  document.getElementById('btn-salvar-escala-geral').textContent = '💾 Salvar Escala'

  // Mostra links dos já escalados
  _mostrarLinksEscalados(jaEscalados || [], vols)

  document.getElementById('modal-escala-geral').classList.add('active')
}

function _mostrarLinksEscalados(escala, vols) {
  const linksWrap  = document.getElementById('escala-geral-links-wrap')
  const linksLista = document.getElementById('escala-geral-links-lista')
  const pendentes = escala.filter(e => e.token && e.status === 'pendente')
  if (!linksWrap || !linksLista || !pendentes.length) {
    if (linksWrap) linksWrap.style.display = 'none'
    return
  }

  const base       = location.origin + location.pathname + '?token='
  const checkinUrl = esc => location.origin + '/checkin-voluntario.html?token=' + esc.token
  linksLista.innerHTML = ''

  escala.forEach(esc => {
    if (!esc.token) return
    // Mostra links apenas para pendentes (confirmados e recusados não precisam)
    if (esc.status !== 'pendente') return
    const vol     = vols.find(v => v.id === esc.voluntario_id)
    const nome    = vol ? vol.nome : 'Voluntário'
    const tel     = vol?.telefone || ''
    const url     = base + esc.token
    const urlChk  = checkinUrl(esc)
    const dataFmt = _evGeralAtual.data
      ? new Date(_evGeralAtual.data + 'T00:00:00').toLocaleDateString('pt-BR')
      : ''
    const statusIcon = esc.status === 'confirmado' ? '✅'
                     : esc.status === 'recusado'   ? '❌' : '⏳'

    const whatsMsg = encodeURIComponent(
      'Olá ' + nome + '! Você foi escalado(a) para servir em *' +
      _evGeralAtual.nome + '* no dia *' + dataFmt +
      '*.\n\nConfirme sua presença clicando no link:\n' + url +
      '\n\nNo dia, faça check-in por aqui:\n' + urlChk
    )

    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid #f5f5f5;flex-wrap:wrap;'
    row.innerHTML =
      '<div style="flex:1;min-width:140px;">' +
        '<strong style="font-size:13px;">' + statusIcon + ' ' + nome + '</strong>' +
        (tel ? '<a href="' + window.linkWhatsApp(tel, '') + '" target="_blank" rel="noopener" style="font-size:12px;color:#aaa;margin-left:6px;text-decoration:none;" title="Abrir conversa no WhatsApp">· ' + tel + '</a>' : '') +
        '<div style="font-size:10px;color:#bbb;word-break:break-all;margin-top:2px;">' + url + '</div>' +
      '</div>' +
      '<button onclick="copiarTextoGeral(\'' + url.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\', this)" ' +
        'style="padding:5px 10px;font-size:11px;background:#f0fffe;border:1px solid #2BBFB3;' +
        'color:#2BBFB3;border-radius:6px;cursor:pointer;white-space:nowrap;font-weight:600;">' +
        '📋 Link</button>' +
      '<a href="' + window.linkWhatsApp(tel, whatsMsg) + '" target="_blank" ' +
        'style="padding:5px 10px;font-size:11px;background:#25D366;color:white;' +
        'border-radius:6px;text-decoration:none;white-space:nowrap;font-weight:600;">' +
        '📱 WhatsApp</a>'
    linksLista.appendChild(row)
  })

  linksWrap.style.display = 'block'
}

function fecharModalEscalaGeral() {
  document.getElementById('modal-escala-geral').classList.remove('active')
  _evGeralAtual   = null
  _escalaAtualMap = {}
}

function toggleTodosGeral() {
  const checks = [...document.querySelectorAll('.chk-vol-geral:not(:disabled)')]
  const todos  = checks.every(c => c.checked)
  checks.forEach(c => c.checked = !todos)
}

async function salvarEscalaGeral() {
  if (!_evGeralAtual) return

  const btn = document.getElementById('btn-salvar-escala-geral')
  btn.disabled = true
  btn.textContent = 'Salvando...'

  const selecionados = [...document.querySelectorAll('.chk-vol-geral:checked:not(:disabled)')]
    .map(c => {
      const sel = document.querySelector(`.sel-sala-vol[data-vol-id="${c.value}"]`)
      const salaVal = sel ? sel.value : ''
      const fInputs = document.querySelectorAll(
        `.vol-ev-item:has(.chk-vol-geral[value="${c.value}"]) .chk-funcao-vol-geral:checked`
      )
      return {
        id: c.value, nome: c.dataset.nome,
        sala_id: salaVal ? parseInt(salaVal, 10) : null,
        funcoes: [...fInputs].map(f => f.value)
      }
    })

  if (!selecionados.length) {
    alert('Selecione ao menos um voluntário.')
    btn.disabled = false
    btn.textContent = '💾 Salvar Escala'
    return
  }

  const { data: inseridos, error } = await _db
    .from('ministerio_escala')
    .insert(selecionados.map(v => ({
      evento_id:     _evGeralAtual.id,
      voluntario_id: v.id,
      status:        'pendente',
      sala_id:       v.sala_id,
      funcoes:       v.funcoes
    })))
    .select()

  if (error) {
    alert('Erro ao salvar escala: ' + error.message)
    console.error(error)
    btn.disabled = false
    btn.textContent = '💾 Salvar Escala'
    return
  }

  btn.textContent = '✅ Salvo!'

  // Atualiza o mapa e mostra todos os links (antigos + novos)
  ;(inseridos || []).forEach(e => { _escalaAtualMap[e.voluntario_id] = e })
  const todosEscalados = Object.values(_escalaAtualMap)
  const vols = typeof volsCache !== 'undefined' ? volsCache : []
  _mostrarLinksEscalados(todosEscalados, vols)

  // Atualiza o painel
  await carregarEventos()
  renderCalendario()
  if (typeof diaSelecionado !== 'undefined' && diaSelecionado) {
    const ds = diaSelecionado.ano + '-' +
      String(diaSelecionado.mes + 1).padStart(2, '0') + '-' +
      String(diaSelecionado.dia).padStart(2, '0')
    await renderEventosDia(eventosCache.filter(e => e.data === ds))
    if (typeof renderDisponibilidadesDia === 'function') renderDisponibilidadesDia(ds)
  }
}

function copiarTextoGeral(texto, btn) {
  navigator.clipboard.writeText(texto).then(() => {
    const orig = btn.textContent
    btn.textContent = '✅'
    setTimeout(() => btn.textContent = orig, 2000)
  })
}