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

/* ── PDF con texto (los recibos del CRM): se lee sin OCR ── */
/* jsPDF pesa 350 KB: en un teléfono barato se carga sólo cuando alguien
   hace un recibo, un estado de cuenta o comprime un PDF escaneado. */
const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
let _jspdfCarga = null;
function cargarJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (typeof document === 'undefined') return Promise.resolve(null);
  if (_jspdfCarga) return _jspdfCarga;
  _jspdfCarga = new Promise(ok => {
    const s = document.createElement('script'); s.src = JSPDF_CDN;
    s.onload = () => ok(window.jspdf && window.jspdf.jsPDF || null);
    s.onerror = () => { _jspdfCarga = null; ok(null); };
    document.head.appendChild(s);
  });
  return _jspdfCarga;
}
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
let _pdfCarga = null;
function cargarPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (_pdfCarga) return _pdfCarga;
  _pdfCarga = new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = PDFJS_CDN;
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN.replace('pdf.min.js', 'pdf.worker.min.js'); ok(window.pdfjsLib); };
    s.onerror = () => no(new Error('No se pudo cargar el lector de PDF'));
    document.head.appendChild(s);
  });
  return _pdfCarga;
}
async function textoDePDF(archivo) {
  const lib = await cargarPdfjs();
  const doc = await lib.getDocument({ data: await archivo.arrayBuffer() }).promise;
  let t = '';
  for (let i = 1; i <= Math.min(doc.numPages, 2); i++) {
    const pg = await doc.getPage(i); const c = await pg.getTextContent();
    t += c.items.map(x => x.str).join(' ') + '\n';
  }
  return t;
}

/* El recibo del CRM (RECIBO DE PAGO No …): trae todo lo que hace falta
   para encontrar el pago al que pertenece. */
function interpretarReciboCRM(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ');
  if (!/RECIBO DE PAGO/i.test(t)) return null;
  const num = (t.match(/RECIBO DE PAGO\s*No\.?\s*(\d{4,10})/i) || [])[1] || null;
  const contrato = (t.match(/CONTRATO:\s*([A-Z]{2,4}-\d{1,5})/i) || [])[1] || null;
  const lote = (t.match(/LOTE:\s*([A-Z]{1,2}-?\d{1,3})/i) || [])[1] || null;
  const montoTxt = (t.match(/POR\s*Q\s*([\d,]+\.\d{2})/i) || t.match(/TOTAL PAGADO\s*([\d,]+\.\d{2})/i) || [])[1];
  const monto = montoTxt ? Math.round(parseFloat(montoTxt.replace(/,/g, '')) * 100) / 100 : null;
  const aIso = d => { const m = d && d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : null; };
  const fechaRecibo = aIso((t.match(/FECHA:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i) || [])[1]);
  // la fecha del pago está en la fila de la tabla: «01/84 30/06/2026»
  const fechaPago = aIso((t.match(/\d{2}\/\d{2,3}\s+(\d{1,2}\/\d{1,2}\/\d{4})/) || [])[1]) || fechaRecibo;
  const referencia = (t.match(/(?:NO DE REF|referencia|Ref\.?)\s*:?\s*(\d{6,14})/i) || [])[1]
                  || (t.match(/Bancario \(Q\)\s*[\d,]+\.\d{2}\s*(\d{6,14})/i) || [])[1] || null;
  const cuota = (t.match(/(\d{2})\/(\d{2,3})\s+\d{1,2}\/\d{1,2}\/\d{4}/) || []);
  const obligacion = /CUOTA\s*INICIAL/i.test(t) ? 'Cuota inicial' : (/SALDO\s*DEUDOR/i.test(t) ? 'Saldo deudor' : null);
  const registradoPor = (t.match(/REGISTRADO POR:\s*([A-ZÁÉÍÓÚÑ ]{4,40}?)\./i) || [])[1] || null;
  return { reciboCRM: num, contrato, lote, monto, fechaRecibo, fechaPago, referencia,
           cuota: cuota[1] ? `${cuota[1]}/${cuota[2]}` : null, obligacion, registradoPor };
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
  decir('Leyendo la boleta…');
  try {
    let r;
    if (/pdf/i.test(archivo.type) || /\.pdf$/i.test(archivo.name)) {
      const texto = await textoDePDF(archivo);
      const crm = interpretarReciboCRM(texto);
      r = crm ? { referencia: crm.referencia, monto: crm.monto, fecha: crm.fechaPago, motivo: 'recibo del CRM No ' + crm.reciboCRM, crm } : interpretarBoleta(texto);
      if (!texto.trim()) { decir('El PDF no tiene texto (es un escaneo): la referencia se escribe a mano.', true); return; }
    } else {
      const T = await cargarTesseract();
      const lienzo = await imagenReducida(archivo);
      const { data } = await T.recognize(lienzo, 'spa', { logger: () => {} });
      r = interpretarBoleta(data.text);
    }
    window.__ultimaLectura = r;
    const ref = ids.ref ? document.getElementById(ids.ref) : null;
    const mon = ids.monto ? document.getElementById(ids.monto) : null;
    const partes = [];
    if (r.referencia) { if (ref && !ref.value.trim()) ref.value = r.referencia; partes.push('referencia ' + r.referencia); }
    if (r.monto) {
      /* El monto manda lo que dice la boleta, aunque el campo traiga la
         cuota programada: si el cliente pagó otra cosa, eso es lo que
         entró. Se dice cuál era el valor anterior si difiere. */
      const previo = mon ? +mon.value : 0;
      if (mon) { mon.value = r.monto; mon.classList.add('leido'); }
      let txt = 'Q ' + r.monto.toLocaleString('es-GT', { minimumFractionDigits: 2 });
      if (previo > 0 && Math.abs(previo - r.monto) >= 0.01) txt += ' (la cuota programada era Q ' + previo.toLocaleString('es-GT', { minimumFractionDigits: 2 }) + ')';
      partes.push(txt);
    }
    if (!partes.length) { decir('No pude leer la referencia en la foto: escribila a mano.', true); return; }
    if (r.crm && r.crm.contrato) partes.push('recibo CRM ' + r.crm.reciboCRM + ' de ' + r.crm.contrato);
    decir('Leído de la boleta: ' + partes.join(' · ') + ' — revisá antes de guardar.');
    if (ref && r.referencia && ref.value === r.referencia) ref.classList.add('leido');
  } catch (e) {
    decir('No se pudo leer la foto (' + (e.message || e) + '). Escribí la referencia a mano.', true);
  }
}

