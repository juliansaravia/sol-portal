/* ============================================================
   LEER LA BOLETA · el número de referencia se llena solo

   Al elegir la foto de una boleta de transferencia, se lee el texto
   con Tesseract (OCR en el navegador: la imagen no sale del teléfono)
   y se buscan la referencia y el monto. Se llenan los campos vacíos y
   se avisa qué se leyó, para que quien cobra revise y guarde.

   Tesseract pesa ~2 MB y se descarga la primera vez que hace falta,
   no al abrir el portal. Si falla o no encuentra nada, no pasa nada:
   se escribe a mano como siempre.
   ============================================================ */
'use strict';

const OCR_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js';
let _ocrCarga = null;
function cargarTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (_ocrCarga) return _ocrCarga;
  _ocrCarga = new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = OCR_CDN;
    s.onload = () => ok(window.Tesseract); s.onerror = () => no(new Error('No se pudo cargar el lector de boletas'));
    document.head.appendChild(s);
  });
  return _ocrCarga;
}

/* La foto se reduce a 1600 px: más rápido y lee igual de bien. */
async function imagenReducida(archivo) {
  if (!/^image\//.test(archivo.type)) return null;      // un PDF no se lee acá
  const img = new Image(); const url = URL.createObjectURL(archivo);
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
  const esc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * esc); c.height = Math.round(img.naturalHeight * esc);
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c;
}

/* Cuentas propias: un número de cuenta nunca es la referencia. */
const CUENTAS_PROPIAS = () => (typeof CUENTAS_COBRO !== 'undefined' ? CUENTAS_COBRO.map(c => c.numero) : []);

/* De un texto de boleta, qué es la referencia y cuánto el monto. */
function interpretarBoleta(texto) {
  const t = String(texto || '').replace(/[|]/g, '1');
  const propias = CUENTAS_PROPIAS();
  const esFecha = n => /^(19|20)\d{6}$/.test(n) || /^\d{2}(0[1-9]|1[0-2])\d{4}$/.test(n);
  let referencia = null, motivo = '';

  // 1· Con etiqueta: «Referencia», «Ref.», «Autorización», «No. de documento», «Comprobante»
  const conEtiqueta = t.match(/(referencia|ref\.?|autorizaci[oó]n|documento|comprobante|transacci[oó]n)\s*(?:no\.?|n[°º]|#|:)?[^\d\n]{0,12}(\d[\d\s-]{5,16}\d)/i);
  if (conEtiqueta) { referencia = conEtiqueta[2].replace(/[\s-]/g, ''); motivo = 'junto a «' + conEtiqueta[1] + '»'; }

  // 2· Sin etiqueta: el número largo que no es cuenta ni fecha ni monto
  if (!referencia) {
    const nums = (t.match(/\d[\d\s-]{6,16}\d/g) || []).map(n => n.replace(/[\s-]/g, ''))
      .filter(n => n.length >= 7 && n.length <= 14 && !propias.includes(n) && !esFecha(n));
    if (nums.length) { referencia = nums.sort((a, b) => b.length - a.length)[0]; motivo = 'el número más largo de la boleta'; }
  }

  // Monto: «Monto/Total/Valor … Q 2,500.00» o cualquier cantidad con centavos
  let monto = null;
  const m1 = t.match(/(monto|total|valor|importe|cantidad)[^\d\n]{0,14}q?\s*\.?\s*([\d.,]+[.,]\d{2})/i) || t.match(/\bQ\s*\.?\s*([\d.,]+[.,]\d{2})/);
  if (m1) { const raw = (m1[2] || m1[1]).replace(/\.(?=\d{3}(\D|$))/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.'); const v = parseFloat(raw); if (v > 0 && v < 5000000) monto = Math.round(v * 100) / 100; }

  // Fecha dd/mm/aaaa
  let fecha = null;
  const f = t.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})/);
  if (f) fecha = `${f[3]}-${f[2].padStart(2, '0')}-${f[1].padStart(2, '0')}`;

  return { referencia, monto, fecha, motivo };
}

/**
 * Lee la boleta y llena los campos que estén vacíos.
 * @param {HTMLInputElement} input   el <input type=file>
 * @param {{ref?:string, monto?:string, aviso?:string}} ids  ids de los campos a llenar
 */
async function leerBoletaEn(input, ids) {
  const archivo = input && input.files && input.files[0]; if (!archivo) return;
  const aviso = ids.aviso ? document.getElementById(ids.aviso) : null;
  const decir = (msg, err) => { if (aviso) { aviso.textContent = msg; aviso.style.color = err ? '#B8452E' : 'var(--green)'; } };
  if (!/^image\//.test(archivo.type)) { decir('Es un PDF: la referencia se escribe a mano.'); return; }
  decir('Leyendo la boleta…');
  try {
    const T = await cargarTesseract();
    const lienzo = await imagenReducida(archivo);
    const { data } = await T.recognize(lienzo, 'spa', { logger: () => {} });
    const r = interpretarBoleta(data.text);
    const ref = ids.ref ? document.getElementById(ids.ref) : null;
    const mon = ids.monto ? document.getElementById(ids.monto) : null;
    const partes = [];
    if (r.referencia) { if (ref && !ref.value.trim()) ref.value = r.referencia; partes.push('referencia ' + r.referencia); }
    if (r.monto)      { if (mon && !(+mon.value > 0)) mon.value = r.monto; partes.push('Q ' + r.monto.toLocaleString('es-GT', { minimumFractionDigits: 2 })); }
    if (!partes.length) { decir('No pude leer la referencia en la foto: escribila a mano.', true); return; }
    decir('Leído de la boleta: ' + partes.join(' · ') + ' — revisá antes de guardar.');
    if (ref && r.referencia && ref.value === r.referencia) ref.classList.add('leido');
  } catch (e) {
    decir('No se pudo leer la foto (' + (e.message || e) + '). Escribí la referencia a mano.', true);
  }
}

window.leerBoletaEn = leerBoletaEn;
window.interpretarBoleta = interpretarBoleta;
