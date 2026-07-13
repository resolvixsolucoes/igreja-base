// ================================================================
//  comunicacao-ministerios.js
//  Aba "💬 Mensagens" auto-injetada nas páginas ministerios-*.html.
//  Acesso: admin OU usuário com vínculo em ministerio_lideres do
//  ministério atual (qualquer função).
// ================================================================
(function () {
  'use strict'

  const _db = window.db
  if (!_db) return

  // Mapeia o slug da página → padrões ilike pra achar o ministério.
  const SLUG_PADROES = {
    ministerios_comunicacao: ['%comunicação%', '%comunicacao%'],
    ministerios_integracao:  ['%integração%', '%integracao%'],
    ministerios_levinho:     ['%levinho%'],
    ministerios_midia:       ['%mídia%', '%midia%'],
    ministerios_musica:      ['%música%', '%musica%'],
    ministerios_som:         ['%som%'],
  }

  let MIN_ATUAL_ID    = null
  let MIN_ATUAL_NOME  = ''
  let MEU_PERFIL_ID   = null
  let outrosMinisterios = []   // [{id, nome, icone}]
  let threadAtual     = null   // {id, ministerio_id (do outro lado)}
  let pollMsgsTimer   = null
  let pollListaTimer  = null

  // ── Aguarda AUTH.perfil pronto ────────────────────────────────────
  function aguardarAuth() {
    return new Promise(resolve => {
      if (window.AUTH?.perfil) return resolve()
      window.addEventListener('auth:ready', () => resolve(), { once: true })
      // safety net
      setTimeout(() => resolve(), 5000)
    })
  }

  // ── Resolve o ministério da página atual ──────────────────────────
  async function resolverMinisterioAtual() {
    const meta = document.querySelector('meta[name="pagina-slug"]')
    const slug = meta?.getAttribute('content') || ''
    const pads = SLUG_PADROES[slug]
    if (!pads) return null
    for (const p of pads) {
      const { data } = await _db.from('ministerios')
        .select('id, nome').ilike('nome', p).maybeSingle()
      if (data) return data
    }
    return null
  }

  // ── Checa se o user pode usar o chat deste ministério ────────────
  async function temAcesso() {
    if (window.AUTH?.isAdmin) return true
    const membroId = window.AUTH?.membroId
    if (!membroId || !MIN_ATUAL_ID) return false
    const { data: vol } = await _db.from('voluntarios')
      .select('id').eq('membro_id', membroId).maybeSingle()
    if (!vol?.id) return false
    const { data: lider } = await _db.from('ministerio_lideres')
      .select('id').eq('ministerio_id', MIN_ATUAL_ID)
      .eq('voluntario_id', vol.id).maybeSingle()
    return !!lider
  }

  // ── CSS injetado uma vez ─────────────────────────────────────────
  function injetarCSS() {
    if (document.getElementById('comunicacao-min-css')) return
    const css = `
      #aba-mensagens-com .com-wrap{
        display:grid; grid-template-columns: 280px 1fr;
        gap:16px; min-height:520px;
      }
      @media (max-width: 768px){
        #aba-mensagens-com .com-wrap{ grid-template-columns: 1fr; }
        #aba-mensagens-com .com-chat{ display:none; }
        #aba-mensagens-com.modo-chat .com-lista{ display:none; }
        #aba-mensagens-com.modo-chat .com-chat{ display:flex; }
      }
      #aba-mensagens-com .com-lista{
        background:#f7faf9; border-radius:12px; padding:8px;
        overflow-y:auto; max-height:70vh;
      }
      #aba-mensagens-com .com-item{
        display:flex; align-items:center; gap:10px;
        padding:10px 12px; border-radius:10px; cursor:pointer;
        transition:background .15s;
      }
      #aba-mensagens-com .com-item:hover{ background:#e8f4f2; }
      #aba-mensagens-com .com-item.ativo{ background:#2BBFB3; color:#fff; }
      #aba-mensagens-com .com-item.ativo .com-item-prev{ color:rgba(255,255,255,.85); }
      #aba-mensagens-com .com-item-icon{ font-size:22px; }
      #aba-mensagens-com .com-item-info{ flex:1; min-width:0; }
      #aba-mensagens-com .com-item-nome{
        font-weight:600; font-size:14px;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      #aba-mensagens-com .com-item-prev{
        font-size:12px; color:#777;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      #aba-mensagens-com .com-badge{
        background:#e74c3c; color:#fff; font-size:11px; font-weight:700;
        border-radius:10px; padding:2px 7px; min-width:18px; text-align:center;
      }
      #aba-mensagens-com .com-item.ativo .com-badge{ background:#fff; color:#2BBFB3; }
      #aba-mensagens-com .com-chat{
        display:flex; flex-direction:column;
        background:#fff; border:1px solid #eee; border-radius:12px;
        overflow:hidden; min-height:520px;
      }
      #aba-mensagens-com .com-chat-header{
        padding:12px 16px; border-bottom:1px solid #eee;
        display:flex; align-items:center; gap:10px;
        font-weight:600;
      }
      #aba-mensagens-com .com-chat-back{
        display:none; background:transparent; border:0; font-size:18px;
        cursor:pointer; color:#2BBFB3;
      }
      @media (max-width:768px){ #aba-mensagens-com .com-chat-back{ display:inline; } }
      #aba-mensagens-com .com-chat-msgs{
        flex:1; overflow-y:auto; padding:14px;
        background:#fafbfb; display:flex; flex-direction:column; gap:8px;
        max-height:60vh;
      }
      #aba-mensagens-com .com-msg{
        max-width:75%; padding:8px 12px; border-radius:12px;
        font-size:14px; line-height:1.35; word-wrap:break-word;
      }
      #aba-mensagens-com .com-msg-meta{
        font-size:11px; color:#888; margin-top:3px;
      }
      #aba-mensagens-com .com-msg.eu{
        align-self:flex-end; background:#2BBFB3; color:#fff;
      }
      #aba-mensagens-com .com-msg.eu .com-msg-meta{ color:rgba(255,255,255,.85); }
      #aba-mensagens-com .com-msg.outro{
        align-self:flex-start; background:#fff; border:1px solid #eee;
      }
      #aba-mensagens-com .com-chat-form{
        display:flex; gap:8px; padding:10px;
        border-top:1px solid #eee; background:#fff;
      }
      #aba-mensagens-com .com-chat-form textarea{
        flex:1; resize:none; border:1px solid #ddd; border-radius:10px;
        padding:8px 12px; font-family:inherit; font-size:14px;
        max-height:120px;
      }
      #aba-mensagens-com .com-chat-form button{
        background:#2BBFB3; color:#fff; border:0; border-radius:10px;
        padding:0 18px; cursor:pointer; font-weight:600;
      }
      #aba-mensagens-com .com-chat-form button:disabled{ opacity:.5; cursor:default; }
      #aba-mensagens-com .com-empty{
        display:flex; flex:1; align-items:center; justify-content:center;
        color:#999; font-size:14px; padding:40px 20px; text-align:center;
      }
    `
    const tag = document.createElement('style')
    tag.id = 'comunicacao-min-css'
    tag.textContent = css
    document.head.appendChild(tag)
  }

  // ── Injeta tab button + painel ────────────────────────────────────
  function injetarUI() {
    const abas = document.querySelector('.abas')
    if (!abas) return false

    if (!document.getElementById('btn-aba-mensagens-com')) {
      const btn = document.createElement('button')
      btn.id = 'btn-aba-mensagens-com'
      btn.className = 'aba-btn'
      btn.setAttribute('data-aba', 'mensagens-com')
      btn.textContent = '💬 Mensagens'
      btn.addEventListener('click', () => abrirAba(btn))
      abas.appendChild(btn)
    }

    if (!document.getElementById('aba-mensagens-com')) {
      const main = abas.parentElement
      const painel = document.createElement('div')
      painel.id = 'aba-mensagens-com'
      painel.className = 'aba-content'
      painel.setAttribute('data-aba', 'mensagens-com')
      painel.innerHTML = `
        <div class="com-wrap">
          <div class="com-lista" id="com-lista">
            <div style="padding:20px;text-align:center;color:#888;">Carregando...</div>
          </div>
          <div class="com-chat" id="com-chat">
            <div class="com-empty" id="com-empty">
              👈 Selecione um ministério à esquerda para iniciar uma conversa.
            </div>
          </div>
        </div>
      `
      main.appendChild(painel)
    }
    return true
  }

  function abrirAba(btn) {
    document.querySelectorAll('.aba-content').forEach(el => el.classList.remove('active'))
    document.querySelectorAll('.aba-btn').forEach(el => el.classList.remove('active'))
    document.getElementById('aba-mensagens-com').classList.add('active')
    btn.classList.add('active')
    carregarLista()
    if (pollListaTimer) clearInterval(pollListaTimer)
    pollListaTimer = setInterval(carregarLista, 15000)
  }

  // ── Carrega lista de ministérios (lado esquerdo) ─────────────────
  async function carregarLista() {
    if (!outrosMinisterios.length) {
      const { data } = await _db.from('ministerios')
        .select('id, nome, icone').neq('id', MIN_ATUAL_ID).order('nome')
      outrosMinisterios = data || []
    }

    // Threads existentes envolvendo MIN_ATUAL_ID
    const { data: threads } = await _db.from('comunicacao_threads')
      .select('id, ministerio_a_id, ministerio_b_id')
      .or(`ministerio_a_id.eq.${MIN_ATUAL_ID},ministerio_b_id.eq.${MIN_ATUAL_ID}`)
    const threadsMap = new Map()
    ;(threads || []).forEach(t => {
      const outro = t.ministerio_a_id === MIN_ATUAL_ID ? t.ministerio_b_id : t.ministerio_a_id
      threadsMap.set(outro, t.id)
    })

    // Última mensagem por thread + leituras pra calcular não-lido
    const threadIds = (threads || []).map(t => t.id)
    let ultimasPorThread = new Map()
    let leiturasPorThread = new Map()
    if (threadIds.length) {
      const { data: msgs } = await _db.from('comunicacao_mensagens')
        .select('id, thread_id, autor_ministerio_id, texto, created_at')
        .in('thread_id', threadIds).order('created_at', { ascending: false })
      ;(msgs || []).forEach(m => {
        if (!ultimasPorThread.has(m.thread_id)) ultimasPorThread.set(m.thread_id, m)
      })
      const { data: leituras } = await _db.from('comunicacao_leituras')
        .select('thread_id, ultima_leitura_at')
        .eq('perfil_id', MEU_PERFIL_ID).eq('ministerio_id', MIN_ATUAL_ID)
        .in('thread_id', threadIds)
      ;(leituras || []).forEach(l => leiturasPorThread.set(l.thread_id, l.ultima_leitura_at))

      // Calcula não-lido: msgs cujo autor_ministerio_id != MIN_ATUAL_ID
      // e created_at > ultima_leitura_at
      const naoLidoPorThread = new Map()
      ;(msgs || []).forEach(m => {
        if (m.autor_ministerio_id === MIN_ATUAL_ID) return
        const ult = leiturasPorThread.get(m.thread_id)
        if (!ult || new Date(m.created_at) > new Date(ult)) {
          naoLidoPorThread.set(m.thread_id, (naoLidoPorThread.get(m.thread_id) || 0) + 1)
        }
      })
      window._comNaoLido = naoLidoPorThread
    } else {
      window._comNaoLido = new Map()
    }

    // Render
    const lista = document.getElementById('com-lista')
    if (!lista) return
    if (!outrosMinisterios.length) {
      lista.innerHTML = `<div style="padding:20px;text-align:center;color:#888;">
        Nenhum outro ministério cadastrado.</div>`
      return
    }
    lista.innerHTML = outrosMinisterios.map(m => {
      const tid    = threadsMap.get(m.id)
      const ult    = tid ? ultimasPorThread.get(tid) : null
      const nLido  = tid ? (window._comNaoLido.get(tid) || 0) : 0
      const ativo  = threadAtual?.outroMinId === m.id ? 'ativo' : ''
      const prev   = ult
        ? (ult.autor_ministerio_id === MIN_ATUAL_ID ? 'Você: ' : '') + ult.texto
        : 'Sem mensagens ainda'
      const badge  = nLido > 0 ? `<span class="com-badge">${nLido}</span>` : ''
      return `
        <div class="com-item ${ativo}" data-min="${m.id}" data-nome="${escapeAttr(m.nome)}">
          <div class="com-item-icon">${m.icone || '✨'}</div>
          <div class="com-item-info">
            <div class="com-item-nome">${escapeHtml(m.nome)}</div>
            <div class="com-item-prev">${escapeHtml(prev).slice(0, 60)}</div>
          </div>
          ${badge}
        </div>`
    }).join('')
    lista.querySelectorAll('.com-item').forEach(el => {
      el.addEventListener('click', () => {
        const id   = el.getAttribute('data-min')
        const nome = el.getAttribute('data-nome')
        abrirConversa(id, nome)
      })
    })
  }

  // ── Abre conversa com determinado ministério ─────────────────────
  async function abrirConversa(outroMinId, outroMinNome) {
    document.getElementById('aba-mensagens-com').classList.add('modo-chat')
    threadAtual = { outroMinId, outroMinNome, threadId: null }

    const { data: tid, error } = await _db.rpc('obter_ou_criar_thread_comunicacao',
      { p_min1: MIN_ATUAL_ID, p_min2: outroMinId })
    if (error) {
      alert('Erro ao abrir conversa: ' + error.message)
      console.error(error); return
    }
    threadAtual.threadId = tid

    renderChatHeader(outroMinNome)
    await carregarMensagens()
    await marcarComoLido()

    if (pollMsgsTimer) clearInterval(pollMsgsTimer)
    pollMsgsTimer = setInterval(async () => {
      await carregarMensagens()
      await marcarComoLido()
    }, 6000)

    // re-renderiza lista pra atualizar destaque/badges
    carregarLista()
  }

  function renderChatHeader(nome) {
    const chat = document.getElementById('com-chat')
    chat.innerHTML = `
      <div class="com-chat-header">
        <button class="com-chat-back" id="com-chat-back">←</button>
        <span>💬 Conversa com <strong>${escapeHtml(nome)}</strong></span>
      </div>
      <div class="com-chat-msgs" id="com-chat-msgs"></div>
      <form class="com-chat-form" id="com-chat-form">
        <textarea id="com-chat-input" rows="1" placeholder="Escreva uma mensagem..."></textarea>
        <button type="submit" id="com-chat-send">Enviar</button>
      </form>
    `
    document.getElementById('com-chat-back').addEventListener('click', () => {
      document.getElementById('aba-mensagens-com').classList.remove('modo-chat')
    })
    document.getElementById('com-chat-form').addEventListener('submit', enviarMensagem)
    const ta = document.getElementById('com-chat-input')
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        document.getElementById('com-chat-form').requestSubmit()
      }
    })
    ta.focus()
  }

  async function carregarMensagens() {
    if (!threadAtual?.threadId) return
    const { data, error } = await _db.from('comunicacao_mensagens')
      .select('id, autor_perfil_id, autor_ministerio_id, texto, created_at, perfis(id), perfis_nome:autor_perfil_id(nome)')
      .eq('thread_id', threadAtual.threadId)
      .order('created_at', { ascending: true })
    if (error) {
      // fallback sem join se a relação inferida não pegar
      const { data: d2 } = await _db.from('comunicacao_mensagens')
        .select('id, autor_perfil_id, autor_ministerio_id, texto, created_at')
        .eq('thread_id', threadAtual.threadId)
        .order('created_at', { ascending: true })
      renderMensagens(d2 || [])
      return
    }
    renderMensagens(data || [])
  }

  function renderMensagens(msgs) {
    const wrap = document.getElementById('com-chat-msgs')
    if (!wrap) return
    const scrollAntes = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 30
    if (!msgs.length) {
      wrap.innerHTML = `<div class="com-empty">Sem mensagens. Escreva a primeira!</div>`
      return
    }
    wrap.innerHTML = msgs.map(m => {
      const eu      = m.autor_ministerio_id === MIN_ATUAL_ID
      const classe  = eu ? 'eu' : 'outro'
      const data    = formatarData(m.created_at)
      return `
        <div class="com-msg ${classe}">
          ${escapeHtml(m.texto)}
          <div class="com-msg-meta">${data}</div>
        </div>`
    }).join('')
    if (scrollAntes) wrap.scrollTop = wrap.scrollHeight
  }

  async function enviarMensagem(e) {
    e.preventDefault()
    const input = document.getElementById('com-chat-input')
    const btn   = document.getElementById('com-chat-send')
    const txt   = (input.value || '').trim()
    if (!txt || !threadAtual?.threadId) return
    btn.disabled = true
    const { error } = await _db.from('comunicacao_mensagens').insert({
      thread_id:           threadAtual.threadId,
      autor_perfil_id:     MEU_PERFIL_ID,
      autor_ministerio_id: MIN_ATUAL_ID,
      texto:               txt,
    })
    btn.disabled = false
    if (error) {
      alert('Erro ao enviar: ' + error.message)
      console.error(error); return
    }
    input.value = ''
    await carregarMensagens()
    await marcarComoLido()
    carregarLista()
  }

  async function marcarComoLido() {
    if (!threadAtual?.threadId) return
    await _db.from('comunicacao_leituras').upsert({
      thread_id:         threadAtual.threadId,
      perfil_id:         MEU_PERFIL_ID,
      ministerio_id:     MIN_ATUAL_ID,
      ultima_leitura_at: new Date().toISOString(),
    }, { onConflict: 'thread_id,perfil_id,ministerio_id' })
    // Atualiza badges (sidebar/aba/dashboard) sem esperar o polling.
    if (typeof window.atualizarBadgesComunicacao === 'function') {
      window.atualizarBadgesComunicacao()
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    })[c])
  }
  function escapeAttr(s) { return escapeHtml(s) }
  function formatarData(iso) {
    const d = new Date(iso)
    const hoje = new Date()
    const mesmoDia = d.toDateString() === hoje.toDateString()
    const hh = String(d.getHours()).padStart(2,'0')
    const mm = String(d.getMinutes()).padStart(2,'0')
    if (mesmoDia) return `${hh}:${mm}`
    const dd = String(d.getDate()).padStart(2,'0')
    const mo = String(d.getMonth()+1).padStart(2,'0')
    return `${dd}/${mo} ${hh}:${mm}`
  }

  // ── INIT ──────────────────────────────────────────────────────────
  async function init() {
    await aguardarAuth()
    MEU_PERFIL_ID = window.AUTH?.user?.id || null
    if (!MEU_PERFIL_ID) return

    const min = await resolverMinisterioAtual()
    if (!min) return
    MIN_ATUAL_ID   = min.id
    MIN_ATUAL_NOME = min.nome

    if (!(await temAcesso())) return

    injetarCSS()
    if (!injetarUI()) return
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
