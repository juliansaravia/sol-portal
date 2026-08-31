/* ============================================================
   MARCA

   Dos niveles, y no hay que confundirlos:

     SOL INMOBILIARIA  es el suite. Lo ve el equipo.
     LA ESPERANZA      es el proyecto. Lo ve el cliente.

   Todo lo que sale hacia afuera — cotización, contrato, estado
   de cuenta, recibo — lleva la marca del PROYECTO, porque el
   comprador conoce La Esperanza, no Sol Inmobiliaria.

   ── El logo ──
   Se usa el archivo original, tal cual. No se redibuja ni se
   reinterpreta: un logo aproximado deja de ser el logo.

   El original está en assets/logo.svg — export de Illustrator,
   vectorial, en crema (#f4f1e7), pensado para ir sobre terracota.
   Para usarlo sobre fondo claro se cambia el color con `filtro`.

   Si falta el archivo, en vez de inventar un logo se muestra el
   nombre en texto — feo, pero se nota que falta.
   ============================================================ */

const MARCA = {
  RLE: {
    nombre: 'La Esperanza',
    bajada: 'Residencial',
    // Colores tomados del logo original
    terracota: '#B0562F',
    crema: '#F7F0E6',
    tinta: '#3A2318',
    // Rutas de los archivos de marca
    logo: 'assets/logo.svg',            // original, crema, vectorial
  }
};

const marcaDe = (codigo = 'RLE') => MARCA[codigo] || MARCA.RLE;

/**
 * El logo, desde el archivo original. No se redibuja.
 * @param {number} tam    alto en px
 * @param {string} sobre  'terracota' (el logo va crema, tal cual) |
 *                        'claro' (se tiñe de terracota para fondo blanco)
 */
function logoProyecto(tam = 64, sobre = 'terracota') {
  const m = marcaDe(typeof PROYECTO_ACTIVO !== 'undefined' ? PROYECTO_ACTIVO : 'RLE');
  const alt = `${m.nombre} ${m.bajada}`;
  // El archivo es crema. Sobre fondo claro se recolorea con un filtro CSS,
  // que no altera el dibujo — solo su color.
  const filtro = sobre === 'claro'
    ? 'filter:brightness(0) saturate(100%) invert(38%) sepia(38%) saturate(1180%) hue-rotate(338deg) brightness(94%) contrast(88%);'
    : '';
  return `<img src="${m.logo}" alt="${alt}"
     style="height:${tam}px;width:auto;display:block;${filtro}"
     onerror="this.onerror=null;this.outerHTML='<span class=&quot;marca-falta&quot;>${m.nombre}</span>';">`;
}

/** Logo con el nombre debajo. Para portadas. */
function marcaCompleta({ tam = 90, color = null, sobreTerracota = false } = {}) {
  const m = marcaDe();
  const c = color || (sobreTerracota ? m.crema : m.terracota);
  return `<div class="marca-completa" style="text-align:center;color:${c}">
    ${logoProyecto(tam, sobreTerracota ? 'terracota' : 'claro')}
    <div class="marca-nombre" style="color:${c}">${m.nombre}</div>
    <div class="marca-bajada" style="color:${c}">${m.bajada}</div>
  </div>`;
}

/** Membrete horizontal, para el encabezado de un documento. */
function membrete(subtitulo = '') {
  const m = marcaDe();
  return `<div class="membrete">
    <div class="membrete-logo">${logoProyecto(52, 'claro')}</div>
    <div class="membrete-txt">
      <div class="membrete-nombre">${m.nombre}</div>
      <div class="membrete-bajada">${m.bajada} · San Miguel Pochuta, Chimaltenango</div>
    </div>
    ${subtitulo ? `<div class="membrete-sub">${subtitulo}</div>` : ''}
  </div>`;
}
