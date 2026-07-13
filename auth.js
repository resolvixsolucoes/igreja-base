// ========================================================
// auth.js — Guard de autenticação + controle de permissões
// Sua Igreja
// ========================================================

const PAGINA_SLUG = {
  'dashboard.html':              'dashboard',
  'membros.html':                'membros',
  'visitantes.html':             'visitantes',
  'criancas.html':               'criancas',
  'pedido-de-oracao.html':       'pedido_oracao',
  'aniversariantes.html':        'aniversariantes',
  'ministerios.html':            'ministerios',
  'agenda.html':                 'agenda',
  'central-voluntarios.html':    'central_voluntarios',
  'ministerios-comunicacao.html': 'ministerios_comunicacao',
  'ministerios-integracao.html':  'ministerios_integracao',
  'ministerios-levinho.html':     'ministerios_levinho',
  'ministerios-midia.html':       'ministerios_midia',
  'ministerios-musica.html':      'ministerios_musica',
  'ministerios-som.html':         'ministerios_som',
  'mesas.html':                  'mesas',
  'financeiro.html':             'financeiro',
  'relatorios.html':             'relatorios',
  'usuarios.html':               'usuarios',
  'conteudos.html':              'conteudos',
}

const PAGINAS_REDIRECT = [
  { slug: 'dashboard',                href: 'dashboard.html'                },
  { slug: 'membros',                  href: 'membros.html'                  },
  { slug: 'visitantes',               href: 'visitantes.html'               },
  { slug: 'criancas',                 href: 'criancas.html'                 },
  { slug: 'pedido_oracao',            href: 'pedido-de-oracao.html'         },
  { slug: 'aniversariantes',          href: 'aniversariantes.html'          },
  { slug: 'ministerios',              href: 'ministerios.html'              },
  { slug: 'agenda',                   href: 'agenda.html'                   },
  { slug: 'central_voluntarios',      href: 'central-voluntarios.html'      },
  { slug: 'ministerios_comunicacao',  href: 'ministerios-comunicacao.html'  },
  { slug: 'ministerios_integracao',   href: 'ministerios-integracao.html'   },
  { slug: 'ministerios_levinho',      href: 'ministerios-levinho.html'      },
  { slug: 'ministerios_midia',        href: 'ministerios-midia.html'        },
  { slug: 'ministerios_musica',       href: 'ministerios-musica.html'       },
  { slug: 'ministerios_som',          href: 'ministerios-som.html'          },
  { slug: 'mesas',                    href: 'mesas.html'                    },
  { slug: 'financeiro',               href: 'financeiro.html'               },
  { slug: 'relatorios',               href: 'relatorios.html'               },
  { slug: 'conteudos',                href: 'conteudos.html'                },
]

const SLUGS_SUBPAGINAS_MINISTERIO = [
  'ministerios_comunicacao',
  'ministerios_integracao',
  'ministerios_levinho',
  'ministerios_midia',
  'ministerios_musica',
  'ministerios_som',
]

window.AUTH = {
  user:               null,
  perfil:             null,
  permissoesGranular: {},   // chave `${pagina}::${aba}` -> {ver,adicionar,editar,excluir}
  isAdmin:            false,
  membroId:           null,
  // Set de ministerio_id em que o user é Líder ou Co-Líder (NÃO inclui
  // Coordenador). Usado pelo gate `data-acao-lider`.
  lideres:            new Set(),
}

