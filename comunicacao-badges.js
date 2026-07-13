// ================================================================
//  comunicacao-badges.js
//  Aplica badges de mensagens não-lidas em 3 lugares:
//   1. Aba "💬 Mensagens" (na página do ministério)
//   2. Sidebar lateral (item do ministério)
//   3. Card do dashboard (#com-dashboard-card)
//
//  Faz polling de 30s. Carregado em todas as páginas com sidebar.
// ================================================================
(function () {
  'use strict'

  const _db = window.db
  if (!_db) return

  const POLL_MS = 30000
  let cache = new Map()       // ministerio_id -> total
  let nomesMap = new Map()    // ministerio_id -> nome
  let timer = null

  // ── CSS injetado uma vez ─────────────────────────────────────
  function injetarCSS() {
    if (document.getElementById('com-badges-css')) return
    const css = `
      .com-badge-dot{
        display:inline-flex; align-items:center; justify-content:center;
        background:#e74c3c; color:#fff; font-size:10px; font-weight:700;
        border-radius:10px; min-width:18px; height:16px; padding:0 5px;
        margin-left:6px; line-height:1;
      }
      .com-badge-dot.is-pulse{ animation: comBadgePulse 1.6s infinite; }
      @keyframes comBadgePulse {
        0%,100% { box-shadow: 0 0 0 0 rgba(231,76,60,.55); }
        50%     { box-shadow: 0 0 0 6px rgba(231,76,60,0); }
      }
      /* Card do dashboard */
      #com-dashboard-card{
        margin: 16px 0; padding: 16px 18px;
        background: linear-gradient(135deg,#6b8e4e,#4a6a35); color:#fff;
        border-radius: 14px; display:none; gap:14px; align-items:center;
        box-shadow: 0 4px 18px rgba(107,142,78,.25);
      }
      #com-dashboard-card.has-unread{ display:flex; }
      #com-dashboard-card .com-card-icon{
        font-size:30px; flex-shrink:0;
      }
      #com-dashboard-card .com-card-info{ flex:1; min-width:0; }
      #com-dashboard-card .com-card-title{ font-weight:700; font-size:15px; }
      #com-dashboard-card .com-card-sub{
        font-size:13px; color:rgba(255,255,255,.9); margin-top:2px;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      #com-dashboard-card .com-card-list{
        display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;
      }
      #com-dashboard-card .com-card-pill{
        background: rgba(255,255,255,.18); color:#fff;
        font-size:12px; font-weight:600; padding:3px 9px;
        border-radius:12px; text-decoration:none;
      }
      #com-dashboard-card .com-card-pill:hover{ background: rgba(255,255,255,.3); }
    `
    const tag = document.createElement('style')
    tag.id = 'com-badges-css'
    tag.textContent = css
    document.head.appendChild(tag)
  }

  // ── Aguarda AUTH ─────────────────────────────────────────────
  function aguardarAuth() {
    return new Promise(resolve => {
      if (window.AUTH?._initDone) return resolve()
      window.addEventListener('auth:ready', () => resolve(), { once: true })
      setTimeout(() => resolve(), 5000)
    })
  }

  // ── Carrega o mapa de não-lidas via RPC ──────────────────────
  async function carregarNaoLidas() {
    const { data, error } = await _db.rpc('minhas_mensagens_nao_lidas')
    if (error) {
      // RPC ainda não existe (SQL não rodado) — silencia.
      console.warn('minhas_mensagens_nao_lidas indisponível:', error.message)
      return
    }
    cache = new Map((data || []).map(r => [r.ministerio_id, Number(r.total)]))

    // Carrega nomes dos ministérios pra mostrar no card do dashboard.
    if (cache.size && !nomesMap.size) {
      const { data: mins } = await _db.from('ministerios')
        .select('id, nome, icone')
      ;(mins || []).forEach(m => nomesMap.set(m.id, m))
    }
  }

  // ── Helper: renderiza/atualiza badge num elemento ────────────
  function setBadge(el, total, opts = {}) {
    if (!el) return
    let badge = el.querySelector(':scope > .com-badge-dot')
    if (total > 0) {
      if (!badge) {
        badge = document.createElement('span')
        badge.className = 'com-badge-dot is-pulse'
        el.appendChild(badge)
      }
      badge.textContent = total > 99 ? '99+' : String(total)
      if (opts.title) badge.title = opts.title
    } else if (badge) {
      badge.remove()
    }
  }

  // ── 1) Badge na aba "💬 Mensagens" ───────────────────────────
  function aplicarBadgeTab() {
    const btn = document.getElementById('btn-aba-mensagens-com')
    if (!btn) return
    const minId = window.MINISTERIO_ID_ATUAL
    const total = minId ? (cache.get(minId) || 0) : 0
    setBadge(btn, total)
  }

  // ── 2) Badge na sidebar lateral ──────────────────────────────
  function aplicarBadgeSidebar() {
    // Agrega total por nav-acc-item via slug → resolve ministerio_id
    // pelo nome buscado em nomesMap. Mais simples: faz match por nome.
    document.querySelectorAll('.nav-acc-nome').forEach(linkEl => {
      const nome = linkEl.textContent.trim()
      let total = 0
      cache.forEach((t, id) => {
        const m = nomesMap.get(id)
        if (m && m.nome.trim().toLowerCase() === nome.toLowerCase()) total += t
      })
      setBadge(linkEl.parentElement, total) // pendura no header (ao lado da seta)
    })

    // Total agregado no menu pai "✨ Ministérios"
    const trigger = document.getElementById('nav-min-trigger')
    if (trigger) {
      let totalGeral = 0
      cache.forEach(t => totalGeral += t)
      const span = trigger.querySelector('span:first-child')
      setBadge(span, totalGeral)
    }
  }

  // ── 3) Card no dashboard ─────────────────────────────────────
  function aplicarCardDashboard() {
    const card = document.getElementById('com-dashboard-card')
    if (!card) return
    let total = 0
    const items = []
    cache.forEach((t, id) => {
      total += t
      const m = nomesMap.get(id)
      if (m) items.push({ id, nome: m.nome, icone: m.icone || '✨', total: t })
    })
    items.sort((a, b) => b.total - a.total)

    if (total === 0) {
      card.classList.remove('has-unread')
      card.innerHTML = ''
      return
    }
    card.classList.add('has-unread')
    card.innerHTML = `
      <div class="com-card-icon">💬</div>
      <div class="com-card-info">
        <div class="com-card-title">${total} mensagem${total !== 1 ? 's' : ''} não-lida${total !== 1 ? 's' : ''}</div>
        <div class="com-card-sub">Você tem novas conversas em ${items.length} ministério${items.length !== 1 ? 's' : ''}.</div>
        <div class="com-card-list">
          ${items.slice(0, 6).map(it =>
            `<a class="com-card-pill" href="${slugHref(it.nome)}?aba=mensagens-com">${it.icone} ${escapeHtml(it.nome)} · ${it.total}</a>`
          ).join('')}
        </div>
      </div>
    `
  }

  function slugHref(nome) {
    const slug = nome
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/^ministerio\s+(de\s+)?/i, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
    return 'ministerios-' + slug + '.html'
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
    })[c])
  }

  let aplicando = false
  function aplicarTudo() {
    if (aplicando) return
    aplicando = true
    try {
      aplicarBadgeTab()
      aplicarBadgeSidebar()
      aplicarCardDashboard()
    } finally {
      // Próximo tick libera — evita reentrância via MutationObserver.
      setTimeout(() => { aplicando = false }, 0)
    }
  }

  let debounceTimer = null
  function aplicarDebounced() {
    if (aplicando) return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(aplicarTudo, 250)
  }

  async function tick() {
    await carregarNaoLidas()
    aplicarTudo()
  }

  async function init() {
    injetarCSS()
    await aguardarAuth()
    await tick()
    if (timer) clearInterval(timer)
    timer = setInterval(tick, POLL_MS)

    // Observa só os containers que importam (sidebar + abas), debouncado.
    // Ignora mutações de nós com data-com-badge pra evitar loop quando
    // nós inserimos o próprio badge.
    const obs = new MutationObserver(muts => {
      const relevante = muts.some(m =>
        ![...m.addedNodes, ...m.removedNodes].every(n =>
          n.nodeType === 1 && n.classList?.contains('com-badge-dot')
        )
      )
      if (relevante) aplicarDebounced()
    })
    const navLista = document.getElementById('nav-ministerios-lista')
    if (navLista) obs.observe(navLista, { childList: true, subtree: true })
    const abas = document.querySelector('.abas')
    if (abas) obs.observe(abas, { childList: true })
  }

  // Expõe pra outros scripts forçarem refresh (ex: ao marcar como lido).
  window.atualizarBadgesComunicacao = tick

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
