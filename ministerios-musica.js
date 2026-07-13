// ================================================================
//  ministerios-musica.js
// ================================================================
const _db = db

const FINALIDADE_COR_ESCALA = {
  culto:       '#7c3aed', conferencia: '#2563eb', curso:      '#d97706',
  treinamento: '#ea580c', reuniao:     '#374151', cafe:       '#92400e',
  festividade: '#16a34a', pastoral:    '#dc2626',
}
const FINALIDADE_LABEL_ESCALA = {
  culto:'Culto', conferencia:'Conferência', curso:'Curso',
  treinamento:'Treinamento', reuniao:'Reunião', cafe:'Café',
  festividade:'Festividade', pastoral:'Atendimento Pastoral',
}

let MINISTERIO_ID     = null
let MEU_VOLUNTARIO_ID = null
let volsCache         = []
let eventosCache      = []
let relatorioCache    = []
let escalaAtiva       = null
let tokenEscalaId     = null
let dispCache         = []
let dispEditandoId    = null
let dispEditandoData  = null
let volHabAtivo       = null
const escalaFuncoesCache = {}

const HABILIDADES = [
  { id: 'vocal',    label: 'Vocal',    cor: '#7c3aed' },
  { id: 'violao',   label: 'Violão',   cor: '#059669' },
  { id: 'teclado',  label: 'Teclado',  cor: '#2563eb' },
  { id: 'baixo',    label: 'Baixo',    cor: '#d97706' },
  { id: 'guitarra', label: 'Guitarra', cor: '#dc2626' },
  { id: 'bateria',  label: 'Bateria',  cor: '#6b7280' },
]
window.HABILIDADES_MUSICA = HABILIDADES
function habChips(ids) {
  if (!ids || !ids.length) return ''
  return ids.map(id => {
    const h = HABILIDADES.find(x => x.id === id)
    if (!h) return ''
    return `<span style="background:${h.cor}18;color:${h.cor};border:1px solid ${h.cor}40;
      padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;">${h.label}</span>`
  }).filter(Boolean).join(' ')
}

let calAno         = new Date().getFullYear()
let calMes         = new Date().getMonth()
let diaSelecionado = null

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const DIAS_PT  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']

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
  await carregarVoluntarios()
  await ajustarPermissoes()

  // ── Gate granular (user-based) por aba e por acao ──
  aplicarGateAbasGranular('ministerios_musica')
  aplicarGateAcoesGranular('ministerios_musica')
  document.querySelectorAll('[data-aba]').forEach(painel => {
    new MutationObserver(() => aplicarGateAcoesGranular('ministerios_musica'))
      .observe(painel, { childList: true, subtree: true })
  })

  // ── Ativa aba da URL ──
  ativarAbaPorURL()
})

// ================================================================
//  RESOLVE IDs
// ================================================================
async function resolverMinisterioId() {
  const { data, error } = await _db.from('ministerios').select('id')
    .ilike('nome', '%música%').maybeSingle()
  if (error || !data) {
    const { data: d2, error: e2 } = await _db.from('ministerios').select('id')
      .ilike('nome', '%musica%').maybeSingle()
    if (e2 || !d2) { console.error('Ministério Música não encontrado.', e2); return }
    MINISTERIO_ID = d2.id; return
  }
  MINISTERIO_ID = data.id
}

async function resolverMeuVoluntarioId() {
  const { data: { session } } = await _db.auth.getSession()
  if (!session) return
  const { data: perfil } = await _db.from('perfis').select('id, membro_id')
    .eq('id', session.user.id).maybeSingle()
  if (!perfil?.membro_id) return
  const { data: vol } = await _db.from('voluntarios').select('id')
    .eq('membro_id', perfil.membro_id).maybeSingle()
  MEU_VOLUNTARIO_ID = vol?.id || null
}

// ================================================================
//  PERMISSÕES
// ================================================================
async function ajustarPermissoes() {
  const pode = await usuarioPodeGerenciar()
  ;['btn-add-lider','btn-add-evento'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.style.display = pode ? 'inline-flex' : 'none'
  })
  const btnAvisos = document.getElementById('btn-aba-avisos')
  if (btnAvisos) btnAvisos.style.display = pode ? 'inline-flex' : 'none'
  const formAviso = document.getElementById('aviso-form-inline')
  if (formAviso) formAviso.style.display = pode ? 'block' : 'none'
}

async function usuarioPodeGerenciar() {
  if (window.AUTH?.isAdmin) return true
  // Tem permissao granular CUD em qualquer aba
  if (window.AUTH?.permissoesGranular) {
    for (const k in window.AUTH.permissoesGranular) {
      if (k.startsWith('ministerios_musica::')) {
        const p = window.AUTH.permissoesGranular[k]
        if (p.adicionar || p.editar || p.excluir) return true
      }
    }
  }
  // Lider/Co-Lider deste ministerio (do AUTH.lideres populado em auth.js)
  if (window.AUTH?.lideres?.has?.(MINISTERIO_ID)) return true
  // Fallback DB pra cobrir casos sem AUTH.lideres populado.
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
  if (!temPermissaoAba('ministerios_musica', nome, 'ver')) return

  document.querySelectorAll('.aba-content').forEach(el => el.classList.remove('active'))
  document.querySelectorAll('.aba-btn').forEach(el => el.classList.remove('active'))
  // ... resto do código permanece igual
  document.querySelectorAll('.aba-content').forEach(el => el.classList.remove('active'))
  document.querySelectorAll('.aba-btn').forEach(el => el.classList.remove('active'))
  document.getElementById('aba-' + nome).classList.add('active')
  btn.classList.add('active')
  if (['lideres','escala'].includes(nome) && !volsCache.length) await carregarVoluntarios()
  if (nome === 'lideres')    await carregarLideres()
  if (nome === 'escala')     await iniciarEscala()
  if (nome === 'avisos')     await carregarAvisos()
  if (nome === 'relatorios') await iniciarRelatorios()
  if (nome === 'playlist')   await carregarPlaylist()
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
  renderVols(volsCache)
  await carregarAvisosDestaque()
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
    const chips = habChips(v.habilidades)
    const tr   = document.createElement('tr')
    tr.innerHTML = `
      <td>${v.nome}</td><td>${v.telefone || '—'}</td><td>${v.endereco || '—'}</td>
      <td>${nasc}</td><td>${mesa}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          ${chips || '<span style="color:#bbb;font-size:12px;">—</span>'}
          <button class="btn btn-secondary" data-acao="adicionar"
            style="padding:2px 8px;font-size:11px;"
            onclick="abrirModalHabilidades('${v.id}')">✏️</button>
        </div>
      </td>
      <td><span class="badge ${v.status === 'Ativo' ? 'badge-ativo' : 'badge-inativo'}">
        ${v.status}</span></td>`
    tbody.appendChild(tr)
  })
}

function filtrarVols() {
  const t = document.getElementById('busca-vol').value.toLowerCase()
  renderVols(volsCache.filter(v =>
    v.nome.toLowerCase().includes(t) || (v.telefone || '').includes(t)))
}

