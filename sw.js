// Dana Nails · muestra los avisos en la pantalla de notificaciones del teléfono,
// con la app abierta o cerrada (antes, con la app abierta, no se mostraban)
const APP = 'https://darix2801.github.io/dana-nails/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  const n = d.notification || {};
  const link = (d.fcmOptions && d.fcmOptions.link) || n.click_action || APP;
  e.waitUntil(self.registration.showNotification(n.title || 'Dana Nails', {
    body: n.body || 'Tienes un aviso nuevo de tus citas 💅',
    icon: n.icon || APP + 'icon-192.png',
    badge: n.badge || APP + 'icon-192.png',
    data: { link }
  }));
});

// al tocar la notificación se abre la app y muestra qué pasó con la cita
// (si ya estaba abierta, se trae al frente y se le pasa la notificación)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || APP;
  e.waitUntil((async () => {
    // se guarda también aquí: en iPhone la app a veces se abre sin el link de la notificación,
    // y la página lo lee de este lugar al abrir
    try { await (await caches.open('dn-aviso')).put(APP + '__aviso', new Response(JSON.stringify({ link, t: Date.now() }))); } catch (err) {}
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = lista.find(x => x.url.startsWith(APP)) || lista[0];
    if (c) {
      try { await c.focus(); } catch (err) {}
      c.postMessage({ tipo: 'aviso-dana', url: link });
      return;
    }
    await self.clients.openWindow(APP);
  })());
});
