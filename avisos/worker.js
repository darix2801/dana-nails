// Dana Nails · avisos a Dana cuando una clienta agenda, cambia o cancela (Cloudflare Worker)
// Manda una notificación al teléfono de Dana (y WhatsApp si se configura CallMeBot).
//
// En Settings → Variables and Secrets agrega:
//   FIREBASE_SA   (Secret)  = todo el texto del archivo .json de la cuenta de servicio de Firebase
//   CALLMEBOT_KEY (Secret, opcional) y TELEFONO (Text, opcional, ej. 584147149667) para WhatsApp
const ORIGEN = 'https://darix2801.github.io';
const PROYECTO = 'dana-nails';
const DANA_UID = 'g9fF6IX7VhN78bwys1VfyGcCRDd2';
const API_KEY = 'AIzaSyDyWK4vBeBvch-JYa5WhjoNHwfqGwv6448';
const APP = 'https://darix2801.github.io/dana-nails/';
const FS = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents`;
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// "2026-11-10", "08:00" -> "martes 10 de noviembre, 8:00 am"
function cuando(fecha, hora) {
  const [y, m, d] = fecha.split('-').map(Number), [hh, mm] = hora.split(':').map(Number);
  return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]}, ${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'pm' : 'am'}`;
}

// ---- permiso de Google con la cuenta de servicio (se renueva cada hora) ----
let permiso = null;
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const txt64u = t => b64u(new TextEncoder().encode(t));
async function tokenGoogle(env) {
  if (permiso && permiso.vence > Date.now() + 60000) return permiso.token;
  const sa = JSON.parse(env.FIREBASE_SA), ahora = Math.floor(Date.now() / 1000);
  const cab = txt64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const datos = txt64u(JSON.stringify({
    iss: sa.client_email, aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore'
  }));
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), c => c.charCodeAt(0));
  const llave = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', llave, new TextEncoder().encode(cab + '.' + datos));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + cab + '.' + datos + '.' + b64u(firma)
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('No se pudo entrar a Google: ' + JSON.stringify(j));
  permiso = { token: j.access_token, vence: Date.now() + (j.expires_in || 3600) * 1000 };
  return permiso.token;
}

// ---- Firestore ----
const valor = f => f == null ? null : 'stringValue' in f ? f.stringValue : 'integerValue' in f ? Number(f.integerValue)
  : 'doubleValue' in f ? f.doubleValue : 'booleanValue' in f ? f.booleanValue : null;
async function leerCita(id, tk) {
  const r = await fetch(`${FS}/citas/${id}`, { headers: { Authorization: 'Bearer ' + tk } });
  if (!r.ok) return null;
  const f = (await r.json()).fields || {}, c = {};
  for (const k in f) c[k] = valor(f[k]);
  return c;
}
async function telefonosDana(tk) {
  const r = await fetch(`${FS}/tokens?pageSize=50`, { headers: { Authorization: 'Bearer ' + tk } });
  const j = await r.json();
  return (j.documents || []).map(d => decodeURIComponent(d.name.split('/').pop()));
}
async function enviarPush(tk, token, titulo, cuerpo, link = APP) {
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${PROYECTO}/messages:send`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, webpush: {
      notification: { title: titulo, body: cuerpo, icon: APP + 'icon-192.png', badge: APP + 'icon-192.png' },
      fcm_options: { link } } } })
  });
  if (r.ok) return true;
  const t = await r.text();
  if (/UNREGISTERED|NOT_FOUND/.test(t)) // ese teléfono ya no recibe: se borra
    await fetch(`${FS}/tokens/${encodeURIComponent(token)}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tk } });
  return false;
}

