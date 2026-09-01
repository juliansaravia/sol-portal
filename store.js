/* ============================================================
   SUITE SOL INMOBILIARIA · Capa de datos y persistencia

   Dos modos, y el archivo entero está escrito para que la
   diferencia se note lo menos posible:

     · CON BASE (lo normal) · cada mutación escribe en Supabase
       por medio de `escribir.js`, espera la respuesta y recién
       entonces toca el objeto DB. Lo que ve uno lo ven todos.

     · SIN BASE (demostración) · se guarda en localStorage, como
       antes. Sirve para enseñar el portal sin conexión.

   Las mutaciones son `async` por eso: no se puede prometer que
   algo quedó guardado antes de que el servidor lo diga. Devuelven
   el objeto creado, o `null` si falló — y en ese caso el error ya
   se le mostró al usuario.
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

/* ------------------------------------------------------------
   Comparar identificadores

   En modo demostración los ids los inventa uid() y son cadenas.
   Desde Supabase son BIGINT, o sea números. Y todo el portal los
   hace viajar por el HTML —onclick="verExpediente('${ct.id}')"—,
   que los devuelve SIEMPRE como texto.

   Resultado: `c.id === id` comparaba el número 9001 contra la
   cadena '9001', daba false, y la función se salía sin hacer
   nada. Los expedientes no abrían, los contratos no abrían, los
   pagos no se confirmaban. Ningún error en consola: simplemente
   no pasaba nada.

   Se compara como texto, que es lo único que las dos formas
   tienen en común.
   ------------------------------------------------------------ */
const mismoId = (a, b) => a != null && b != null && String(a) === String(b);

/* ------------------------------------------------------------
   Índices · buscar sin recorrerlo todo

   El portal buscaba con `.find()` y `.filter()` sobre los arreglos
   completos, una vez por fila dibujada. Con los datos reales eso
   son, en una sola pantalla de cartera:

     nombreCliente()  148 filas × 148 clientes  =  21,904 vueltas
     recaudadoDe()    148 filas × 738 pagos     = 109,224 vueltas

   Y la reportería, la agenda y comisiones hacen lo mismo otra vez.
   Con diez contratos de demostración no se nota; con 148 y 5,550
   giros, sí.

   Acá se arma un índice por llave, una sola vez, y las búsquedas
   pasan a ser directas. Se reconstruye solo cuando cambia el
   tamaño de algún arreglo —que es lo que pasa al crear, borrar o
   recargar— sin tener que acordarse de avisarle desde cada sitio
   que escribe.
   ------------------------------------------------------------ */
let _idx = null;
let _huella = '';

const _huellaActual = () =>
  `${DB.clientes.length}|${DB.contratos.length}|${DB.pagos.length}|` +
  `${DB.documentos.length}|${DB.lotes.length}|${DB.equipo.length}`;

function indices() {
  const h = _huellaActual();
  if (_idx && _huella === h) return _idx;

  const porId = (arr) => { const m = new Map(); for (const x of arr) m.set(String(x.id), x); return m; };
  const agrupar = (arr, llave) => {
    const m = new Map();
    for (const x of arr) {
      const k = String(llave(x));
      const g = m.get(k);
      if (g) g.push(x); else m.set(k, [x]);
    }
    return m;
  };

  _idx = {
    clientes:  porId(DB.clientes),
    contratos: porId(DB.contratos),
    lotesPorClave: (() => {
      const m = new Map();
      for (const l of DB.lotes) {
        if (l.clave) m.set(l.clave, l);
        /* Los códigos se repiten entre fases: el índice por código
           guarda el primero y `getLote` avisa si hubo ambigüedad. */
        if (!m.has(l.codigo)) m.set(l.codigo, l);
      }
      return m;
    })(),
    pagosPorContrato: agrupar(DB.pagos, p => p.contratoId),
    docsPorContrato:  agrupar(DB.documentos, d => d.contratoId),
    contratosPorVendedor: agrupar(
      DB.contratos.filter(c => c.estado !== 'anulado'), c => c.vendedor || ''),
    /* Media docena de sitios buscan por número de contrato («SD-42») y
       no por id: es la llave que sale del Excel, del banco y de la
       conversación. Sin este índice, cada uno recorría los 148. */
    contratosPorNo: (() => {
      const m = new Map();
      for (const c of DB.contratos) if (c.no) m.set(String(c.no), c);
      return m;
    })(),
    contratoPorLote: (() => {
      const m = new Map();
      for (const c of DB.contratos) {
        if (c.estado === 'anulado') continue;
        if (c.clave && !m.has(c.clave)) m.set(c.clave, c);
        if (c.lote && !m.has(c.lote))   m.set(c.lote, c);
      }
      return m;
    })()
  };
  _huella = h;
  return _idx;
}