;(async function initAuth() {

  const { data: { session } } = await db.auth.getSession()

  if (!session) {
    window.location.href = 'login.html'
    return
  }

  const user = session.user
  AUTH.user = user

  // ── Carrega perfil ──────────────────────────────────────
  const { data: perfil, error: errPerfil } = await db
    .from('perfis')
    .select('*')
    .eq('id', user.id)
    .single()

  if (errPerfil || !perfil) {
    await db.auth.signOut()
    window.location.href = 'login.html'
    return
  }

  if (!perfil.ativo) {
    await db.auth.signOut()
    alert('Sua conta está desativada. Contate o administrador.')
    window.location.href = 'login.html'
    return
  }

  AUTH.perfil   = perfil
  AUTH.isAdmin  = perfil.role === 'admin'
  AUTH.membroId = perfil.membro_id ?? null

  localStorage.setItem('role',          perfil.role          || 'membro')
  localStorage.setItem('voluntario_id', perfil.voluntario_id || perfil.id || '')

  // ── Carrega permissoes_granular ──────────────────────────
  // Fonte unica do gate de pagina/aba/acao apos a Fase 7. Helpers
  // temPermissaoAba / temAcessoPagina sao usados em todo o app.
  // Admin tambem carrega — alguns checks futuros podem precisar do
  // mapa mesmo para admin.
  {
    const { data: permsGran, error: errGran } = await db.rpc('get_minhas_permissoes')
    if (errGran) {
      console.warn('[Fase 5.2] get_minhas_permissoes falhou:', errGran.message)
    } else {
      ;(permsGran || []).forEach(p => {
        AUTH.permissoesGranular[`${p.pagina}::${p.aba}`] = {
          ver:       p.ver,
          adicionar: p.adicionar,
          editar:    p.editar,
          excluir:   p.excluir,
        }
      })
    }
  }

  // ── Carrega ministérios em que o user é Líder/Co-Líder ──────────
  // Coordenador é excluído de propósito: o gate `data-acao-lider`
  // libera apenas Líder e Co-Líder pra escalar pessoas / criar eventos.
  {
    const { data: lideranca, error: errLid } = await db.rpc('meus_ministerios_lideranca')
    if (errLid) {
      console.warn('meus_ministerios_lideranca falhou:', errLid.message)
    } else {
      ;(lideranca || []).forEach(l => {
        if (l.funcao === 'Líder' || l.funcao === 'Co-Líder') AUTH.lideres.add(l.ministerio_id)
      })
    }
  }

  // ── Marca init como concluido para que paginas que dependem de
  //    AUTH.permissoesGranular possam aguardar com seguranca.
  //    Setado mesmo se a RPC falhou (mapa fica vazio = fail-closed).
  AUTH._initDone = true
  window.dispatchEvent(new CustomEvent('auth:ready'))

  // ── Identifica página atual ───────────────────────────
  const paginaAtual = window.location.pathname.split('/').pop() || 'dashboard.html'
  const slug        = PAGINA_SLUG[paginaAtual]

  // ── dashboard.html e perfil.html são LIVRES para qualquer autenticado ──
  if (paginaAtual === 'dashboard.html' || paginaAtual === 'perfil.html') {
    injetarSidebar()
    return
  }

  // ── Admin: libera tudo ────────────────────────────────
  if (AUTH.isAdmin) {
    injetarSidebar()
    return
  }

  // ── Não-admin: bloqueia usuarios.html ─────────────────
  if (paginaAtual === 'usuarios.html') {
    redirecionarParaPrimeiraPermitida()
    return
  }

  // ── Não-admin: gate de página unificado via permissoes_granular ─
  // Toda pagina interna (Fase 7 completa) passa se houver alguma aba
  // com ver=true. permissoes.ministerios.ver cascata so visualmente
  // no submenu — acesso real exige aba liberada da pagina especifica.
  if (slug && !temAcessoPagina(slug)) {
    redirecionarParaPrimeiraPermitida()
    return
  }

  injetarSidebar()

})()

