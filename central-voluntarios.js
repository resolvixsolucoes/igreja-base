// =============================================================
//  central-voluntarios.js — Central de Voluntários
//
//  Abas: Voluntários | Escalas/Programações | Materiais (placeholder)
//
//  Permissão: gate em `central_voluntarios._default` via auth.js.
// =============================================================

const _db = window.db

let _voluntariosAll = []
let _ministeriosMap = {}
let _eventosCache   = []
let _escalasCache   = []   // todas as escalas dos eventos visíveis
let _abaAtual       = 'voluntarios'

// ──────────────────────────────────────────────────────────────
// TROCA DE ABA
// ──────────────────────────────────────────────────────────────
window.trocarAba = function(nome, btn) {
  _abaAtual = nome
  document.querySelectorAll('.aba-btn').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.aba-content').forEach(c => c.classList.remove('active'))
  btn.classList.add('active')
  document.getElementById('aba-' + nome).classList.add('active')
  if (nome === 'escalas'   && !_eventosCache.length)  carregarEscalas()
  if (nome === 'materiais' && !_matEventosCache)      carregarEventosParaMateriais()
}

// ──────────────────────────────────────────────────────────────
// CARREGAMENTO INICIAL
// ──────────────────────────────────────────────────────────────
async function init() {
  // Espera AUTH popular permissões
  let tries = 0
  while (!window.AUTH?.user && tries < 30) {
    await new Promise(r => setTimeout(r, 100))
    tries++
  }

  await Promise.all([carregarMinisterios(), carregarVoluntarios()])
  popularSelectsMinisterio()
  renderVoluntarios()
}

async function carregarMinisterios() {
  const { data, error } = await _db.from('ministerios')
    .select('id, nome, icone').order('nome')
  if (error) { console.error('Erro ao buscar ministérios:', error); return }
  ;(data || []).forEach(m => { _ministeriosMap[m.id] = m })
}

async function carregarVoluntarios() {
  const { data, error } = await _db.from('voluntarios')
    .select('id, nome, telefone, status, ministerio_ids')
    .order('nome')
  if (error) { console.error('Erro ao buscar voluntários:', error); return }
  _voluntariosAll = data || []
}

function popularSelectsMinisterio() {
  const opts = Object.values(_ministeriosMap)
    .map(m => `<option value="${m.id}">${m.icone || ''} ${m.nome}</option>`)
    .join('')
  const sel1 = document.getElementById('filtro-min')
  const sel2 = document.getElementById('filtro-ev-min')
  if (sel1) sel1.insertAdjacentHTML('beforeend', opts)
  if (sel2) sel2.insertAdjacentHTML('beforeend', opts)
}

// ──────────────────────────────────────────────────────────────
// ABA VOLUNTÁRIOS
// ──────────────────────────────────────────────────────────────
window.renderVoluntarios = function() {
  const busca   = (document.getElementById('busca-vol').value || '').trim().toLowerCase()
  const filtMin = document.getElementById('filtro-min').value
  const filtSt  = document.getElementById('filtro-status').value

  const filtrados = _voluntariosAll.filter(v => {
    if (filtSt && v.status !== filtSt) return false
    if (filtMin) {
      const ids = Array.isArray(v.ministerio_ids) ? v.ministerio_ids : []
      if (!ids.includes(filtMin)) return false
    }
    if (busca) {
      const alvo = (v.nome + ' ' + (v.telefone || '')).toLowerCase()
      if (!alvo.includes(busca)) return false
    }
    return true
  })

  document.getElementById('contagem-vols').textContent =
    filtrados.length + ' voluntário(s)'

  const lista = document.getElementById('lista-voluntarios')
  if (!filtrados.length) {
    lista.innerHTML = '<div class="empty-state">Nenhum voluntário encontrado.</div>'
    return
  }

  lista.innerHTML = filtrados.map(v => {
    const ids   = Array.isArray(v.ministerio_ids) ? v.ministerio_ids : []
    const tags  = ids.map(id => {
      const m = _ministeriosMap[id]
      if (!m) return ''
      return `<span class="vol-card-min-tag">${m.icone || ''} ${m.nome}</span>`
    }).join('')
    const tel = v.telefone
      ? (typeof window.spanTelWhatsApp === 'function'
          ? window.spanTelWhatsApp(v.telefone)
          : `<span class="vol-card-tel">· ${v.telefone}</span>`)
      : ''
    return `
      <div class="vol-card">
        <div class="vol-card-info">
          <div class="vol-card-nome">${escapeHtml(v.nome)} ${tel}</div>
          ${tags ? `<div class="vol-card-mins">${tags}</div>` : ''}
        </div>
        <span class="vol-card-status vol-status-${v.status || 'Inativo'}">${v.status || '—'}</span>
      </div>`
  }).join('')
}

