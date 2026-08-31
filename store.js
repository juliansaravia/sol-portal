/* ============================================================
   SUITE SOL INMOBILIARIA · Capa de datos y persistencia
   Guarda en localStorage. Al conectar el API del CRM/KOMMO,
   basta sustituir load()/save() por llamadas a la API.
   ============================================================ */
const STORE_KEY = 'solinmobiliaria_suite_v4';

/* ---------------------------------------------------------------------------
   REGLAS DE FINANCIAMIENTO (verificadas contra el contrato real J-05)
   Saldo a financiar = precio − enganche
   Capital mensual   = saldo / plazo
   Interés mensual   = saldo × 1.5 %   (interés PLANO sobre el saldo original)
   Cuota             = capital + interés
   Ejemplo J-05: saldo 84,104.82 · 84 giros → 1,001.25 + 1,261.57 = 2,262.82 ✓
   --------------------------------------------------------------------------- */
const TASA_MENSUAL = 0.015;          // 1.5 % mensual · 18 % anual (plano)
const PLAZOS = [12, 24, 36, 48, 60, 72, 84];
const ENGANCHE_MIN = 2500;

/* Mora (cláusula del contrato): 2 % mensual sobre el saldo pendiente de pago.
   Se aplica sobre las cuotas vencidas, prorrateado por días de atraso. */
const TASA_MORA = 0.02;
const DIAS_GRACIA = 0;               // ajustar si se otorgan días de gracia

/* Comisión del vendedor: 2 % del valor del lote */
const COMISION_PCT = 0.02;

function planFinanciamiento(precio, enganche, plazo, tasa){
  precio = +precio || 0;
  enganche = Math.min(+enganche || 0, precio);
  plazo = +plazo || 60;
  tasa = (tasa === undefined || tasa === null) ? TASA_MENSUAL : +tasa;
  const saldo   = Math.max(0, precio - enganche);
  const capital = saldo / plazo;
  const interes = saldo * tasa;
  const cuota   = capital + interes;
  const totalGiros = cuota * plazo;
  return {
    precio, enganche, plazo, saldo,
    capital: r2(capital), interes: r2(interes), cuota: r2(cuota),
    totalGiros: r2(totalGiros),
    totalInteres: r2(interes * plazo),
    total: r2(enganche + totalGiros),
    tasa
  };
}
const r2 = n => Math.round(n * 100) / 100;

/* Modelo en memoria */
const DB = {
  lotes: [], contratos: [], clientes: [], pagos: [],
  gestiones: [], documentos: [], leadsFunnel: [], equipo: [],
  recaudacion: [], movimientos: [], declaradas: [], conciliaciones: [], liquidaciones: [],
  bitacora: [],
  meta: { correlativo: 131, version: 1 }
};

/* ---------- Bitácora ----------
   Todo lo que toca dinero, permisos o el estado de un contrato
   deja rastro. No se puede borrar desde la interfaz: si algo se
   deshace, se anota el deshacer, no se quita el original.       */
const BITACORA_MAX = 2000;
function anotar(accion, detalle, extra = {}) {
  const e = {
    id: uid(), ts: new Date().toISOString(),
    quien: (typeof USUARIO !== 'undefined' && USUARIO) ? USUARIO : 'sistema',
    rol: (typeof ROLE !== 'undefined') ? ROLE : '—',
    accion, detalle, ...extra
  };
  DB.bitacora.unshift(e);
  if (DB.bitacora.length > BITACORA_MAX) DB.bitacora.length = BITACORA_MAX;
  saveDB();
  return e;
}

/* Roles del equipo. Solo 'vendedor' genera comisión. */
const ROLES_EQUIPO = [
  { id:'admin',      label:'Administrador',        comisiona:false },
  { id:'gerencia',   label:'Gerencia',             comisiona:false },
  { id:'vendedor',   label:'Vendedor',             comisiona:true  },
  { id:'cobranza',   label:'Cobranza',             comisiona:false },
  { id:'financiero', label:'Financiero',           comisiona:false },
  { id:'confirmacion',label:'Confirmación de pagos',comisiona:false },
];
const rolLabel = id => (ROLES_EQUIPO.find(r=>r.id===id)||{}).label || id;
const rolComisiona = id => !!(ROLES_EQUIPO.find(r=>r.id===id)||{}).comisiona;

