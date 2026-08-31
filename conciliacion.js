/* ============================================================
   CONCILIACIÓN BANCARIA — el cuadre de Edwin y David

   El cliente transfiere directo a Banrural. Nadie cobra en mano:
   el dinero aparece en el estado de cuenta y hay que averiguar
   de quién es. Ese es el trabajo.

   Por qué no es trivial: en la cartera real hay 2,422 cuotas
   pero solo 35 montos distintos. El 6 de agosto hay contratos
   que deben exactamente lo mismo el mismo día. El monto no
   identifica a nadie.

   Reglas del dinero que esta pantalla respeta:
     · Un depósito se puede repartir, pero nunca por más de lo
       que entró al banco.
     · Una cuota no se paga dos veces.
     · Quien concilia (Edwin) no confirma su propio cuadre.
       Confirma el financiero (David).
   ============================================================ */

const TOLERANCIA_C = 0.50;
const VENTANA_C = 12;

/* Formato propio: este módulo no depende de que app.js ya haya cargado. */
const _Q  = n => 'Q ' + (Math.round(n * 100) / 100).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _fD = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const difC  = (a, b) => Math.abs(Number(a) - Number(b));
const diasC = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);
const sumaDias = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const CALC = () => (typeof CALENDARIO !== 'undefined' ? CALENDARIO : []);

function normRef(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[^0-9a-zA-Z]/g, '').replace(/^0+/, '').toUpperCase();
  return s || null;
}

/* ---------- Lectura del estado de cuenta ----------
   Formato real de Banrural, tomado del export de la cuenta de
   ALJIBE (hoja "Ingreso Aljibe" del Modelo Financiero):

     fecha | agencia | descripcion | referencia 1 | referencia 2 | Debito | Credito | Saldo

   Dos cosas que se aprendieron de los datos reales:
     · Solo interesa la columna Credito. Los débitos son salidas
       (comisiones, traslados a Editorial Sol) y no son cobros.
     · «referencia 1» es la que sirve: en los depósitos de
       ventanilla trae el número de boleta, el mismo que aparece
       en el recibo del CRM. «referencia 2» es interna del banco
       y solo coincide con la 1 en las notas de crédito.        */

const ALIAS = {
  fecha:  ['fecha', 'fecha operacion', 'fecha de operacion', 'f. operacion', 'fec'],
  monto:  ['credito', 'créditos', 'creditos', 'abono', 'haber', 'monto', 'deposito', 'depósito', 'valor'],
  ref:    ['referencia 1', 'referencia1', 'boleta', 'documento', 'doc', 'referencia', 'ref', 'no. documento'],
  ref2:   ['referencia 2', 'referencia2'],
  desc:   ['descripcion', 'descripción', 'concepto', 'detalle', 'observaciones'],
  agencia:['agencia', 'sucursal', 'oficina'],
  debito: ['debito', 'débito', 'cargo', 'debe'],
};

const _norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function detectarColumnas(encabezado) {
  const cols = {};
  encabezado.forEach((h, i) => {
    const n = _norm(h);
    for (const [campo, nombres] of Object.entries(ALIAS))
      if (cols[campo] === undefined && nombres.some(x => n === x || n.includes(x))) cols[campo] = i;
  });
  return cols;
}

/** Convierte "7,865.00" o "Q 1.393,51" en número. */
function aNum(v) {
  let s = String(v ?? '').replace(/[^\d.,-]/g, '').trim();
  if (!s) return null;
  // Si la coma va después del último punto, la coma es el decimal
  if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function aISO(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!m) return null;
  let [, d, mes, a] = m;
  if (a.length === 2) a = '20' + a;
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Lee un estado de cuenta pegado como texto (CSV, TSV o pegado de Excel).
 * Devuelve las líneas que son ABONOS — los cargos no interesan aquí.
 */
function leerEstadoCuenta(texto) {
  const lineas = String(texto || '').trim().split(/\r?\n/).filter(l => l.trim());
  if (!lineas.length) return { movimientos: [], error: 'No hay nada que leer' };

  const sep = lineas[0].includes('\t') ? '\t' : (lineas[0].split(';').length > lineas[0].split(',').length ? ';' : ',');
  const parte = l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));

  const enc = parte(lineas[0]);
  const cols = detectarColumnas(enc);
  const tieneEncabezado = cols.fecha !== undefined || cols.monto !== undefined;
  if (!tieneEncabezado) return { movimientos: [], error: 'No reconocí las columnas. Necesito al menos una de fecha y una de monto o crédito.' };

  const out = [], descartados = [];
  for (const l of lineas.slice(1)) {
    const c = parte(l);
    const fecha = aISO(c[cols.fecha]);
    const monto = aNum(c[cols.monto]);
    // Solo abonos. Los débitos son salidas de caja, no cobros.
    if (!fecha || !(monto > 0)) { descartados.push(l); continue; }
    out.push({
      fecha, monto,
      ref:  normRef(cols.ref  !== undefined ? c[cols.ref]  : null),
      ref2: normRef(cols.ref2 !== undefined ? c[cols.ref2] : null),
      descripcion: cols.desc !== undefined ? c[cols.desc] : '',
      agencia: cols.agencia !== undefined ? c[cols.agencia] : ''
    });
  }
  return { movimientos: out, descartados: descartados.length, columnas: cols, encabezado: enc };
}

