// Dana Nails · avisos por WhatsApp a Dana (Cloudflare Worker)
// En Settings → Variables and Secrets agrega:
//   CALLMEBOT_KEY = el código (apikey) que le mandó CallMeBot a Dana   (tipo: Secret)
//   TELEFONO      = 584147149667  (el WhatsApp de Dana con código de país, sin + ni espacios)
const ORIGEN = 'https://darix2801.github.io';
const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/dana-nails/databases/(default)/documents/ocupado/';
const API_KEY = 'AIzaSyDyWK4vBeBvch-JYa5WhjoNHwfqGwv6448';
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export default {
  async fetch(req, env, ctx) {
    const cors = { 'Access-Control-Allow-Origin': ORIGEN, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('Avisos de Dana Nails funcionando 💅', { headers: cors });

    let d;
    try { d = await req.json(); } catch { return new Response('datos', { status: 400, headers: cors }); }
    if (!/^[A-Za-z0-9]{10,40}$/.test(d.id || '') || !['nueva', 'reprogramada'].includes(d.tipo))
      return new Response('datos', { status: 400, headers: cors });

    // 1) La cita tiene que existir de verdad: se revisa en las horas ocupadas (no tienen nombres ni teléfonos)
    const r = await fetch(FIRESTORE + d.id + '?key=' + API_KEY);
    if (!r.ok) return new Response('no existe', { status: 404, headers: cors });
    const f = (await r.json()).fields || {};
    const fecha = f.fecha?.stringValue, inicio = Number(f.inicio?.integerValue);
    if (!fecha || !Number.isFinite(inicio)) return new Response('no existe', { status: 404, headers: cors });

    // 2) No avisar dos veces la misma cita
    const marca = new Request(`https://avisos.dana-nails/${d.id}/${d.tipo}/${fecha}/${inicio}`);
    if (await caches.default.match(marca)) return new Response('ya avisado', { headers: cors });

    // 3) El mensaje: día y hora salen de la base de datos; nombre y servicio los manda la app
    const limpio = s => String(s || '').replace(/[\r\n*_~]+/g, ' ').trim().slice(0, 60);
    const [y, m, dd] = fecha.split('-').map(Number), dia = new Date(y, m - 1, dd);
    const hh = Math.floor(inicio / 60), mm = inicio % 60;
    const hora = `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'pm' : 'am'}`;
    const texto = [
      d.tipo === 'nueva' ? '📲 *Nueva cita en Dana Nails*' : '🔄 *Una clienta cambió su cita*',
      '',
      `👤 ${limpio(d.nombre)}`,
      `💅 ${limpio(d.servicio)}`,
      `📅 ${DIAS[dia.getDay()]} ${dd} de ${MESES[m - 1]} · 🕐 ${hora}`,
      ...(d.otroSistema ? ['✨ Viene con sistema de otro lado'] : []),
      '',
      'Confírmala en tu panel 💙'
    ].join('\n');

    const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent('+' + env.TELEFONO) +
      '&text=' + encodeURIComponent(texto) + '&apikey=' + encodeURIComponent(env.CALLMEBOT_KEY);
    const envio = await fetch(url);
    if (envio.ok) ctx.waitUntil(caches.default.put(marca, new Response('1', { headers: { 'Cache-Control': 'max-age=2592000' } })));
    return new Response(envio.ok ? 'enviado' : 'error al enviar', { status: envio.ok ? 200 : 502, headers: cors });
  }
};