/* ---------- Utilidades ---------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const HOY_ISO = '2026-08-03';   // fecha de corte del sistema
const addMonths = (iso, m) => { const d = new Date(iso + 'T00:00:00'); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };

/* ---------- Persistencia ---------- */
const LS = () => { try { return window.localStorage; } catch (e) { return null; } };
/* Con la base conectada, el navegador NO es el lugar donde viven los
   datos: son de Supabase y los ve todo el equipo. Guardar aquí una
   copia solo serviría para que dos personas se pisen sin saberlo.

   Mientras el modo consulta esté encendido tampoco se escribe a la
   base: el equipo entra a mirar, no a registrar. El interruptor está
   en la tabla `ajuste`, no aquí — así no se le da la vuelta desde el
   navegador. */
function saveDB() {
  if (typeof SESION !== 'undefined' && SESION.persona) {
    if (SESION.modoConsulta) {
      console.warn('[modo consulta] no se guardó nada');
      if (typeof toast === 'function') toast('Modo consulta: todavía no se registra nada');
    }
    return;   // en remoto, cada operación escribe su propia tabla
  }
  const s = LS(); if (!s) return;      // modo demostración, sin conexión
  try { s.setItem(STORE_KEY, JSON.stringify(DB)); }
  catch (e) { console.warn('No se pudo guardar:', e.message); }
}
function loadDB() {
  const s = LS(); if (!s) return false;
  try {
    const raw = s.getItem(STORE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || !d.lotes || !d.lotes.length) return false;
    Object.keys(DB).forEach(k => { if (d[k] !== undefined) DB[k] = d[k]; });
    return true;
  } catch (e) { return false; }
}
function resetDB() {
  const s = LS(); if (s) { try { s.removeItem(STORE_KEY); } catch (e) {} }
  location.reload();
}

/* ---------- Semilla (solo datos REALES extraídos del CRM) ---------- */
function seedDB() {
  seedEquipo();
  // 1. Lotes reales del CRM + coordenadas reales del plano
  const geo = {};
  (window.LOT_GEO || []).forEach(g => { geo[g.id] = g; });

  DB.lotes = LOTES_RAW.trim().split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const [codigo, precio, area, est] = s.split('|');
    const g = geo[codigo];
    return {
      codigo, manzana: codigo.split('-')[0], precio: +precio, area: +area,
      // 'P' = está en el plano pero le falta el alta (área y precio).
      // No se puede cotizar ni vender hasta que alguien lo complete.
      estado: est === 'V' ? 'vendido' : (est === 'P' ? 'por_dar_de_alta' : 'disponible'),
      x: g ? g.x : null, y: g ? g.y : null, tipo: g ? g.tipo : null
    };
  });

  // 2. Cartera REAL (Modelo Financiero: 111 contratos con cliente, vendedor y pagos)
  const fuente = (typeof CONTRATOS_REALES !== 'undefined' && CONTRATOS_REALES.length)
                 ? CONTRATOS_REALES : null;
  if (fuente) {
    DB.contratos = fuente.map(c => {
      const cli = crearCliente(c.cliente);
      const ct = {
        id: uid(), no: c.no, lote: c.lote, clienteId: cli.id,
        fecha: c.fecha, precio: c.precio, estado: 'aprobado',
        vendedor: c.vendedor || 'Sin asignar',
        firma: 'firmado', origen: 'CRM', integrantes: [],
        fuente: 'Modelo Financiero', recaudadoBase: c.pagado || 0,
        banco: c.banco, boleta: c.boleta
      };
      ct.obligaciones = crearObligaciones(ct, c.pagado || 0,
        { enganche: c.enganche, plazo: c.plazo || 1, tasa: c.tasa });
      return ct;
    });
    // correlativo = mayor SD-n encontrado
    const max = fuente.reduce((m, c) => {
      const n = parseInt(String(c.no).replace(/\D/g, ''), 10);
      return (n && n > m) ? n : m; }, 0);
    DB.meta.correlativo = Math.max(131, max);
  } else {
    DB.contratos = CONTRATOS_RAW.map((c, i) => {
      const cli = crearCliente(c.cliente);
      const ct = { id: uid(), no: c.no, lote: c.lote, clienteId: cli.id,
        fecha: c.fecha, precio: c.precio, estado: 'aprobado',
        vendedor: VENDEDORES[i % VENDEDORES.length], firma: 'firmado',
        origen: 'Campo', integrantes: [], fuente: 'CRM', recaudadoBase: c.recaudado };
      ct.obligaciones = crearObligaciones(ct, c.recaudado);
      return ct;
    });
    DB.meta.correlativo = 131;
  }
  saveDB();
}