/** Guarda los movimientos, sin duplicar si vuelven a subir el mismo archivo. */
function importarMovimientos(lista, cuenta) {
  DB.movimientos = DB.movimientos || [];
  let nuevos = 0, repetidos = 0;
  for (const m of lista) {
    const yaEsta = DB.movimientos.some(x =>
      x.fecha === m.fecha && difC(x.monto, m.monto) < 0.01 &&
      (m.ref ? x.ref === m.ref : x.descripcion === m.descripcion));
    if (yaEsta) { repetidos++; continue; }
    DB.movimientos.push({ id: uid(), ...m, cuenta: cuenta || 'Banrural 3445903856',
                          importado: HOY_ISO });
    nuevos++;
  }
  saveDB();
  return { nuevos, repetidos };
}

/* ---------- El cruce ---------- */

const cuotaPagada = (ct, v) => (DB.conciliaciones || []).some(k => k.contrato === ct && k.vence === v);
const movUsado = id => (DB.conciliaciones || []).filter(k => k.movimientoId === id);

function saldoLibre(mov) {
  const usado = movUsado(mov.id).reduce((t, k) => t + k.monto, 0);
  return Math.round((mov.monto - usado) * 100) / 100;
}

function cuotasCerca(fecha, monto) {
  const d = sumaDias(fecha, -VENTANA_C), h = sumaDias(fecha, VENTANA_C);
  return CALC()
    .filter(c => c.f >= d && c.f <= h)
    .filter(c => !cuotaPagada(c.c, c.f))
    .filter(c => monto === undefined || difC(c.m, monto) <= TOLERANCIA_C);
}

/** Ordena los candidatos por qué tan probable es que el depósito sea suyo. */
function rankear(cands, mov) {
  return cands.map(c => {
    const señales = [];
    let p = 0;
    const d = diasC(mov.fecha, c.f);
    if (d >= 0) { p += 20; señales.push('la cuota ya venció'); }
    p += Math.max(0, 15 - Math.abs(d));
    if (c.r) { p += 10; señales.push('contrato en mora'); }
    if ((DB.conciliaciones || []).some(k => k.contrato === c.c && k.fecha === mov.fecha)) {
      p -= 30; señales.push('ya se le aplicó otro depósito ese día');
    }
    return { cuota: c, puntaje: p, señales };
  }).sort((a, b) => b.puntaje - a.puntaje);
}

