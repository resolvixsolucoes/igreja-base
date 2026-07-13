// ================================================================
//  Ministério Semente — Service Worker (Network First)
//  Sempre busca versão mais nova da internet.
//  Usa cache apenas se estiver offline.
// ================================================================

// CACHE_NAME usa um placeholder que o Vercel substitui pelo SHA do
// commit no build (ver vercel.json -> buildCommand). Cada deploy gera
// nome unico, forcando o service worker a invalidar caches antigos no
// activate. Em dev local sem build, fica literal — funcional, mas sem
// invalidacao automatica.
const CACHE_NAME    = 'sua-igreja-__BUILD_SHA__'
const CACHE_OFFLINE = 'sua-igreja-offline'

// Arquivos para cache inicial (shell do app)
const SHELL = [
  '/dashboard.html',
  '/style.css',
  '/auth.js',
  '/supabase.js',
  '/logo.png',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
]

// ── Install: faz cache do shell ───────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  )
})

// ── Activate: remove caches antigos ──────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== CACHE_OFFLINE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch: Network First ──────────────────────────────────────────
self.addEventListener('fetch', e => {
  // Ignora requisições não-GET e requests externos (Supabase, Spotify etc.)
  const url = new URL(e.request.url)
  const isLocal = url.origin === self.location.origin
  if (e.request.method !== 'GET' || !isLocal) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Se veio da rede, atualiza o cache
        if (res && res.status === 200) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone))
        }
        return res
      })
      .catch(() =>
        // Offline: usa cache
        caches.match(e.request)
          .then(cached => cached || caches.match('/dashboard.html'))
      )
  )
})

// ── Mensagem do cliente para forçar update ────────────────────────
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting()
})