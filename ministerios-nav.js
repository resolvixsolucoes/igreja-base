// ministerios-nav.js — acordeão vertical na sidebar

(function () {

  const ABAS_POR_MINISTERIO = {
    'musica':      ['👥 Voluntários|voluntarios', '👑 Líderes|lideres', '📅 Escala|escala', '🎵 Playlist|playlist', '📢 Avisos|avisos', '📊 Relatórios|relatorios'],
    'midia':       ['👥 Voluntários|voluntarios', '👑 Líderes|lideres', '📅 Escala|escala', '📢 Avisos|avisos', '📊 Relatórios|relatorios'],
    'louvor':      ['👥 Voluntários|voluntarios', '👑 Líderes|lideres', '📅 Escala|escala', '🎵 Playlist|playlist', '📊 Relatórios|relatorios'],
    'infantil':    ['👥 Voluntários|voluntarios', '👑 Líderes|lideres', '📢 Avisos|avisos'],
    'levinho':     ['👥 Voluntários|voluntarios', '👑 Líderes|lideres', '📅 Escala|escala', '🧒 Presentes|presentes', '📚 Materiais|materiais', '📢 Avisos|avisos', '📊 Relatórios|relatorios'],
    'recepcao':    ['👥 Voluntários|voluntarios', '👑 Líderes|lideres', '📅 Escala|escala', '📢 Avisos|avisos'],
    'comunicacao': ['👥 Voluntários|voluntarios', '👑 Líderes|lideres', '📅 Escala|escala', '📢 Avisos|avisos', '📊 Relatórios|relatorios'],
    'integracao':  ['👥 Voluntários|voluntarios', '👑 Líderes|lideres', '📅 Escala|escala', '📢 Avisos|avisos', '📊 Relatórios|relatorios'],
    'som':         ['👥 Voluntários|voluntarios', '👑 Líderes|lideres', '📅 Escala|escala', '📢 Avisos|avisos', '📊 Relatórios|relatorios'],
    '_default':    ['👥 Voluntários|voluntarios', '👑 Líderes|lideres', '📅 Escala|escala', '📢 Avisos|avisos', '📊 Relatórios|relatorios'],
  }

  function slugify(nome) {
    return nome
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/^ministerio\s+(de\s+)?/i, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .trim()
  }

  function getAbas(slug) {
    return ABAS_POR_MINISTERIO[slug] || ABAS_POR_MINISTERIO['_default']
  }

  var slugAtual = window.location.pathname.split('/').pop().replace('ministerios-', '').replace('.html', '')

  function buildAcordeon(ministerios) {
    var container = document.getElementById('nav-ministerios-lista')
    if (!container) return

    var html = ''

    ministerios.forEach(function (min) {
      var slug      = min.slug || slugify(min.nome)
      var icone     = min.icone || '✨'
      var abas      = getAbas(slug)
      var ehAtual   = window.location.pathname.split('/').pop() === ('ministerios-' + slug + '.html')
      var aberto    = ehAtual // abre automaticamente o ministério atual

      // Linha do ministério (clicável para expandir/recolher)
      html += '<div class="nav-acc-item' + (ehAtual ? ' nav-acc-ativo' : '') + '" data-slug="' + slug + '">'

      // Cabeçalho clicável
      html += '<div class="nav-acc-header" onclick="navAccToggle(this)">'
      html += '<span class="nav-acc-icone">' + icone + '</span>'
      html += '<a class="nav-acc-nome" href="ministerios-' + slug + '.html" onclick="event.stopPropagation()">' + min.nome + '</a>'
      html += '<span class="nav-acc-seta">' + (aberto ? '▴' : '▾') + '</span>'
      html += '</div>'

      // Sub-itens (abas) — filtra por permissão (ver) quando AUTH está pronto.
      var paginaSlug = 'ministerios_' + slug
      var podeGate   = window.AUTH?._initDone && typeof temPermissaoAba === 'function'
      html += '<div class="nav-acc-sub" style="display:' + (aberto ? 'block' : 'none') + ';">'
      abas.forEach(function (aba) {
        var partes = aba.split('|')
        var label  = partes[0]
        var chave  = partes[1]
        if (podeGate && !temPermissaoAba(paginaSlug, chave, 'ver')) return
        var abaAtual = ehAtual && window.location.search.includes('aba=' + chave)
        html += '<a class="nav-acc-sub-link' + (abaAtual ? ' nav-acc-sub-ativo' : '') + '" href="ministerios-' + slug + '.html?aba=' + chave + '">'
        html += label
        html += '</a>'
      })
      html += '</div>'

      html += '</div>'
    })


    container.innerHTML = html
  }

  // Toggle acordeão — expõe global para o onclick inline
  window.navAccToggle = function (header) {
    var item  = header.parentElement
    var sub   = item.querySelector('.nav-acc-sub')
    var seta  = header.querySelector('.nav-acc-seta')
    var aberto = sub.style.display !== 'none'

    // Fecha todos os outros
    document.querySelectorAll('.nav-acc-sub').forEach(function (s) {
      s.style.display = 'none'
    })
    document.querySelectorAll('.nav-acc-seta').forEach(function (s) {
      s.textContent = '▾'
    })

    // Abre/fecha o clicado
    if (!aberto) {
      sub.style.display = 'block'
      seta.textContent  = '▴'
    }
  }

  // Toggle do bloco principal de ministérios
  function initTrigger() {
    var trigger   = document.getElementById('nav-min-trigger')
    var lista     = document.getElementById('nav-ministerios-lista')
    if (!trigger || !lista) return

    // Marca ativo se estiver em página de ministério
    var emMinisterio = window.location.pathname.includes('ministerios')
    if (emMinisterio) {
      trigger.classList.add('active')
      lista.style.display = 'block' // já abre se estiver na página
    }

    trigger.addEventListener('click', function () {
      var aberto = lista.style.display !== 'none'
      lista.style.display = aberto ? 'none' : 'block'
      trigger.classList.toggle('open', !aberto)
    })

    // Clique no texto "Ministérios" navega para a página
    var textoTrigger = trigger.querySelector('span:first-child')
    if (textoTrigger) {
      textoTrigger.style.cursor = 'pointer'
      textoTrigger.addEventListener('click', function (e) {
        e.stopPropagation()
        window.location.href = 'ministerios.html'
      })
    }
  }

  async function aguardarAuth() {
    if (window.AUTH?._initDone) return
    await new Promise(function (resolve) {
      var done = false
      function ok() { if (!done) { done = true; resolve() } }
      window.addEventListener('auth:ready', ok, { once: true })
      var iv = setInterval(function () {
        if (window.AUTH?._initDone) { clearInterval(iv); ok() }
      }, 50)
      setTimeout(function () { clearInterval(iv); ok() }, 3000)
    })
  }

  async function carregarMinisterios() {
    if (!window.db) return
    try {
      // Espera AUTH popular permissoesGranular pra filtrar sub-abas no nav.
      await aguardarAuth()
      var result = await window.db
        .from('ministerios')
        .select('id, nome, icone')
        .order('nome')
      if (result.error || !result.data || !result.data.length) return
      buildAcordeon(result.data)
    } catch (e) {
      console.warn('Erro ao carregar ministérios no nav:', e)
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTrigger()
    tentarCarregar(30)
  })

  function tentarCarregar(tentativas) {
    if (tentativas <= 0) return
    if (window.db) {
      carregarMinisterios()
    } else {
      setTimeout(function () { tentarCarregar(tentativas - 1) }, 150)
    }
  }

})()