/** ¿De quién es este depósito? */
function analizarMov(mov) {
  const libre = saldoLibre(mov);
  if (libre <= 0.009) return { mov, estado: 'aplicado', nota: 'Ya se repartió por completo.' };

  // La referencia manda: si coincide con la del recibo o la que mandó el cliente.
  // Se prueban las dos que trae Banrural — en las notas de crédito la buena
  // puede estar en cualquiera de las dos columnas.
  const refs = [mov.ref, mov.ref2].filter(Boolean);
  if (refs.length) {
    const dec = (DB.declaradas || []).filter(x => refs.includes(x.ref) && x.contrato);
    if (dec.length === 1) {
      const d = dec[0];
      const c = elegirCuotaC(cuotasCerca(mov.fecha).filter(x => x.c === d.contrato), libre);
      if (c) return veredictoC('referencia', 0.99, mov, c, libre);
    }
  }

  const cands = cuotasCerca(mov.fecha, libre);
  if (cands.length === 1) return veredictoC('monto_fecha', 0.75, mov, cands[0], libre);
  if (cands.length > 1)
    return { mov, estado: 'ambiguo', via: 'monto_fecha', confianza: 0.35, libre,
             candidatos: rankear(cands, mov),
             nota: `${cands.length} contratos deben exactamente ${_Q(libre)} en estas fechas. Sin referencia no se puede saber cuál es.` };

  // Nada calza exacto: ¿podría ser abono parcial o pago adelantado?
  const parciales = cuotasCerca(mov.fecha)
    .sort((a, b) => Math.abs(a.m - libre) - Math.abs(b.m - libre)).slice(0, 6);
  if (parciales.length)
    return { mov, estado: 'revisar', via: 'parcial', confianza: 0.3, libre,
             candidatos: rankear(parciales, mov),
             nota: 'El monto no calza con ninguna cuota. Puede ser un abono parcial, un pago adelantado o un enganche.' };

  return { mov, estado: 'huerfano', confianza: 0, libre, candidatos: [],
           nota: 'No hay ninguna cuota que le corresponda. Puede ser de otro proyecto o ajeno a La Esperanza.' };
}

function elegirCuotaC(cuotas, monto) {
  if (!cuotas.length) return null;
  return cuotas.find(c => difC(c.m, monto) <= TOLERANCIA_C)
      || cuotas.slice().sort((a, b) => a.f < b.f ? -1 : 1)[0];
}

function veredictoC(via, confianza, mov, cuota, libre) {
  const dif = Math.round((libre - cuota.m) * 100) / 100;
  return {
    mov, cuota, via, confianza, libre,
    estado: confianza >= 0.75 ? 'sugerido' : 'revisar',
    diferencia: dif,
    nota: dif === 0 ? null
        : (dif < 0 ? `Pago parcial: faltarían ${_Q(-dif)}` : `Sobran ${_Q(dif)} — se abonan a las cuotas siguientes`)
  };
}

/**
 * Reparte un monto entre las cuotas pendientes de un contrato, de la
 * más vieja a la más nueva. Es lo que hace hoy el CRM: en los recibos
 * reales un depósito de Q5,000 salió como 4,019.79 + 749.84 + 230.37.
 */
function repartir(monto, contrato) {
  let resto = Math.round(Number(monto) * 100) / 100;
  const partes = [];
  const pend = CALC().filter(c => c.c === contrato && !cuotaPagada(c.c, c.f))
                     .sort((a, b) => a.f < b.f ? -1 : 1);
  for (const c of pend) {
    if (resto <= 0.009) break;
    const aplica = Math.min(resto, c.m);
    partes.push({ contrato: c.c, vence: c.f, cuota: `${c.q}/${c.p}`, montoCuota: c.m,
                  monto: Math.round(aplica * 100) / 100, completa: aplica >= c.m - 0.009 });
    resto = Math.round((resto - aplica) * 100) / 100;
  }
  return { partes, sobrante: resto };
}

/* ---------- Aplicar y confirmar ---------- */

function aplicarConciliacion({ movimientoId, asignaciones, usuario, nota, via }) {
  DB.conciliaciones = DB.conciliaciones || [];
  const mov = DB.movimientos.find(m => m.id === movimientoId);
  if (!mov) throw new Error('No existe ese movimiento');

  for (const a of asignaciones) {
    if (cuotaPagada(a.contrato, a.vence))
      throw new Error(`La cuota de ${a.contrato} del ${_fD(a.vence)} ya tiene un pago aplicado`);
  }
  const suma = asignaciones.reduce((t, a) => t + Number(a.monto || 0), 0);
  if (suma > saldoLibre(mov) + TOLERANCIA_C)
    throw new Error(`Se está repartiendo ${_Q(suma)} de un depósito con ${_Q(saldoLibre(mov))} disponibles`);

  const hechos = asignaciones.map(a => {
    const c = CALC().find(x => x.c === a.contrato && x.f === a.vence);
    return {
      id: uid(), movimientoId, contrato: a.contrato, vence: a.vence,
      fecha: mov.fecha, monto: Math.round(Number(a.monto) * 100) / 100,
      montoCuota: c ? c.m : null, cliente: c ? c.n : '', lote: c ? c.l : '',
      completa: c ? Number(a.monto) >= c.m - TOLERANCIA_C : false,
      ref: mov.ref, via: via || 'manual', repartido: asignaciones.length > 1,
      estado: 'conciliado', nota: nota || '',
      conciliadoPor: (window.__user ? window.__user.name : 'Cobranza'),
      conciliado: new Date().toISOString()
    };
  });
  DB.conciliaciones.push(...hechos);
  saveDB();
  return hechos;
}

