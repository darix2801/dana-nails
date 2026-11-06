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

// al tocar la notificación se abre la app (o se trae al frente si ya está abierta)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || APP;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    for (const c of lista) if ('focus' in c) return c.focus();
    return self.clients.openWindow(link);
  }));
});