/* ---------- Equipo (usuarios y vendedores) ---------- */
/* Sembrado con el personal real del CRM y los vendedores de la cartera */
const EQUIPO_SEED = [
  { nombre:'Julián Saravia',  codigo:'JS',  rol:'admin',       activo:true  },
  { nombre:'Jorge Aceituno',  codigo:'JA',  rol:'admin',       activo:true  },
  { nombre:'Benjamín Reyes',  codigo:'BR',  rol:'gerencia',    activo:true  },
  { nombre:'Andy Chavac',     codigo:'AND', rol:'vendedor',    activo:true, alias:['Andy','ANDY','Andy Chavac'] },
  { nombre:'Marlon Calí',     codigo:'MAR', rol:'vendedor',    activo:true, alias:['Marlon','MARLON','Marlon Cali'] },
  { nombre:'Gabriel Reyes',   codigo:'GR',  rol:'vendedor',    activo:true, alias:['Gabriel'] },
  { nombre:'Diego Reyes',     codigo:'DR',  rol:'vendedor',    activo:true, alias:['Diego'],
    nota:'Administrador de venta en las fichas de abril y agosto' },
  { nombre:'Víctor del Valle',codigo:'VDV', rol:'vendedor',    activo:true  },
  { nombre:'Lester Sapon',    codigo:'LS',  rol:'vendedor',    activo:false, nota:'Ya no labora en la empresa' },
  { nombre:'David Cermeño',   codigo:'DC',  rol:'financiero',  activo:true,  alias:['David','DAVID'] },
  { nombre:'Norman Estrada',  codigo:'NE',  rol:'cobranza',    activo:true  },
  { nombre:'Pedro Ramírez',   codigo:'PR',  rol:'cobranza',    activo:true  },
  { nombre:'Edwin Mazariegos',codigo:'EM',  rol:'cobranza',    activo:true, alias:['Edwin'] },
  { nombre:'Gabriela Cox',    codigo:'GC',  rol:'confirmacion',activo:true, alias:['Gabriela'],
    nota:'Registra pagos en el CRM (23 recibos)' },
];
function seedEquipo(){
  DB.equipo = EQUIPO_SEED.map(p => ({ id: uid(), telefono:'', email:'', ...p }));
}
const equipoActivo   = () => DB.equipo.filter(p => p.activo);
const vendedores     = () => DB.equipo.filter(p => p.rol==='vendedor' && p.activo);
const buscarPersona  = nombre => {
  if(!nombre) return null;
  const n = String(nombre).trim().toLowerCase();
  return DB.equipo.find(p => p.nombre.toLowerCase()===n
      || (p.alias||[]).some(a=>a.toLowerCase()===n)) || null;
};
/* El nombre canónico de quien vendió: los contratos traen "Andy" y en el
   equipo está "Andy Chavac". Sin esto la comisión se le pierde. */
const nombreCanonico = v => { const p = buscarPersona(v); return p ? p.nombre : v; };
/* Contratos y comisión acumulada de una persona */
const contratosDe = nombre => DB.contratos.filter(c => c.vendedor===nombre && c.estado!=='anulado');
function guardarPersona(datos){
  if(datos.id){ const p=DB.equipo.find(x=>x.id===datos.id); if(p) Object.assign(p,datos); }
  else { DB.equipo.push({ id:uid(), activo:true, telefono:'', email:'', ...datos }); }
  saveDB();
}
function borrarPersona(id){
  const p=DB.equipo.find(x=>x.id===id); if(!p) return;
  p.activo=false; saveDB();
}
/* Reasigna todos los contratos de un vendedor a otro */
function reasignarContratos(de, a){
  let n=0;
  DB.contratos.forEach(c=>{ if(c.vendedor===de){ c.vendedor=a; n++; } });
  saveDB(); return n;
}

