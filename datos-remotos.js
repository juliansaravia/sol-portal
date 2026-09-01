/* ============================================================
   LOS DATOS, DE LA BASE

   Antes: cada quien tenía su propia copia en el navegador
   (localStorage), sembrada desde los archivos data-*.js con la
   foto de julio. Norman registraba un pago y Pedro no lo veía.

   Ahora: todos leen las mismas filas de Supabase.

   Se llena el mismo objeto DB que ya usaba el portal, con la
   misma forma, para no reescribir las tres mil líneas de app.js
   que lo consultan. Lo que cambia es de dónde viene.

   Las políticas RLS deciden qué filas llegan: un vendedor recibe
   sus contratos, no los del compañero. El filtrado NO se hace
   aquí — se hace en la base, que es donde no se puede saltar.
   ============================================================ */
'use strict';

/* Los códigos de lote se repiten entre líneas: hay 87 que existen a
   la vez en Fase I Residencial y en Agrolotes. La llave real es
   (fase, código), y el portal la maneja como una sola cadena. */
const claveLote = (fase, codigo) => `${fase}·${codigo}`;

/* ------------------------------------------------------------
   El vocabulario de los estados

   La base dice `activo`; el portal, desde antes de que existiera la
   base, dice `aprobado`. Nadie traducía, así que con Supabase
   conectado catorce filtros del portal —comisiones pendientes,
   contratos activos del inicio, desistimientos— comparaban contra
   una palabra que ya no llegaba nunca y salían vacíos.

   Se traduce acá, en la frontera, igual que `rolDePortal()` hace con
   los roles. Un solo sitio, no catorce.

   `estadoBase` conserva el valor original: 'caido' y 'liquidado' no
   tienen equivalente en el portal y no se puede perder cuál era.
   ------------------------------------------------------------ */
const ESTADO_PORTAL = {
  activo:    'aprobado',    // vendido y vigente
  caido:     'anulado',     // se cayó · el portal solo distingue dentro/fuera
  liquidado: 'aprobado'     // terminó de pagar · sigue siendo una venta
};
const estadoDePortal = e => ESTADO_PORTAL[e] || e;

const _num = v => (v === null || v === undefined ? 0 : Number(v));
const _fecha = v => (v ? String(v).slice(0, 10) : null);

/**
 * Trae todo de Supabase y llena DB.
 * @returns {Promise<{ok:boolean, error?:string, resumen?:object}>}
 */
