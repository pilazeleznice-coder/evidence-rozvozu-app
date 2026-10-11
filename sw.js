'use strict';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
// Keep the existing app's network/storage behaviour: this worker only handles push.
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