/* ---------- Clientes ---------- */
function crearCliente(nombreCompleto, extra = {}) {
  const partes = nombreCompleto.trim().split(' ');
  const cli = {
    id: uid(),
    nombre: partes.slice(0, 2).join(' '),
    apellido: partes.slice(2).join(' '),
    dpi: extra.dpi || '', telefono: extra.telefono || '',
    email: extra.email || '', direccion: extra.direccion || '',
    ocupacion: extra.ocupacion || '', ingresoMensual: extra.ingresoMensual || null,
    constancia: extra.constancia || null, pesoConstancia: extra.pesoConstancia ?? null,
    pariente: extra.pariente || null,
    creado: HOY_ISO
  };
  DB.clientes.push(cli);
  return cli;
}
const getCliente = id => DB.clientes.find(c => c.id === id);
const nombreCliente = id => { const c = getCliente(id); return c ? `${c.nombre} ${c.apellido}`.trim() : '—'; };

/* ---------- Obligaciones y giros (estructura real del CRM) ---------- */
/* Cada contrato se divide en: CUOTA INICIAL (1 giro) + SALDO DEUDOR (n giros) */
function crearObligaciones(ct, recaudado = 0, cfg = {}) {
  const enganche = cfg.enganche !== undefined ? cfg.enganche
                 : (cfg.reserva !== undefined ? cfg.reserva : ENGANCHE_MIN);
  const plazo = cfg.plazo || cfg.girosSaldo || 60;
  const plan = planFinanciamiento(ct.precio, enganche, plazo, cfg.tasa);
  ct.plan = plan;

  const obs = [
    mkObl('inicial', 'Cuota Inicial', plan.enganche, 1, ct.fecha, plan.enganche),
    mkObl('saldo', 'Saldo Deudor', plan.totalGiros, plazo, addMonths(ct.fecha, 1), plan.cuota)
  ];
  aplicarRecaudo(obs, recaudado, ct);
  return obs;
}
function mkObl(tipo, desc, monto, nGiros, fechaBase, cuotaFija) {
  const cuota = cuotaFija !== undefined ? r2(cuotaFija)
              : (nGiros > 0 ? r2(monto / nGiros) : 0);
  const giros = [];
  for (let i = 1; i <= nGiros; i++) {
    giros.push({ n: i, venc: addMonths(fechaBase, i - 1), monto: cuota, estado: 'pendiente' });
  }
  // La última cuota absorbe el residuo de redondeo (igual que el CRM real)
  if (giros.length) {
    const suma = r2(cuota * nGiros);
    const dif = r2(r2(monto) - suma);
    if (Math.abs(dif) >= 0.01) giros[giros.length - 1].monto = r2(cuota + dif);
  }
  return { tipo, desc, monto: r2(monto), nGiros, giros };
}
/* Distribuye lo recaudado sobre los giros en orden y marca vencidos */
function aplicarRecaudo(obs, recaudado, ct) {
  let resto = recaudado;
  obs.forEach(o => o.giros.forEach(g => {
    if (resto >= g.monto - 0.01) { g.estado = 'pagado'; resto -= g.monto; }
    else if (resto > 0) { g.estado = 'parcial'; g.abonado = Math.round(resto * 100) / 100; resto = 0; }
    else { g.estado = g.venc < HOY_ISO ? 'vencido' : 'pendiente'; }
  }));
}
/* Recalcula estados a partir de los pagos confirmados */
function recalcular(ct) {
  const rec = recaudadoDe(ct);
  ct.obligaciones.forEach(o => o.giros.forEach(g => { g.estado = 'pendiente'; delete g.abonado; }));
  aplicarRecaudo(ct.obligaciones, rec, ct);
}

