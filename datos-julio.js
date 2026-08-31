/* ============================================================
   LOS DATOS DE JULIO · respaldo

   Las pantallas de calendario de cobranza, conciliación y recibos
   todavía leen de los archivos data-*.js: la foto del CRM de
   julio. Esos archivos NO se despliegan, porque traen nombres,
   teléfonos y montos de clientes reales y no tienen por qué
   viajar a un servidor público.

   Sin ellos, esas pantallas tiraban ReferenceError y se llevaban
   la página entera. Aquí se declaran vacíos para que fallen
   solas y en silencio, no todo el portal.

   Migrar esas pantallas a Supabase es lo que falta para poder
   borrar los data-*.js del todo. Mientras tanto, `faltanDatosJulio()`
   permite avisar en pantalla en vez de mostrar cero sin explicación.

   Este archivo va ANTES que app.js.
   ============================================================ */
'use strict';
(() => {
  const vacios = {
    CALENDARIO: [], CONTRATOS_REALES: [], CONTRATOS_CARTERA: [],
    MORA_OFICIAL: [], RECIBOS_CRM: [], RECIBO_POR_REF: {},
    MORA_RESUMEN: { contratos: 0, monto: 0 }
  };
  const faltan = [];
  for (const [n, v] of Object.entries(vacios)) {
    if (typeof window[n] === 'undefined') { window[n] = v; faltan.push(n); }
  }
  window.__faltanJulio = faltan;
  window.faltanDatosJulio = () => faltan.length > 0;
  if (faltan.length) {
    console.info('[datos de julio] no cargados · las pantallas que dependen de ellos ' +
                 'van a salir vacías:', faltan.join(', '));
  }
})();
