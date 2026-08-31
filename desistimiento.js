/* ============================================================
   DESISTIMIENTO Y COMISIÓN EN DOS TRAMOS

   El caso que lo obligó: cinco lotes vendidos a finales de mayo,
   comisión pagada completa, y los clientes dejaron de pagar en la
   tercera cuota. La empresa recuperó el lote pero ya había pagado
   una comisión sobre una venta que nunca se sostuvo.

   La política, decidida por la gerencia:

     40 %  al aprobarse la venta
     60 %  cuando el cliente paga la tercera cuota

   La lógica: la primera cuota es el enganche — todo el mundo lo
   paga, es el entusiasmo de la firma. La tercera es la primera
   señal real de que el cliente va a seguir pagando. Ese es el
   momento en que la venta deja de ser una promesa.

   Si el cliente desiste antes de la tercera cuota, el 60 % no se
   devengó nunca — no hay nada que descontar, simplemente no se
   paga. Eso importa: el vendedor no queda debiendo dinero, que es
   lo que pasaría si se pagara todo por adelantado y hubiera que
   cobrarlo de vuelta.

   Lo ya pagado no se persigue. Se anota y ahí queda.
   ============================================================ */

/* ---------- La política ---------- */
const TRAMOS_COMISION = [
  { id: 'venta',  pct: 0.40, etiqueta: 'Al aprobarse la venta',
    condicion: 'Contrato aprobado' },
  { id: 'cuota3', pct: 0.60, etiqueta: 'A la tercera cuota',
    condicion: 'El cliente pagó tres cuotas' },
];
const CUOTA_QUE_CONSOLIDA = 3;

/* ---------- Cuántas cuotas lleva pagadas de verdad ---------- */
/**
 * Se cuenta sobre pagos confirmados, no sobre lo que dice el estado
 * del giro: un giro puede quedar marcado por conciliación y todavía
 * no estar confirmado por el financiero.
 */
/* El contrato guarda clienteId, no el nombre; y el enganche vive
   dentro del plan. Costó una prueba descubrirlo: la bitácora salía
   diciendo «A-13 · undefined». */
const clienteDe  = ct => nombreCliente(ct.clienteId);
const engancheDe = ct => (ct.plan && ct.plan.enganche) || 0;

/**
 * Tres fuentes dicen cuántas cuotas lleva pagadas un contrato, y no
 * dicen lo mismo. Manda la más reciente y la más específica:
 *
 *   1. Los recibos del CRM · llegan al 06/08 y son el documento que
 *      se le entregó al cliente. Es lo que él tiene en la mano.
 *   2. El modelo financiero · corte anterior.
 *   3. El cálculo del portal · el más viejo de los tres.
 *
 * No es un detalle. A-13 aparecía con 1 cuota en el portal y tiene 3
 * en el CRM: con 1 se le cancela el 60 % de la comisión al vendedor,
 * con 3 se le paga completa. La fuente equivocada le quita Q745 a
 * alguien que se los ganó.
 */
function cuotasPagadas(ct) {
  if (typeof cuotasDelSaldoPagadas === 'function') {
    const n = cuotasDelSaldoPagadas(ct.no);
    if (n > 0) return n;
  }
  const e = estadoCuenta(ct);
  if (e.cuotasPagadasModelo != null) return e.cuotasPagadasModelo;
  return e.pagadas;
}

/** De dónde salió el número, para poder discutirlo. */
function fuenteCuotas(ct) {
  if (typeof cuotasDelSaldoPagadas === 'function' && cuotasDelSaldoPagadas(ct.no) > 0)
    return 'Recibos del CRM · corte 06/08/2026';
  const e = estadoCuenta(ct);
  return e.cuotasPagadasModelo != null ? 'Modelo financiero' : 'Cálculo del portal';
}

/** Dónde las tres fuentes no coinciden. Vale la pena mirarla antes de liquidar. */
function discrepanciasCuotas() {
  return DB.contratos.filter(c => c.estado === 'aprobado').map(c => {
    const e = estadoCuenta(c);
    const crm = typeof cuotasDelSaldoPagadas === 'function' ? cuotasDelSaldoPagadas(c.no) : null;
    return { no: c.no, lote: c.lote, crm, modelo: e.cuotasPagadasModelo, portal: e.pagadas };
  }).filter(x => x.crm != null && x.modelo != null && x.crm !== x.modelo);
}