// ========================================================
// REDIRECIONA PARA A PRIMEIRA PÁGINA PERMITIDA
// ========================================================
function redirecionarParaPrimeiraPermitida() {
  const primeiraPermitida = PAGINAS_REDIRECT.find(p => {
    if (SLUGS_SUBPAGINAS_MINISTERIO.includes(p.slug)) return false
    return temAcessoPagina(p.slug)
  })

  if (primeiraPermitida) {
    window.location.href = primeiraPermitida.href
    return
  }

  document.body.style.cssText = `
    margin: 0; padding: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f0f2f5;
    font-family: sans-serif;
  `
  document.body.innerHTML = `
    <div style="
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center; gap: 16px; padding: 40px 20px;
    ">
      <span style="font-size: 64px;">🔒</span>
      <h2 style="color: #1a2e2d; margin: 0;">Sem permissões</h2>
      <p style="color: #888; margin: 0;">
        Sua conta não possui nenhum acesso liberado.<br>
        Contate o administrador.
      </p>
      <a href="login.html"
        style="
          background: #2BBFB3; color: white;
          padding: 10px 24px; border-radius: 8px;
          text-decoration: none; font-weight: 600;
        ">
        🔑 Ir para o Login
      </a>
    </div>
  `
}

// ========================================================
// INJETA SIDEBAR COM USUÁRIO + LOGOUT
// ========================================================
function injetarSidebar() {
  const sidebar = document.querySelector('.sidebar')
  if (!sidebar) return

  const nav     = sidebar.querySelector('nav')
  const nome    = AUTH.perfil?.nome || AUTH.user?.email || 'Usuário'
  const isAdmin = AUTH.isAdmin

  // Filtra um link da sidebar por permissao (reutilizado no init e no observer
  // do acordeao de ministerios, que e injetado async pelo ministerios-nav.js).
  const filtrarLinkPorPermissao = (link) => {
    const href = link.getAttribute('href')
    const slug = PAGINA_SLUG[href]
    if (!slug) return
    if (href === 'usuarios.html') { link.style.display = 'none'; return }
    if (href === 'dashboard.html') return
    // Subpaginas de ministerio vivem dentro de .nav-acc-item; esconder
    // so o <a> deixaria icone+seta orfaos (item fantasma do acordeao).
    if (!temAcessoPagina(slug)) (link.closest('.nav-acc-item') || link).style.display = 'none'
  }

  if (!isAdmin && nav) {
    nav.querySelectorAll('a').forEach(filtrarLinkPorPermissao)

    // Em paginas de ministerio o acordeao costuma ser injetado DEPOIS do
    // initAuth terminar (DOMContentLoaded chega tarde). Observa o container
    // e reaplica o filtro quando ministerios-nav.js popular/repopular.
    const acordeao = document.getElementById('nav-ministerios-lista')
    if (acordeao) {
      new MutationObserver(() => {
        acordeao.querySelectorAll('a').forEach(filtrarLinkPorPermissao)
      }).observe(acordeao, { childList: true, subtree: true })
    }

    // Fase 5.3: submenu de Conteudos vive em #nav-conteudos e os subitens
    // tem data-aba. filtrarLinkPorPermissao acima ignora os links com
    // querystring (`conteudos.html?aba=...`), entao tratamos aqui via
    // permissoes_granular. Sem nenhuma aba liberada => some o submenu
    // inteiro; com algumas abas => esconde so os subitens vetados.
    const navConteudos = document.getElementById('nav-conteudos')
    if (navConteudos) {
      if (!temAcessoPagina('conteudos')) {
        navConteudos.style.display = 'none'
      } else {
        document.querySelectorAll('#nav-conteudos-lista a[data-aba]').forEach(a => {
          if (!temPermissaoAba('conteudos', a.dataset.aba, 'ver')) {
            a.style.display = 'none'
          }
        })
      }
    }

    // Trigger do acordeao de ministerios e um <div>, nao <a>, entao escapa do
    // filtrarLinkPorPermissao acima. Esconde o cabecalho inteiro quando o user
    // nao tem ver=true em ministerios geral nem em nenhum ministerio especifico.
    const navMinisterios = document.getElementById('nav-ministerios')
    if (navMinisterios) {
      const temAlgum = temAcessoPagina('ministerios')
        || SLUGS_SUBPAGINAS_MINISTERIO.some(s => temAcessoPagina(s))
      if (!temAlgum) navMinisterios.style.display = 'none'
    }
  }

  if (isAdmin && nav) {
    if (!nav.querySelector('a[href="usuarios.html"]')) {
      const a = document.createElement('a')
      a.href        = 'usuarios.html'
      a.textContent = '👤 Usuários'
      nav.appendChild(a)
    }
  }

  if (!sidebar.querySelector('.sidebar-footer')) {
    const footer = document.createElement('div')
    footer.className = 'sidebar-footer'

    const fotoUrl    = AUTH.perfil?.foto_url || null
    const avatarHtml = fotoUrl
      ? `<img src="${fotoUrl}" alt="Avatar"
           style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />`
      : `<span style="
           display:inline-flex;align-items:center;justify-content:center;
           width:28px;height:28px;border-radius:50%;
           background:#2BBFB3;color:white;font-size:13px;font-weight:700;
         ">${(nome)[0].toUpperCase()}</span>`

    footer.innerHTML = `
      <div class="sidebar-user" onclick="window.location.href='perfil.html'"
        style="cursor:pointer;" title="Editar meu perfil">
        <span class="sidebar-user-icon">${avatarHtml}</span>
        <span class="sidebar-user-nome" title="${AUTH.user?.email}">${nome}</span>
      </div>
      <button class="sidebar-logout" onclick="fazerLogout()">
        🚪 Sair
      </button>
    `
    sidebar.appendChild(footer)
  }
}

