/* ============================================================
   ¿HAY VERSIÓN NUEVA?

   El portal se despliega solo con cada cambio, pero una pestaña
   abierta sigue corriendo el código con el que arrancó. Cada 3
   minutos —y al volver a la pestaña— se pregunta al servidor la
   huella (ETag) de app.js. Si cambió, se avisa con un botón; y si no
   hay ningún modal ni cajón abierto, se recarga sola. Nadie tiene que
   acordarse de apretar F5.
   ============================================================ */
'use strict';
(() => {
  /* Sólo en un navegador de verdad: en las pruebas (vm de Node) un
     setInterval vivo dejaba el proceso colgado para siempre. */
  if (typeof location === 'undefined' || !/^https?:/.test(String(location.href || '')) || typeof fetch !== 'function') return;
  let huella = null;
  async function huellaActual() {
    try {
      const r = await fetch('app.js', { method: 'HEAD', cache: 'no-store' });
      return r.headers.get('etag') || r.headers.get('last-modified') || null;
    } catch (e) { return null; }
  }
  function ocupado() {
    const m = document.getElementById('modalScrim'), d = document.getElementById('drawer');
    return (m && !m.hidden) || (d && !d.hidden) || (typeof SCREEN !== 'undefined' && SCREEN === 'login');
  }
  function avisar() {
    if (document.getElementById('avisoVersion')) return;
    const b = document.createElement('div');
    b.id = 'avisoVersion';
    b.innerHTML = 'Hay una versión nueva del suite. <button onclick="location.reload()">Actualizar</button>';
    document.body.appendChild(b);
  }
  async function revisar() {
    const h = await huellaActual(); if (!h) return;
    if (huella === null) { huella = h; pintarVersion(h); return; }
    if (h !== huella) { if (ocupado()) avisar(); else location.reload(); }
  }
  function pintarVersion(h) {
    const f = document.querySelector('.sidebar-foot'); if (!f) return;
    const v = document.createElement('div'); v.className = 'hint'; v.style.marginTop = '6px';
    v.textContent = 'Versión ' + String(h).replace(/\W/g, '').slice(-8);
    f.appendChild(v);
  }
  revisar();
  setInterval(revisar, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revisar(); });
})();