window.leerBoletaEn = leerBoletaEn;
window.interpretarBoleta = interpretarBoleta;
window.interpretarReciboCRM = interpretarReciboCRM;
window.textoDePDF = textoDePDF;


/* ============================================================
   COMPRIMIR ANTES DE SUBIR

   Un escaneo de 60 MB es resolución de imprenta; para leerlo en pantalla
   y en un expediente basta 150 dpi. Todo archivo pasa por aquí antes de
   subir (sbAdjuntar / sbSubirDocumento):
     · fotos → JPEG, lado mayor 2,000 px, calidad 0.82 (un DPI sigue
       legible con lupa);
     · PDF de más de 3 MB → cada página se dibuja a ~150 dpi y se
       re-arma como PDF de imágenes (pdf.js + jsPDF);
     · PDF chicos o con texto (recibos del CRM) → intactos;
     · si comprimir no achica, se sube el original.
   Devuelve un File con el mismo nombre (extensión .jpg/.pdf) y anota
   cuánto se ahorró en `File.__ahorro`.
   ============================================================ */
const COMPRIMIR_PDF_DESDE = 3 * 1024 * 1024;
async function comprimirParaSubir(archivo, avisar) {
  try {
    if (!archivo || archivo.size < 400 * 1024) return archivo;
    const tipo = archivo.type || '';
    if (/^image\//.test(tipo)) return await _comprimirImagen(archivo, avisar);
    if (/pdf/i.test(tipo) || /\.pdf$/i.test(archivo.name)) {
      if (archivo.size < COMPRIMIR_PDF_DESDE) return archivo;
      return await _comprimirPDF(archivo, avisar);
    }
    return archivo;
  } catch (e) { console.warn('[comprimir] se sube el original:', e.message || e); return archivo; }
}
async function _comprimirImagen(archivo, avisar) {
  const img = new Image(); const url = URL.createObjectURL(archivo);
  await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = url; });
  const esc = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * esc); c.height = Math.round(img.naturalHeight * esc);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
  if (!blob || blob.size >= archivo.size) return archivo;
  const f = new File([blob], archivo.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg', { type: 'image/jpeg' });
  f.__ahorro = archivo.size - blob.size; if (avisar) avisar(f);
  return f;
}
async function _comprimirPDF(archivo, avisar) {
  const J = await cargarJsPDF(); if (!J) return archivo;
  const lib = await cargarPdfjs();
  const doc = await lib.getDocument({ data: await archivo.arrayBuffer() }).promise;
  /* Si trae texto de verdad, es un PDF generado, no un escaneo: dejarlo. */
  const p1 = await doc.getPage(1); const t = await p1.getTextContent();
  if (t.items.map(x => x.str).join('').trim().length > 200) return archivo;
  let salida = null;
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const vp0 = pg.getViewport({ scale: 1 });                 // 72 dpi
    const escala = 150 / 72;
    const vp = pg.getViewport({ scale: escala });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const jpg = c.toDataURL('image/jpeg', 0.72);
    const wpt = vp0.width, hpt = vp0.height;
    if (!salida) salida = new J({ unit: 'pt', format: [wpt, hpt], orientation: wpt > hpt ? 'l' : 'p' });
    else salida.addPage([wpt, hpt], wpt > hpt ? 'l' : 'p');
    salida.addImage(jpg, 'JPEG', 0, 0, wpt, hpt);
  }
  const blob = salida.output('blob');
  if (blob.size >= archivo.size) return archivo;
  const f = new File([blob], archivo.name.replace(/\.[a-z0-9]+$/i, '') + '.pdf', { type: 'application/pdf' });
  f.__ahorro = archivo.size - blob.size; if (avisar) avisar(f);
  return f;
}
window.comprimirParaSubir = comprimirParaSubir;