export default {
  async fetch(req, env, ctx) {
    const cors = { 'Access-Control-Allow-Origin': ORIGEN, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    const resp = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('Avisos de Dana Nails funcionando 💅', { headers: cors });
    let d;
    try { d = await req.json(); } catch { return resp({ error: 'datos' }, 400); }
    try {
      const tk = await tokenGoogle(env);
      let titulo, cuerpo, marca = null, link = APP;

      if (d.tipo === 'prueba') {
        // solo Dana puede pedir una prueba: se revisa su sesión
        const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: d.idToken || '' }) });
        const j = await r.json();
        if (j.users?.[0]?.localId !== DANA_UID) return resp({ error: 'Solo Dana puede enviar pruebas' }, 403);
        titulo = '🔔 ¡Listo, Dana!'; cuerpo = 'Así te van a llegar los avisos de tus citas 💅';
      } else {
        if (!/^[A-Za-z0-9]{10,40}$/.test(d.id || '') || !['nueva', 'reprogramada', 'cancelada'].includes(d.tipo)) return resp({ error: 'datos' }, 400);
        // los datos salen de la cita guardada en Firebase, no de lo que mande la página
        const c = await leerCita(d.id, tk);
        if (!c) return resp({ error: 'no existe' }, 404);
        const real = d.tipo === 'cancelada' ? (c.estado === 'cancelada' && c.canceladaPor === 'clienta')
          : (c.estado === 'pendiente' && c.creadaPor !== 'manicurista');
        if (!real) return resp({ error: 'no coincide' }, 409);
        marca = new Request(`https://avisos.dana-nails/${d.id}/${d.tipo}/${c.fecha}/${c.hora}`);
        if (await caches.default.match(marca)) return resp({ enviados: 0, nota: 'ya avisado' });
        // fecha y hora de antes (solo al cambiar la cita): "2026-11-10T08:00"
        const antes = d.tipo === 'reprogramada' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d.antes || '') ? d.antes.split('T') : null;
        const quien = (c.nombre || 'Una clienta').trim(), serv = (c.servicioNombre || 'Servicio').replace(/Pies cl[aá]sico/i, 'Pies semipermanente');
        const nueva = cuando(c.fecha, c.hora);
        if (d.tipo === 'cancelada') {
          titulo = '💔 Cita cancelada';
          cuerpo = `${quien} canceló su cita de ${serv} del ${nueva}`;
        } else if (d.tipo === 'reprogramada') {
          titulo = '🔄 Cita cambiada';
          cuerpo = `${quien} cambió su cita${antes ? ` del ${cuando(antes[0], antes[1])}` : ''} para el ${nueva}`;
        } else {
          titulo = '📲 Nueva cita';
          cuerpo = `${quien} agendó ${serv} para el ${nueva}` + (c.otroSistema ? '. Viene con sistema de otro lado' : '');
        }
        // al tocar la notificación, la app abre la cita y explica qué pasó
        link = `${APP}?aviso=${d.tipo}&cita=${d.id}` + (antes ? `&antes=${antes[0]}T${antes[1]}` : '');
      }

      const telefonos = await telefonosDana(tk);
      let enviados = 0;
      for (const t of telefonos) if (await enviarPush(tk, t, titulo, cuerpo, link)) enviados++;

      // WhatsApp (opcional, si CallMeBot está configurado)
      if (env.CALLMEBOT_KEY && env.TELEFONO && d.tipo !== 'prueba') {
        const url = 'https://api.callmebot.com/whatsapp.php?phone=' + encodeURIComponent('+' + env.TELEFONO) +
          '&text=' + encodeURIComponent(`*${titulo}*\n${cuerpo}`) + '&apikey=' + encodeURIComponent(env.CALLMEBOT_KEY);
        ctx.waitUntil(fetch(url).catch(() => {}));
      }
      if (marca && enviados) ctx.waitUntil(caches.default.put(marca, new Response('1', { headers: { 'Cache-Control': 'max-age=2592000' } })));
      return resp({ enviados, telefonos: telefonos.length, error: telefonos.length ? undefined : 'Dana no ha activado las notificaciones en ningún teléfono' });
    } catch (e) {
      return resp({ error: String(e.message || e) }, 500);
    }
  }
};