/**
 * Qué tramos tiene ganados este contrato hoy.
 * Devuelve los dos tramos siempre, cada uno con su estado, para que
 * el vendedor pueda ver lo que le falta y por qué.
 */
function tramosDe(ct) {
  const base = calcularComision(ct);
  const pag = cuotasPagadas(ct);
  const desistido = ct.estado === 'desistido';
  const aprobado = ct.estado === 'aprobado';

  return TRAMOS_COMISION.map(t => {
    const monto = Math.round(base * t.pct * 100) / 100;
    let estado, porque;
    if (t.id === 'venta') {
      if (aprobado || desistido) { estado = 'devengado'; porque = 'La venta se aprobó.'; }
      else { estado = 'pendiente'; porque = 'La venta todavía no está aprobada.'; }
    } else {
      if (pag >= CUOTA_QUE_CONSOLIDA) { estado = 'devengado'; porque = `El cliente lleva ${pag} cuotas pagadas.`; }
      else if (desistido) { estado = 'cancelado'; porque = `El cliente desistió con ${pag} cuota${pag===1?'':'s'} pagada${pag===1?'':'s'}. Este tramo no llegó a devengarse.`; }
      else { estado = 'pendiente'; porque = `Faltan ${CUOTA_QUE_CONSOLIDA - pag} cuota${CUOTA_QUE_CONSOLIDA-pag===1?'':'s'} para consolidarlo.`; }
    }
    return { ...t, monto, estado, porque, cuotasPagadas: pag };
  });
}

/** Lo que hoy se le puede liquidar a alguien por este contrato. */
const comisionDevengada = ct =>
  Math.round(tramosDe(ct).filter(t => t.estado === 'devengado')
    .reduce((s, t) => s + t.monto, 0) * 100) / 100;

/* ============================================================
   El desistimiento
   ============================================================ */

/** Qué pasa si se registra el desistimiento. Se calcula ANTES de tocar nada. */
function simularDesistimiento(ct) {
  const e = estadoCuenta(ct);
  const pag = cuotasPagadas(ct);
  const tramos = tramosDe(ct);
  const t2 = tramos.find(t => t.id === 'cuota3');

  // Lo que ya se le liquidó a este vendedor por este contrato
  const yaLiquidado = (DB.liquidaciones || [])
    .filter(l => l.estado === 'pagada')
    .flatMap(l => (l.contratos || []).filter(c => c.no === ct.no)
      .map(c => ({ comision: c.comision, liquidacion: l.numero, fecha: l.pago ? l.pago.fecha : l.creada })));
  const pagadoAlVendedor = Math.round(yaLiquidado.reduce((s, x) => s + x.comision, 0) * 100) / 100;

  const tramo2SeCancela = t2.estado !== 'devengado';
  const yaCobroDeMas = Math.max(0, Math.round((pagadoAlVendedor - comisionDevengada(ct)) * 100) / 100);

  return {
    lote: ct.lote, cliente: clienteDe(ct), vendedor: ct.vendedor,
    cuotasPagadas: pag,
    recaudado: e.recaudado,
    // El primer pago es arras. No se devuelve.
    arras: engancheDe(ct),
    tramos, tramo2SeCancela,
    montoCancelado: tramo2SeCancela ? t2.monto : 0,
    pagadoAlVendedor, yaLiquidado, yaCobroDeMas,
    avisos: [
      `El lote ${ct.lote} vuelve a inventario y queda disponible para vender.`,
      `Lo recaudado (${_Q(e.recaudado)}) no se devuelve: el primer pago queda como arras según el contrato.`,
      tramo2SeCancela
        ? `Se cancela el 60 % de la comisión (${_Q(t2.monto)}) porque nunca llegó a devengarse.`
        : `La comisión ya estaba devengada completa: el cliente pagó ${pag} cuotas. No se descuenta nada.`,
      yaCobroDeMas > 0
        ? `Atención: ya se le liquidaron ${_Q(pagadoAlVendedor)} a ${ct.vendedor}, ${_Q(yaCobroDeMas)} por encima de lo devengado. Esto es de los casos anteriores a la política de tramos — se anota, y se decide aparte si se descuenta de la próxima liquidación.`
        : null,
    ].filter(Boolean)
  };
}

