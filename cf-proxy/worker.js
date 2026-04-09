// Cloudflare Worker — GitHub OAuth CORS proxy for MatchBook
// Deploy at: https://dash.cloudflare.com/workers

const ALLOWED_ORIGIN = 'https://avr2222.github.io'
const GITHUB_URLS = [
  'https://github.com/login/device/code',
  'https://github.com/login/oauth/access_token',
]

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || ''

    // Handle CORS preflight
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
