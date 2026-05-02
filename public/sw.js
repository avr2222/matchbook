const CACHE = 'matchbook-v2'

const SHELL = [
  '/matchbook/',
  '/matchbook/index.html',
]

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  // Delete all old cache versions (including matchbook-v1 with stale API responses)
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  // Never cache Supabase API calls — always network so deletes/updates are visible immediately
  if (url.hostname.includes('supabase.co')) {
    e.respondWith(fetch(request))
    return
  }

  // Never cache non-GET requests (POST, DELETE, PATCH, etc.)
  if (request.method !== 'GET') {
    e.respondWith(fetch(request))
    return
  }

  // Navigation: try network, fall back to cached shell for offline
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/matchbook/index.html'))
    )
    return
  }

  // JS/CSS/image assets: cache-first (Vite content-hashes them so cache is always fresh)
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
        }
        return res
      })
    })
  )
})