/**
 * Registra el desistimiento. Nada se borra: el contrato queda con
 * su historia completa, marcado como desistido.
 */
function registrarDesistimiento(contratoId, { motivo, fecha, nota } = {}) {
  const ct = getContrato(contratoId);
  if (!ct) throw new Error('No existe ese contrato');
  if (ct.estado === 'desistido') throw new Error('Ese contrato ya está marcado como desistido');
  if (!motivo) throw new Error('Hay que anotar el motivo del desistimiento');

  const sim = simularDesistimiento(ct);

  ct.estado = 'desistido';
  ct.desistimiento = {
    fecha: fecha || HOY_ISO, motivo, nota: nota || '',
    quien: usuarioActual(), cuando: new Date().toISOString(),
    cuotasPagadas: sim.cuotasPagadas,
    recaudado: sim.recaudado,
    arrasRetenidas: sim.arras,
    comisionCancelada: sim.montoCancelado,
    comisionYaPagada: sim.pagadoAlVendedor,
    saldoAFavorEmpresa: sim.yaCobroDeMas,
  };

  // El lote vuelve a inventario
  const lote = getLote(ct.lote);
  if (lote) { lote.estado = 'disponible'; lote.contratoId = null; }

  // Las cuotas que no se pagaron dejan de estar vencidas: ya no se persiguen
  (ct.obligaciones || []).forEach(o => (o.giros || []).forEach(g => {
    if (g.estado === 'pendiente' || g.estado === 'vencido') g.estado = 'cancelado';
  }));

  anotar('venta.desistida',
    `${ct.lote} · ${clienteDe(ct)} — ${motivo}. ${sim.cuotasPagadas} cuotas pagadas, ` +
    `arras retenidas ${_Q(sim.arras)}` +
    (sim.montoCancelado ? `, comisión cancelada ${_Q(sim.montoCancelado)}` : ''),
    { contratoId: ct.id, lote: ct.lote });

  if (sim.montoCancelado)
    anotar('comision.cancelada',
      `${_Q(sim.montoCancelado)} de ${ct.vendedor} por ${ct.lote}: el tramo de la tercera cuota no se devengó.`,
      { contratoId: ct.id });

  saveDB();
  return sim;
}

/** Deshacer: el cliente volvió a pagar. Se anota, no se borra el rastro. */
function revertirDesistimiento(contratoId, motivo) {
  const ct = getContrato(contratoId);
  if (!ct || ct.estado !== 'desistido') throw new Error('Ese contrato no está desistido');
  ct.estado = 'aprobado';
  ct.desistimientoRevertido = { de: ct.desistimiento, motivo,
    quien: usuarioActual(), cuando: new Date().toISOString() };
  delete ct.desistimiento;
  const lote = getLote(ct.lote);
  if (lote) { lote.estado = 'vendido'; lote.contratoId = ct.id; }
  (ct.obligaciones || []).forEach(o => (o.giros || []).forEach(g => {
    if (g.estado === 'cancelado') g.estado = 'pendiente';
  }));
  recalcular(ct);
  anotar('venta.desistida', `REVERTIDO · ${ct.lote} vuelve a estar vigente. ${motivo}`, { contratoId: ct.id });
  saveDB();
}

/* ---------- Los que ya desistieron ---------- */
const desistidos = () => DB.contratos.filter(c => c.estado === 'desistido');

function resumenDesistimientos() {
  const d = desistidos();
  return {
    contratos: d.length,
    lotesRecuperados: d.length,
    arrasRetenidas: Math.round(d.reduce((s, c) => s + ((c.desistimiento||{}).arrasRetenidas || 0), 0) * 100) / 100,
    comisionCancelada: Math.round(d.reduce((s, c) => s + ((c.desistimiento||{}).comisionCancelada || 0), 0) * 100) / 100,
    comisionPagadaDeMas: Math.round(d.reduce((s, c) => s + ((c.desistimiento||{}).saldoAFavorEmpresa || 0), 0) * 100) / 100,
  };
}

const MOTIVOS_DESISTIMIENTO = [
  'Dejó de pagar y no responde',
  'Problemas económicos del cliente',
  'El cliente pidió cancelar',
  'Ya no le interesó el lote',
  'Se cambió a otro lote',
  'Falleció el titular',
  'Otro',
];
