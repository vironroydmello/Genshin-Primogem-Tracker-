/* =====================================================================================
   Primogem Tracker relay  (one free Cloudflare Worker that does two jobs)
   1) /uid/<UID>            Enka.Network profile, public, cached 60 s
   2) /v1/summary?uid=<UID> your HoYoLAB resin (Real-Time Notes) and this month's
                            primogem income (Traveler's Diary), PROTECTED by your token
   Your HoYoLAB login never goes into the app. It lives only here, as an encrypted secret.

   SET UP (about 10 minutes, once, on a computer)
   1. dash.cloudflare.com -> Workers & Pages -> Create -> Hello World -> Deploy -> Edit code.
      Paste this whole file, then Deploy.
   2. Worker -> Settings -> Variables and Secrets -> add these as type "Secret":
        HOYO_COOKIE  = ltuid_v2=NUMBER; ltoken_v2=LONG_TEXT
                       (log in at hoyolab.com on a computer, press F12, open Application (or
                        Storage) -> Cookies -> hoyolab.com, copy the values of ltuid_v2 and ltoken_v2)
        AUTH_TOKEN   = a long random password that you make up (the app asks for it)
      Optional (type "Text"):
        ALLOW_ORIGIN = the address of your tracker, e.g. https://yourname.github.io
        DS_SALT, APP_VERSION = only if HoYoLAB changes its signing; see CONFIG below
   3. In HoYoLAB: Battle Chronicle -> settings -> turn on "Real-Time Notes" and sharing.
   4. In the app: Home -> HoYoLAB sync -> paste the Worker address and your token -> Test connection.

   WHEN HOYOLAB CHANGES SOMETHING: only this file needs an update, never the app.
   The app only ever reads the fixed "schema 1" answer below, and every section can fail
   on its own without breaking the others.
   Using your HoYoLAB login with tools like this is unofficial. Read-only, at your own risk.
   ===================================================================================== */

const CONFIG = {
  schema: 1,
  relayVersion: '1.0',
  appVersions: ['1.5.0'],                                  // x-rpc-app_version values to try, in order
  dsSalts: ['6s25p5ox5y14umn1p61aqyyvbvvl3lrt'],           // overseas signing salt(s) to try, in order
  routes: {                                                // each list is tried in order
    notes: [
      'https://sg-public-api.hoyolab.com/event/game_record/genshin/api/dailyNote',
      'https://bbs-api-os.hoyolab.com/game_record/genshin/api/dailyNote'
    ],
    diary: ['https://sg-hk4e-api.hoyolab.com/event/ysledgeros/month_info']
  },
  cacheSeconds: { notes: 60, diary: 600 },
  lang: 'en-us'
};

/* HoYoLAB return codes -> stable names the app understands */
const CODES = { '-100': 'cookie_expired', '-101': 'cookie_expired', '10001': 'cookie_expired', '10101': 'rate_limited', '10102': 'not_public' };
const DEFINITIVE = ['cookie_expired', 'rate_limited', 'not_public'];

const num = x => (x === null || x === undefined || x === '' || !Number.isFinite(+x)) ? null : +x;
const serverOf = uid => ({ '6': 'os_usa', '7': 'os_euro', '8': 'os_asia', '9': 'os_cht' }[String(uid)[0]] || 'os_asia');

async function md5(text) {
  if (globalThis.__md5) return globalThis.__md5(text);                       // test hook only
  const buf = await crypto.subtle.digest('MD5', new TextEncoder().encode(text)); // supported in Cloudflare Workers
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function ds(salt) {
  const t = Math.floor(Date.now() / 1000);
  const r = Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 52)]).join('');
  return t + ',' + r + ',' + await md5('salt=' + salt + '&t=' + t + '&r=' + r);
}
const uniq = a => a.filter((v, i) => v && a.indexOf(v) === i);

async function hoyo(kind, params, env) {
  const salts = uniq([env.DS_SALT, ...CONFIG.dsSalts]), vers = uniq([env.APP_VERSION, ...CONFIG.appVersions]);
  let last = { code: 'unreachable' };
  for (const base of CONFIG.routes[kind]) for (const salt of salts) for (const ver of vers) {
    let res;
    try {
      res = await fetch(base + '?' + new URLSearchParams(params), { headers: {
        Cookie: env.HOYO_COOKIE, 'x-rpc-app_version': ver, 'x-rpc-client_type': '5',
        'x-rpc-language': CONFIG.lang, 'x-rpc-lang': CONFIG.lang, DS: await ds(salt),
        Origin: 'https://act.hoyolab.com', Referer: 'https://act.hoyolab.com/', Accept: 'application/json'
      } });
    } catch (e) { last = { code: 'unreachable' }; continue; }
    let j = null;
    try { j = await res.json(); } catch (e) { last = { code: 'bad_response', status: res.status }; continue; }
    if (j && j.retcode === 0 && j.data) return { ok: true, data: j.data };
    const code = CODES[String(j && j.retcode)] || 'api_changed';
    last = { code, retcode: j && j.retcode, message: j && j.message };
    if (DEFINITIVE.includes(code)) return { ok: false, ...last };
  }
  return { ok: false, ...last };
}

