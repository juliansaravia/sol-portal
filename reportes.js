/* ============================================================
   REPORTERÍA · lo que se lleva al cierre

   La pantalla anterior mostraba dos gráficas de barras. Bonitas y
   sin uso: no se puede cerrar un mes mirando barras.

   Lo que hace falta para un cierre contable o financiero es poder
   sacar la información y trabajarla afuera. Así que esto son dos
   cosas:

     · Los números del período, arriba, para saber cómo va el mes.
     · Seis descargas, abajo, que es lo que se le manda al contador.

   ── Sobre el CSV ──

   Se generan con punto y coma y con BOM. No es capricho: el Excel
   configurado en español interpreta la coma como separador decimal,
   así que un CSV con comas le parte los montos en columnas
   equivocadas. Y sin BOM se come los acentos.

   Todo sale del navegador, de lo que ya está cargado. No necesita
   el hub ni ningún servicio.
   ============================================================ */
'use strict';

/* ------------------------------------------------------------
   El período que se está mirando
   ------------------------------------------------------------ */
let REP = { desde: null, hasta: null };

function repPeriodoPorDefecto() {
  if (REP.desde && REP.hasta) return REP;
  const hoy = (typeof HOY_ISO !== 'undefined') ? HOY_ISO : new Date().toISOString().slice(0, 10);
  REP.desde = hoy.slice(0, 8) + '01';          // primero del mes en curso
  REP.hasta = hoy;
  return REP;
}

/* ------------------------------------------------------------
   Descargar
   ------------------------------------------------------------ */
const _repTxt = v => (v === null || v === undefined) ? '' : String(v);

/** Una celda de CSV. El punto y coma y el salto de línea obligan a comillas. */
function _celda(v) {
  const s = _repTxt(v);
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* `_repNum` y no `_num`: datos-remotos.js ya declara un `_num` en el mismo
   ámbito global, y dos `const` con el mismo nombre tumban la carga entera. */
const _repNum = n => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',');

/* ── Excel de verdad (.xlsx), sin librerías (18 sept 2026) ──
   El CSV con «;» y coma decimal sólo abre bien en un Excel configurado en
   español. En uno en inglés (separador «,») el encabezado cae en una sola celda
   y cada monto se parte en dos columnas. Un .xlsx no depende de la región: los
   montos van como números y los textos (referencias, DPI, recibos con ceros a
   la izquierda) como texto. Un .xlsx es un ZIP de XML; se arma aquí mismo, sin
   compresión (método «store»), que Excel, Numbers y Google Sheets abren igual. */