// ──────────────────────────────────────────────────────────────
// ABA ESCALAS
// ──────────────────────────────────────────────────────────────
async function carregarEscalas() {
  const lista = document.getElementById('lista-escalas')
  lista.innerHTML = '<div class="empty-state">Carregando…</div>'

  // Janela: hoje até hoje+90 dias
  const hoje = window.hojeStrLocal ? window.hojeStrLocal() : new Date().toISOString().slice(0, 10)
  const fim  = new Date()
  fim.setDate(fim.getDate() + 90)
  const fimStr = fim.getFullYear() + '-' +
    String(fim.getMonth() + 1).padStart(2, '0') + '-' +
    String(fim.getDate()).padStart(2, '0')

  const { data: evs, error: errEv } = await _db.from('eventos_igreja')
    .select('id, nome, data, hora, finalidade, tipo, ministerio_id')
    .gte('data', hoje).lte('data', fimStr)
    .order('data').order('hora')
  if (errEv) { console.error(errEv); return }
  _eventosCache = evs || []

  const evIds = _eventosCache.map(e => e.id)
  if (!evIds.length) { _escalasCache = []; renderEscalas(); return }

  const { data: escs } = await _db.from('ministerio_escala')
    .select('id, evento_id, voluntario_id, status, checkin_em, voluntarios(nome, telefone, ministerio_ids)')
    .in('evento_id', evIds)
  _escalasCache = escs || []

  renderEscalas()
}

