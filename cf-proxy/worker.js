// Cloudflare Worker — GitHub OAuth CORS proxy + CricHeroes scrape proxy for MatchBook
// Deploy at: https://dash.cloudflare.com/workers

const ALLOWED_ORIGIN = 'https://avr2222.github.io'
const GITHUB_URLS = [
  'https://github.com/login/device/code',
  'https://github.com/login/oauth/access_token',
]

const CRICHEROES_HOST = 'cricheroes.com'

export default {
  async fetch(req) {
    const url = new URL(req.url)

    // ── CricHeroes scrape proxy (GET /cricheroes?url=...) ──────────────────────
    // Cloudflare edge IPs are not blocked by CricHeroes, unlike GitHub Actions IPs.
    if (req.method === 'GET' && url.pathname === '/cricheroes') {
      const target = url.searchParams.get('url')
      if (!target) {
        return new Response('Missing url parameter', { status: 400 })
      }
      let targetUrl
      try {
        targetUrl = new URL(target)
      } catch {
        return new Response('Invalid url parameter', { status: 400 })
      }
      if (targetUrl.hostname !== CRICHEROES_HOST && !targetUrl.hostname.endsWith('.' + CRICHEROES_HOST)) {
        return new Response('Only cricheroes.com URLs are allowed', { status: 403 })
      }
      const chRes = await fetch(targetUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      const body = await chRes.arrayBuffer()
      return new Response(body, {
        status: chRes.status,
        headers: {
          'Content-Type': chRes.headers.get('Content-Type') || 'text/html; charset=utf-8',
        },
      })
    }

    // ── GitHub OAuth CORS proxy (POST) ─────────────────────────────────────────

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept',
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    const target = req.headers.get('X-Target-URL')
    if (!target || !GITHUB_URLS.includes(target)) {
      return new Response('Invalid target', { status: 400 })
    }

    const body = await req.text()
    const ghRes = await fetch(target, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })

    const data = await ghRes.text()
    return new Response(data, {
      status: ghRes.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      },
    })
  },
}
