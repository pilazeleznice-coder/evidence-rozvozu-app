'use strict';
const SHELL_CACHE='pz-evidence-shell-sync-1';
const SHELL=['./','./index.html','./manifest.webmanifest','./push-config.js','./push-model.js','./push-client.js','./push-settings.css','./cloud-auth.js','./sync-model.js','./sync-client.js','./sync-settings.css','./vendor/supabase-2.117.3.js','./icon-192.png','./icon-512.png'];
self.addEventListener('install', event => event.waitUntil((async()=>{const cache=await caches.open(SHELL_CACHE);await cache.addAll(SHELL);await self.skipWaiting();})()));
self.addEventListener('activate', event => event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('pz-evidence-shell-')&&key!==SHELL_CACHE)await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url),base=new URL(self.registration.scope);
 if(event.request.method!=='GET'||url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return;
 const relative=url.pathname.slice(base.pathname.length),isNavigation=event.request.mode==='navigate';
 if(!isNavigation&&!SHELL.some(x=>x.replace('./','')===relative)&&!['AK.png','TRM.png','TRMS.png','TRV.png','TRVS.png'].includes(relative))return;
 event.respondWith((async()=>{
  const cache=await caches.open(SHELL_CACHE),key=isNavigation?new URL('./index.html',base).href:event.request;
  try{const response=await fetch(event.request,{signal:AbortSignal.timeout(5000)});if(response.ok)await cache.put(key,response.clone());return response;}
  catch(error){const saved=await cache.match(key);if(saved)return saved;throw error;}
 })());
});
self.addEventListener('push', event => {
 event.waitUntil((async () => {
  let message; try { message = event.data.json(); } catch { return; }
  if (!message || (message.expiresAt && Date.now() > message.expiresAt)) return;
  const base = new URL(self.registration.scope), target = new URL(message.url || base.href, base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) return;
  await self.registration.showNotification(String(message.title || 'Evidence rozvozů'), {
   body: String(message.body || ''), tag: String(message.tag || 'pz-push'), renotify: true,
   data: { url: target.href, rideId: String(message.rideId || '') }, vibrate: [200,100,200],
   requireInteraction: true
  });
 })());
});
self.addEventListener('notificationclick', event => {
 event.notification.close();
 event.waitUntil((async () => {
  const base = new URL(self.registration.scope), target = new URL(event.notification.data?.url || base.href, base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) return;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing = windows.find(client => client.url.startsWith(base.href));
  if (existing) { existing.postMessage({ type: 'PZ_OPEN_RIDE', rideId: event.notification.data?.rideId }); await existing.focus(); }
  else await self.clients.openWindow(target.href);
 })());
});
