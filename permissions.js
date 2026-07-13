// permissions.js — gate granular (paginas/abas/acoes/campos)

// Esconde botoes [data-acao] dentro de [data-aba=X] sem permissao em
// permissoes_granular(pagina, aba, acao). Admin curto-circuita.
//
// Tambem aplica o gate `data-acao-lider`: elementos marcados (em qualquer
// lugar da pagina) ficam visiveis apenas para admin OU Lider/Co-Lider do
// ministerio atual (via `window.MINISTERIO_ID_ATUAL` setado pelo JS da
// pagina e `AUTH.lideres`).
function aplicarGateAcoesGranular(pagina) {
  if (!window.AUTH?.isAdmin) {
    document.querySelectorAll('[data-aba]').forEach(painel => {
      const aba = painel.dataset.aba
      painel.querySelectorAll('[data-acao]').forEach(btn => {
        const ok = (typeof temPermissaoAba === 'function')
          ? temPermissaoAba(pagina, aba, btn.dataset.acao)
          : true
        btn.style.display = ok ? '' : 'none'
      })
    })
  }
  // `data-acao-lider` roda DEPOIS pra que `display:none` aplicado aqui
  // não seja sobrescrito pelo gate granular (voluntário tem
  // escala::adicionar=true mas ainda assim não pode escalar).
  aplicarGateAcaoLider()
}

function aplicarGateAcaoLider() {
  if (window.AUTH?.isAdmin) {
    document.querySelectorAll('[data-acao-lider]').forEach(el => {
      if (el.style.display === 'none') el.style.display = ''
    })
    return
  }
  const minId = window.MINISTERIO_ID_ATUAL
  const ehLider = !!(minId && window.AUTH?.lideres?.has?.(minId))
  document.querySelectorAll('[data-acao-lider]').forEach(el => {
    el.style.display = ehLider ? '' : 'none'
  })
}

// Esconde o botao da aba (.aba-btn[data-aba]) e o painel (.aba-content[data-aba])
// quando o user nao tem ver=true em permissoes_granular(pagina, aba). Admin ve tudo.
function aplicarGateAbasGranular(pagina) {
  if (window.AUTH?.isAdmin) return
  if (typeof temPermissaoAba !== 'function') return
  document.querySelectorAll('.aba-btn[data-aba], .aba-content[data-aba]').forEach(el => {
    if (!temPermissaoAba(pagina, el.dataset.aba, 'ver')) el.style.display = 'none'
  })
}

// Espera o init de auth.js terminar (popular AUTH.permissoesGranular).
// auth.js dispara `auth:ready` quando _initDone vira true. Fallback de 3s.
async function aguardarAuthReady() {
  if (window.AUTH?._initDone) return
  await new Promise(resolve => {
    const onReady = () => { window.removeEventListener('auth:ready', onReady); resolve() }
    window.addEventListener('auth:ready', onReady)
    const iv = setInterval(() => {
      if (window.AUTH?._initDone) { clearInterval(iv); onReady() }
    }, 50)
    setTimeout(() => { clearInterval(iv); onReady() }, 3000)
  })
}


// ─── Permissões por campo ─────────────────────────────────────────────────────
function aplicarPermissoesCampos(pagina) {
  // Admin sempre tem acesso total — sai imediatamente
  if (window.AUTH?.isAdmin || window.AUTH?.perfil?.role === 'admin') return

  // Fase 2.2: shortcut `role === 'admin'` baseado em storage foi removido
  // (vetor de elevacao). Acima ja tratamos admin via AUTH.
  const role = getRoleSeguro()
  if (!role) return

  const salvo = sessionStorage.getItem(`permissoes_campos_${pagina}`)
  if (!salvo) {
    // Busca do banco se não estiver em cache
    carregarPermissoesCampos(pagina).then(() => aplicarPermissoesCampos(pagina))
    return
  }

  const perms = JSON.parse(salvo)

  // Tabela vazia = sem restrições configuradas = libera tudo
  if (Object.keys(perms).length === 0) return

  // Acesso total configurado (*) = libera tudo
  if (perms['*']?.ver) return

  // Aplica em elementos com data-campo
  document.querySelectorAll('[data-campo]').forEach(el => {
    const campo = el.dataset.campo
    const perm  = perms[campo] || { ver: true, editar: true } // sem regra = libera

    if (!perm.ver) {
      el.style.display = 'none'
      return
    }

    if (!perm.editar) {
      el.querySelectorAll('input, select, textarea')
        .forEach(input => {
          input.disabled = true
          input.style.background = '#f5f5f5'
          input.style.cursor = 'not-allowed'
        })
      if (['INPUT','SELECT','TEXTAREA'].includes(el.tagName)) {
        el.disabled = true
        el.style.background = '#f5f5f5'
        el.style.cursor = 'not-allowed'
      }
    }
  })

  ocultarColunasSemPermissao(perms)
}

async function carregarPermissoesCampos(pagina) {
  const role = getRoleSeguro()
  if (!role) return

  const { data } = await db
    .from('perfil_permissoes_campos')
    .select('campo, ver, editar')
    .eq('role', role)
    .eq('pagina', pagina)

  const mapa = {}
  ;(data || []).forEach(p => {
    if (p.campo === '*') {
      mapa['*'] = { ver: p.ver, editar: p.editar }
    } else {
      mapa[p.campo] = { ver: p.ver, editar: p.editar }
    }
  })

  sessionStorage.setItem(`permissoes_campos_${pagina}`, JSON.stringify(mapa))
}

function ocultarColunasSemPermissao(perms) {
  // Tabela vazia ou acesso total = não oculta nada
  if (!perms || Object.keys(perms).length === 0) return
  if (perms['*']?.ver) return

  const ths = document.querySelectorAll('thead th[data-campo]')
  ths.forEach(th => {
    const campo = th.dataset.campo
    const perm  = perms[campo] || { ver: true } // sem regra = mostra
    if (!perm.ver) {
      th.style.display = 'none'
      const idx = Array.from(th.parentElement.children).indexOf(th)
      document.querySelectorAll('tbody tr').forEach(tr => {
        const td = tr.children[idx]
        if (td) td.style.display = 'none'
      })
    }
  })
}