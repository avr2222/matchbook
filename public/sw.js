const CACHE = 'matchbook-v1'

// App shell files to pre-cache on install
const SHELL = [
  '/matchbook/',
  '/matchbook/index.html',
]

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  // Remove old cache versions
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

  // Data JSON files: network-first so players always see fresh data
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    e.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
          return res
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // Navigation (page loads): serve cached index.html so the app works offline
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/matchbook/index.html'))
    )
    return
  }

  // JS/CSS/assets: cache-first (they're content-hashed by Vite, safe to cache forever)
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(res => {
        if (res.ok && request.method === 'GET') {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(request, clone))
        }
        return res
      })
    })
  )
})