// ================================================================
//  HABILIDADES
// ================================================================
function abrirModalHabilidades(volId) {
  const vol = volsCache.find(v => v.id === volId)
  if (!vol) return
  volHabAtivo = volId
  document.getElementById('mh-nome').textContent = vol.nome
  const selecionadas = vol.habilidades || []
  document.getElementById('mh-checks').innerHTML = HABILIDADES.map(h => `
    <label style="display:flex;align-items:center;gap:8px;padding:10px 14px;
      border:2px solid ${selecionadas.includes(h.id) ? h.cor : '#e5e7eb'};
      border-radius:10px;cursor:pointer;
      background:${selecionadas.includes(h.id) ? h.cor + '12' : '#fff'}">
      <input type="checkbox" value="${h.id}" ${selecionadas.includes(h.id) ? 'checked' : ''}
        style="accent-color:${h.cor};width:16px;height:16px;">
      <span style="font-weight:600;color:#242e1a;">${h.label}</span>
    </label>`).join('')
  document.getElementById('modal-habilidades').classList.add('active')
}
function fecharModalHabilidades() {
  document.getElementById('modal-habilidades').classList.remove('active')
  volHabAtivo = null
}
async function salvarHabilidades() {
  if (!volHabAtivo) return
  const selecionadas = [...document.querySelectorAll('#mh-checks input:checked')].map(i => i.value)
  const { error } = await _db.from('voluntarios').update({ habilidades: selecionadas }).eq('id', volHabAtivo)
  if (error) { alert('Erro ao salvar habilidades.'); console.error(error); return }
  const vol = volsCache.find(v => v.id === volHabAtivo)
  if (vol) vol.habilidades = selecionadas
  fecharModalHabilidades()
  renderVols(volsCache)
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
//  CALENDÁRIO DA ESCALA
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
    const el     = document.createElement('div')
    el.className = 'cal-day'
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
  document.getElementById('dia-painel-titulo').textContent    = `🎵 ${dataFmt}`
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
    _db.from('eventos_igreja').select('*')
      .eq('ministerio_id', MINISTERIO_ID).eq('tipo', 'ministerio')
      .order('data', { ascending: false }),
    _db.from('eventos_igreja').select('*')
      .eq('tipo', 'geral').order('data', { ascending: false })
  ])
  if (resMin.error)   console.error('Erro eventos ministério:', resMin.error)
  if (resGeral.error) console.error('Erro eventos gerais:', resGeral.error)
  const evMin   = resMin.data   || []
  const evGeral = (resGeral.data || []).map(ev => ({ ...ev, _geral: true }))
  eventosCache  = [...evMin, ...evGeral]
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

  // Busca repertório de todos os eventos de uma vez
  const evIds = eventos.map(e => e.id)
  const { data: plData } = await _db
    .from('playlist_eventos')
    .select('evento_id, ordem, playlist_musicas(titulo, artista, tonalidade, bpm, spotify_url)')
    .in('evento_id', evIds)
    .order('ordem')
  const repertorioPorEvento = _agruparRepertorio(plData || [])

  for (const ev of eventos) {
    const { data: escalaRaw } = await _db.from('ministerio_escala')
      .select('*, voluntarios(nome, telefone)').eq('evento_id', ev.id)
    const volIds = new Set(volsCache.map(v => v.id))
    const escala = (escalaRaw || []).filter(e => volIds.has(e.voluntario_id))
    wrap.appendChild(buildEventoCard(ev, escala || [], true, pode, repertorioPorEvento[ev.id] || []))
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

  // Busca repertório de todos os eventos do dia de uma vez
  const evIds = eventos.map(e => e.id)
  const { data: plData } = await _db
    .from('playlist_eventos')
    .select('evento_id, ordem, playlist_musicas(titulo, artista, tonalidade, bpm, spotify_url)')
    .in('evento_id', evIds)
    .order('ordem')
  const repertorioPorEvento = _agruparRepertorio(plData || [])

  for (const ev of eventos) {
    const { data: escalaRaw } = await _db.from('ministerio_escala')
      .select('*, voluntarios(nome, telefone)').eq('evento_id', ev.id)
    const volIds = new Set(volsCache.map(v => v.id))
    const escala = (escalaRaw || []).filter(e => volIds.has(e.voluntario_id))
    wrap.appendChild(buildEventoCard(ev, escala || [], false, pode, repertorioPorEvento[ev.id] || []))
  }
}

// ── Helper: agrupa playlist_eventos por evento_id ──────────────
function _agruparRepertorio(playlistEventos) {
  const map = {}
  playlistEventos.forEach(pe => {
    if (!map[pe.evento_id]) map[pe.evento_id] = []
    if (pe.playlist_musicas) {
      map[pe.evento_id].push({
        ordem:       pe.ordem,
        titulo:      pe.playlist_musicas.titulo,
        artista:     pe.playlist_musicas.artista,
        tonalidade:  pe.playlist_musicas.tonalidade,
        bpm:         pe.playlist_musicas.bpm,
        spotify_url: pe.playlist_musicas.spotify_url,
      })
    }
  })
  return map
}