function normNotes(d) {
  return {
    resin: { cur: num(d.current_resin), max: num(d.max_resin), fullInSec: num(d.resin_recovery_time) },
    realm: { cur: num(d.current_home_coin), max: num(d.max_home_coin), fullInSec: num(d.home_coin_recovery_time) },
    commissions: { done: num(d.finished_task_num), total: num(d.total_task_num), claimed: !!d.is_extra_task_reward_received },
    expeditions: { active: Array.isArray(d.expeditions) ? d.expeditions.length : null, max: num(d.max_expedition_num) },
    discounts: { left: num(d.remain_resin_discount_num), max: num(d.resin_discount_num_limit) }
  };
}
function normDiary(d) {
  const m = d.month_data || {};
  return {
    month: num(d.data_month),
    primos: { thisMonth: num(m.current_primogems), lastMonth: num(m.last_primogems), ratePct: num(m.primogem_rate) },
    mora: { thisMonth: num(m.current_mora), lastMonth: num(m.last_mora) },
    sources: (Array.isArray(m.group_by) ? m.group_by : []).map(g => ({ id: num(g.action_id), name: String(g.action || ''), amount: num(g.num), pct: num(g.percent) }))
  };
}

async function cached(key, seconds, make) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const k = new Request('https://cache.local/' + key);
  if (cache) { const hit = await cache.match(k); if (hit) return hit.json(); }
  const val = await make();
  if (cache && val && val.ok) await cache.put(k, new Response(JSON.stringify(val), { headers: { 'cache-control': 'max-age=' + seconds } }));
  return val;
}

async function summary(uid, env, server) {
  const sv = server || serverOf(uid), out = { schema: CONFIG.schema, relay: CONFIG.relayVersion, fetchedAt: new Date().toISOString(), uid: String(uid), server: sv, notes: null, diary: null, errors: { notes: null, diary: null } };
  const month = new Date(Date.now() + 8 * 3600e3).getUTCMonth() + 1;           // HoYoLAB months follow UTC+8
  const [n, d] = await Promise.all([
    cached('notes/' + uid, CONFIG.cacheSeconds.notes, () => hoyo('notes', { server: sv, role_id: uid }, env)),
    cached('diary/' + uid + '/' + month, CONFIG.cacheSeconds.diary, () => hoyo('diary', { uid, region: sv, month, lang: CONFIG.lang }, env))
  ]);
  if (n.ok) out.notes = normNotes(n.data); else out.errors.notes = n.code;
  if (d.ok) out.diary = normDiary(d.data); else out.errors.diary = d.code;
  return out;
}

export default {
  async fetch(req, env, ctx) {
    const origin = env.ALLOW_ORIGIN || '*';
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '86400', vary: 'Origin' };
    const reply = (body, status = 200, extra = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors, ...extra } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(req.url);

    /* 1) Enka profile (public) */
    let m = url.pathname.match(/^\/uid\/(\d{9,10})$/);
    if (m) {
      const cache = typeof caches !== 'undefined' ? caches.default : null, key = new Request(url.origin + url.pathname);
      let res = cache && await cache.match(key);
      if (!res) {
        const up = await fetch('https://enka.network/api/uid/' + m[1], { headers: { 'User-Agent': 'PrimogemTracker/1.0 (personal pull tracker)' } });
        res = new Response(up.body, { status: up.status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=' + (up.ok ? 60 : 10) } });
        if (cache && up.ok) ctx.waitUntil(cache.put(key, res.clone()));
      }
      const out = new Response(res.body, res);
      for (const k in cors) out.headers.set(k, cors[k]);
      return out;
    }

    /* 2) health check (no secrets revealed) */
    if (url.pathname === '/v1/health') return reply({ ok: true, schema: CONFIG.schema, relay: CONFIG.relayVersion, hasCookie: !!env.HOYO_COOKIE, hasToken: !!env.AUTH_TOKEN });

    /* 3) HoYoLAB summary (protected) */
    if (url.pathname === '/v1/summary') {
      if (!env.AUTH_TOKEN) return reply({ error: 'no_token_set' }, 503);
      if ((req.headers.get('authorization') || '') !== 'Bearer ' + env.AUTH_TOKEN) return reply({ error: 'unauthorized' }, 401);
      if (!env.HOYO_COOKIE) return reply({ error: 'no_cookie_set' }, 503);
      const uid = url.searchParams.get('uid') || '';
      if (!/^\d{9,10}$/.test(uid)) return reply({ error: 'bad_uid' }, 400);
      return reply(await summary(uid, env, url.searchParams.get('server')));
    }
    return reply({ error: 'not_found', try: ['/uid/<UID>', '/v1/summary?uid=<UID>', '/v1/health'] }, 404);
  }
};
