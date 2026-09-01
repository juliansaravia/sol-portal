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
    const [lotes, contratos, clientes, pagos, giros, equipo, documentos, obligaciones, comisiones, requeridos] = await Promise.all([
      todas('v_inventario', 'proyecto_id,proyecto,fase,manzana,lote_id,lote,area_m2,precio_lista,estado'),
      todas('contrato', 'id,numero,fecha,precio_venta,enganche,plazo_meses,tasa_mensual,estado,banco,boleta,lote_id,cliente_id,persona_id'),
      todas('cliente', 'id,nombre,dpi,nit,telefono,email,direccion,ocupacion'),
      todas('pago', 'id,contrato_id,monto,fecha_pago,forma_pago,referencia,estado'),
      todas('giro', 'id,obligacion_id,numero,vencimiento,monto,estado,abonado'),
      todas('persona', 'id,nombre,codigo,rol,email,telefono,activo'),
      /* Las columnas del respaldo llegaron con 14_documentos.sql. Si esa
         migración todavía no se corrió, se piden las de siempre: el portal
         funciona igual, solo que sin distinguir archivo de anotación.
         Antes esto tumbaba la carga entera y la pantalla salía vacía. */
      conRespaldo('documento',
        'id,contrato_id,cliente_id,tipo,nombre,created_at',
        'bucket,ruta,mime,bytes,cara,verificado_en'),
      todas('obligacion', 'id,contrato_id,tipo,descripcion,monto_total,orden'),
      /* `comision` existe desde 01_schema, pero puede estar vacía o sin
         permisos para el rol que entró. Que eso no tumbe la cartera. */
      opcional('comision', 'id,contrato_id,persona_id,monto,base,estado,periodo'),
      /* La tabla nace con 14_documentos.sql. Sin ella el portal usa su
         lista de respaldo — no se cae por un catálogo que no está. */
      opcional('documento_requerido', 'codigo,nombre,descripcion,bucket,caras,obligatorio,orden')
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
      tipo: d.tipo, nombre: d.nombre, fecha: _fecha(d.created_at),
      // Sin archivo no es respaldo, por más que la fila exista.
      bucket: d.bucket, ruta: d.ruta, mime: d.mime, bytes: d.bytes, cara: d.cara,
      verificado: !!d.verificado_en
    }));

    /* Qué papeles lleva un expediente lo dice la base, no una lista
       escrita en el portal. Si el abogado pide uno más, se inserta una
       fila y la pantalla lo pide sola. */
    DB.documentosRequeridos = (requeridos || []).sort((a, b) => a.orden - b.orden);

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

      /* El plan de pago, que media docena de pantallas dan por hecho.
         El modo demostración lo arma en crearObligaciones(); acá no lo
         armaba nadie, así que `ct.plan` era undefined y las pantallas
         mostraban «Plazo: 0 meses», «Cuota Q 0.00» y «Enganche Q 0.00»
         encima de contratos que sí tienen plan.

         Es el mismo cálculo verificado contra el contrato J-05. */
      if (typeof planFinanciamiento === 'function')
        ct.plan = planFinanciamiento(ct.precio, ct.enganche, ct.plazo, ct.tasa);
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
/**
 * Como `todas`, pero si la tabla no existe devuelve vacío en vez de
 * tumbar la carga. Para lo que llega con una migración que puede no
 * haberse corrido todavía.
 */
async function opcional(tabla, columnas) {
  try { return await todas(tabla, columnas); }
  catch (e) {
    console.warn(`[datos] ${tabla} no está todavía · falta correr su migración`);
    return [];
  }
}

/**
 * Pide las columnas de siempre más las nuevas; si las nuevas no existen,
 * repite sin ellas. Un despliegue del portal no puede quedar a merced de
 * que alguien se acuerde de pegar un .sql.
 */
async function conRespaldo(tabla, base, nuevas) {
  try { return await todas(tabla, base + ',' + nuevas); }
  catch (e) {
    console.warn(`[datos] ${tabla} sin ${nuevas} · falta correr su migración`);
    return await todas(tabla, base);
  }
}

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