// ========================================================
// LOGOUT
// ========================================================
async function fazerLogout() {
  localStorage.removeItem('role')
  localStorage.removeItem('voluntario_id')
  await db.auth.signOut()
  window.location.href = 'login.html'
}

// ========================================================
// HELPER — leitura segura de role (Fase 2.2)
// Fonte autoritativa: AUTH.perfil.role (vem da sessao Supabase).
// Fallback transitorio para storage com aviso de observacao
// (1-2 semanas) — apos confirmar que AUTH sempre vence,
// removemos o fallback e o vetor `localStorage.role='admin'` morre.
// ========================================================
function getRoleSeguro() {
  if (window.AUTH?.perfil?.role) return window.AUTH.perfil.role
  const fb = sessionStorage.getItem('role') || localStorage.getItem('role') || ''
  if (fb) console.warn('[getRoleSeguro] AUTH ausente, usando fallback de storage:', fb)
  return fb
}

// ========================================================
// Fase 5.2 — Helpers do modelo granular (pagina × aba × acao)
//
// AUTH.permissoesGranular foi populado no init via RPC
// get_minhas_permissoes (chaves no formato `${pagina}::${aba}`).
// Paginas sem abas usam aba='_default'. Admin sempre passa.
// Default fail-closed: chave ausente => acesso negado.
// ========================================================
function temPermissaoAba(pagina, aba = '_default', acao = 'ver') {
  if (AUTH.isAdmin) return true
  // Aba "lideres" dos ministerios e exclusiva de admin — nem granular
  // nem wildcard de lideranca liberam.
  if (aba === 'lideres' && pagina?.startsWith('ministerios_')) return false
  if (AUTH.permissoesGranular?.[`${pagina}::${aba}`]?.[acao] === true) return true
  // Wildcard: liderança ganha aba='*' que libera qualquer aba da página.
  if (AUTH.permissoesGranular?.[`${pagina}::*`]?.[acao] === true) return true
  return false
}

function temAcessoPagina(pagina) {
  if (AUTH.isAdmin) return true
  if (!AUTH.permissoesGranular) return false
  const prefix = `${pagina}::`
  for (const k in AUTH.permissoesGranular) {
    if (k.startsWith(prefix) && AUTH.permissoesGranular[k].ver === true) return true
  }
  return false
}