const _CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function _crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = _CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function _zipStore(archivos) {
  const enc = new TextEncoder(), partes = [], central = []; let pos = 0;
  const u16 = n => [n & 255, (n >>> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  archivos.forEach(a => {
    const nombre = enc.encode(a.nombre), datos = enc.encode(a.texto), crc = _crc32(datos);
    const cab = new Uint8Array([0x50, 0x4B, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(datos.length), ...u32(datos.length), ...u16(nombre.length), ...u16(0)]);
    partes.push(cab, nombre, datos);
    central.push({ nombre, crc, n: datos.length, pos });
    pos += cab.length + nombre.length + datos.length;
  });
  let tamCentral = 0; const ini = pos;
  central.forEach(c => {
    const h = new Uint8Array([0x50, 0x4B, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c.crc), ...u32(c.n), ...u32(c.n), ...u16(c.nombre.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(c.pos)]);
    partes.push(h, c.nombre); tamCentral += h.length + c.nombre.length;
  });
  partes.push(new Uint8Array([0x50, 0x4B, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(tamCentral), ...u32(ini), ...u16(0)]));
  return new Blob(partes, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
/* Texto seguro para XML: escapa & < > " y quita los caracteres de control que XML no admite. */
const _xml = s => Array.from(String(s)).filter(ch => { const k = ch.charCodeAt(0); return k >= 32 || k === 9 || k === 10 || k === 13; }).join('')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function _colXlsx(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; }
/** Filas (arreglo de arreglos) → Blob .xlsx. La primera fila es el encabezado. */
function _xlsxDeFilas(filas, hoja) {
  const anchos = [];
  const celdas = filas.map((f, r) => '<row r="' + (r + 1) + '">' + f.map((v, c) => {
    const ref = _colXlsx(c) + (r + 1); const txt = (v === null || v === undefined) ? '' : v;
    anchos[c] = Math.min(60, Math.max(anchos[c] || 8, String(txt).length + 2));
    /* Número: un number de JS, o el texto que produce _repNum («1234,56»). Todo lo demás es texto. */
    if (r > 0 && typeof txt === 'number' && isFinite(txt)) return `<c r="${ref}" s="${Number.isInteger(txt) ? 0 : 2}"><v>${txt}</v></c>`;
    if (r > 0 && typeof txt === 'string' && /^-?\d+,\d{2}$/.test(txt)) return `<c r="${ref}" s="2"><v>${txt.replace(',', '.')}</v></c>`;
    if (txt === '') return '';
    return `<c r="${ref}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${_xml(_repTxt(txt))}</t></is></c>`;
  }).join('') + '</row>').join('');
  const cols = '<cols>' + Array.from(anchos, (a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a || 10}" customWidth="1"/>`).join('') + '</cols>';
  const ultima = _colXlsx(Math.max(0, (filas[0] || []).length - 1)) + filas.length;
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const nombreHoja = _xml(String(hoja || 'Reporte').replace(/[\\/?*:\[\]]/g, ' ').slice(0, 31));
  return _zipStore([
    { nombre: '[Content_Types].xml', texto: X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { nombre: '_rels/.rels', texto: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nombre: 'xl/workbook.xml', texto: X + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="' + nombreHoja + '" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { nombre: 'xl/_rels/workbook.xml.rels', texto: X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { nombre: 'xl/styles.xml', texto: X + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
    { nombre: 'xl/worksheets/sheet1.xml', texto: X + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' + cols + '<sheetData>' + celdas + '</sheetData><autoFilter ref="A1:' + ultima + '"/></worksheet>' }
  ]);
}

/* Conserva el nombre por quien ya la llama; lo que baja ahora es un .xlsx. */
function descargarCSV(nombre, filas) {
  if (!filas || filas.length < 2) { toast('No hay nada que descargar en ese período'); return; }
  const blob = _xlsxDeFilas(filas, nombre);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre}_${REP.desde}_a_${REP.hasta}.xlsx`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  toast(`${filas.length - 1} fila(s) descargadas · Excel`);
}

/* ------------------------------------------------------------
   Los seis reportes
   ------------------------------------------------------------ */

/** 1 · La cartera al corte. El que pide el contador primero. */
function repCartera() {
  const f = [['Contrato','Lote','Fase','Cliente','Vendedor','Fecha','Precio','Enganche',
              'Plazo','Cuota','Total del plan','Recaudado','Saldo','Cuotas pagadas',
              'Cuotas totales','Vencidas','Monto vencido','Estado','Fuente de la mora']];
  DB.contratos.filter(c => c.estado !== 'anulado').forEach(c => {
    const e = estadoCuenta(c), p = c.plan || {};
    f.push([c.no, c.lote, c.fase || '', nombreCliente(c.clienteId), c.vendedor || 'Sin asignar',
            c.fecha, _repNum(c.precio), _repNum(p.enganche || c.enganche), p.plazo || c.plazo,
            _repNum(p.cuota), _repNum(e.totalGiros), _repNum(e.recaudado), _repNum(e.saldo),
            e.pagadas, e.totalGirosN, e.vencidas, _repNum(e.montoVencido),
            e.enMora ? 'En mora' : 'Al día', e.fuenteMora]);
  });
  return f;
}

/** 2 · Los cobros del período. Contra esto se cuadra el banco. */
function repCobros() {
  const f = [['Fecha','Contrato','Lote','Cliente','Monto','Forma','Referencia','Estado']];
  DB.pagos.filter(p => p.fecha >= REP.desde && p.fecha <= REP.hasta)
    .sort((a, b) => a.fecha < b.fecha ? -1 : 1)
    .forEach(p => {
      const c = getContrato(p.contratoId) || {};
      f.push([p.fecha, c.no || '—', c.lote || '—',
              c.clienteId ? nombreCliente(c.clienteId) : '—',
              _repNum(p.monto), p.forma || '', p.referencia || '', p.estado]);
    });
  return f;
}

/** 2b · Las boletas aplicadas, por cliente y por lote (18 sept 2026), del período
 *  elegido arriba (Desde/Hasta; «Todo el historial» lo abre completo). Una fila por
 *  boleta, ordenadas por cliente → lote → fecha, con a qué cuota se aplicó, su
 *  recibo y si tiene la foto. Los pagos eliminados o rechazados no salen. */
function repBoletas() {
  const f = [['Cliente','DPI','Lote','Fase','Contrato','Vendedor','Fecha del pago','Monto','Forma','Referencia / boleta',
              'Recibo No.','Recibo en PDF','Estado','Se aplicó a','Foto de la boleta']];
  const filas = [];
  DB.contratos.forEach(c => {
    const pagos = (indices().pagosPorContrato.get(String(c.id)) || []).filter(p => p.estado !== 'rechazado' && p.fecha >= REP.desde && p.fecha <= REP.hasta);
    if (!pagos.length) return;
    const apl = new Map();
    try { pagosAplicados(c, filasEstadoCuenta(c).filas).forEach(x => apl.set(String(x.id), x.detalle.map(d => d.etq + ' ' + _repNum(d.monto)).join(' + '))); } catch (e) {}
    const cli = c.clienteId ? (getCliente(c.clienteId) || {}) : {};
    const l = (typeof getLote === 'function' ? getLote(c.lote) : null) || {};
    pagos.forEach(p => {
      const rc = typeof reciboDe === 'function' ? reciboDe(p.id) : null;
      const foto = (typeof adjuntosDe === 'function' ? adjuntosDe('pago', p.id) : []).some(a => !/^Recibo/i.test(a.descripcion || ''));
      filas.push([c.clienteId ? nombreCliente(c.clienteId) : '—', cli.dpi || '', c.lote || '—', l.fase || '', c.no || '—', c.vendedor || '',
                  p.fecha || '', _repNum(p.monto), p.forma || '', p.referencia || '',
                  rc ? String(rc.numero).padStart(6, '0') : '', rc ? (rc.adjuntoId ? 'sí' : 'se genera al abrirlo') : 'sin recibo',
                  p.estado === 'confirmado' ? 'confirmado' : 'por confirmar',
                  p.estado === 'confirmado' ? (apl.get(String(p.id)) || '') : 'se aplica al confirmarse', foto ? 'sí' : 'no']);
    });
  });
  filas.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es') || String(a[2]).localeCompare(String(b[2]), 'es', { numeric: true }) || String(a[6]).localeCompare(String(b[6])));
  return f.concat(filas);
}

/** 2c · El resumen de lo anterior: una fila por cliente y lote. */
function repBoletasResumen() {
  const f = [['Cliente','Lote','Fase','Contrato','Boletas','Confirmado','Por confirmar','Primer pago','Último pago','Saldo pendiente','Cuotas vencidas','Referencias de las boletas']];
  const filas = [];
  DB.contratos.filter(c => c.estado !== 'anulado').forEach(c => {
    const pagos = (indices().pagosPorContrato.get(String(c.id)) || []).filter(p => p.estado !== 'rechazado' && p.fecha >= REP.desde && p.fecha <= REP.hasta);
    if (!pagos.length) return;
    const conf = pagos.filter(p => p.estado === 'confirmado'), reg = pagos.filter(p => p.estado === 'registrado');
    const fechas = pagos.map(p => p.fecha).filter(Boolean).sort();
    const ec = (typeof estadoCuenta === 'function') ? estadoCuenta(c) : {};
    const l = (typeof getLote === 'function' ? getLote(c.lote) : null) || {};
    filas.push([c.clienteId ? nombreCliente(c.clienteId) : '—', c.lote || '—', l.fase || '', c.no || '—', pagos.length,
                _repNum(conf.reduce((s, p) => s + (+p.monto || 0), 0)), _repNum(reg.reduce((s, p) => s + (+p.monto || 0), 0)),
                fechas[0] || '', fechas[fechas.length - 1] || '', _repNum(ec.saldo || 0), ec.vencidas || 0,
                pagos.slice().sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || ''))).map(p => (p.referencia || 's/ref') + ' (' + _repNum(p.monto) + ')').join(' · ')]);
  });
  filas.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'es') || String(a[1]).localeCompare(String(b[1]), 'es', { numeric: true }));
  return f.concat(filas);
}

/** 2d · Revisión de enganches: cada contrato aprobado cuyo enganche no figura pagado, y por qué. */
function repEnganches() {
  const f = [['Caso','Contrato','Lote','Cliente','Vendedor','Fecha del contrato','Enganche','Aplicado al enganche','Falta','Pagos confirmados','Pagos por confirmar','Boleta del enganche subida','Qué hacer']];
  (typeof revisionEnganches === 'function' ? revisionEnganches() : []).forEach(x => {
    const C = CASOS_ENGANCHE[x.caso];
    f.push([C.t, x.ct.no, x.ct.lote, nombreCliente(x.ct.clienteId), x.ct.vendedor || '', x.ct.fecha || '', _repNum(x.enganche), _repNum(x.abonado), _repNum(x.falta),
            _repNum(x.conf), _repNum(x.reg), x.boleta ? 'sí' : 'no', C.d]);
  });
  return f;
}

/** 3 · Antigüedad de saldos. El reporte de cartera de toda la vida. */
function repAntiguedad() {
  const tramos = [[1,30],[31,60],[61,90],[91,180],[181,9999]];
  const f = [['Contrato','Lote','Cliente','Vendedor','Saldo total','Días de atraso',
              'Al día','1-30','31-60','61-90','91-180','Más de 180']];
  const hoy = HOY_ISO;
  DB.contratos.filter(c => c.estado !== 'anulado').forEach(c => {
    const e = estadoCuenta(c);
    const giros = (c.obligaciones || []).flatMap(o => o.giros || []);
    const vencidos = giros.filter(g => g.estado !== 'pagado' && g.vence < hoy);
    const dias = vencidos.length
      ? Math.round((new Date(hoy) - new Date(vencidos[0].vence)) / 86400000) : 0;
    const col = tramos.map(([a, b]) => {
      const m = vencidos.filter(g => {
        const d = Math.round((new Date(hoy) - new Date(g.vence)) / 86400000);
        return d >= a && d <= b;
      }).reduce((s, g) => s + g.monto, 0);
      return m ? _repNum(m) : '';
    });
    f.push([c.no, c.lote, nombreCliente(c.clienteId), c.vendedor || 'Sin asignar',
            _repNum(e.saldo), dias, dias === 0 ? _repNum(e.saldo) : '', ...col]);
  });
  return f;
}

/** 4 · Comisiones: lo devengado, lo pagado y lo que queda. */
function repComisiones() {
  const f = [['Vendedor','Código','Contrato','Lote','Valor del lote','Comisión',
              'Estado','Retenida por']];
  (typeof comisionesPendientes === 'function' ? comisionesPendientes() : []).forEach(x => {
    x.contratos.forEach(c => f.push([x.persona.nombre, x.persona.codigo || '',
      c.no, c.lote, _repNum(c.precio), _repNum(c.comision), 'Por liquidar', '']));
    (x.retenidos || []).forEach(c => f.push([x.persona.nombre, x.persona.codigo || '',
      c.no, c.lote, _repNum(c.precio), _repNum(c.comision), 'Retenida', c.falta || 'expediente incompleto']));
  });
  return f;
}

/** 5 · El inventario, para conciliar contra el plano y contra ventas. */
function repInventario() {
  const f = [['Fase','Manzana','Lote','Área m2','Precio de lista','Estado','En el plano']];
  DB.lotes.slice()
    .sort((a, b) => (a.fase || '').localeCompare(b.fase || '') || a.codigo.localeCompare(b.codigo))
    .forEach(l => f.push([l.fase || '', l.manzana || '', l.codigo,
      _repNum(l.area), _repNum(l.precio), l.estado,
      (l.x != null || l.poligono) ? 'sí' : 'no']));
  return f;
}

/** 6 · El expediente: qué papel le falta a cada contrato. */
function repExpedientes() {
  const f = [['Contrato','Lote','Cliente','Teléfono','Papeles con archivo','Le falta']];
  DB.contratos.filter(c => c.estado !== 'anulado').forEach(c => {
    const docs = (typeof documentosDe === 'function' ? documentosDe(c.id) : []) || [];
    const conArchivo = docs.filter(d => d.bucket && d.ruta).length;
    const falta = (typeof faltantesDe === 'function' ? faltantesDe(c) : [])
      .filter(x => x.grave).map(x => x.que).join(' · ');
    f.push([c.no, c.lote, nombreCliente(c.clienteId), c.tel || 'sin teléfono',
            conArchivo, falta || 'nada']);
  });
  return f;
}

/* ============================================================
   CUADRE CONTRA EL MODELO FINANCIERO

   `Modelo_La_Esperanza_ISR.xlsx` es la fuente que la gerencia y el
   contador dan por buena. El sistema tiene que decir lo mismo, y
   cuando no lo diga, tiene que explicarse.

   Al corte del modelo —31 de julio de 2026— cuadra al centavo en
   lo que se compara directo:

     ventas contratadas    Q10,157,288.94   diferencia 0.00
     enganches contratados  Q2,020,197.60   diferencia 0.00

   Y difiere en el recaudo, por una razón que no es un error:

     el modelo cuenta SOLO las cuotas       Q 1,185,113.75
     el sistema cuenta TODO lo que entró    Q 2,859,006.72
     la diferencia son los enganches cobrados Q1,673,892.97
                                            (82.9 % de los contratados)

   Son dos preguntas distintas —«¿cuánto se ha cobrado del plan?» y
   «¿cuánto dinero entró?»— y las dos son correctas. Lo que estaba
   mal era no decirlo, y dejar que cada quien descubriera solo por
   qué dos cifras del mismo negocio no coinciden.
   ============================================================ */
const MODELO = {
  archivo: 'Modelo_La_Esperanza_ISR.xlsx',
  corte:   '2026-07-31',
  regimenISR: 'Opcional simplificado',
  lotes: 438, vendidos: 148, disponibles: 290,
  contratos: 148,
  ventas:     10157288.94,
  enganches:   2020197.60,
  capital:     8137091.34,
  intereses:   5168074.28,
  financiado: 13305165.62,
  cuotasCobradas: 1185113.75,   // solo cuotas: NO incluye enganches
  saldo:      12120051.87,
  enMora: 7, montoMora: 87995.80
};

/** El cuadre contra el modelo financiero (rehecho el 18 sept 2026).
 *
 *  El modelo es una foto al 31 de julio; el sistema sigue vivo. Comparar la foto
 *  contra «hoy» marcaba «Revisar» cada venta nueva. Ahora cada indicador trae:
 *    · modelo      lo que dice el Excel a su fecha de corte
 *    · alCorte     lo que dice el sistema A ESA MISMA FECHA (contratos firmados
 *                  hasta el corte, lotes que ya existían) → contra esto se cuadra
 *    · mov         qué se movió desde el corte (ventas nuevas, bajas, lotes nuevos)
 *    · sistema     cómo está hoy, con el inventario total
 *  «Cuadra» compara modelo contra alCorte. Lo de hoy nunca se marca como error. */
function cuadreConModelo() {
  const corte = MODELO.corte;
  const f10 = c => String(c.fecha || '').slice(0, 10);
  const vivos   = DB.contratos.filter(c => c.estado === 'aprobado');
  const alCorte = vivos.filter(c => !c.fecha || f10(c) <= corte);
  const nuevos  = vivos.filter(c => c.fecha && f10(c) > corte);
  /* Ventas que el modelo contaba y ya no están vivas (anuladas o desistieron). */
  const bajas   = DB.contratos.filter(c => (c.estado === 'anulado' || c.estado === 'desistido') && c.fecha && f10(c) <= corte);
  const ecDe = new Map(vivos.map(c => [c.id, estadoCuenta(c)]));
  const eng = c => ((c.plan || {}).enganche || c.enganche || 0);
  const suma = (L, fn) => L.reduce((s, c) => s + (fn(c) || 0), 0);
  const giros = L => suma(L, c => (ecDe.get(c.id) || {}).totalGiros);
  const enMora = vivos.filter(c => (ecDe.get(c.id) || {}).enMora);

  /* Inventario: los lotes creados después del corte (L-08, L-09, los que se agreguen). */
  const lotesNuevos = DB.lotes.filter(l => l.creado && l.creado > corte);
  const vendidosHoy = DB.lotes.filter(l => l.estado === 'vendido').length;
  const dispHoy     = DB.lotes.filter(l => l.estado === 'disponible').length;
  const lotesCorte  = DB.lotes.length - lotesNuevos.length;
  const vendCorte   = vendidosHoy - nuevos.length + bajas.length;
  const dispCorte   = dispHoy + nuevos.length - bajas.length - lotesNuevos.filter(l => l.estado === 'disponible').length;

  const pagosConf = (DB.pagos || []).filter(p => p.estado === 'confirmado');
  const idsVivos = new Set(vivos.map(c => String(c.id)));
  const recCorte = pagosConf.filter(p => idsVivos.has(String(p.contratoId)) && String(p.fecha || '').slice(0, 10) <= corte).reduce((s, p) => s + (+p.monto || 0), 0);
  const recHoy   = suma(vivos, c => (ecDe.get(c.id) || {}).recaudado);

  const lista = (L, fn) => L.slice(0, 8).map(fn).join(', ') + (L.length > 8 ? ' y ' + (L.length - 8) + ' más' : '');
  const movVentas = (nuevos.length ? '+' + nuevos.length + ' venta(s) nueva(s)' : '') + (nuevos.length && bajas.length ? ' · ' : '') + (bajas.length ? '−' + bajas.length + ' baja(s)' : '');
  const linea = (que, m, c, hoy, mov, nota, comparable) => ({
    que, modelo: m, alCorte: c, sistema: hoy, mov: mov || '', dif: (c || 0) - (m || 0),
    cuadra: comparable === false ? false : Math.abs((c || 0) - (m || 0)) < 1, nota, comparable: comparable !== false
  });

  /* El inventario total de hoy, por fase: lo que pidió ver Julián en el cuadre. */
  const porFase = new Map();
  DB.lotes.forEach(l => { const k = l.fase || 'Sin fase'; const o = porFase.get(k) || { fase: k, total: 0, vendidos: 0, disponibles: 0, otros: 0 };
    o.total++; if (l.estado === 'vendido') o.vendidos++; else if (l.estado === 'disponible') o.disponibles++; else o.otros++; porFase.set(k, o); });

  return {
    corte,
    nuevos: nuevos.map(c => ({ no: c.no, lote: c.lote, fecha: c.fecha, precio: c.precio || 0 })),
    bajas: bajas.map(c => ({ no: c.no, lote: c.lote, estado: c.estado })),
    lotesNuevos: lotesNuevos.map(l => ({ codigo: l.codigo, fase: l.fase })),
    inventario: Array.from(porFase.values()).sort((a, b) => String(a.fase).localeCompare(String(b.fase), 'es', { numeric: true })),
    filas: [
      linea('Lotes en total', MODELO.lotes, lotesCorte, DB.lotes.length,
            lotesNuevos.length ? '+' + lotesNuevos.length + ' lote(s) agregados: ' + lista(lotesNuevos, l => l.codigo) : ''),
      linea('Lotes vendidos', MODELO.vendidos, vendCorte, vendidosHoy, movVentas),
      linea('Lotes disponibles', MODELO.disponibles, dispCorte, dispHoy,
            (nuevos.length ? '−' + nuevos.length + ' vendidos' : '') + (bajas.length ? ' · +' + bajas.length + ' liberados' : '') + (lotesNuevos.length ? ' · +' + lotesNuevos.length + ' agregados' : '')),
      linea('Contratos', MODELO.contratos, alCorte.length + bajas.length, vivos.length,
            (nuevos.length ? 'nuevos: ' + lista(nuevos, c => c.no) : '') + (bajas.length ? (nuevos.length ? ' · ' : '') + 'bajas: ' + lista(bajas, c => c.no) : '')),
      linea('Ventas contratadas', MODELO.ventas, suma(alCorte, c => c.precio) + suma(bajas, c => c.precio), suma(vivos, c => c.precio), movVentas),
      linea('Enganches contratados', MODELO.enganches, suma(alCorte, eng) + suma(bajas, eng), suma(vivos, eng), movVentas),
      linea('Total financiado', MODELO.financiado, giros(alCorte) - suma(alCorte, eng), giros(vivos) - suma(vivos, eng), movVentas,
            'Capital financiado más intereses, sin el enganche — como lo define el modelo. Las bajas no entran (su plan ya no existe).'),
      linea('Cartera total', MODELO.financiado + MODELO.enganches, giros(alCorte), giros(vivos), movVentas,
            'Lo mismo con el enganche incluido: todo lo que el cliente va a pagar. Es la cifra que muestra el tablero.'),
      linea('Recaudado', MODELO.cuotasCobradas, recCorte, recHoy, '',
            'El modelo cuenta solo las cuotas. El sistema cuenta todo el dinero que entró, enganches incluidos. '
          + 'La diferencia son los enganches ya cobrados — no es un descuadre.', false),
      linea('Contratos en mora', MODELO.enMora, null, enMora.length, '',
            'El modelo mira al ' + corte.split('-').reverse().join('/') + '; la mora del sistema sólo se conoce a hoy. Es normal que difieran.', false)
    ]
  };
}

/** 7 · El cuadre, para pegarlo al lado del modelo. */
function repCuadre() {
  const c = cuadreConModelo();
  const f = [['Indicador', 'Modelo (' + c.corte + ')', 'Sistema al ' + c.corte, 'Diferencia al corte', '¿Cuadra?', 'Movimiento desde el corte', 'Sistema hoy', 'Nota']];
  c.filas.forEach(x => f.push([x.que, _repNum(x.modelo), x.alCorte == null ? '' : _repNum(x.alCorte), x.alCorte == null ? '' : _repNum(x.dif),
                               !x.comparable ? 'explicado' : (x.cuadra ? 'sí' : 'no'), x.mov || '', _repNum(x.sistema), x.nota || '']));
  f.push([]); f.push(['Inventario total hoy, por fase', 'Lotes', 'Vendidos', 'Disponibles', 'Otros (reservado, etc.)']);
  c.inventario.forEach(i => f.push([i.fase, i.total, i.vendidos, i.disponibles, i.otros]));
  f.push(['TOTAL', c.inventario.reduce((s, i) => s + i.total, 0), c.inventario.reduce((s, i) => s + i.vendidos, 0), c.inventario.reduce((s, i) => s + i.disponibles, 0), c.inventario.reduce((s, i) => s + i.otros, 0)]);
  return f;
}

/** Caja esperada por cuotas: lo programado y no pagado, mes a mes. */
const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function cajaMensual(meses) {
  meses = meses || 12;
  const cal = (typeof calendario === 'function' ? calendario() : []) || [];
  const hoyMes = HOY_ISO.slice(0, 7);
  const porMes = new Map(), vencido = { n: 0, monto: 0, cts: new Set() };
  cal.forEach(c => {
    if (!c.f) return;
    if (c.f < HOY_ISO) { vencido.n++; vencido.monto += c.m || 0; vencido.cts.add(c.c); return; }
    const k = String(c.f).slice(0, 7);
    if (!porMes.has(k)) porMes.set(k, { n: 0, monto: 0, cts: new Set() });
    const m = porMes.get(k); m.n++; m.monto += c.m || 0; m.cts.add(c.c);
  });
  /* Saldos al desmembrar (contado al 50%): entran el mes de la fecha
     estimada de escrituras; sin fecha, se listan aparte. */
  const difMes = new Map(); let diferidoSinFecha = 0;
  DB.contratos.filter(c => c.estado === 'aprobado').forEach(c => {
    (c.obligaciones || []).flatMap(o => o.giros || []).filter(g => g.condicion && g.estado !== 'pagado').forEach(g => {
      const resto = (g.monto || 0) - (g.abonado || 0); if (!(resto > 0)) return;
      const f = g.fechaEstimada ? String(g.fechaEstimada).slice(0, 7) : null;
      if (!f) { diferidoSinFecha += resto; return; }
      const k = f < hoyMes ? hoyMes : f;
      if (!difMes.has(k)) difMes.set(k, { monto: 0, n: 0 });
      const d = difMes.get(k); d.monto += resto; d.n++;
    });
  });
  const salida = [];
  let [y, mo] = hoyMes.split('-').map(Number);
  for (let i = 0; i < meses; i++) {
    const k = `${y}-${String(mo).padStart(2, '0')}`;
    const m = porMes.get(k) || { n: 0, monto: 0, cts: new Set() };
    const d = difMes.get(k) || { monto: 0, n: 0 };
    salida.push({ mes: k, etiqueta: `${MESES_CORTOS[mo - 1]} ${y}`, n: m.n, monto: Math.round(m.monto * 100) / 100, contratos: m.cts.size,
                  diferido: Math.round(d.monto * 100) / 100, diferidoN: d.n });
    mo++; if (mo > 12) { mo = 1; y++; }
  }
  const diferido = DB.contratos.filter(c => c.estado === 'aprobado').reduce((s, c) => s + ((estadoCuenta(c).diferido) || 0), 0);
  return { meses: salida, vencido: { n: vencido.n, monto: Math.round(vencido.monto * 100) / 100, contratos: vencido.cts.size },
           total: { n: salida.reduce((s, m) => s + m.n, 0), monto: Math.round(salida.reduce((s, m) => s + m.monto, 0) * 100) / 100,
                    diferido: Math.round(salida.reduce((s, m) => s + m.diferido, 0) * 100) / 100 },
           diferido: Math.round(diferido * 100) / 100, diferidoSinFecha: Math.round(diferidoSinFecha * 100) / 100 };
}
function repCajaMensual() {
  const cm = cajaMensual(24);
  const f = [['Mes','Cuotas','Contratos','Cuotas (Q)','Escrituras · contado 50% (Q)','Total']];
  if (cm.vencido.monto) f.push(['Vencido a la fecha', cm.vencido.n, cm.vencido.contratos, _repNum(cm.vencido.monto), '', _repNum(cm.vencido.monto)]);
  cm.meses.forEach(m => f.push([m.mes, m.n, m.contratos, _repNum(m.monto), _repNum(m.diferido), _repNum(m.monto + m.diferido)]));
  if (cm.diferidoSinFecha) f.push(['Saldos al desmembrar sin fecha estimada', '', '', '', _repNum(cm.diferidoSinFecha), '']);
  return f;
}

const REPORTES = [
  { id:'caja',         nombre:'Caja esperada por cuotas',
    que:'Mes a mes, cuántas cuotas vencen y cuánto dinero debería entrar.',
    para:'Para saber con qué caja contar y planear pagos.', fn: repCajaMensual },
  { id:'cartera',      nombre:'Cartera al corte',
    que:'Cada contrato con su plan, lo recaudado, el saldo y la mora.',
    para:'Es el primero que pide el contador.', fn: repCartera },
  { id:'cobros',       nombre:'Cobros del período',
    que:'Cada pago con su fecha, referencia y estado.',
    para:'Contra esto se cuadra el banco.', fn: repCobros },
  { id:'boletas',      nombre:'Pagos uno por uno, con No. de referencia',
    que:'UNA FILA POR PAGO, ordenado por cliente y lote: fecha, monto, No. de referencia de la boleta, recibo, a qué cuota se aplicó y si tiene la foto.',
    para:'Para revisar el historial de pagos de un cliente o de un lote, o filtrarlo en Excel.', fn: repBoletas },
  { id:'boletas-resumen', nombre:'Resumen de pagos por cliente y lote',
    que:'UNA FILA POR CLIENTE Y LOTE: cuántas boletas, confirmado, por confirmar, primer y último pago, saldo, y al final las referencias de sus boletas.',
    para:'Para ver de un vistazo quién ha pagado cuánto.', fn: repBoletasResumen },
  { id:'enganches',    nombre:'Revisión de enganches',
    que:'Cada contrato aprobado cuyo enganche no figura pagado, con su caso: boleta subida sin pago, pago por confirmar, pago aplicado a otra cuota, sin respaldo.',
    para:'La lista de trabajo para dejar todos los enganches aplicados. No depende del período.', fn: repEnganches },
  { id:'antiguedad',   nombre:'Antigüedad de saldos',
    que:'El saldo vencido repartido en tramos de 30, 60, 90 y 180 días.',
    para:'Para provisionar y para decidir a quién se escala.', fn: repAntiguedad },
  { id:'comisiones',   nombre:'Comisiones',
    que:'Lo devengado por vendedor, y lo retenido con su motivo.',
    para:'Para la liquidación y para provisionar el gasto.', fn: repComisiones },
  { id:'inventario',   nombre:'Inventario',
    que:'Todos los lotes con su área, precio y estado.',
    para:'Para conciliar contra el plano y contra las ventas.', fn: repInventario },
  { id:'cuadre',       nombre:'Cuadre con el modelo financiero',
    que:'Cada cifra de control del modelo contra la del sistema.',
    para:'Para poder afirmar que los dos dicen lo mismo.', fn: repCuadre },
  { id:'expedientes',  nombre:'Expedientes',
    que:'Qué papel le falta a cada contrato.',
    para:'Para saber qué cobrar antes de que sea un problema legal.', fn: repExpedientes },
];

function descargarReporte(id) {
  const r = REPORTES.find(x => x.id === id);
  if (!r) return;
  try { descargarCSV(r.id, r.fn()); }
  catch (e) { toast('No se pudo armar el reporte: ' + e.message, 7000, true); }
}

/* ------------------------------------------------------------
   Los números del período
   ------------------------------------------------------------ */
function repNumeros() {
  const { desde, hasta } = repPeriodoPorDefecto();
  const activos = DB.contratos.filter(c => c.estado === 'aprobado');
  const cuentas = activos.map(c => estadoCuenta(c));

  const enPeriodo = DB.pagos.filter(p => p.fecha >= desde && p.fecha <= hasta);
  const confirmados = enPeriodo.filter(p => p.estado === 'confirmado');
  const porConfirmar = enPeriodo.filter(p => p.estado === 'registrado');

  const ventas = activos.filter(c => c.fecha >= desde && c.fecha <= hasta);
  const enMora = cuentas.filter(e => e.enMora);

  return {
    desde, hasta,
    cobrado:      confirmados.reduce((s, p) => s + p.monto, 0),
    cobros:       confirmados.length,
    porConfirmar: porConfirmar.reduce((s, p) => s + p.monto, 0),
    nPorConfirmar: porConfirmar.length,
    ventas:       ventas.length,
    valorVentas:  ventas.reduce((s, c) => s + c.precio, 0),
    cartera:      cuentas.reduce((s, e) => s + e.totalGiros, 0),
    recaudado:    cuentas.reduce((s, e) => s + e.recaudado, 0),
    saldo:        cuentas.reduce((s, e) => s + e.saldo, 0),
    enMora:       enMora.length,
    montoMora:    enMora.reduce((s, e) => s + e.montoVencido, 0),
    activos:      activos.length,
    fuenteMora:   cuentas.length ? cuentas[0].fuenteMora : '—'
  };
}

Object.assign(window, {
  REP, REPORTES, repNumeros, repPeriodoPorDefecto, descargarReporte, descargarCSV,
  MODELO, cuadreConModelo
});
