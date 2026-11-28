const CACHE="colloexpres-v11";
const CORE=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest"];
self.addEventListener("install",event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(CORE);await self.skipWaiting();})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim();})()));
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET"||new URL(request.url).origin!==self.location.origin)return;
 const url=new URL(request.url);
 const isCore=url.pathname.endsWith("/")||/\\.(html|css|js)$/.test(url.pathname);
 if(isCore){
  event.respondWith((async()=>{try{const fresh=await fetch(request,{cache:"no-store"});if(fresh.ok){const cache=await caches.open(CACHE);await cache.put(request,fresh.clone());}return fresh;}catch(error){const cached=await caches.match(request);if(cached)return cached;throw error;}})());
 }else{
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
 }
});