// Dana Nails · muestra los avisos en la pantalla de notificaciones del teléfono,
// con la app abierta o cerrada, y al tocarlos abre la app con lo que pasó
const VERSION_SW = 5;
const APP = 'https://darix2801.github.io/dana-nails/';

// registro de lo que pasa con los avisos (se ve en Ajustes → Notificaciones → Ver registro)
async function anotar(txt) {
  try {
    const c = await caches.open('dn-registro'), r = await c.match(APP + '__registro');
    const lista = r ? await r.json() : [];
    lista.push(new Date().toLocaleString('es', { timeZone: 'America/Caracas' }) + ' · ' + txt);
    await c.put(APP + '__registro', new Response(JSON.stringify(lista.slice(-20))));
  } catch (err) {}
}
const conTiempo = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r('tardó'), ms))]);

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(anotar('servicio de avisos v' + VERSION_SW + ' instalado')); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  const n = d.notification || {};
  const link = (d.fcmOptions && d.fcmOptions.link) || n.click_action || APP;
  e.waitUntil(Promise.all([
    self.registration.showNotification(n.title || 'Dana Nails', {
      body: n.body || 'Tienes un aviso nuevo de tus citas 💅',
      icon: n.icon || APP + 'icon-192.png',
      badge: n.badge || APP + 'icon-192.png',
      data: { link }
    }),
    anotar('llegó: ' + (n.title || 'aviso'))
  ]));
});

// Al tocar la notificación:
// - se guarda cuál se tocó, para que la app lo muestre al abrir
// - si la app ya está abierta (en esta dirección), se trae al frente y se le avisa
// - si no, se abre la app en su página de inicio. En iPhone esto es lo que evita la
//   pantalla en blanco: no se usa una ventana que no sea la de la app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || APP;
  e.waitUntil((async () => {
    try { await (await caches.open('dn-aviso')).put(APP + '__aviso', new Response(JSON.stringify({ link, t: Date.now() }))); } catch (err) {}
    const lista = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = lista.find(x => (x.url || '').startsWith(APP));
    await anotar(`tocada · ventanas: ${lista.length}${lista.length ? ' (' + lista.map(x => x.url || 'sin dirección').join(', ') + ')' : ''}`);
    if (c) {
      let r = 'ok';
      try { r = await conTiempo(c.focus(), 2000); } catch (err) { r = 'error ' + err.message; }
      c.postMessage({ tipo: 'aviso-dana', url: link });
      await anotar('app al frente: ' + (r === 'tardó' ? 'tardó' : typeof r === 'string' ? r : 'ok'));
      return;
    }
    try {
      const w = await self.clients.openWindow(APP);
      await anotar('app abierta: ' + (w ? 'ok' : 'sin ventana'));
    } catch (err) { await anotar('no se pudo abrir: ' + err.message); }
  })());
});