async function cargarDesdeSupabase() {
  if (!window.SB) return { ok: false, error: 'sin conexión' };
  const t0 = Date.now();

  try {
    // Se piden en paralelo: son consultas independientes y la más
    // lenta manda. En serie esto tardaba el triple.
    const [lotes, contratos, clientes, pagos, giros, equipo, documentos, obligaciones, comisiones] = await Promise.all([
      todas('v_inventario', 'proyecto_id,proyecto,fase,manzana,lote_id,lote,area_m2,precio_lista,estado'),
      todas('contrato', 'id,numero,fecha,precio_venta,enganche,plazo_meses,tasa_mensual,estado,banco,boleta,lote_id,cliente_id,persona_id'),
      todas('cliente', 'id,nombre,dpi,nit,telefono,email,direccion,ocupacion'),
      todas('pago', 'id,contrato_id,monto,fecha_pago,forma_pago,referencia,estado'),
      todas('giro', 'id,obligacion_id,numero,vencimiento,monto,estado,abonado'),
      todas('persona', 'id,nombre,codigo,rol,email,telefono,activo'),
      todas('documento', 'id,contrato_id,cliente_id,tipo,nombre,created_at'),
      todas('obligacion', 'id,contrato_id,tipo,descripcion,monto_total,orden'),
      todas('comision', 'id,contrato_id,persona_id,monto,base,estado,periodo')
    ]);

    const porLote = new Map(lotes.map(l => [l.lote_id, l]));
    const porCliente = new Map(clientes.map(c => [c.id, c]));
    const porPersona = new Map(equipo.map(p => [p.id, p]));

    DB.lotes = lotes.map(l => ({
      id: l.lote_id,
      // Sin el proyecto no se puede crear un contrato: el número de
      // contrato y la serie son por proyecto, no globales.
      proyecto_id: l.proyecto_id,
      codigo: l.lote,
      clave: claveLote(l.fase, l.lote),
      fase: l.fase,
      manzana: l.manzana,
      area: _num(l.area_m2),
      precio: _num(l.precio_lista),
      estado: l.estado
    }));

    DB.clientes = clientes.map(c => ({
      id: c.id, nombre: c.nombre, apellido: '',
      dpi: c.dpi, nit: c.nit, tel: c.telefono, correo: c.email,
      direccion: c.direccion, ocupacion: c.ocupacion
    }));

    /* Los expedientes se arman con esto: sin los documentos de la base,
       la pantalla marcaba TODOS los contratos como incompletos. */
    DB.documentos = documentos.map(d => ({
      id: d.id, contratoId: d.contrato_id, clienteId: d.cliente_id,
      tipo: d.tipo, nombre: d.nombre, fecha: _fecha(d.created_at)
    }));

    DB.equipo = equipo.map(p => ({
      id: p.id, nombre: p.nombre, codigo: p.codigo,
      rol: rolDePortal(p.rol), email: p.email, tel: p.telefono, activo: p.activo
    }));

    DB.contratos = contratos.map(c => {
      const l = porLote.get(c.lote_id) || {};
      const cl = porCliente.get(c.cliente_id) || {};
      const v = porPersona.get(c.persona_id) || {};
      return {
        id: c.id,
        no: c.numero,
        lote: l.lote || '—',
        fase: l.fase || '',
        clave: l.lote ? claveLote(l.fase, l.lote) : null,
        clienteId: c.cliente_id,
        cliente: cl.nombre || '(sin titular)',
        tel: cl.telefono || '',
        dpi: cl.dpi || '',
        vendedor: v.nombre || '',
        fecha: _fecha(c.fecha),
        precio: _num(c.precio_venta),
        enganche: _num(c.enganche),
        plazo: c.plazo_meses,
        tasa: _num(c.tasa_mensual),
        estado: estadoDePortal(c.estado),
        estadoBase: c.estado,
        banco: c.banco || '',
        boleta: c.boleta || '',
        obligaciones: []
      };
    });

    DB.pagos = pagos.map(p => ({
      id: p.id, contratoId: p.contrato_id, monto: _num(p.monto),
      fecha: _fecha(p.fecha_pago), forma: p.forma_pago,
      referencia: p.referencia, estado: p.estado
    }));

    // Los giros cuelgan de la obligación, y la obligación del contrato.
    // Las obligaciones se piden arriba, junto con todo lo demás: antes
    // se pedían acá, después de esperar a las otras siete consultas,
    // y esa espera en serie era casi un segundo regalado.
    const oblDe = new Map(obligaciones.map(o => [o.id, o]));
    const porContrato = new Map(DB.contratos.map(c => [c.id, c]));

    for (const o of obligaciones) {
      const ct = porContrato.get(o.contrato_id);
      if (ct) ct.obligaciones.push({ id: o.id, tipo: o.tipo, desc: o.descripcion,
                                     monto: _num(o.monto_total), orden: o.orden, giros: [] });
    }
    for (const g of giros) {
      const o = oblDe.get(g.obligacion_id);
      const ct = o && porContrato.get(o.contrato_id);
      if (!ct) continue;
      const dest = ct.obligaciones.find(x => x.id === g.obligacion_id);
      if (dest) dest.giros.push({
        n: g.numero, vence: _fecha(g.vencimiento),
        monto: _num(g.monto), estado: g.estado, abonado: _num(g.abonado)
      });
    }
    for (const ct of DB.contratos) {
      ct.obligaciones.sort((a, b) => a.orden - b.orden);
      ct.obligaciones.forEach(o => o.giros.sort((a, b) => a.n - b.n));
    }

    /* La comisión la dice la base, no un 2 % recalculado en el navegador.
       Sin esto el portal mostraba su propia cuenta y la liquidación se
       creaba sin amarrar ninguna fila de `comision`: quedaban en
       'pendiente' para siempre y se podían liquidar dos veces. */
    for (const cm of comisiones) {
      const ct = porContrato.get(cm.contrato_id);
      if (!ct) continue;
      ct.comisionId     = cm.id;
      ct.comisionMonto  = _num(cm.monto);
      ct.comisionEstado = cm.estado;
      ct.comisionPeriodo = _fecha(cm.periodo);
    }

    DB.meta = DB.meta || {};
    DB.meta.origen = 'supabase';
    DB.meta.cargadoEn = new Date().toISOString();

    const resumen = {
      lotes: DB.lotes.length, contratos: DB.contratos.length,
      clientes: DB.clientes.length, pagos: DB.pagos.length,
      documentos: DB.documentos.length,
      giros: giros.length, equipo: DB.equipo.length, comisiones: comisiones.length,
      ms: Date.now() - t0
    };
    console.log('[datos] de Supabase:', resumen);
    return { ok: true, resumen };

  } catch (e) {
    console.error('[datos] falló la carga:', e);
    return { ok: false, error: e.message };
  }
}

/**
 * Trae TODAS las filas de una tabla o vista.
 * Supabase corta en 1,000 por consulta; con 5,550 giros eso significa
 * que sin paginar se perdía el 80% de la cartera sin avisar.
 */
async function todas(tabla, columnas, tam = 1000) {
  /* La primera página viene con el total (count: 'exact'), así que en
     un solo viaje sabemos cuántas páginas faltan y las pedimos TODAS
     a la vez.

     Antes esto era un for que esperaba cada página antes de pedir la
     siguiente: con 5,550 giros eran 6 viajes en fila india, y desde
     Guatemala cada viaje cuesta medio segundo largo. El usuario se
     quedaba mirando una pantalla vacía mientras el navegador hacía
     cola consigo mismo. Ahora son 2 rondas en vez de 6. */
  const { data, error, count } = await SB
    .from(tabla).select(columnas, { count: 'exact' }).range(0, tam - 1);
  if (error) throw new Error(`${tabla}: ${error.message}`);
  if (count == null || count <= tam) return data;
  if (count > 100000) throw new Error(`${tabla}: demasiadas filas (${count})`);

  const pendientes = [];
  for (let desde = tam; desde < count; desde += tam)
    pendientes.push(SB.from(tabla).select(columnas).range(desde, desde + tam - 1));

  for (const r of await Promise.all(pendientes)) {
    if (r.error) throw new Error(`${tabla}: ${r.error.message}`);
    data.push(...r.data);
  }
  return data;
}

window.cargarDesdeSupabase = cargarDesdeSupabase;
window.claveLote = claveLote;
window.estadoDePortal = estadoDePortal;
