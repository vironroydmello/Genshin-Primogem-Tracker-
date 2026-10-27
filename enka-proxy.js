// Free Cloudflare Worker that lets your tracker read Enka.Network profiles reliably.
// It adds the User-Agent Enka asks for, adds the permission headers browsers need,
// and keeps each answer for 60 seconds so you never hit Enka's rate limit.
export default {
  async fetch(req, env, ctx) {
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': '*',
      'access-control-max-age': '86400'
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);
    const m = url.pathname.match(/^\/uid\/(\d{9,10})$/);
    if (!m) return new Response('Use /uid/<your UID>', { status: 400, headers: cors });
    const cache = caches.default;
    const key = new Request(url.origin + url.pathname);
    let res = await cache.match(key);
    if (!res) {
      const up = await fetch('https://enka.network/api/uid/' + m[1], {
        headers: { 'User-Agent': 'PrimogemTracker/1.0 (personal wish and pull tracker)' }
      });
      res = new Response(up.body, {
        status: up.status,
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + (up.ok ? 60 : 10) }
      });
      if (up.ok) ctx.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const k in cors) out.headers.set(k, cors[k]);
    return out;
  }
};
