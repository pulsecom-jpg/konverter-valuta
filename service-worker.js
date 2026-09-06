const C='pricelens-v5';
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(['/','/index.html','/manifest.webmanifest'])).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(async r=>{if(r)return r;try{let n=await fetch(e.request);if(n.ok){let u=new URL(e.request.url);if(u.origin===location.origin||u.hostname.includes('jsdelivr.net')||u.hostname.includes('projectnaptha.com'))(await caches.open(C)).put(e.request,n.clone());}return n}catch(x){if(e.request.mode==='navigate')return caches.match('/index.html');throw x}}))});
