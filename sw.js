const CACHE="colloexpres-v45";
const CORE=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest"];
self.addEventListener("install",event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.all(CORE.map(async url=>{try{const response=await fetch(url);if(response.ok)await cache.put(url,response);}catch(_){}}));
 await self.skipWaiting();
})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(key=>key.startsWith("colloexpres-")&&key!==CACHE).map(key=>caches.delete(key)));
 await self.clients.claim();
})()));
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET"||new URL(request.url).origin!==self.location.origin)return;
 const url=new URL(request.url);
 const isCore=url.pathname.endsWith("/")||/\.(html|css|js|webmanifest)$/.test(url.pathname);
 if(!isCore)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached){fetch(request).then(response=>{if(response.ok)cache.put(request,response.clone());}).catch(()=>{});return cached;}
  const fresh=await fetch(request);
  if(fresh.ok)cache.put(request,fresh.clone());
  return fresh;
 })());
});