/** Para cuando algo cambió sin cambiar de tamaño (renombrar un vendedor). */
const reindexar = () => { _idx = null; _cal = null; };

/* Cuando algo no se pudo guardar hay que decirlo, y decirlo fuerte.
   El silencio es lo peor que puede pasar acá: el usuario cierra el
   modal creyendo que registró un pago que no existe. */
function avisar(mensaje) {
  console.error('[no se guardó]', mensaje);
  if (typeof toast === 'function') toast(mensaje, 7000, true);
  else alert(mensaje);
}
/* ------------------------------------------------------------
   Hoy es hoy

   Esto estaba clavado en '2026-08-03': la fecha en que se congeló la
   foto de julio. Servía cuando los datos eran una foto — todo tenía
   que mirarse desde el mismo día para que cuadrara con el Excel.

   Con la base conectada es al revés: la mora corre, las cuotas vencen
   y la agenda de cobranza tiene que abrir en la semana de hoy. Con la
   fecha vieja, la agenda mostraba la semana del 3 de agosto para
   siempre y la mora se quedaba quieta.

   `window.FECHA_CORTE` sigue permitiendo fijarla, para pruebas o para
   reproducir un cierre.
   ------------------------------------------------------------ */
const HOY_ISO = (typeof window !== 'undefined' && window.FECHA_CORTE)
  ? window.FECHA_CORTE
  : new Date().toISOString().slice(0, 10);
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
    // El admin sí escribe en modo consulta — igual que en la base.
    if (SESION.modoConsulta && SESION.rol !== 'admin') {
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
      const cli = crearClienteLocal(c.cliente);
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
      const cli = crearClienteLocal(c.cliente);
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
const contratosDe = nombre => indices().contratosPorVendedor.get(String(nombre)) || [];
async function guardarPersona(datos){
  if (typeof hayBase === 'function' && hayBase()) {
    const r = await sbGuardarPersona(datos);
    if (!r.ok) { avisar(r.error); return null; }
    return DB.equipo.find(x => mismoId(x.id, r.dato.id)) || null;
  }
  if(datos.id){ const p=DB.equipo.find(x=>mismoId(x.id,datos.id)); if(p) Object.assign(p,datos); }
  else { DB.equipo.push({ id:uid(), activo:true, telefono:'', email:'', ...datos }); }
  saveDB();
  return datos.id ? DB.equipo.find(x=>mismoId(x.id,datos.id)) : DB.equipo[DB.equipo.length-1];
}
async function borrarPersona(id){
  if (typeof hayBase === 'function' && hayBase()) {
    const r = await sbDesactivarPersona(id);
    if (!r.ok) { avisar(r.error); return false; }
    return true;
  }
  const p=DB.equipo.find(x=>mismoId(x.id,id)); if(!p) return false;
  p.activo=false; saveDB(); return true;
}
/* Reasigna todos los contratos de un vendedor a otro.
   Con base, el vínculo es `contrato.persona_id`; el nombre del
   vendedor es solo lo que se muestra. */
async function reasignarContratos(de, a){
  const cts = DB.contratos.filter(c => c.vendedor===de && c.estado!=='anulado');
  if (typeof hayBase === 'function' && hayBase()) {
    const destino = DB.equipo.find(p => p.nombre === a);
    if (!destino) { avisar('No se encontró a «'+a+'» en el equipo.'); return 0; }
    const r = await sbReasignarContratos(cts.map(c=>c.id), destino.id);
    if (!r.ok) { avisar(r.error); return 0; }
    cts.forEach(c => { c.vendedor = a; });
    return r.dato;
  }
  let n=0;
  DB.contratos.forEach(c=>{ if(c.vendedor===de){ c.vendedor=a; n++; } });
  saveDB(); return n;
}

/* ---------- Clientes ---------- */
/* El constructor puro, sin red. Lo usa la siembra del modo demostración,
   que es síncrona y tiene que seguir siéndolo: pedirle `await` a un bucle
   de 148 contratos de ejemplo no aporta nada y rompe el arranque. */
function crearClienteLocal(nombreCompleto, extra = {}) {
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

/** El cliente que sí va a la base. Devuelve null si no se pudo guardar. */
async function crearCliente(nombreCompleto, extra = {}) {
  if (!(typeof hayBase === 'function' && hayBase()))
    return crearClienteLocal(nombreCompleto, extra);
  const r = await sbCrearCliente({
    nombre: nombreCompleto.trim(), dpi: extra.dpi, telefono: extra.telefono,
    email: extra.email, direccion: extra.direccion, ocupacion: extra.ocupacion
  });
  if (!r.ok) { avisar(r.error); return null; }
  return DB.clientes[DB.clientes.length - 1];
}
const getCliente = id => (id == null) ? undefined : indices().clientes.get(String(id));
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
/* La comisión que dice la base manda sobre la que calcularía el portal.
   Son el mismo 2 %, pero si algún contrato tiene una comisión pactada
   distinta —pasa— la buena es la que está registrada, no la fórmula. */
const calcularComision = ct =>
  (ct && ct.comisionMonto != null) ? r2(ct.comisionMonto) : r2((ct.precio || 0) * COMISION_PCT);

/* ---------- Cálculos de cartera ---------- */
const pagosDe = ct => (ct ? (indices().pagosPorContrato.get(String(ct.id)) || []) : []);
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
  const of = (typeof MORA_OFICIAL !== 'undefined' && MORA_OFICIAL) ? MORA_OFICIAL : {};
  const lista = Object.entries(of).map(([no, m]) => ({ no, ...m }));

  // Con el modelo cargado manda el modelo. Es lo que estaba y se respeta.
  if (lista.length) return {
    enMora: lista.length,
    vigentes: DB.contratos.filter(c => c.estado === 'aprobado').length - lista.length,
    saldoVencido: r2(lista.reduce((s, m) => s + (m.saldoVenc || 0), 0)),
    cuotasAtraso: lista.reduce((s, m) => s + (m.atraso || 0), 0),
    nuncaPagaron: lista.filter(m => !m.cuotasPag),
    lista,
    fuente: 'Modelo Financiero'
  };

  /* Sin modelo, se calcula sobre lo que hay. Antes devolvía ceros y un
     `vigentes` undefined que salía impreso tal cual en la pantalla. */
  const activos = DB.contratos.filter(c => c.estado === 'aprobado');
  const conEstado = activos.map(c => ({ c, ec: estadoCuenta(c) }));
  const conMora = conEstado.filter(x => x.ec.enMora);

  /* Todas las filas salen con la misma forma que las del modelo
     —{no, lote, atraso, saldoVenc, cuotasPag}— porque las pantallas
     las leen así. Devolver el contrato crudo imprimía «Q NaN». */
  const fila = x => ({ no: x.c.no, lote: x.c.lote,
                       atraso: x.ec.vencidas, saldoVenc: x.ec.montoVencido,
                       cuotasPag: x.ec.pagadas });

  return {
    enMora: conMora.length,
    vigentes: activos.length - conMora.length,
    saldoVencido: r2(conMora.reduce((s, x) => s + (x.ec.montoVencido || 0), 0)),
    cuotasAtraso: conMora.reduce((s, x) => s + (x.ec.vencidas || 0), 0),
    nuncaPagaron: conEstado.filter(x => recaudadoDe(x.c) <= 0).map(fila),
    lista: conMora.map(fila),
    fuente: 'giros de la base'
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

  /* ── De dónde sale la mora ──

     Esto decía `enMora: !!of`, o sea: un contrato está en mora si
     aparece en MORA_OFICIAL, la foto de julio. Cuando esos archivos
     dejaron de desplegarse, `of` pasó a ser siempre undefined y el
     portal empezó a decir que NINGUNO de los 148 contratos está en
     mora. Cobranza abría su pantalla y no veía nada que cobrar.

     Ahora hay dos fuentes y un orden claro:

       1. El modelo financiero, si está cargado. Sigue mandando: es
          la cifra que el CRM y la gerencia dan por buena.
       2. Si no está, el cálculo propio sobre los giros. Con la base
          conectada esto ya no es una aproximación del navegador:
          los estados de los giros los pone `recalcular_contrato()`
          en Postgres, con las reglas del contrato.

     `fuenteMora` dice cuál se usó, y la pantalla lo muestra. Una
     cifra sin su procedencia no sirve para cobrar. */
  const hayModelo = typeof MORA_OFICIAL !== 'undefined'
                    && MORA_OFICIAL && Object.keys(MORA_OFICIAL).length > 0;

  return {
    giros, totalGiros, pagadas, totalGirosN: giros.length,
    // El cálculo propio se conserva siempre, para poder contrastar
    vencidasCalculadas: vencidos.length,
    montoVencidoCalculado: montoVencido,

    vencidas:     hayModelo ? (of ? (of.atraso || 0) : 0)    : vencidos.length,
    montoVencido: hayModelo ? (of ? (of.saldoVenc || 0) : 0) : montoVencido,
    enMora:       hayModelo ? !!of : vencidos.length > 0,
    cuotasPagadasModelo: of ? of.cuotasPag : null,
    fuenteMora: hayModelo ? 'Modelo Financiero' : 'giros de la base',
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
/* ------------------------------------------------------------
   Un lote se identifica por FASE + CÓDIGO, no por código

   Hay 97 códigos que existen en dos fases a la vez: A-01 es un lote
   de 90 m² en Fase 1 y uno de 606.5 m² en Agrolotes. Esto buscaba
   solo por código y devolvía el primero que encontrara.

   O sea que el cotizador mostraba el área de un lote con el precio
   de otro —se veía en pantalla: «A-01 · 606.5 m²» arriba y «A-01 ·
   90 m²» abajo— y, peor, una venta podía quedar registrada contra
   el lote equivocado, en la fase equivocada.

   `datos-remotos.js` ya arma la llave buena (`clave` = fase·código)
   justo por esto. Faltaba usarla.
   ------------------------------------------------------------ */
function getLote(x) {
  if (!x) return undefined;
  const v = String(x);

  // La llave completa: fase·código. Es la que manda.
  const porClave = indices().lotesPorClave.get(v);
  if (porClave && porClave.clave === v) return porClave;

  const porCodigo = DB.lotes.filter(l => l.codigo === v);
  if (porCodigo.length === 1) return porCodigo[0];
  if (porCodigo.length > 1) {
    /* Ambiguo. Se devuelve uno para no romper la pantalla, pero queda
       dicho: quien llamó tenía que haber pasado la clave. */
    console.warn(`[lote] «${v}» existe en ${porCodigo.length} fases `
               + `(${porCodigo.map(l => l.fase).join(', ')}). Se usó ${porCodigo[0].fase}. `
               + `Quien llamó debería pasar la clave, no el código.`);
  }
  return porCodigo[0];
}

/** La llave con la que se debe pedir un lote desde la interfaz. */
const claveDe = l => (l && (l.clave || l.codigo)) || '';
const getContrato = id => (id == null) ? undefined : indices().contratos.get(String(id));
const contratoDeLote = codigo => indices().contratoPorLote.get(String(codigo));
const gestionesDe = id => DB.gestiones.filter(g => g.contratoId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
const documentosDe = id => indices().docsPorContrato.get(String(id)) || [];

/* El contacto del titular de un contrato.

   Vivía en data-contactos.js — la foto del CRM de julio, que no se
   publica porque trae teléfonos de clientes reales. Al no estar,
   `contactoDe` no existía y la pantalla de Expedientes se caía entera
   con "contactoDe is not defined": el tab estaba en el menú pero no
   dibujaba nada.

   Ahora sale de la base, que es donde vive el dato de verdad. */
function contactoDe(numeroContrato) {
  const ct = indices().contratosPorNo.get(String(numeroContrato));
  if (!ct) return null;
  const cl = getCliente(ct.clienteId) || {};
  return {
    tel:       cl.tel || ct.tel || '',
    correo:    cl.correo || '',
    ocupacion: cl.ocupacion || '',
    dpi:       cl.dpi || ct.dpi || '',
    direccion: cl.direccion || ''
  };
}

/* ---------- Mutaciones ---------- */
async function nuevoContrato({ lote, nombre, dpi, telefono, email, vendedor, reserva, enganche, plazo, girosSaldo, origen,
                         direccion, ocupacion, ingresoMensual, constancia, pesoConstancia, pariente }) {
  const l = getLote(lote);
  if (!l) { avisar('No se encontró el lote ' + lote); return null; }

  // El expediente completo se guarda en el cliente: es lo que después
  // permite cobrar, y lo que arma la carpeta para el buró de créditos.
  const cli = await crearCliente(nombre, { dpi, telefono, email, direccion, ocupacion,
                                     ingresoMensual, constancia, pesoConstancia, pariente });
  if (!cli) return null;

  /* Con base, el contrato lo crea Postgres: el número sale de la serie
     del proyecto y el plan de giros de generar_giros(). Dos cosas que
     el navegador no debe decidir, porque de ellas cuelga la cartera. */
  if (typeof hayBase === 'function' && hayBase()) {
    const vend = DB.equipo.find(p => p.nombre === vendedor);
    const r = await sbCrearContrato({
      lote: l, cliente_id: cli.id, persona_id: vend ? vend.id : null,
      enganche: enganche !== undefined ? enganche : (reserva !== undefined ? reserva : ENGANCHE_MIN),
      plazo: plazo || girosSaldo || 60, origen: origen || 'Campo'
    });
    if (!r.ok) { avisar(r.error); return null; }

    const ct = {
      id: r.dato.id, no: r.dato.numero, lote: l.codigo, fase: l.fase, clave: l.clave,
      clienteId: cli.id, cliente: cli.nombre, tel: cli.tel || '', dpi: cli.dpi || '',
      vendedor: vendedor || '', fecha: r.dato.fecha,
      precio: Number(r.dato.precio_venta), enganche: Number(r.dato.enganche),
      plazo: r.dato.plazo_meses, tasa: Number(r.dato.tasa_mensual),
      estado: r.dato.estado, obligaciones: []
    };
    DB.contratos.push(ct);
    l.estado = 'reservado';
    await registrarGestion(ct.id, 'Bitácora Socios', 'Contactado', 'Contrato creado desde ' + (origen || 'Campo'));
    return ct;
  }

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
  await registrarGestion(ct.id, 'Bitácora Socios', 'Contactado', 'Contrato creado desde ' + ct.origen);
  saveDB();
  return ct;
}
async function registrarPago(contratoId, { monto, forma, cuenta, referencia }) {
  if (typeof hayBase === 'function' && hayBase()) {
    const r = await sbRegistrarPago(contratoId, { monto, forma, cuenta, referencia });
    if (!r.ok) { avisar(r.error); return null; }
    return DB.pagos[DB.pagos.length - 1];
  }
  const p = { id: uid(), contratoId, monto: +monto, forma, cuenta, referencia,
              fecha: HOY_ISO, estado: 'registrado', registrado: new Date().toISOString() };
  DB.pagos.push(p); saveDB(); return p;
}
async function confirmarPago(pagoId, ok = true) {
  if (typeof hayBase === 'function' && hayBase()) {
    const r = await sbConfirmarPago(pagoId, ok);
    if (!r.ok) { avisar(r.error); return false; }
    return true;
  }
  const p = DB.pagos.find(x => mismoId(x.id, pagoId)); if (!p) return false;
  p.estado = ok ? 'confirmado' : 'rechazado';
  p.fechaAprobacion = HOY_ISO;
  const ct = getContrato(p.contratoId);
  if (ct) recalcular(ct);
  saveDB(); return true;
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
async function marcarCobrada(contrato, fecha, { monto, forma, cuenta, referencia, nota }) {
  const ct = indices().contratosPorNo.get(String(contrato));

  if (typeof hayBase === 'function' && hayBase()) {
    if (!ct) { avisar('No se encontró el contrato ' + contrato); return null; }
    const r = await sbMarcarCobrada(ct.id, fecha, { monto, forma, cuenta, referencia, nota });
    if (!r.ok) { avisar(r.error); return null; }
    const reg = { id: r.dato.recaudo.id, clave: claveCuota(contrato, fecha), contrato, fecha,
                  estado: 'cobrada', monto: +monto, forma, cuenta, referencia, nota: nota || '',
                  pagoId: r.dato.pago.id, motivo: null,
                  usuario: SESION.persona.nombre, marcado: r.dato.recaudo.marcado_en };
    const i = DB.recaudacion.findIndex(x => x.clave === reg.clave);
    if (i >= 0) DB.recaudacion[i] = reg; else DB.recaudacion.push(reg);
    await registrarGestion(ct.id, 'Cobro', 'Cobrada', `Cuota del ${fecha} · ${referencia||'sin boleta'}`);
    return reg;
  }

  let pagoId = null;
  if (ct) pagoId = (await registrarPago(ct.id, { monto, forma, cuenta, referencia })).id;

  const prev = buscarRecaudo(contrato, fecha);
  const reg = prev || { id: uid(), clave: claveCuota(contrato, fecha), contrato, fecha };
  Object.assign(reg, {
    estado: 'cobrada', monto: +monto, forma, cuenta, referencia, nota: nota || '',
    pagoId, motivo: null,
    usuario: (window.__user ? window.__user.name : 'Cobranza'),
    marcado: new Date().toISOString()
  });
  if (!prev) DB.recaudacion.push(reg);
  if (ct) await registrarGestion(ct.id, 'Cobro', 'Cobrada', `Cuota del ${fecha} · ${referencia||'sin boleta'}`);
  saveDB();
  return reg;
}

/** Marca una cuota como NO COBRADA con su motivo. */
async function marcarNoCobrada(contrato, fecha, { motivo, nota, promesa }) {
  const ct = indices().contratosPorNo.get(String(contrato));

  if (typeof hayBase === 'function' && hayBase()) {
    if (!ct) { avisar('No se encontró el contrato ' + contrato); return null; }
    const r = await sbMarcarNoCobrada(ct.id, fecha, { motivo, nota, promesa });
    if (!r.ok) { avisar(r.error); return null; }
    const reg = { id: r.dato.id, clave: claveCuota(contrato, fecha), contrato, fecha,
                  estado: 'no_cobrada', motivo, nota: nota || '', promesa: promesa || null,
                  monto: 0, pagoId: null,
                  usuario: SESION.persona.nombre, marcado: r.dato.marcado_en };
    const i = DB.recaudacion.findIndex(x => x.clave === reg.clave);
    if (i >= 0) DB.recaudacion[i] = reg; else DB.recaudacion.push(reg);
    await registrarGestion(ct.id, 'Cobro', 'No cobrada', motivoLabel(motivo) + (nota ? ' · ' + nota : ''));
    return reg;
  }

  const prev = buscarRecaudo(contrato, fecha);
  const reg = prev || { id: uid(), clave: claveCuota(contrato, fecha), contrato, fecha };
  Object.assign(reg, {
    estado: 'no_cobrada', motivo, nota: nota || '', promesa: promesa || null,
    monto: 0, pagoId: null,
    usuario: (window.__user ? window.__user.name : 'Cobranza'),
    marcado: new Date().toISOString()
  });
  if (!prev) DB.recaudacion.push(reg);
  if (ct) await registrarGestion(ct.id, 'Cobro', 'No cobrada', motivoLabel(motivo) + (nota ? ' · ' + nota : ''));
  saveDB();
  return reg;
}

/** Deshace la marca (si se equivocaron). Anula el pago si aún no se confirmó. */
async function desmarcarCuota(contrato, fecha) {
  const i = DB.recaudacion.findIndex(r => r.clave === claveCuota(contrato, fecha));
  if (i < 0) return;

  if (typeof hayBase === 'function' && hayBase()) {
    const ct = indices().contratosPorNo.get(String(contrato));
    if (!ct) { avisar('No se encontró el contrato ' + contrato); return; }
    const r = await sbDesmarcarCuota(ct.id, fecha);
    if (!r.ok) { avisar(r.error); return; }
    DB.recaudacion.splice(i, 1);
    return;
  }

  const reg = DB.recaudacion[i];
  if (reg.pagoId) {
    const j = DB.pagos.findIndex(p => mismoId(p.id, reg.pagoId));
    if (j >= 0 && DB.pagos[j].estado === 'registrado') DB.pagos.splice(j, 1);
  }
  DB.recaudacion.splice(i, 1); saveDB();
}

/* ------------------------------------------------------------
   El calendario de cuotas

   `CALENDARIO` era un archivo de 290 KB con las cuotas de julio, y
   dejó de desplegarse. Sin él la agenda de cobranza abre vacía: dice
   «no hay cuotas programadas esta semana» aunque haya 148 contratos
   pagando.

   Los giros ya vienen de la base —`datos-remotos.js` los trae con su
   vencimiento, monto y estado—, así que el calendario se arma con
   ellos. Misma forma que el archivo viejo, para que las pantallas no
   se enteren:

     c  contrato · f  vence · m  monto · n  cliente
     l  lote     · q  número de cuota · p  total de cuotas
   ------------------------------------------------------------ */
/* La foto de julio traía el nombre del día en `d` y la agenda lo usa
   para encabezar cada jornada. El calendario armado desde los giros no
   lo producía, así que renderAgenda() reventaba con «charAt of
   undefined» y la pantalla entera se quedaba en blanco. */
const DIAS_SEM = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const diaSemana = iso => DIAS_SEM[new Date(iso + 'T00:00:00').getDay()] || '';

function calendarioDeCartera() {
  const salida = [];
  for (const ct of DB.contratos) {
    if (ct.estado === 'anulado') continue;
    const giros = (ct.obligaciones || []).flatMap(o => o.giros || []);
    if (!giros.length) continue;
    const total = giros.length;
    giros.forEach((g, i) => {
      if (g.estado === 'pagado') return;          // ya se cobró, no se agenda
      salida.push({
        c: ct.no, f: g.vence, m: g.monto,
        n: nombreCliente(ct.clienteId), l: ct.lote,
        d: diaSemana(g.vence),
        q: i + 1, p: total
      });
    });
  }
  return salida.sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : 0));
}

/* La foto de julio si está; si no, lo que hay en la base. Se recalcula
   cada vez porque los giros cambian al confirmarse un pago. */
let _cal = null, _calHuella = '';

function calendario() {
  if (typeof CALENDARIO !== 'undefined' && CALENDARIO && CALENDARIO.length) return CALENDARIO;

  /* Recorrer 148 contratos y 5,550 giros costaba lo mismo cada vez que
     alguien preguntaba, y la agenda preguntaba dos veces por dibujado
     y la búsqueda una por tecla. Se guarda con la misma huella que los
     índices: confirmar un pago mueve DB.pagos.length y la invalida. */
  const h = _huellaActual() + '|' + (DB.meta && DB.meta.carteraLista ? '1' : '0');
  if (_cal && _calHuella === h) return _cal;
  _cal = calendarioDeCartera();
  _calHuella = h;
  return _cal;
}

/** Estado de la semana: lo programado contra lo efectivamente gestionado. */
function resumenRecaudacion(desde, hasta) {
  // OJO: CALENDARIO se declara con `const`, así que vive en el ámbito léxico
  // global y NO en window. Referenciarlo por window daría siempre vacío.
  const cal = calendario().filter(c => c.f >= desde && c.f <= hasta);
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
      const p = DB.pagos.find(x => mismoId(x.id, f.reg.pagoId));
      return p && p.estado === 'registrado';
    }).length,
    efectividad: programado > 0 ? recaudado / programado : 0,
    cerrada: pendientes.length === 0 && cal.length > 0
  };
}

async function registrarGestion(contratoId, tipo, resultado, comentario) {
  if (typeof hayBase === 'function' && hayBase()) {
    const r = await sbGestion(contratoId, tipo, resultado, comentario);
    /* Una gestión que no se pudo anotar no debe tumbar la operación que
       la produjo: el pago ya entró. Se avisa en consola y se sigue. */
    if (!r.ok) console.warn('[gestión] no se pudo anotar:', r.error);
    return r.ok ? r.dato : null;
  }
  DB.gestiones.push({ id: uid(), contratoId, tipo, resultado, comentario,
                      fecha: new Date().toISOString().slice(0, 16).replace('T', ' '), usuario: (window.__user ? window.__user.name : 'Sistema') });
  saveDB();
}
/**
 * Agrega un documento al expediente.
 * @param {*} archivo  un File del navegador — sube de verdad — o un
 *                     texto, que es el camino viejo: solo anota el
 *                     nombre y NO cuenta como respaldo.
 */
async function agregarDocumento(contratoId, tipo, archivo, cara) {
  if (typeof hayBase === 'function' && hayBase()) {
    const esArchivo = typeof File !== 'undefined' && archivo instanceof File;
    const r = esArchivo
      ? await sbSubirDocumento(contratoId, tipo, archivo, cara)
      : await sbDocumento(contratoId, tipo, String(archivo || tipo));
    if (!r.ok) { avisar(r.error); return null; }
    return r.dato;
  }
  DB.documentos.push({ id: uid(), contratoId, tipo,
                       nombre: (archivo && archivo.name) || String(archivo || tipo),
                       fecha: HOY_ISO });
  saveDB();
}
async function agregarIntegrante(contratoId, nombre, cargo) {
  const ct = getContrato(contratoId); if (!ct) return null;
  if (typeof hayBase === 'function' && hayBase()) {
    const r = await sbIntegrante(contratoId, nombre, cargo);
    if (!r.ok) { avisar(r.error); return null; }
    ct.integrantes = ct.integrantes || [];
    ct.integrantes.push({ id: r.dato.id, nombre, cargo });
    return r.dato;
  }
  ct.integrantes = ct.integrantes || [];
  ct.integrantes.push({ id: uid(), nombre, cargo });
  saveDB();
}
async function aprobarContrato(id) {
  const ct = getContrato(id); if (!ct) return false;
  if (typeof hayBase === 'function' && hayBase()) {
    /* Se dice 'aprobado' —el idioma del portal— y `sbEstadoContrato()`
       lo traduce a 'activo', que es lo que entiende la base y lo que
       dispara la partida contable de la venta. */
    const r = await sbEstadoContrato(id, 'aprobado', 'vendido');
    if (!r.ok) { avisar(r.error); return false; }
    const l = getLote(ct.clave || ct.lote); if (l) l.estado = 'vendido';
    await registrarGestion(id, 'Bitácora Socios', 'Solucionado', 'Crédito aprobado por el comité');
    return true;
  }
  ct.estado = 'aprobado'; ct.fechaAprobacion = HOY_ISO;
  const l = getLote(ct.clave || ct.lote); if (l) l.estado = 'vendido';
  await registrarGestion(id, 'Bitácora Socios', 'Solucionado', 'Crédito aprobado por el comité');
  saveDB(); return true;
}
async function rechazarContrato(id) {
  const ct = getContrato(id); if (!ct) return false;
  if (typeof hayBase === 'function' && hayBase()) {
    const r = await sbEstadoContrato(id, 'anulado', 'disponible');
    if (!r.ok) { avisar(r.error); return false; }
    const l = getLote(ct.clave || ct.lote); if (l) l.estado = 'disponible';
    await registrarGestion(id, 'Bitácora Socios', 'Solucionado', 'Solicitud rechazada — lote liberado');
    return true;
  }
  ct.estado = 'anulado';
  const l = getLote(ct.clave || ct.lote); if (l) l.estado = 'disponible';
  await registrarGestion(id, 'Bitácora Socios', 'Solucionado', 'Solicitud rechazada — lote liberado');
  saveDB(); return true;
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
