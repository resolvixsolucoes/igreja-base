// ================================================================
//  Ministério Semente — PWA Registration & Install Prompt
// ================================================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        reg.addEventListener('updatefound', () => {
          const novo = reg.installing
          novo.addEventListener('statechange', () => {
            if (novo.state === 'installed' && navigator.serviceWorker.controller) {
              mostrarToastUpdate()
            }
          })
        })
      })
      .catch(err => console.warn('[PWA] Falha no registro:', err))
  })
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload())
}

function mostrarToastUpdate() {
  const toast = document.createElement('div')
  toast.innerHTML = `<span>🔄 Nova versão disponível!</span>
    <button onclick="navigator.serviceWorker.controller.postMessage('SKIP_WAITING')"
      style="margin-left:12px;background:white;color:#6b8e4e;border:none;border-radius:8px;
             padding:5px 12px;font-weight:700;cursor:pointer;font-size:13px;">Atualizar</button>
    <button onclick="this.parentElement.remove()"
      style="margin-left:6px;background:transparent;color:rgba(255,255,255,0.7);border:none;
             cursor:pointer;font-size:16px;padding:0 4px;">✕</button>`
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#6b8e4e;color:white;padding:12px 20px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.2);display:flex;align-items:center;z-index:99999;font-size:14px;font-weight:600;white-space:nowrap;'
  document.body.appendChild(toast)
}

let _deferredPrompt = null
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  _deferredPrompt = e
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    const btn = document.createElement('button')
    btn.id = 'pwa-install-btn'
    btn.innerHTML = '📲 Instalar app'
    btn.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#6b8e4e;color:white;border:none;border-radius:12px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(107,142,78,.4);z-index:9998;'
    btn.onclick = async () => {
      _deferredPrompt.prompt()
      await _deferredPrompt.userChoice
      _deferredPrompt = null
      btn.remove()
    }
    document.body.appendChild(btn)
    setTimeout(() => btn.remove(), 15000)
  }
})
window.addEventListener('appinstalled', () => document.getElementById('pwa-install-btn')?.remove())

// ================================================================
//  MENU HAMBÚRGUER — Mobile sidebar toggle
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
  const sidebar = document.querySelector('.sidebar')
  if (!sidebar) return

  // ── Cria botão hambúrguer ──
  const btn = document.createElement('button')
  btn.id = 'sidebar-toggle-btn'
  btn.setAttribute('aria-label', 'Menu')
  btn.style.cssText = [
    'display:none',
    'position:fixed',
    'top:12px',
    'left:12px',
    'z-index:400',
    'width:42px',
    'height:42px',
    'background:#6b8e4e',
    'border:none',
    'border-radius:10px',
    'cursor:pointer',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:5px',
    'box-shadow:0 2px 10px rgba(0,0,0,0.25)',
    'padding:0',
  ].join(';')
  btn.innerHTML = `
    <span style="display:block;width:20px;height:2px;background:white;border-radius:2px;"></span>
    <span style="display:block;width:20px;height:2px;background:white;border-radius:2px;"></span>
    <span style="display:block;width:20px;height:2px;background:white;border-radius:2px;"></span>
  `
  document.body.appendChild(btn)

  // ── Cria overlay ──
  const overlay = document.createElement('div')
  overlay.id = 'sidebar-overlay'
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:250;pointer-events:none;'
  document.body.appendChild(overlay)

  // ── Funções ──
  function abrirSidebar() {
    sidebar.style.transform = 'translateX(0)'
    overlay.style.display = 'block'
    overlay.style.pointerEvents = 'auto'
    document.body.style.overflow = 'hidden'
    btn.innerHTML = `<span style="display:block;width:20px;height:2px;background:white;border-radius:2px;transform:rotate(45deg) translate(5px,5px);"></span>
      <span style="display:block;width:20px;height:2px;background:white;border-radius:2px;opacity:0;"></span>
      <span style="display:block;width:20px;height:2px;background:white;border-radius:2px;transform:rotate(-45deg) translate(5px,-5px);"></span>`
  }

  function fecharSidebar() {
    sidebar.style.transform = 'translateX(-100%)'
    overlay.style.display = 'none'
    overlay.style.pointerEvents = 'none'
    document.body.style.overflow = ''
    btn.innerHTML = `
      <span style="display:block;width:20px;height:2px;background:white;border-radius:2px;"></span>
      <span style="display:block;width:20px;height:2px;background:white;border-radius:2px;"></span>
      <span style="display:block;width:20px;height:2px;background:white;border-radius:2px;"></span>
    `
  }

  function toggleSidebar() {
    const fechada = sidebar.style.transform === 'translateX(-100%)' || sidebar.style.transform === ''
    if (fechada) abrirSidebar()
    else fecharSidebar()
  }

  // ── Aplica estado inicial por tamanho de tela ──
  function aplicarEstado() {
    if (window.innerWidth <= 768) {
      btn.style.display = 'flex'
      sidebar.style.transition = 'transform 0.3s ease'
      sidebar.style.transform = 'translateX(-100%)'
    } else {
      btn.style.display = 'none'
      sidebar.style.transform = ''
      sidebar.style.transition = ''
      overlay.style.display = 'none'
      overlay.style.pointerEvents = 'none'
      document.body.style.overflow = ''
    }
  }

  // ── Eventos ──
  btn.addEventListener('click', toggleSidebar)
  overlay.addEventListener('click', fecharSidebar)

  sidebar.querySelectorAll('nav a').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth <= 768) fecharSidebar()
    })
  })

  window.addEventListener('resize', aplicarEstado)
  aplicarEstado()
})