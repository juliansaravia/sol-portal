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

function descargarCSV(nombre, filas) {
  if (!filas || filas.length < 2) { toast('No hay nada que descargar en ese período'); return; }
  const cuerpo = filas.map(f => f.map(_celda).join(';')).join('\r\n');
  const blob = new Blob(['﻿' + cuerpo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre}_${REP.desde}_a_${REP.hasta}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  toast(`${filas.length - 1} fila(s) descargadas`);
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

/** Lo mismo, calculado sobre lo que hay en la base ahora. */
function cuadreConModelo() {
  const activos = DB.contratos.filter(c => c.estado === 'aprobado');
  const cuentas = activos.map(c => estadoCuenta(c));
  const enMora = cuentas.filter(e => e.enMora);

  const sis = {
    lotes: DB.lotes.length,
    vendidos: DB.lotes.filter(l => l.estado === 'vendido').length,
    disponibles: DB.lotes.filter(l => l.estado === 'disponible').length,
    contratos: activos.length,
    ventas: activos.reduce((s, c) => s + (c.precio || 0), 0),
    enganches: activos.reduce((s, c) => s + ((c.plan || {}).enganche || c.enganche || 0), 0),
    financiado: cuentas.reduce((s, e) => s + e.totalGiros, 0),
    recaudado: cuentas.reduce((s, e) => s + e.recaudado, 0),
    saldo: cuentas.reduce((s, e) => s + e.saldo, 0),
    enMora: enMora.length,
    montoMora: enMora.reduce((s, e) => s + e.montoVencido, 0)
  };

  const linea = (que, m, s, nota) => ({
    que, modelo: m, sistema: s, dif: (s || 0) - (m || 0),
    cuadra: Math.abs((s || 0) - (m || 0)) < 1, nota
  });

  return {
    corte: MODELO.corte,
    filas: [
      linea('Lotes en total',        MODELO.lotes,       sis.lotes),
      linea('Lotes vendidos',        MODELO.vendidos,    sis.vendidos),
      linea('Lotes disponibles',     MODELO.disponibles, sis.disponibles),
      linea('Contratos',             MODELO.contratos,   sis.contratos),
      linea('Ventas contratadas',    MODELO.ventas,      sis.ventas),
      linea('Enganches contratados', MODELO.enganches,   sis.enganches),
      linea('Total financiado',      MODELO.financiado,  sis.financiado,
            'Capital más intereses de todo el plan.'),
      linea('Recaudado',             MODELO.cuotasCobradas, sis.recaudado,
            'El modelo cuenta solo las cuotas. El sistema cuenta todo el dinero que entró, '
          + 'enganches incluidos. La diferencia son los enganches ya cobrados — no es un descuadre.'),
      linea('Contratos en mora',     MODELO.enMora,      sis.enMora,
            'El modelo mira al 31 de julio; el sistema, a hoy. Es normal que difieran.')
    ]
  };
}

/** 7 · El cuadre, en CSV, para pegarlo al lado del modelo. */
function repCuadre() {
  const c = cuadreConModelo();
  const f = [['Indicador','Modelo (' + c.corte + ')','Sistema (hoy)','Diferencia','¿Cuadra?','Nota']];
  c.filas.forEach(x => f.push([x.que, _repNum(x.modelo), _repNum(x.sistema),
                               _repNum(x.dif), x.cuadra ? 'sí' : 'no', x.nota || '']));
  return f;
}

const REPORTES = [
  { id:'cartera',      nombre:'Cartera al corte',
    que:'Cada contrato con su plan, lo recaudado, el saldo y la mora.',
    para:'Es el primero que pide el contador.', fn: repCartera },
  { id:'cobros',       nombre:'Cobros del período',
    que:'Cada pago con su fecha, referencia y estado.',
    para:'Contra esto se cuadra el banco.', fn: repCobros },
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
