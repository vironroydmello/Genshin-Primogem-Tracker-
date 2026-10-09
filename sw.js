const CACHE='primogem-tracker-v10'; // bump this number whenever you change the files
const ASSETS=['./','./index.html','./manifest.json','./roster.json','./icon-180.png','./icon-192.png','./icon-512.png'];
const FONT_HOSTS=['fonts.googleapis.com','fonts.gstatic.com'];
// Cache each file on its own, so one missing file (or a renamed index.html) can't break the whole install.
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.all(ASSETS.map(a=>c.add(a).catch(()=>{})))));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))));self.clients.claim()});
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
  // Banner roster: always try the network first so new leaks show up straight away, fall back to the saved copy offline.
  if(u.pathname.endsWith('/roster.json')){e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{if(res.ok){const c=res.clone();caches.open(CACHE).then(x=>x.put(r,c))}return res}).catch(()=>caches.match(r,{ignoreSearch:true})));return}
  // Same-origin: serve from cache instantly, refresh the cache in the background (updates arrive on the next open).
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>{
    const net=fetch(r).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put(r,res.clone()));return res}).catch(()=>hit||(r.mode==='navigate'?caches.match('./'):Response.error()));
    return hit||net;
  }));
});
