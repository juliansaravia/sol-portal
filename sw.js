/* ============================================================
   SERVICE WORKER · el portal abre rápido y aguanta señal mala

   Red primero, con copia local de respaldo: cada archivo del portal
   se pide al servidor (así una versión nueva llega sola) y, si la red
   tarda más de 6 s o falla, se sirve la última copia guardada. Lo de
   Supabase y los CDN nunca se guardan: datos y sesión siempre vivos.
   ============================================================ */
'use strict';
const CACHE = 'sol-portal-v1';
const NUCLEO = ['/', 'vendedor.html', 'admin.html', 'styles.css', 'app.js', 'store.js', 'escribir.js', 'datos-remotos.js',
  'supabase.js', 'mfa.js', 'comisiones.js', 'contrato.js', 'cotizacion.js', 'ocr.js', 'expedientes.js', 'permisos.js',
  'data.js', 'datos-julio.js', 'config-supabase.js', 'version.js', 'assets/lotes-geo.js', 'assets/lotes-shape.js',
  'assets/marca.js', 'assets/icono-192.png', 'assets/icono-512.png', 'assets/icono.svg', 'assets/logo.svg'];
const ESPERA_MS = 6000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(NUCLEO.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // Supabase, CDN: directo
  if (url.pathname === '/sw.js') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ESPERA_MS);
    try {
      const r = await fetch(req, { signal: ctl.signal });
      clearTimeout(t);
      if (r && r.ok && r.type === 'basic') cache.put(req, r.clone()).catch(() => {});
      return r;
    } catch (err) {
      clearTimeout(t);
      const guardado = await cache.match(req, { ignoreSearch: true });
      if (guardado) return guardado;
      if (req.mode === 'navigate') { const raiz = await cache.match('/'); if (raiz) return raiz; }
      throw err;
    }
  })());
});