/* ---------- Mora ---------- */
const diasEntre = (a, b) => Math.floor((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
/* Devuelve la mora acumulada de un contrato a la fecha */
function calcularMora(ct, hasta) {
  hasta = hasta || HOY_ISO;
  let total = 0; const detalle = [];
  ct.obligaciones.forEach(o => o.giros.forEach(g => {
    if (g.estado !== 'vencido' && g.estado !== 'parcial') return;
    const dias = diasEntre(g.venc, hasta) - DIAS_GRACIA;
    if (dias <= 0) return;
    const base = g.estado === 'parcial' ? r2(g.monto - (g.abonado || 0)) : g.monto;
    const mora = r2(base * TASA_MORA * (dias / 30));
    total += mora;
    detalle.push({ giro: g.n, obl: o.desc, venc: g.venc, dias, base, mora });
  }));
  return { total: r2(total), detalle };
}
/* Comisión del vendedor: 2 % del valor del lote */
const calcularComision = ct => r2((ct.precio || 0) * COMISION_PCT);

/* ---------- Cálculos de cartera ---------- */
const pagosDe = ct => DB.pagos.filter(p => p.contratoId === ct.id);
const recaudadoDe = ct => {
  const propios = pagosDe(ct).filter(p => p.estado === 'confirmado').reduce((s, p) => s + p.monto, 0);
  return (ct.recaudadoBase || 0) + propios;
};
/* ============================================================
   MORA · qué dice el modelo financiero

   El cálculo propio reconstruye el calendario de pagos y no
   reproduce la lógica del CRM: daba 92 contratos en mora cuando
   son 23. Hasta que reproduzca esa lógica, manda el modelo.

   `discrepanciasMora()` deja ver dónde no coinciden, en vez de
   esconder la diferencia detrás de un número bonito.
   ============================================================ */
const moraOficialDe = ct => (typeof MORA_OFICIAL !== 'undefined' ? MORA_OFICIAL[ct.no] : null) || null;
const enMoraOficial = ct => !!moraOficialDe(ct);

/** Los números de cartera que se muestran, tomados de la fuente buena. */
function resumenMora() {
  const of = (typeof MORA_OFICIAL !== 'undefined') ? MORA_OFICIAL : {};
  const lista = Object.entries(of).map(([no, m]) => ({ no, ...m }));
  return {
    enMora: lista.length,
    vigentes: (typeof MORA_RESUMEN !== 'undefined' ? MORA_RESUMEN.vigentes : null),
    saldoVencido: Math.round(lista.reduce((s, m) => s + (m.saldoVenc || 0), 0) * 100) / 100,
    cuotasAtraso: lista.reduce((s, m) => s + (m.atraso || 0), 0),
    nuncaPagaron: lista.filter(m => !m.cuotasPag),
    lista,
    fuente: 'Modelo Financiero'
  };
}

/**
 * Dónde el cálculo del portal no coincide con el modelo.
 * Esto no se corrige solo: es una lista de trabajo.
 */
function discrepanciasMora() {
  const out = [];
  DB.contratos.filter(c => c.estado === 'aprobado').forEach(c => {
    const of = moraOficialDe(c);
    const mio = estadoCuentaCrudo(c);
    const yoDigo = mio.vencidas > 0, elDice = !!of;
    if (yoDigo !== elDice)
      out.push({ contrato: c.no, lote: c.lote, cliente: nombreCliente(c.clienteId),
                 portal: yoDigo ? 'en mora' : 'vigente',
                 modelo: elDice ? 'en mora' : 'vigente',
                 vencidasPortal: mio.vencidas,
                 atrasoModelo: of ? of.atraso : 0 });
  });
  return out;
}

function estadoCuenta(ct) {
  const giros = ct.obligaciones.flatMap(o => o.giros.map(g => ({ ...g, obl: o.desc })));
  const totalGiros = giros.reduce((s, g) => s + g.monto, 0);
  const pagadas = giros.filter(g => g.estado === 'pagado').length;
  const vencidos = giros.filter(g => g.estado === 'vencido');
  const montoVencido = vencidos.reduce((s, g) => s + g.monto, 0);
  const rec = recaudadoDe(ct);
  const saldo = Math.max(0, totalGiros - rec);
  const prox = giros.find(g => g.estado === 'pendiente' || g.estado === 'vencido' || g.estado === 'parcial');
  const pct = totalGiros ? Math.min(100, Math.round(rec / totalGiros * 100)) : 0;
  const of = moraOficialDe(ct);
  return {
    giros, totalGiros, pagadas, totalGirosN: giros.length,
    // Lo que el portal calcula por su cuenta — se conserva para poder comparar
    vencidasCalculadas: vencidos.length,
    montoVencidoCalculado: montoVencido,
    // Lo que manda: el modelo financiero
    vencidas: of ? (of.atraso || 0) : 0,
    montoVencido: of ? (of.saldoVenc || 0) : 0,
    enMora: !!of,
    cuotasPagadasModelo: of ? of.cuotasPag : null,
    fuenteMora: of ? 'Modelo Financiero' : (typeof MORA_OFICIAL !== 'undefined' ? 'Modelo Financiero · vigente' : 'cálculo propio'),
    recaudado: rec, saldo, prox, pct
  };
}

/** La versión sin corregir, para poder contrastar. */
function estadoCuentaCrudo(ct) {
  const giros = ct.obligaciones.flatMap(o => o.giros.map(g => ({ ...g, obl: o.desc })));
  const vencidos = giros.filter(g => g.estado === 'vencido');
  return { vencidas: vencidos.length,
           montoVencido: vencidos.reduce((s, g) => s + g.monto, 0) };
}

/* ---------- Accesores ---------- */
const getLote = c => DB.lotes.find(l => l.codigo === c);
const getContrato = id => DB.contratos.find(c => c.id === id);
const contratoDeLote = codigo => DB.contratos.find(c => c.lote === codigo && c.estado !== 'anulado');
const gestionesDe = id => DB.gestiones.filter(g => g.contratoId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
const documentosDe = id => DB.documentos.filter(d => d.contratoId === id);

/* ---------- Mutaciones ---------- */
function nuevoContrato({ lote, nombre, dpi, telefono, email, vendedor, reserva, enganche, plazo, girosSaldo, origen,
                         direccion, ocupacion, ingresoMensual, constancia, pesoConstancia, pariente }) {
  const l = getLote(lote);
  // El expediente completo se guarda en el cliente: es lo que después
  // permite cobrar, y lo que arma la carpeta para el buró de créditos.
  const cli = crearCliente(nombre, { dpi, telefono, email, direccion, ocupacion,
                                     ingresoMensual, constancia, pesoConstancia, pariente });
  DB.meta.correlativo++;
  const ct = {
    id: uid(), no: 'SD-' + DB.meta.correlativo, lote, clienteId: cli.id,
    fecha: HOY_ISO, precio: l.precio, estado: 'en_aprobacion',
    vendedor: vendedor || 'Compra en línea', firma: 'firmado',
    origen: origen || 'Campo', integrantes: [], recaudadoBase: 0, fuente: 'Suite',
    ingresoDeclarado: ingresoMensual || null, constancia: constancia || null
  };
  ct.obligaciones = crearObligaciones(ct, 0, {
    enganche: enganche !== undefined ? enganche : reserva,
    plazo: plazo || girosSaldo
  });
  DB.contratos.push(ct);
  if (l) l.estado = 'reservado';
  registrarGestion(ct.id, 'Bitácora Socios', 'Contactado', 'Contrato creado desde ' + ct.origen);
  saveDB();
  return ct;
}
function registrarPago(contratoId, { monto, forma, cuenta, referencia }) {
  const p = { id: uid(), contratoId, monto: +monto, forma, cuenta, referencia,
              fecha: HOY_ISO, estado: 'registrado', registrado: new Date().toISOString() };
  DB.pagos.push(p); saveDB(); return p;
}
function confirmarPago(pagoId, ok = true) {
  const p = DB.pagos.find(x => x.id === pagoId); if (!p) return;
  p.estado = ok ? 'confirmado' : 'rechazado';
  p.fechaAprobacion = HOY_ISO;
  const ct = getContrato(p.contratoId);
  if (ct) recalcular(ct);
  saveDB();
}
/* ============================================================
   RECAUDACIÓN SEMANAL
   El ciclo: Slack avisa qué vence → cobranza marca aquí lo que
   cobró y lo que no → el pago entra como 'registrado' y lo
   confirma el financiero → la cartera se actualiza → el resumen
   de la próxima semana ya refleja lo que pasó.
   ============================================================ */

/* Clave única de una cuota del calendario: contrato + fecha de vencimiento */
const claveCuota = (contrato, fecha) => contrato + '|' + fecha;

const buscarRecaudo = (contrato, fecha) =>
  DB.recaudacion.find(r => r.clave === claveCuota(contrato, fecha));

/* Motivos por los que no se cobra. Importan: alimentan la lectura del sistema. */
const MOTIVOS_NO_COBRO = [
  { id:'no_contesta',  label:'No contesta',              escala:true  },
  { id:'promesa',      label:'Prometió pagar (fecha)',   escala:false },
  { id:'sin_fondos',   label:'Dice no tener fondos',     escala:true  },
  { id:'no_ubicado',   label:'No se pudo ubicar',        escala:true  },
  { id:'sin_telefono', label:'No tiene teléfono registrado', escala:true },
  { id:'disputa',      label:'Reclamo o disputa',        escala:true  },
  { id:'otro',         label:'Otro',                     escala:false },
];
const motivoLabel = id => (MOTIVOS_NO_COBRO.find(m=>m.id===id)||{}).label || id;

/**
 * Marca una cuota como COBRADA. Registra el pago en estado 'registrado':
 * quien cobra no confirma — eso lo hace el financiero (separación de funciones).
 */
function marcarCobrada(contrato, fecha, { monto, forma, cuenta, referencia, nota }) {
  const ct = DB.contratos.find(c => c.no === contrato);
  let pagoId = null;
  if (ct) pagoId = registrarPago(ct.id, { monto, forma, cuenta, referencia }).id;

  const prev = buscarRecaudo(contrato, fecha);
  const reg = prev || { id: uid(), clave: claveCuota(contrato, fecha), contrato, fecha };
  Object.assign(reg, {
    estado: 'cobrada', monto: +monto, forma, cuenta, referencia, nota: nota || '',
    pagoId, motivo: null,
    usuario: (window.__user ? window.__user.name : 'Cobranza'),
    marcado: new Date().toISOString()
  });
  if (!prev) DB.recaudacion.push(reg);
  if (ct) registrarGestion(ct.id, 'Cobro', 'Cobrada', `Cuota del ${fecha} · ${referencia||'sin boleta'}`);
  saveDB();
  return reg;
}

/** Marca una cuota como NO COBRADA con su motivo. */
function marcarNoCobrada(contrato, fecha, { motivo, nota, promesa }) {
  const ct = DB.contratos.find(c => c.no === contrato);
  const prev = buscarRecaudo(contrato, fecha);
  const reg = prev || { id: uid(), clave: claveCuota(contrato, fecha), contrato, fecha };
  Object.assign(reg, {
    estado: 'no_cobrada', motivo, nota: nota || '', promesa: promesa || null,
    monto: 0, pagoId: null,
    usuario: (window.__user ? window.__user.name : 'Cobranza'),
    marcado: new Date().toISOString()
  });
  if (!prev) DB.recaudacion.push(reg);
  if (ct) registrarGestion(ct.id, 'Cobro', 'No cobrada', motivoLabel(motivo) + (nota ? ' · ' + nota : ''));
  saveDB();
  return reg;
}

/** Deshace la marca (si se equivocaron). Anula el pago si aún no se confirmó. */
function desmarcarCuota(contrato, fecha) {
  const i = DB.recaudacion.findIndex(r => r.clave === claveCuota(contrato, fecha));
  if (i < 0) return;
  const reg = DB.recaudacion[i];
  if (reg.pagoId) {
    const j = DB.pagos.findIndex(p => p.id === reg.pagoId);
    if (j >= 0 && DB.pagos[j].estado === 'registrado') DB.pagos.splice(j, 1);
  }
  DB.recaudacion.splice(i, 1); saveDB();
}

/** Estado de la semana: lo programado contra lo efectivamente gestionado. */
function resumenRecaudacion(desde, hasta) {
  // OJO: CALENDARIO se declara con `const`, así que vive en el ámbito léxico
  // global y NO en window. Referenciarlo por window daría siempre vacío.
  const cal = (typeof CALENDARIO !== 'undefined' ? CALENDARIO : []).filter(c => c.f >= desde && c.f <= hasta);
  const filas = cal.map(c => {
    const r = buscarRecaudo(c.c, c.f);
    return { cuota: c, reg: r || null, estado: r ? r.estado : 'pendiente' };
  });
  const cobradas   = filas.filter(f => f.estado === 'cobrada');
  const noCobradas = filas.filter(f => f.estado === 'no_cobrada');
  const pendientes = filas.filter(f => f.estado === 'pendiente');
  const programado = cal.reduce((s, c) => s + c.m, 0);
  const recaudado  = cobradas.reduce((s, f) => s + (f.reg.monto || 0), 0);
  return {
    desde, hasta, filas, cobradas, noCobradas, pendientes,
    programado, recaudado,
    porConfirmar: cobradas.filter(f => {
      const p = DB.pagos.find(x => x.id === f.reg.pagoId);
      return p && p.estado === 'registrado';
    }).length,
    efectividad: programado > 0 ? recaudado / programado : 0,
    cerrada: pendientes.length === 0 && cal.length > 0
  };
}

function registrarGestion(contratoId, tipo, resultado, comentario) {
  DB.gestiones.push({ id: uid(), contratoId, tipo, resultado, comentario,
                      fecha: new Date().toISOString().slice(0, 16).replace('T', ' '), usuario: (window.__user ? window.__user.name : 'Sistema') });
  saveDB();
}
function agregarDocumento(contratoId, tipo, nombre) {
  DB.documentos.push({ id: uid(), contratoId, tipo, nombre, fecha: HOY_ISO });
  saveDB();
}
function agregarIntegrante(contratoId, nombre, cargo) {
  const ct = getContrato(contratoId); if (!ct) return;
  ct.integrantes = ct.integrantes || [];
  ct.integrantes.push({ id: uid(), nombre, cargo });
  saveDB();
}
function aprobarContrato(id) {
  const ct = getContrato(id); if (!ct) return;
  ct.estado = 'aprobado'; ct.fechaAprobacion = HOY_ISO;
  const l = getLote(ct.lote); if (l) l.estado = 'vendido';
  registrarGestion(id, 'Bitácora Socios', 'Solucionado', 'Crédito aprobado por el comité');
  saveDB();
}
function rechazarContrato(id) {
  const ct = getContrato(id); if (!ct) return;
  ct.estado = 'anulado';
  const l = getLote(ct.lote); if (l) l.estado = 'disponible';
  registrarGestion(id, 'Bitácora Socios', 'Solucionado', 'Solicitud rechazada — lote liberado');
  saveDB();
}

/* ---------- Init ---------- */
function initDB() {
  if (!loadDB()) seedDB();
  if (!DB.equipo || !DB.equipo.length) { seedEquipo(); saveDB(); }
  // normaliza el nombre del vendedor al nombre oficial del equipo
  DB.contratos.forEach(c => { const p = buscarPersona(c.vendedor); if (p) c.vendedor = p.nombre; });
  // asegura que los lotes tengan coordenadas aunque la semilla sea vieja
  const geo = {}; (window.LOT_GEO || []).forEach(g => { geo[g.id] = g; });
  DB.lotes.forEach(l => { if (l.x == null && geo[l.codigo]) { l.x = geo[l.codigo].x; l.y = geo[l.codigo].y; } });
  // recaudadoBase de los contratos reales del CRM
  DB.contratos.forEach((ct, i) => {
    if (ct.recaudadoBase === undefined && ct.fuente === 'CRM') {
      const src = CONTRATOS_RAW.find(r => r.no === ct.no);
      ct.recaudadoBase = src ? src.recaudado : 0;
    }
  });
}
