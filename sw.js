const BUILD='18.3+9b4b3de1'; // stamped by build.js: the same value is shown in the app, so the cache and the version never drift apart
const CACHE='primogem-tracker-'+BUILD;
const ASSETS=['./','./index.html','./manifest.json','./roster.json','./rules.json','./icon-180.png','./icon-192.png','./icon-512.png'];
const FONT_HOSTS=['fonts.googleapis.com','fonts.gstatic.com'];
// Cache each file on its own, so one missing file can't break the whole install. 'reload' skips the browser's HTTP cache.
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(ASSETS.map(a=>c.add(new Request(a,{cache:'reload'})).catch(()=>{})))));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim()});
// The page can ask a waiting worker to take over (used by the "Update available" toast)
self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET')return;
  const u=new URL(r.url);
  // Google Fonts: keep a copy after the first online visit so the heading font also works offline
  if(FONT_HOSTS.includes(u.hostname)){
    e.respondWith(caches.open(CACHE).then(c=>c.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok||res.type==='opaque')c.put(r,res.clone());return res}).catch(()=>Response.error()))));
    return;
  }
  if(u.origin!==location.origin)return;
  // Banner roster and reward rules (data only): network first (4 s limit), saved copy offline
  if(u.pathname.endsWith('/roster.json')||u.pathname.endsWith('/rules.json')){
    const net=fetch(r,{cache:'no-cache'}).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(x=>x.put(r,c))}return res});
    const slow=new Promise((_,no)=>setTimeout(no,4000));
    e.respondWith(Promise.race([net,slow]).catch(()=>caches.match(r,{ignoreSearch:true}).then(hit=>hit||net)));return}
  // Everything else: from the cache instantly, refreshed in the background. A changed file means a new BUILD, so a new worker, so the app shows "Update available".
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>{
    const net=fetch(r,{cache:'no-cache'}).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put(r,res.clone()));return res}).catch(()=>hit||(r.mode==='navigate'?caches.match('./'):Response.error()));
    return hit||net;
  }));
});