window.renderEscalas = function() {
  const quando = document.getElementById('filtro-ev-quando').value
  const filtMin = document.getElementById('filtro-ev-min').value
  const hoje = window.hojeStrLocal ? window.hojeStrLocal() : new Date().toISOString().slice(0, 10)

  const limite = new Date()
  if (quando === 'hoje')      limite.setDate(limite.getDate())
  else if (quando === 'proximos') limite.setDate(limite.getDate() + 30)
  else                            limite.setDate(limite.getDate() + 90)
  const limStr = limite.getFullYear() + '-' +
    String(limite.getMonth() + 1).padStart(2, '0') + '-' +
    String(limite.getDate()).padStart(2, '0')

  const evsVisiveis = _eventosCache.filter(ev => {
    if (ev.data < hoje) return false
    if (quando === 'hoje' && ev.data !== hoje) return false
    if (ev.data > limStr) return false
    return true
  })

  const lista = document.getElementById('lista-escalas')
  if (!evsVisiveis.length) {
    lista.innerHTML = '<div class="empty-state">Nenhum evento na janela selecionada.</div>'
    return
  }

  lista.innerHTML = evsVisiveis.map(ev => {
    let escEv = _escalasCache.filter(e => e.evento_id === ev.id)

    // Filtro por ministério: aplica via cruzamento com ministerio_ids do voluntário
    if (filtMin) {
      escEv = escEv.filter(e => {
        const ids = Array.isArray(e.voluntarios?.ministerio_ids) ? e.voluntarios.ministerio_ids : []
        return ids.includes(filtMin)
      })
    }

    const ehHoje = ev.data === hoje
    const conf   = escEv.filter(e => e.status === 'confirmado').length
    const pend   = escEv.filter(e => e.status === 'pendente').length
    const pres   = escEv.filter(e => e.checkin_em).length

    const dataFmt = new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR',
      { weekday: 'short', day: '2-digit', month: 'short' })
    const hora = ev.hora ? ev.hora.slice(0, 5) : '—'
    const minLabel = ev.ministerio_id && _ministeriosMap[ev.ministerio_id]
      ? `${_ministeriosMap[ev.ministerio_id].icone || ''} ${_ministeriosMap[ev.ministerio_id].nome}` : ''

    const linhasEsc = escEv.length ? escEv.map(e => {
      const vol = e.voluntarios
      const minIcons = (Array.isArray(vol?.ministerio_ids) ? vol.ministerio_ids : [])
        .map(id => _ministeriosMap[id]?.icone || '').filter(Boolean).join(' ')
      const statusTag = e.status === 'confirmado'
        ? '<span class="pill pill-conf">✅</span>'
        : e.status === 'recusado'
          ? '<span class="pill" style="background:#FEE2E2;color:#991B1B;">❌</span>'
          : '<span class="pill pill-pend">⏳</span>'
      const btnCheckin = ehHoje
        ? window.renderCheckinEscalaBadge(e.id, e.checkin_em)
        : ''
      return `
        <div class="esc-row">
          <span class="nome">${escapeHtml(vol?.nome || '—')}</span>
          <span class="min">${minIcons}</span>
          ${statusTag}
          ${btnCheckin}
        </div>`
    }).join('') : '<div style="color:#bbb;font-size:13px;padding:8px 0;">Sem voluntários escalados.</div>'

    const btnQR = ehHoje
      ? `<button class="btn-qr" onclick="abrirModalQR('${ev.id}', ${JSON.stringify(ev.nome).replace(/"/g, '&quot;')}, '${ev.data}')">
          📱 QR de Check-in</button>`
      : ''

    return `
      <div class="evento-bloco">
        <div class="evento-head">
          <div>
            <h3>${escapeHtml(ev.nome)}</h3>
            <div class="evento-meta">${dataFmt} · ${hora}${minLabel ? ' · ' + minLabel : ''}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <div class="evento-resumo">
              <span class="pill pill-conf">✅ ${conf}</span>
              <span class="pill pill-pend">⏳ ${pend}</span>
              <span class="pill pill-pres">📍 ${pres}</span>
            </div>
            ${btnQR}
          </div>
        </div>
        <div class="esc-list">${linhasEsc}</div>
      </div>`
  }).join('')
}

// ──────────────────────────────────────────────────────────────
// MODAL QR
// ──────────────────────────────────────────────────────────────
// QR único e permanente: aponta pra /checkin-evento.html sem params.
// Voluntário escaneia → página identifica via auth e marca a escala
// dele para hoje (se for 1) ou mostra picker (se 2+).
window.abrirQRGeral = function() {
  const url = location.origin + '/checkin-evento.html'
  document.getElementById('qr-evento-nome').textContent = '📱 Check-in dos Voluntários'
  document.getElementById('qr-evento-data').textContent =
    'QR único — imprima e cole na entrada. Vale pra qualquer evento.'
  document.getElementById('qr-url').textContent = url
  document.getElementById('qr-img').src =
    'https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=8&data=' +
    encodeURIComponent(url)
  document.getElementById('modal-qr-overlay').classList.add('active')
}