// ── Helper: monta HTML do bloco de repertório ──────────────────
function _buildRepertorioHtml(repertorio) {
  if (!repertorio || !repertorio.length) return ''
  return `
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

function buildEventoCard(ev, esc, showDate = false, pode = false, repertorio = []) {
  const confirmados = esc.filter(e => e.status === 'confirmado').length
  const pendentes   = esc.filter(e => e.status === 'pendente').length
  const recusados   = esc.filter(e => e.status === 'recusado').length
  const hora        = ev.hora ? ` · ${ev.hora.slice(0,5)}` : ''
  const dataFmt     = showDate && ev.data
    ? new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR') + hora
    : hora || 'Dia todo'
  const card = document.createElement('div')
  card.className = 'evento-card'
  let _footerGeralHtml = ''
  if (ev._geral || ev.tipo === 'geral') {
    const _minha = esc.find(e => e.voluntario_id === MEU_VOLUNTARIO_ID)
    if (_minha) {
      const _nEsc  = (_minha.voluntarios?.nome || '').replace(/'/g, "\\'")
      const _dEsc  = (ev.data || '').replace(/'/g, "\\'")
      const _nEv   = ev.nome.replace(/'/g, "\\'")
      const _label = _minha.status === 'confirmado' ? '✅ Confirmado'
                   : _minha.status === 'recusado'   ? '❌ Recusado' : '⏳ Confirmar presença'
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
        <h3>🎵 ${ev.nome}</h3>
        ${ev.descricao ? `<p class="evento-desc">${ev.descricao}</p>` : ''}
      </div>
      <span class="evento-data-badge">${dataFmt}</span>
    </div>
    <div class="escala-itens">
      ${esc.length ? esc.map(e => {
          const ehMeu      = e.voluntario_id === MEU_VOLUNTARIO_ID
          const btnExcluir = pode
            ? `<button title="Remover da escala" style="padding:3px 8px;font-size:11px;"
                class="btn btn-danger" data-acao="excluir"
                onclick="removerEscala('${e.id}','${(e.voluntarios?.nome||'').replace(/'/g,"\\'")}','${ev.nome.replace(/'/g,"\\'")}')">
                🗑️</button>` : ''
          const btnEditar = (pode || ehMeu)
            ? `<button class="btn btn-secondary" style="padding:4px 10px;font-size:11px;"
                onclick="abrirModalStatus('${e.id}','${ev.nome.replace(/'/g,"\\'")}','${ev.data}','${(e.voluntarios?.nome||'').replace(/'/g,"\\'")}',${ehMeu})">
                ✏️</button>` : ''
          const _token    = e.token || ''
          const _url      = _token ? (location.origin + location.pathname + '?token=' + _token) : ''
          const _nomeFiel = (e.voluntarios?.nome || 'Voluntário').replace(/'/g, "'")
          const _dataFmt2 = ev.data ? new Date(ev.data + 'T00:00:00').toLocaleDateString('pt-BR') : ''
          const _wMsg     = _url ? encodeURIComponent(
            'Olá ' + _nomeFiel + '! Você foi escalado(a) para servir em *' +
            ev.nome + '* no dia *' + _dataFmt2 + '*.\n\nConfirme sua presença:\n' + _url) : ''
          const _telVol = e.voluntarios?.telefone || ''
          const _btnWpp = (pode && e.status === 'pendente' && _url)
            ? `<a href="${window.linkWhatsApp(_telVol, _wMsg)}" target="_blank"
                title="Enviar confirmação via WhatsApp"
                style="padding:3px 8px;font-size:11px;background:#25D366;color:white;
                  border-radius:6px;text-decoration:none;white-space:nowrap;">📱</a>
              <button onclick="copiarTextoGeral('${_url}', this)"
                title="Copiar link de confirmação"
                style="padding:3px 8px;font-size:11px;background:#f7faee;
                  border:1px solid #6b8e4e;color:#6b8e4e;border-radius:6px;cursor:pointer;">🔗</button>` : ''
          escalaFuncoesCache[e.id] = e.funcoes || []
          const funcoesHtml = habChips(e.funcoes)
          return `
            <div class="escala-item">
              <div>
                <span class="escala-item-nome">${e.voluntarios?.nome || '—'}</span>
                ${window.spanTelWhatsApp(e.voluntarios?.telefone)}
                ${funcoesHtml ? `<div style="margin-top:4px;">${funcoesHtml}</div>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span class="pill pill-${e.status}">
                  ${e.status === 'confirmado' ? '✅ Confirmado'
                    : e.status === 'recusado' ? '❌ Recusado' : '⏳ Pendente'}
                </span>
                ${window.renderCheckinEscalaBadgeIfHoje(e, ev, pode, ehMeu)}${_btnWpp}${btnEditar}${btnExcluir}
              </div>
            </div>`
        }).join('')
        : `<p style="color:#bbb;font-size:13px;text-align:center;">Nenhum voluntário escalado.</p>`}
    </div>
    ${_buildRepertorioHtml(repertorio)}
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

function abrirModalEvento() {
  ;['inp-ev-nome','inp-ev-hora','inp-ev-desc'].forEach(id =>
    document.getElementById(id).value = '')
  if (!diaSelecionado) document.getElementById('inp-ev-data').value = ''
  document.getElementById('links-gerados').style.display = 'none'
  document.getElementById('lista-links').innerHTML = ''
  const wrap = document.getElementById('check-vols')
  wrap.innerHTML = ''
  volsCache.filter(v => v.status === 'Ativo').forEach(v => {
    const habs = v.habilidades || []
    const item = document.createElement('div')
    item.style.cssText = 'border:1px solid #e5e7eb;border-radius:10px;margin-bottom:6px;'
    item.className = 'vol-ev-item'
    item.innerHTML =
      '<label style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;margin:0;">' +
        '<input type="checkbox" class="chk-vol" value="' + v.id + '"' +
          ' data-nome="' + v.nome.replace(/"/g, '&quot;') + '"' +
          ' data-habilidades=\'' + JSON.stringify(habs) + '\'>' +
        '<span style="font-weight:500;">' + v.nome + '</span>' +
        (v.telefone ? '<span style="color:#aaa;font-size:12px;margin-left:4px;">· ' + v.telefone + '</span>' : '') +
      '</label>' +
      '<div class="vol-ev-funcoes" style="padding:8px 14px 12px;border-top:1px solid #f0f0f0;background:#fafafa;">' +
        '<p style="font-size:12px;font-weight:600;color:#555;margin:0 0 8px;">🎵 Vai executar neste evento:</p>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
          HABILIDADES.map(function(h) {
            var chk = habs.includes(h.id)
            return '<label style="display:flex;align-items:center;gap:5px;padding:4px 10px;margin:0;' +
              'border:1px solid ' + h.cor + '40;border-radius:20px;cursor:pointer;' +
              'background:' + (chk ? h.cor + '18' : '#fff') + ';font-size:12px;font-weight:600;color:' + h.cor + ';">' +
              '<input type="checkbox" class="chk-funcao-vol" value="' + h.id + '"' + (chk ? ' checked' : '') +
                ' style="accent-color:' + h.cor + ';">' +
              h.label + '</label>'
          }).join('') +
        '</div>' +
      '</div>'
    wrap.appendChild(item)
  })
  document.getElementById('btn-salvar-evento').disabled    = false
  document.getElementById('btn-salvar-evento').textContent = 'Salvar'
  document.getElementById('modal-evento').classList.add('active')
}

function fecharModalEvento() {
  document.getElementById('modal-evento').classList.remove('active')
}

window._toggleFuncoesVol = function(id, checked) {
  var fw = document.getElementById('funcoes-vol-' + id)
  if (fw) fw.style.display = checked ? 'block' : 'none'
}

function toggleTodos() {
  const checks = document.querySelectorAll('.chk-vol')
  const todos  = [...checks].every(c => c.checked)
  checks.forEach(c => {
    c.checked = !todos
    window._toggleFuncoesVol(c.value, c.checked)
  })
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
      const funcoesChecked = document.querySelectorAll(`#funcoes-vol-${c.value} .chk-funcao-vol:checked`)
      return { id: c.value, nome: c.dataset.nome, funcoes: [...funcoesChecked].map(f => f.value) }
    })
  let escalaInserida = []
  if (selecionados.length) {
    const { data: ins, error: errEsc } = await _db.from('ministerio_escala')
      .insert(selecionados.map(v => ({
        evento_id: ev.id, voluntario_id: v.id, status: 'pendente', funcoes: v.funcoes
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

function copiarTextoGeral(url, btn) {
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent
    btn.textContent = '✅'
    setTimeout(() => btn.textContent = orig, 2000)
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
  const funcoesWrap = document.getElementById('mse-funcoes-wrap')
  if (funcoesWrap && !ehMeu) {
    const atuais = escalaFuncoesCache[escalaId] || []
    document.getElementById('mse-funcoes').innerHTML = HABILIDADES.map(h => `
      <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;
        border:2px solid ${atuais.includes(h.id) ? h.cor : '#e5e7eb'};
        border-radius:10px;cursor:pointer;
        background:${atuais.includes(h.id) ? h.cor + '12' : '#fff'}">
        <input type="checkbox" class="chk-mse-funcao" value="${h.id}"
          ${atuais.includes(h.id) ? 'checked' : ''}
          style="accent-color:${h.cor};width:15px;height:15px;">
        <span style="font-size:13px;font-weight:600;color:#242e1a;">${h.label}</span>
      </label>`).join('')
    funcoesWrap.style.display = 'block'
  } else if (funcoesWrap) {
    funcoesWrap.style.display = 'none'
  }
  document.getElementById('modal-status-escala').classList.add('active')
}

function fecharModalStatus() {
  document.getElementById('modal-status-escala').classList.remove('active')
  escalaAtiva = null
}

async function alterarStatus(novoStatus) {
  if (!escalaAtiva) return
  const update = { status: novoStatus, respondido_em: new Date().toISOString() }
  const funcoesInputs = document.querySelectorAll('.chk-mse-funcao')
  if (funcoesInputs.length) {
    update.funcoes = [...funcoesInputs].filter(i => i.checked).map(i => i.value)
    escalaFuncoesCache[escalaAtiva] = update.funcoes
  }
  const { error } = await _db.from('ministerio_escala').update(update).eq('id', escalaAtiva)
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
  if (error) { console.error('Erro carregarDisponibilidades:', error); return }
  dispCache = data || []
}

async function aceitarDisponibilidade(dispId, voluntarioId, eventoId, btnEl) {
  const pode = await usuarioPodeGerenciar()
  if (!pode) return
  btnEl.disabled = true; btnEl.textContent = '⏳'
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
      .insert({ evento_id: eventoId, voluntario_id: voluntarioId,
                status: 'confirmado', respondido_em: new Date().toISOString() })
    errEscala = error
  }
  if (errEscala) {
    console.error('Erro ao escalar:', errEscala)
    alert('Erro ao escalar voluntário.')
    btnEl.disabled = false; btnEl.textContent = '✅ Escalar'; return
  }
  btnEl.textContent      = '✔ Escalado'
  btnEl.style.background = '#D1FAE5'
  btnEl.style.color      = '#065F46'
  btnEl.style.border     = '1px solid #6EE7B7'
  btnEl.disabled         = true
  await carregarEventos(); renderCalendario()
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
                onclick="abrirModalDisponibilidade('${data}','${d.id}','${d.periodo}',\`${(d.observacao||'').replace(/`/g,"'")}\`)">✏️</button>
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
  const porEvento = {}
  dispDia.forEach(d => {
    const evId = d.evento_id || '_sem_evento'
    if (!porEvento[evId]) porEvento[evId] = { ev: d.eventos_igreja, vols: [] }
    porEvento[evId].vols.push(d)
  })
  const podeGer  = await usuarioPodeGerenciar()
  const evIdsDia = Object.keys(porEvento).filter(id => id !== '_sem_evento')
  let escalaConfirmadaMap = {}
  if (podeGer && evIdsDia.length) {
    const { data: escDia } = await _db.from('ministerio_escala')
      .select('voluntario_id, evento_id, status').in('evento_id', evIdsDia)
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
      '<div style="background:#f8f8f8;padding:7px 12px;font-size:12px;font-weight:800;color:#242e1a;border-bottom:1px solid #eee;">' +
        '📋 ' + evNome + '<span style="color:#6b8e4e;font-weight:400;">' + evHora + '</span>' +
      '</div>' +
      '<div style="padding:8px 12px;display:flex;flex-wrap:wrap;gap:6px;">' +
        vols.map(d => {
          const ehMeu        = d.voluntario_id === MEU_VOLUNTARIO_ID
          const statusEscala = escalaConfirmadaMap[d.voluntario_id + '_' + evId]
          const jaConfirmado = statusEscala === 'confirmado'
          let btnEscalar = ''
          if (podeGer && evId !== '_sem_evento') {
            if (jaConfirmado) {
              btnEscalar = '<span style="font-size:11px;padding:2px 10px;border-radius:20px;' +
                'background:#D1FAE5;color:#065F46;border:1px solid #6EE7B7;font-weight:600;">✔ Escalado</span>'
            } else {
              btnEscalar = '<button data-acao-lider onclick="aceitarDisponibilidade(\'' + d.id + '\',\'' +
                d.voluntario_id + '\',\'' + evId + '\', this)"' +
                ' style="font-size:11px;padding:2px 10px;border-radius:20px;cursor:pointer;' +
                'background:#f7faee;color:#4a6a35;border:1px solid #6b8e4e;font-weight:600;">✅ Escalar</button>'
            }
          }
          const btnsMeus = ehMeu
            ? '<button title="Editar minha disponibilidade" onclick="abrirModalDisponibilidade(\'' + d.data + '\')" ' +
              'style="font-size:11px;padding:2px 7px;border-radius:6px;cursor:pointer;background:#fff;border:1px solid #6b8e4e;color:#4a6a35;">✏️</button>' +
              '<button title="Excluir minha disponibilidade" onclick="excluirDisponibilidade(\'' + d.id + '\')" ' +
              'style="font-size:11px;padding:2px 7px;border-radius:6px;cursor:pointer;background:#fff;border:1px solid #ef4444;color:#ef4444;">🗑️</button>'
            : ''
          return '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;' +
            'background:' + (ehMeu ? '#eef5e2' : '#f5f5f5') + ';color:' + (ehMeu ? '#4a6a35' : '#555') + ';">' +
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
  const eventosHoje = eventosCache.filter(ev => ev.data === data)
  const wrap        = document.getElementById('modal-disp-eventos')
  const semEv       = document.getElementById('modal-disp-sem-eventos')
  wrap.innerHTML    = ''
  if (!eventosHoje.length) {
    wrap.style.display  = 'none'; semEv.style.display = 'block'
    document.getElementById('btn-salvar-disp').style.display = 'none'
  } else {
    wrap.style.display  = 'flex'; semEv.style.display = 'none'
    document.getElementById('btn-salvar-disp').style.display = ''
    const jaConfirmados = new Set(
      dispCache.filter(d => d.data === data && d.voluntario_id === MEU_VOLUNTARIO_ID)
        .map(d => d.evento_id))
    eventosHoje.forEach(ev => {
      const horaFmt = ev.hora ? ev.hora.slice(0, 5) : ''
      const jaMarc  = jaConfirmados.has(ev.id)
      const item    = document.createElement('label')
      item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 14px;' +
        'border:2px solid ' + (jaMarc ? '#6b8e4e' : '#e8e8e8') + ';border-radius:10px;cursor:pointer;' +
        'background:' + (jaMarc ? '#f7faee' : 'white') + ';transition:all .2s;'
      item.innerHTML =
        '<input type="checkbox" class="chk-disp-ev" value="' + ev.id + '"' +
        (jaMarc ? ' checked' : '') +
        ' style="accent-color:#6b8e4e;width:18px;height:18px;flex-shrink:0;" />' +
        '<div style="flex:1;"><strong style="font-size:14px;color:#242e1a;">' + ev.nome + '</strong>' +
        (horaFmt ? '<span style="font-size:12px;color:#6b8e4e;margin-left:8px;">⏰ ' + horaFmt + '</span>' : '') +
        '</div>'
      item.addEventListener('change', () => {
        item.style.borderColor = item.querySelector('input').checked ? '#6b8e4e' : '#e8e8e8'
        item.style.background  = item.querySelector('input').checked ? '#f7faee' : 'white'
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
  const checks      = [...document.querySelectorAll('.chk-disp-ev')]
  const marcados    = checks.filter(c => c.checked).map(c => c.value)
  const desmarcados = checks.filter(c => !c.checked).map(c => c.value)
  const btn = document.getElementById('btn-salvar-disp')
  btn.disabled = true; btn.textContent = 'Salvando...'
  if (desmarcados.length) {
    await _db.from('disponibilidade').delete()
      .eq('voluntario_id', MEU_VOLUNTARIO_ID).eq('data', dispEditandoData)
      .in('evento_id', desmarcados)
  }
  if (marcados.length) {
    const rows = marcados.map(evId => ({
      voluntario_id: MEU_VOLUNTARIO_ID, ministerio_id: MINISTERIO_ID,
      data: dispEditandoData, evento_id: evId, periodo: 'dia todo',
    }))
    const { error: errUpsert } = await _db.from('disponibilidade')
      .upsert(rows, { onConflict: 'voluntario_id,evento_id', ignoreDuplicates: false })
    if (errUpsert) {
      console.error('Erro ao salvar disponibilidade:', errUpsert)
      alert('Erro ao salvar disponibilidade: ' + errUpsert.message)
      btn.disabled = false; btn.textContent = '✅ Confirmar'; return
    }
  }
  btn.disabled = false; btn.textContent = '✅ Confirmar'
  fecharModalDisponibilidade()
  await carregarDisponibilidades(); renderCalendario(); renderDisponibilidadesMes()
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
  await carregarDisponibilidades(); renderDisponibilidadesMes()
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
    const isImagem = a.arquivo_url && /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(a.arquivo_url)
    const card = document.createElement('div')
    card.className = 'aviso-destaque-card'
    card.onclick   = () => abrirAvisoExpandido(a)
    card.innerHTML = `
      ${isImagem ? `<img class="aviso-destaque-img" src="${a.arquivo_url}"
        alt="${a.titulo}" onerror="this.style.display='none'" />` : ''}
      <div class="aviso-destaque-body">
        <h3>📢 ${a.titulo}</h3>
        <div class="aviso-destaque-meta">📅 ${dataFmt}${a.criado_por ? ` · ✍️ ${a.criado_por}` : ''}</div>
        ${a.texto ? `<div class="aviso-destaque-texto">${a.texto}</div>` : ''}
        <div class="aviso-destaque-rodape">Clique para ler completo →</div>
      </div>`
    section.appendChild(card)
  })
  const hero = document.querySelector('.ministerio-hero')
  hero.parentNode.insertBefore(section, hero.nextSibling)
}

function abrirAvisoExpandido(aviso) {
  const isImagem = aviso.arquivo_url && /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(aviso.arquivo_url)
  const imgWrap  = document.getElementById('modal-av-imagem-wrap')
  const img      = document.getElementById('modal-av-imagem')
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
  overlay.onclick = (e) => { if (e.target === overlay) fecharAvisoExpandido() }
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
    const isImagem = a.arquivo_url && /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(a.arquivo_url)
    const div = document.createElement('div')
    div.className = 'aviso-card'
    div.innerHTML = `
      <div class="aviso-head">
        <h3>📢 ${a.titulo}</h3>
        <button class="btn-rm-aviso" data-acao="excluir" onclick="excluirAviso('${a.id}')">🗑️</button>
      </div>
      <div class="aviso-meta">📅 ${dataFmt}${a.criado_por ? ` · ✍️ ${a.criado_por}` : ''}</div>
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
  document.getElementById('inp-av-arquivo').value       = ''
  document.getElementById('upload-preview').textContent = ''
}

async function salvarAviso() {
  const titulo     = document.getElementById('inp-av-titulo').value.trim()
  const texto      = document.getElementById('inp-av-texto').value.trim()
  const criado_por = document.getElementById('inp-av-autor').value.trim()
  const file       = document.getElementById('inp-av-arquivo').files[0]
  if (!titulo) { alert('Informe o título do aviso.'); return }
  let arquivo_url = null, arquivo_nome = null
  if (file) {
    const ext  = file.name.split('.').pop()
    const path = `ministerios/${MINISTERIO_ID}/avisos/${Date.now()}.${ext}`
    const { data: upData, error: errUp } = await _db.storage
      .from('arquivos').upload(path, file, { upsert: true })
    if (errUp) { alert('Erro ao enviar arquivo.'); console.error(errUp); return }
    const { data: urlData } = _db.storage.from('arquivos').getPublicUrl(path)
    arquivo_url  = urlData.publicUrl
    arquivo_nome = file.name
  }
  const { error } = await _db.from('ministerio_avisos').insert([{
    ministerio_id: MINISTERIO_ID, titulo, texto, criado_por, arquivo_url, arquivo_nome
  }])
  if (error) { alert('Erro ao publicar aviso.'); console.error(error); return }
  limparFormAviso()
  await carregarAvisos()
}

async function excluirAviso(id) {
  if (!confirm('Excluir este aviso?')) return
  const { error } = await _db.from('ministerio_avisos').delete().eq('id', id)
  if (error) { alert('Erro ao excluir.'); console.error(error); return }
  await carregarAvisos()
}

// ================================================================
//  RELATÓRIOS
// ================================================================
async function iniciarRelatorios() {
  if (!volsCache.length) await carregarVoluntarios()
  await gerarRelatorio()
}

async function gerarRelatorio() {
  const ini    = document.getElementById('filtro-ini').value
  const fim    = document.getElementById('filtro-fim').value
  const evId   = document.getElementById('filtro-evento').value
  const status = document.getElementById('filtro-status').value
  let query = _db.from('ministerio_escala')
    .select('*, eventos_igreja(nome, data), voluntarios(nome)')
    .order('created_at', { ascending: false })
  if (evId)   query = query.eq('evento_id', evId)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) { console.error(error); return }
  let lista = data || []
  if (ini) lista = lista.filter(r => r.eventos_igreja?.data >= ini)
  if (fim) lista = lista.filter(r => r.eventos_igreja?.data <= fim)
  const volIds = new Set(volsCache.map(v => v.id))
  const evIds  = new Set(eventosCache.map(e => e.id))
  lista = lista.filter(r => volIds.has(r.voluntario_id) && evIds.has(r.evento_id))
  relatorioCache = lista
  const selEv      = document.getElementById('filtro-evento')
  const valorAtual = selEv.value
  selEv.innerHTML  = '<option value="">Todos</option>'
  const evMap = {}
  lista.forEach(r => {
    if (r.eventos_igreja?.nome) evMap[r.evento_id] = r.eventos_igreja.nome
  })
  Object.entries(evMap).forEach(([id, nome]) => {
    const opt = document.createElement('option')
    opt.value = id; opt.textContent = nome; selEv.appendChild(opt)
  })
  selEv.value = valorAtual
  const conf = lista.filter(r => r.status === 'confirmado').length
  const pend = lista.filter(r => r.status === 'pendente').length
  const rec  = lista.filter(r => r.status === 'recusado').length
  document.getElementById('stats-row').innerHTML = `
    <div class="stat-box"><div class="stat-num">${lista.length}</div><div class="stat-label">Total</div></div>
    <div class="stat-box verde"><div class="stat-num">${conf}</div><div class="stat-label">Confirmados</div></div>
    <div class="stat-box amarelo"><div class="stat-num">${pend}</div><div class="stat-label">Pendentes</div></div>
    <div class="stat-box vermelho"><div class="stat-num">${rec}</div><div class="stat-label">Recusados</div></div>`
  const tbody = document.getElementById('tbody-relatorio')
  tbody.innerHTML = ''
  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Nenhum resultado.</td></tr>`
    return
  }
  lista.forEach(r => {
    const dataEv = r.eventos_igreja?.data
      ? new Date(r.eventos_igreja.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
    const resp = r.respondido_em
      ? new Date(r.respondido_em).toLocaleDateString('pt-BR') : '—'
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${r.eventos_igreja?.nome || '—'}</td>
      <td>${dataEv}</td>
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
  const linhas = [['Evento','Data','Voluntário','Status','Respondido em']]
  relatorioCache.forEach(r => {
    const dataEv = r.eventos_igreja?.data
      ? new Date(r.eventos_igreja.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
    const resp = r.respondido_em
      ? new Date(r.respondido_em).toLocaleDateString('pt-BR') : '—'
    linhas.push([
      r.eventos_igreja?.nome || '—', dataEv,
      r.voluntarios?.nome || '—', r.status, resp
    ])
  })
  const csv  = linhas.map(l => l.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'relatorio-escala.csv'; a.click()
  URL.revokeObjectURL(url)
}

function exportarPDF() {
  if (!relatorioCache.length) { alert('Nenhum dado para exportar.'); return }
  const { jsPDF } = window.jspdf
  const doc = new jsPDF()
  doc.text('Relatório de Escala — Ministério de Música', 14, 16)
  doc.autoTable({
    head: [['Evento','Data','Voluntário','Status','Respondido em']],
    body: relatorioCache.map(r => {
      const dataEv = r.eventos_igreja?.data
        ? new Date(r.eventos_igreja.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
      const resp = r.respondido_em
        ? new Date(r.respondido_em).toLocaleDateString('pt-BR') : '—'
      return [
        r.eventos_igreja?.nome || '—', dataEv,
        r.voluntarios?.nome || '—', r.status, resp
      ]
    }),
    startY: 24,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [107, 142, 78] },
  })
  doc.save('relatorio-escala.pdf')
}

// ================================================================
//  PLAYLIST
// ================================================================
let playlistCache     = []
let playlistFiltrada  = []
let plCalAno          = new Date().getFullYear()
let plCalMes          = new Date().getMonth()
let plEventoSelecionado = null
let cultoSelecionado  = []
let playerAtivoId     = null

async function carregarPlaylist() {
  const { data, error } = await _db.from('playlist_musicas')
    .select('*').order('titulo')
  if (error) { console.error(error); return }
  playlistCache    = data || []
  playlistFiltrada = [...playlistCache]
  // Garante que eventosCache esteja populado pra pintar o calendario,
  // mesmo se a aba Escala nao tiver sido aberta antes.
  if (!eventosCache.length) await carregarEventos()
  filtrarPlaylist()
  renderPlCalendario()
}

function filtrarPlaylist() {
  const busca = document.getElementById('playlist-busca').value.toLowerCase()
  const tom   = document.getElementById('playlist-filtro-tonalidade').value
  playlistFiltrada = playlistCache.filter(m => {
    const matchBusca = !busca ||
      (m.titulo  || '').toLowerCase().includes(busca) ||
      (m.artista || '').toLowerCase().includes(busca)
    const matchTom = !tom || m.tonalidade === tom
    return matchBusca && matchTom
  })
  renderPlaylist()
}

function renderPlaylist() {
  const grid = document.getElementById('playlist-grid')
  grid.innerHTML = ''
  if (!playlistFiltrada.length) {
    grid.innerHTML = '<div class="empty-state">Nenhuma música encontrada.</div>'
    return
  }
  playlistFiltrada.forEach((m, i) => {
    const spotifyId = extrairSpotifyId(m.spotify_url)
    const card = document.createElement('div')
    card.className = 'musica-card'
    card.innerHTML = `
      <span class="musica-num">${i + 1}</span>
      <div class="musica-thumb">
        ${m.thumb_url
          ? `<img src="${m.thumb_url}" alt="${m.titulo}" />`
          : '🎵'}
      </div>
      <div class="musica-info">
        <p class="musica-titulo">${m.titulo || '—'}</p>
        <p class="musica-artista">${m.artista || '—'}</p>
      </div>
      <div class="musica-tags">
        ${m.tonalidade ? `<span class="musica-tag">${m.tonalidade}</span>` : ''}
        ${m.bpm        ? `<span class="musica-tag">${m.bpm} bpm</span>`   : ''}
        ${m.categoria  ? `<span class="musica-tag">${m.categoria}</span>`  : ''}
      </div>
      <div class="musica-footer">
        ${m.spotify_url
          ? `<a class="btn-spotify" href="${m.spotify_url}" target="_blank">
               <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                 <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10
                   10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0
                   01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623
                   0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.623.623
                   0 01.207.857zm1.223-2.722a.78.78 0
                   01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78
                   0 01-.973-.519.781.781 0
                   01.519-.973c3.632-1.102 8.147-.568 11.234 1.328a.78.78
                   0 01.257 1.073zm.105-2.835C14.692 8.95
                   9.375 8.775 6.297 9.71a.937.937 0
                   11-.543-1.794c3.532-1.072 9.404-.865
                   13.115 1.338a.937.937 0 01-.954 1.614z"/>
               </svg>
               Ouvir
             </a>`
          : ''}
        ${spotifyId
          ? `<button class="btn-play-musica" title="Preview"
               onclick="togglePlayer('${m.id}','${spotifyId}',this)">▶</button>`
          : ''}
        <button class="btn-editar-musica"  onclick="editarMusica('${m.id}')">✏️</button>
        <button class="btn-excluir-musica" data-acao="excluir" onclick="excluirMusica('${m.id}','${(m.titulo||'').replace(/'/g,"\\'")}')">🗑️</button>
        <button title="Adicionar ao repertório do culto"
          onclick="adicionarAoCulto('${m.id}','${(m.titulo||'').replace(/'/g,"\\'")}','${(m.artista||'').replace(/'/g,"\\'")}','${m.spotify_url||''}')"
          style="background:#f7faee;border:1px solid #6b8e4e;color:#4a6a35;
                 border-radius:7px;padding:5px 8px;cursor:pointer;font-size:12px;">
          ➕
        </button>
      </div>`

    if (spotifyId) {
      const playerRow = document.createElement('div')
      playerRow.className = 'musica-player-row'
      playerRow.id        = 'player-' + m.id
      playerRow.innerHTML = `
        <iframe src="https://open.spotify.com/embed/track/${spotifyId}?utm_source=generator"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"></iframe>`
      grid.appendChild(card)
      grid.appendChild(playerRow)
    } else {
      grid.appendChild(card)
    }
  })
}

function togglePlayer(musicaId, spotifyId, btn) {
  const row = document.getElementById('player-' + musicaId)
  if (!row) return
  const aberto = row.classList.contains('aberto')
  document.querySelectorAll('.musica-player-row.aberto').forEach(r => r.classList.remove('aberto'))
  document.querySelectorAll('.btn-play-musica.ativo').forEach(b => {
    b.classList.remove('ativo'); b.textContent = '▶'
  })
  if (!aberto) {
    row.classList.add('aberto')
    btn.classList.add('ativo')
    btn.textContent = '⏸'
    playerAtivoId = musicaId
  } else {
    playerAtivoId = null
  }
}

function extrairSpotifyId(url) {
  if (!url) return null
  const m = url.match(/track\/([A-Za-z0-9]+)/)
  return m ? m[1] : null
}

// ── Calendário da Playlist ────────────────────────────────────
function mudarMesPlaylist(delta) {
  plCalMes += delta
  if (plCalMes < 0)  { plCalMes = 11; plCalAno-- }
  if (plCalMes > 11) { plCalMes = 0;  plCalAno++ }
  renderPlCalendario()
}

function renderPlCalendario() {
  const titulo = document.getElementById('pl-cal-titulo')
  const grid   = document.getElementById('pl-cal-grid')
  if (!titulo || !grid) return
  titulo.textContent = `${MESES_PT[plCalMes]} ${plCalAno}`
  grid.innerHTML = ''
  DIAS_PT.forEach(d => {
    const el = document.createElement('div')
    el.className = 'cal-dow'; el.textContent = d[0]; grid.appendChild(el)
  })
  const hoje      = new Date()
  const primDia   = new Date(plCalAno, plCalMes, 1).getDay()
  const totalDias = new Date(plCalAno, plCalMes + 1, 0).getDate()
  const mesStr    = String(plCalMes + 1).padStart(2, '0')
  const evsPorDia = {}
  eventosCache.forEach(ev => {
    if (!ev.data) return
    if (ev.data.startsWith(`${plCalAno}-${mesStr}-`)) {
      const dia = parseInt(ev.data.slice(8, 10))
      if (!evsPorDia[dia]) evsPorDia[dia] = []
      evsPorDia[dia].push(ev)
    }
  })
  for (let i = 0; i < primDia; i++) {
    const el = document.createElement('div'); el.className = 'cal-day vazio'; grid.appendChild(el)
  }
  for (let dia = 1; dia <= totalDias; dia++) {
    const el     = document.createElement('div')
    el.className = 'cal-day'
    const diaStr = String(dia).padStart(2, '0')
    const dtStr  = `${plCalAno}-${mesStr}-${diaStr}`
    const isHoje = dia === hoje.getDate() && plCalMes === hoje.getMonth() && plCalAno === hoje.getFullYear()
    const isSel  = plEventoSelecionado?.data === dtStr
    const evsDia = evsPorDia[dia] || []
    if (isHoje) el.classList.add('hoje')
    if (isSel)  el.classList.add('selecionado')
    if (evsDia.length) el.classList.add('tem-evento')
    const numEl = document.createElement('div')
    numEl.className = 'cal-day-num'; numEl.textContent = dia; el.appendChild(numEl)
    evsDia.slice(0, 2).forEach(ev => {
      const pill = document.createElement('div')
      pill.className   = 'cal-ev-mini'
      pill.textContent = ev.nome
      el.appendChild(pill)
    })
    if (evsDia.length > 2) {
      const mais = document.createElement('div')
      mais.className   = 'cal-ev-mini'
      mais.textContent = '+' + (evsDia.length - 2) + ' mais'
      el.appendChild(mais)
    }
    if (evsDia.length) {
      el.addEventListener('click', () => selecionarEventoPlaylist(dia, evsDia))
    }
    grid.appendChild(el)
  }
}

async function selecionarEventoPlaylist(dia, evsDia) {
  const ev = evsDia.find(e => !e._geral) || evsDia[0]
  plEventoSelecionado = ev
  renderPlCalendario()
  const mesStr  = String(plCalMes + 1).padStart(2, '0')
  const diaStr  = String(dia).padStart(2, '0')
  const dataFmt = new Date(`${plCalAno}-${mesStr}-${diaStr}T00:00:00`)
    .toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' })
  const painelEv = document.getElementById('pl-evento-selecionado')
  document.getElementById('pl-evento-nome').textContent = ev.nome
  document.getElementById('pl-evento-data').textContent = dataFmt
  painelEv.style.display = 'flex'
  const { data: vinculos } = await _db.from('playlist_eventos')
    .select('musica_id, ordem').eq('evento_id', ev.id).order('ordem')
  cultoSelecionado = (vinculos || []).map(v => {
    const m = playlistCache.find(x => x.id === v.musica_id)
    return m ? { id: m.id, titulo: m.titulo, artista: m.artista, spotify_url: m.spotify_url } : null
  }).filter(Boolean)
  renderCultoSelecionado()
}

function limparEventoPlaylist() {
  plEventoSelecionado = null
  renderPlCalendario()
  document.getElementById('pl-evento-selecionado').style.display = 'none'
  cultoSelecionado = []
  renderCultoSelecionado()
}

function adicionarAoCulto(id, titulo, artista, spotifyUrl) {
  if (cultoSelecionado.find(m => m.id === id)) return
  cultoSelecionado.push({ id, titulo, artista, spotify_url: spotifyUrl })
  renderCultoSelecionado()
}

function removerDoCulto(id) {
  cultoSelecionado = cultoSelecionado.filter(m => m.id !== id)
  renderCultoSelecionado()
}

function renderCultoSelecionado() {
  const wrap = document.getElementById('culto-sel-grid')
  wrap.innerHTML = ''
  if (!cultoSelecionado.length) {
    wrap.innerHTML = '<span style="color:#aaa;font-size:13px;">Nenhuma música selecionada.</span>'
    return
  }
  cultoSelecionado.forEach(m => {
    const pill = document.createElement('div')
    pill.className = 'culto-musica-pill'
    pill.innerHTML = `
      <span>${m.titulo}${m.artista
        ? ' <span style="font-weight:400;color:#aaa;">· ' + m.artista + '</span>'
        : ''}</span>
      ${m.spotify_url
        ? `<a href="${m.spotify_url}" target="_blank" rel="noopener"
              title="Ouvir no Spotify"
              style="display:inline-flex;align-items:center;gap:3px;background:#1DB954;
                     color:white;border-radius:20px;padding:2px 8px;font-size:10px;
                     font-weight:700;text-decoration:none;white-space:nowrap;">
             ▶ Spotify
           </a>`
        : ''}
      <button onclick="removerDoCulto('${m.id}')">✕</button>`
    wrap.appendChild(pill)
  })
}

function limparSelecaoCulto() {
  cultoSelecionado = []
  renderCultoSelecionado()
}

async function salvarPlaylistEvento() {
  if (!plEventoSelecionado) { alert('Selecione um evento no calendário.'); return }
  if (!cultoSelecionado.length) { alert('Adicione pelo menos uma música.'); return }
  await _db.from('playlist_eventos').delete().eq('evento_id', plEventoSelecionado.id)
  const rows = cultoSelecionado.map((m, i) => ({
    evento_id: plEventoSelecionado.id,
    musica_id: m.id,
    ordem:     i + 1,
  }))
  const { error } = await _db.from('playlist_eventos').insert(rows)
  if (error) { alert('Erro ao salvar repertório.'); console.error(error); return }
  const msg = document.getElementById('playlist-salvo-msg')
  msg.style.display = 'block'
  setTimeout(() => msg.style.display = 'none', 3000)
}

async function copiarSetlistWhatsapp() {
  if (!cultoSelecionado.length) { alert('Nenhuma música selecionada.'); return }
  const nomeEv = plEventoSelecionado?.nome || 'Evento'
  const linhas = cultoSelecionado.map((m, i) =>
    `${i+1}. ${m.titulo}${m.artista ? ' — ' + m.artista : ''}`)
  const txt = `🎵 *Setlist — ${nomeEv}*\n\n` + linhas.join('\n')
  await navigator.clipboard.writeText(txt)
  alert('✅ Setlist copiado!')
}

// ── Modal Música ──────────────────────────────────────────────
let editandoMusicaId = null

function abrirModalMusica() {
  editandoMusicaId = null
  document.getElementById('modal-playlist-titulo').textContent = '🎵 Nova Música'
  ;['inp-spotify-url','inp-musica-titulo','inp-musica-artista',
    'inp-musica-bpm','inp-musica-obs'].forEach(id => document.getElementById(id).value = '')
  document.getElementById('inp-musica-tom').value       = ''
  document.getElementById('inp-musica-categoria').value = ''
  document.getElementById('spotify-embed-box').style.display   = 'none'
  document.getElementById('spotify-embed-box').innerHTML       = ''
  document.getElementById('spotify-preview-box').style.display = 'none'
  document.getElementById('btn-salvar-musica').disabled    = false
  document.getElementById('btn-salvar-musica').textContent = '💾 Salvar'
  document.getElementById('modal-playlist').classList.add('active')
}

function editarMusica(id) {
  const m = playlistCache.find(x => x.id === id)
  if (!m) return
  editandoMusicaId = id
  document.getElementById('modal-playlist-titulo').textContent = '✏️ Editar Música'
  document.getElementById('inp-spotify-url').value    = m.spotify_url  || ''
  document.getElementById('inp-musica-titulo').value  = m.titulo       || ''
  document.getElementById('inp-musica-artista').value = m.artista      || ''
  document.getElementById('inp-musica-tom').value     = m.tonalidade   || ''
  document.getElementById('inp-musica-bpm').value     = m.bpm          || ''
  document.getElementById('inp-musica-categoria').value = m.categoria  || ''
  document.getElementById('inp-musica-obs').value     = m.observacoes  || ''
  document.getElementById('spotify-embed-box').style.display   = 'none'
  document.getElementById('spotify-preview-box').style.display = 'none'
  document.getElementById('btn-salvar-musica').disabled    = false
  document.getElementById('btn-salvar-musica').textContent = '💾 Salvar'
  document.getElementById('modal-playlist').classList.add('active')
}

function fecharModalMusica() {
  document.getElementById('modal-playlist').classList.remove('active')
  editandoMusicaId = null
}

async function previewSpotify(url) {
  const id = extrairSpotifyId(url)
  const embedBox   = document.getElementById('spotify-embed-box')
  const previewBox = document.getElementById('spotify-preview-box')
  if (!id) {
    embedBox.style.display   = 'none'
    previewBox.style.display = 'none'
    return
  }
  embedBox.style.display = 'block'
  embedBox.innerHTML     = `
    <iframe src="https://open.spotify.com/embed/track/${id}?utm_source=generator"
      width="100%" height="80" frameborder="0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy" style="border-radius:10px;"></iframe>`
}

async function salvarMusica() {
  const titulo     = document.getElementById('inp-musica-titulo').value.trim()
  const artista    = document.getElementById('inp-musica-artista').value.trim()
  const spotifyUrl = document.getElementById('inp-spotify-url').value.trim()
  const tonalidade = document.getElementById('inp-musica-tom').value
  const bpm        = document.getElementById('inp-musica-bpm').value
  const categoria  = document.getElementById('inp-musica-categoria').value
  const observacoes = document.getElementById('inp-musica-obs').value.trim()
  if (!titulo) { alert('Informe o título da música.'); return }
  const btn = document.getElementById('btn-salvar-musica')
  btn.disabled = true; btn.textContent = 'Salvando...'
  let thumb_url = null
  const spotifyId = extrairSpotifyId(spotifyUrl)
  if (spotifyId) {
    try {
      const res  = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${spotifyId}`)
      const json = await res.json()
      thumb_url  = json.thumbnail_url || null
    } catch(e) { console.warn('Não foi possível buscar thumb:', e) }
  }
  const payload = {
    titulo, artista: artista || null,
    spotify_url: spotifyUrl || null,
    tonalidade: tonalidade || null,
    bpm: bpm ? parseInt(bpm) : null,
    categoria: categoria || null,
    observacoes: observacoes || null,
    thumb_url,
  }
  let error
  if (editandoMusicaId) {
    ;({ error } = await _db.from('playlist_musicas').update(payload).eq('id', editandoMusicaId))
  } else {
    ;({ error } = await _db.from('playlist_musicas').insert([payload]))
  }
  if (error) {
    alert('Erro ao salvar música.'); console.error(error)
    btn.disabled = false; btn.textContent = '💾 Salvar'; return
  }
  fecharModalMusica()
  await carregarPlaylist()
}

async function excluirMusica(id, titulo) {
  if (!confirm(`Excluir a música "${titulo}"?`)) return
  const { error } = await _db.from('playlist_musicas').delete().eq('id', id)
  if (error) { alert('Erro ao excluir.'); console.error(error); return }
  await carregarPlaylist()
}

async function corrigirThumbsExistentes() {
  const semThumb = playlistCache.filter(m => !m.thumb_url && m.spotify_url)
  if (!semThumb.length) { alert('Todas as músicas já têm capa!'); return }
  const btn = document.getElementById('btn-corrigir-thumbs')
  btn.disabled = true; btn.textContent = '⏳ Atualizando...'
  let ok = 0
  for (const m of semThumb) {
    const id = extrairSpotifyId(m.spotify_url)
    if (!id) continue
    try {
      const res  = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${id}`)
      const json = await res.json()
      if (json.thumbnail_url) {
        await _db.from('playlist_musicas').update({ thumb_url: json.thumbnail_url }).eq('id', m.id)
        ok++
      }
    } catch(e) { console.warn('Erro ao buscar capa de', m.titulo, e) }
  }
  btn.disabled = false; btn.textContent = '🖼️ Atualizar capas'
  alert(`✅ ${ok} capa${ok !== 1 ? 's' : ''} atualizada${ok !== 1 ? 's' : ''}!`)
  await carregarPlaylist()
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