/** El visto bueno del financiero. Aquí el dinero entra de verdad a la cartera. */
function confirmarConciliacion(id, ok = true) {
  const k = (DB.conciliaciones || []).find(x => x.id === id);
  if (!k) throw new Error('No existe esa conciliación');
  const yo = window.__user ? window.__user.name : '';
  if (k.conciliadoPor === yo)
    throw new Error('Quien concilia no puede confirmar su propio cuadre');
  k.estado = ok ? 'confirmado' : 'rechazado';
  k.confirmadoPor = yo;
  k.confirmado = new Date().toISOString();

  // Al confirmar, el pago entra a la cartera del contrato
  if (ok) {
    const ct = DB.contratos.find(c => c.no === k.contrato);
    if (ct) { registrarPago(ct.id, { monto: k.monto, forma: 'Depósito bancario',
                                     cuenta: 'Banrural', referencia: k.ref || '' }); }
  }
  saveDB();
  return k;
}

function desaplicarConciliacion(id) {
  const i = (DB.conciliaciones || []).findIndex(x => x.id === id);
  if (i < 0) return false;
  if (DB.conciliaciones[i].estado === 'confirmado')
    throw new Error('Ya fue confirmado — eso se corrige con una anulación, no borrando');
  DB.conciliaciones.splice(i, 1);
  saveDB();
  return true;
}

/* ---------- La corrida completa ---------- */

function correrConciliacion({ desde, hasta } = {}) {
  const movs = (DB.movimientos || [])
    .filter(m => !desde || (m.fecha >= desde && m.fecha <= hasta))
    .filter(m => saldoLibre(m) > 0.009);

  const res = movs.map(analizarMov);
  const por = e => res.filter(r => r.estado === e);

  // El otro lado: cuotas que esperábamos y de las que no entró nada
  const fechas = (DB.movimientos || []).map(m => m.fecha).sort();
  const d0 = desde || fechas[0], d1 = hasta || fechas[fechas.length - 1];
  const esperadas = d0 ? CALC().filter(c => c.f >= d0 && c.f <= d1) : [];
  const sinDeposito = esperadas.filter(c => !cuotaPagada(c.c, c.f) &&
    !res.some(r => r.cuota && r.cuota.c === c.c && r.cuota.f === c.f));

  const pendConfirmar = (DB.conciliaciones || []).filter(k => k.estado === 'conciliado');

  return {
    desde: d0, hasta: d1, total: res.length,
    // Automáticos = la referencia calzó. Sugeridos = solo calzó monto y fecha,
    // que es indicio pero no prueba: esos los aplica Edwin a mano.
    automaticos: por('sugerido').filter(x => x.confianza >= 0.9),
    sugeridos:   por('sugerido').filter(x => x.confianza < 0.9),
    ambiguos: por('ambiguo'),
    revisar: por('revisar'), huerfanos: por('huerfano'),
    sinDeposito, pendConfirmar,
    montoDepositado: movs.reduce((t, m) => t + saldoLibre(m), 0),
    montoEsperado: esperadas.reduce((t, c) => t + c.m, 0),
    montoConfirmado: (DB.conciliaciones || []).filter(k => k.estado === 'confirmado')
                       .reduce((t, k) => t + k.monto, 0),
    automatizable: res.length ? por('sugerido').filter(x => x.confianza >= 0.9).length / res.length : 0
  };
}

/** Aplica de una sola vez lo que no tiene duda razonable. */
function aplicarTodoSugerido() {
  const r = correrConciliacion();
  let n = 0; const fallos = [];
  for (const s of r.automaticos) {
    const d = repartir(s.libre, s.cuota.c);
    if (!d.partes.length || d.sobrante > TOLERANCIA_C) continue;
    try { aplicarConciliacion({ movimientoId: s.mov.id, asignaciones: d.partes, via: s.via }); n++; }
    catch (e) { fallos.push(e.message); }
  }
  return { aplicados: n, fallos };
}