window.abrirModalQR = function(evId, evNome, evData) {
  const url = location.origin + '/checkin-evento.html?evento=' + evId
  const dataFmt = evData
    ? new Date(evData + 'T00:00:00').toLocaleDateString('pt-BR',
        { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    : ''
  document.getElementById('qr-evento-nome').textContent = evNome
  document.getElementById('qr-evento-data').textContent = dataFmt
  document.getElementById('qr-url').textContent = url
  // Usa serviço público de QR (URL pública contém só o UUID do evento, sem PII)
  document.getElementById('qr-img').src =
    'https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=8&data=' +
    encodeURIComponent(url)
  document.getElementById('modal-qr-overlay').classList.add('active')
}

window.fecharModalQR = function() {
  document.getElementById('modal-qr-overlay').classList.remove('active')
}

// ──────────────────────────────────────────────────────────────
// ABA MATERIAIS
// ──────────────────────────────────────────────────────────────
let _matEventosCache = null
let _matSelecionado  = null   // evento_id atual na aba Materiais
let _matEscalados    = []     // voluntarios escalados pro evento
let _matLista        = []     // materiais cadastrados pro evento
let _matEntregas     = []     // entregas registradas

async function carregarEventosParaMateriais() {
  // Mesmos eventos que a aba Escalas (próximos 90 dias)
  if (!_eventosCache.length) await carregarEscalas()
  _matEventosCache = _eventosCache
  const sel = document.getElementById('filtro-mat-evento')
  sel.innerHTML = '<option value="">— escolha um evento —</option>' +
    _eventosCache.map(ev => {
      const d = new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR',
        { weekday: 'short', day: '2-digit', month: 'short' })
      const h = ev.hora ? ' · ' + ev.hora.slice(0, 5) : ''
      return `<option value="${ev.id}">${d}${h} — ${escapeHtml(ev.nome)}</option>`
    }).join('')

  // Popula select de ministérios no modal
  const selMin = document.getElementById('mat-ministerio')
  selMin.innerHTML = '<option value="">— Todos os escalados —</option>' +
    Object.values(_ministeriosMap)
      .map(m => `<option value="${m.id}">${m.icone || ''} ${m.nome}</option>`).join('')
}

window.renderMateriais = async function() {
  const evId = document.getElementById('filtro-mat-evento').value
  _matSelecionado = evId || null
  document.getElementById('btn-novo-material').disabled = !evId
  const lista = document.getElementById('lista-materiais')

  if (!evId) {
    lista.innerHTML = '<div class="empty-state">Escolha um evento pra ver e cadastrar materiais.</div>'
    return
  }

  lista.innerHTML = '<div class="empty-state">Carregando…</div>'

  // Carrega: escalados, materiais, entregas (em paralelo)
  const [{ data: escs }, { data: mats }] = await Promise.all([
    _db.from('ministerio_escala')
      .select('voluntario_id, voluntarios(id, nome, ministerio_ids)')
      .eq('evento_id', evId),
    _db.from('voluntario_materiais')
      .select('*').eq('evento_id', evId).order('criado_em')
  ])
  _matEscalados = (escs || [])
    .map(e => e.voluntarios)
    .filter(Boolean)
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''))
  _matLista = mats || []

  if (_matLista.length) {
    const matIds = _matLista.map(m => m.id)
    const { data: ents } = await _db.from('voluntario_materiais_entregas')
      .select('material_id, voluntario_id, entregue_em')
      .in('material_id', matIds)
    _matEntregas = ents || []
  } else {
    _matEntregas = []
  }

  if (!_matEscalados.length) {
    lista.innerHTML = '<div class="empty-state">Nenhum voluntário escalado pra este evento.</div>'
    return
  }

  if (!_matLista.length) {
    lista.innerHTML = '<div class="empty-state">📦 Nenhum material cadastrado.<br>' +
      '<small style="color:#bbb;">Use o botão acima pra adicionar.</small></div>'
    return
  }

  // Render: tabela voluntários × materiais
  const cabec = '<th style="text-align:left;padding:8px;background:#f7faee;color:#4a6a35;font-size:12px;border-bottom:2px solid #d0f0ee;">Voluntário</th>' +
    _matLista.map(m => {
      const ico = m.tipo === 'arquivo' ? '📎' : '📝'
      const minTag = m.ministerio_id && _ministeriosMap[m.ministerio_id]
        ? `<div style="font-size:9px;color:#4a6a35;">${_ministeriosMap[m.ministerio_id].icone || ''} ${escapeHtml(_ministeriosMap[m.ministerio_id].nome)}</div>` : ''
      const linkArq = m.tipo === 'arquivo' && m.arquivo_url
        ? `<a href="${m.arquivo_url}" target="_blank" rel="noopener" style="color:#4a6a35;font-size:10px;text-decoration:underline;">baixar</a>` : ''
      const btnExcluir = `<button onclick="excluirMaterial('${m.id}')" title="Remover" style="background:none;border:none;color:#c00;cursor:pointer;font-size:11px;">✕</button>`
      return `<th style="text-align:center;padding:8px;background:#f7faee;color:#4a6a35;font-size:11px;border-bottom:2px solid #d0f0ee;min-width:100px;">
        <div>${ico} ${escapeHtml(m.titulo)} ${btnExcluir}</div>
        ${minTag}
        ${linkArq}
      </th>`
    }).join('')

  const linhas = _matEscalados.map(vol => {
    const cels = _matLista.map(m => {
      // Filtra: se material tem ministério, só voluntários daquele min veem
      if (m.ministerio_id) {
        const ids = Array.isArray(vol.ministerio_ids) ? vol.ministerio_ids : []
        if (!ids.includes(m.ministerio_id)) {
          return '<td style="text-align:center;padding:6px;color:#ddd;">—</td>'
        }
      }
      const ent = _matEntregas.find(e => e.material_id === m.id && e.voluntario_id === vol.id)
      if (ent) {
        const hora = new Date(ent.entregue_em).toLocaleDateString('pt-BR',
          { day: '2-digit', month: '2-digit' })
        return `<td style="text-align:center;padding:6px;">
          <button onclick="desmarcarEntregaMaterial('${m.id}','${vol.id}',this)"
            title="Desmarcar entrega"
            style="background:#D1FAE5;color:#065F46;border:1px solid #6EE7B7;border-radius:8px;padding:3px 9px;font-size:11px;font-weight:700;cursor:pointer;">
            ✓ ${hora}</button>
        </td>`
      }
      return `<td style="text-align:center;padding:6px;">
        <button onclick="marcarEntregaMaterial('${m.id}','${vol.id}',this)"
          title="Marcar como entregue"
          style="background:#fff;color:#4a6a35;border:1px solid #6b8e4e;border-radius:8px;padding:3px 9px;font-size:11px;font-weight:600;cursor:pointer;">
          Entregar</button>
      </td>`
    }).join('')
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f5f5f5;font-size:13px;">${escapeHtml(vol.nome)}</td>
      ${cels}
    </tr>`
  }).join('')

  lista.innerHTML = `
    <div style="overflow-x:auto;background:#fff;border:1px solid #eee;border-radius:12px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>${cabec}</tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`
}

window.marcarEntregaMaterial = async function(matId, volId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳' }
  const { data, error } = await _db.rpc('voluntario_material_marcar_entregue',
    { p_material_id: matId, p_voluntario_id: volId })
  if (error) {
    alert('Erro ao marcar entrega: ' + (error.message || error))
    if (btn) { btn.disabled = false; btn.textContent = 'Entregar' }
    return
  }
  // Atualiza cache + re-renderiza só essa célula
  const ent = { material_id: matId, voluntario_id: volId, entregue_em: data || new Date().toISOString() }
  _matEntregas.push(ent)
  await renderMateriais()
}

window.desmarcarEntregaMaterial = async function(matId, volId, btn) {
  if (!confirm('Desmarcar entrega?')) return
  if (btn) { btn.disabled = true; btn.textContent = '⏳' }
  const { error } = await _db.rpc('voluntario_material_desmarcar_entregue',
    { p_material_id: matId, p_voluntario_id: volId })
  if (error) {
    alert('Erro ao desmarcar: ' + (error.message || error))
    if (btn) btn.disabled = false
    return
  }
  _matEntregas = _matEntregas.filter(e => !(e.material_id === matId && e.voluntario_id === volId))
  await renderMateriais()
}

window.excluirMaterial = async function(matId) {
  if (!confirm('Remover este material? As marcações de entrega também serão apagadas.')) return
  const { error } = await _db.from('voluntario_materiais').delete().eq('id', matId)
  if (error) { alert('Erro ao remover: ' + error.message); return }
  await renderMateriais()
}

// ──────── MODAL: cadastrar material ────────
window.abrirModalMaterial = function() {
  if (!_matSelecionado) return
  document.getElementById('mat-tipo').value      = 'checklist'
  document.getElementById('mat-titulo').value    = ''
  document.getElementById('mat-descricao').value = ''
  document.getElementById('mat-ministerio').value = ''
  document.getElementById('mat-arquivo').value   = ''
  document.getElementById('mat-erro').style.display = 'none'
  atualizarTipoMaterial()
  document.getElementById('modal-mat-overlay').classList.add('active')
}

window.fecharModalMaterial = function() {
  document.getElementById('modal-mat-overlay').classList.remove('active')
}

window.atualizarTipoMaterial = function() {
  const tipo = document.getElementById('mat-tipo').value
  document.getElementById('mat-arquivo-wrap').style.display = tipo === 'arquivo' ? 'block' : 'none'
}

window.salvarMaterial = async function() {
  if (!_matSelecionado) return
  const tipo      = document.getElementById('mat-tipo').value
  const titulo    = document.getElementById('mat-titulo').value.trim()
  const descricao = document.getElementById('mat-descricao').value.trim() || null
  const minId     = document.getElementById('mat-ministerio').value || null
  const file      = document.getElementById('mat-arquivo').files[0]
  const erroEl    = document.getElementById('mat-erro')
  const btn       = document.getElementById('btn-salvar-material')

  erroEl.style.display = 'none'

  if (!titulo) { erroEl.textContent = 'Título é obrigatório.'; erroEl.style.display = 'block'; return }
  if (tipo === 'arquivo' && !file) {
    erroEl.textContent = 'Selecione um arquivo.'; erroEl.style.display = 'block'; return
  }

  btn.disabled = true; btn.textContent = '⏳ Salvando…'

  let arquivo_url = null, arquivo_nome = null
  if (tipo === 'arquivo' && file) {
    const ext  = file.name.split('.').pop()
    const safe = file.name.replace(/[^\w.\-]/g, '_')
    const path = `voluntario-materiais/${_matSelecionado}/${Date.now()}_${safe}`
    const { error: errUp } = await _db.storage.from('arquivos').upload(path, file, { upsert: false })
    if (errUp) {
      btn.disabled = false; btn.textContent = '💾 Salvar'
      erroEl.textContent = 'Erro no upload: ' + errUp.message
      erroEl.style.display = 'block'
      return
    }
    const { data: urlData } = _db.storage.from('arquivos').getPublicUrl(path)
    arquivo_url  = urlData?.publicUrl || null
    arquivo_nome = file.name
  }

  const { error } = await _db.from('voluntario_materiais').insert([{
    evento_id:     _matSelecionado,
    ministerio_id: minId,
    tipo, titulo, descricao,
    arquivo_url, arquivo_nome,
    criado_por:    window.AUTH?.user?.id || null
  }])
  if (error) {
    btn.disabled = false; btn.textContent = '💾 Salvar'
    erroEl.textContent = 'Erro ao salvar: ' + error.message
    erroEl.style.display = 'block'
    return
  }

  btn.disabled = false; btn.textContent = '💾 Salvar'
  fecharModalMaterial()
  await renderMateriais()
}

// ──────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

init()
