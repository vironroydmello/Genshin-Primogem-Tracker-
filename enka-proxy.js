// Cloudflare Worker: lets the Primogem Tracker read Enka profiles (Enka blocks direct browser calls).
// Setup (free, ~2 minutes): Cloudflare dashboard > Workers & Pages > Create > Hello World > Deploy > Edit code,
// paste this file, Deploy. Then paste  https://YOUR-NAME.workers.dev/?uid={uid}  into the tracker
// (Home > Traveler profile > "Can't load it?" > Your own proxy).
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};
export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const u = new URL(req.url);
    const uid = u.searchParams.get('uid') || u.pathname.split('/').pop();
    if (!/^\d{9,10}$/.test(uid || '')) return new Response('Bad UID', { status: 400, headers: CORS });
    const r = await fetch('https://enka.network/api/uid/' + uid, {
      headers: { 'User-Agent': 'PrimogemTracker/1.0 (personal wish planner)' },
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    return new Response(r.body, { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  },
};
