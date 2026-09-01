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
    /* ── Qué se espera y qué no ──

       Los giros son 5,550 filas: el 74 % de todo lo que baja el portal,
       seis páginas de mil, y la primera pantalla no los usa. Esperarlos
       para poder mostrar algo es lo que hacía que entrar «costara».

       Así que la carga va en dos tiempos. Esto es el primero: lo que
       hace falta para dibujar. La cartera —giros y obligaciones— se
       pide después, con la aplicación ya en pantalla, y cuando llega se
       vuelve a pintar la vista que esté abierta.

       Los pagos se quedan acá: son 738 y de ellos depende cuánto lleva
       recaudado cada contrato, que es de lo primero que se mira. */
    const [lotes, contratos, clientes, pagos, equipo, documentos, comisiones, adjuntos, recibos, liquidaciones, requeridos] = await Promise.all([
      todas('v_inventario', 'proyecto_id,proyecto,fase,manzana,lote_id,lote,area_m2,precio_lista,estado'),
      todas('contrato', 'id,numero,fecha,precio_venta,enganche,plazo_meses,tasa_mensual,estado,origen,banco,boleta,lote_id,cliente_id,persona_id'),
      todas('cliente', 'id,nombre,dpi,nit,telefono,email,direccion,ocupacion'),
      todas('pago', 'id,contrato_id,giro_id,monto,fecha_pago,forma_pago,referencia,estado'),
      /* `auth_uid` viene para saber quién ya puede entrar. No se guarda
         el identificador, solo si lo tiene: la pantalla no necesita más
         y el uid de nadie tiene por qué andar dando vueltas. */
      conRespaldo('persona', 'id,nombre,codigo,rol,email,telefono,activo',
                  'auth_uid,externo,organizacion,acceso_hasta,vendedor_hasta'),
      /* Las columnas del respaldo llegaron con 14_documentos.sql. Si esa
         migración todavía no se corrió, se piden las de siempre: el portal
         funciona igual, solo que sin distinguir archivo de anotación.
         Antes esto tumbaba la carga entera y la pantalla salía vacía. */
      conRespaldo('documento',
        'id,contrato_id,cliente_id,tipo,nombre,created_at',
        'bucket,ruta,mime,bytes,cara,verificado_en'),
      /* `comision` existe desde 01_schema, pero puede estar vacía o sin
         permisos para el rol que entró. Que eso no tumbe la cartera. */
      opcional('comision', 'id,contrato_id,persona_id,monto,base,estado,periodo,liquidacion_id'),
      /* Los respaldos genéricos (20_adjuntos.sql): con ellos el portal sabe
         qué pago tiene su boleta y cuál no. Si la migración no corrió,
         llega vacío y todo pago aparece «sin boleta». */
      opcional('adjunto', 'id,entidad,entidad_id,bucket,ruta,nombre,mime,bytes,descripcion,created_at'),
      opcional('recibo', 'id,numero,pago_id,contrato_id,monto,fecha,adjunto_id'),
      opcional('liquidacion', 'id,numero,persona_id,periodo,periodo_desde,periodo_hasta,total,estado,factura_numero,factura_fecha,pago_fecha,created_at'),
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

    /* La posición en el plano vive en assets/lotes-geo.js (438 lotes,
       códigos únicos, manzanas A–W). Sólo initDB() —la demostración— la
       pegaba; los lotes de la base llegaban sin x/y y el mapa decía
       «438 sin ubicación» con el plano entero dibujado al lado. Se une
       por clave si el archivo la trae, y si no por código. */
    const geo = new Map();
    (window.LOT_GEO || []).forEach(g => { geo.set(g.fase ? claveLote(g.fase, g.id) : g.id, g); });
    let ubicados = 0;
    for (const l of DB.lotes) {
      const g = geo.get(l.clave) || geo.get(l.codigo);
      if (g && g.x != null) { l.x = g.x; l.y = g.y; ubicados++; }
    }
    if (DB.lotes.length && !ubicados)
      console.warn('[datos] ningún lote coincide con lotes-geo.js: revisá los códigos');

    DB.clientes = clientes.map(c => ({
      id: c.id, nombre: c.nombre, apellido: '',
      dpi: c.dpi, nit: c.nit, tel: c.telefono, correo: c.email,
      direccion: c.direccion, ocupacion: c.ocupacion
    }));

    /* Los expedientes se arman con esto: sin los documentos de la base,
       la pantalla marcaba TODOS los contratos como incompletos. */
    DB.adjuntos = (adjuntos || []).map(a => ({
      id: a.id, entidad: a.entidad, entidadId: a.entidad_id, bucket: a.bucket, ruta: a.ruta,
      nombre: a.nombre, mime: a.mime, bytes: a.bytes, descripcion: a.descripcion, fecha: _fecha(a.created_at)
    }));

    DB.recibos = (recibos || []).map(r => ({ id: r.id, numero: r.numero, pagoId: r.pago_id, contratoId: r.contrato_id,
                                            monto: _num(r.monto), fecha: _fecha(r.fecha), adjuntoId: r.adjunto_id }));

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
      rol: rolDePortal(p.rol), email: p.email, tel: p.telefono, activo: p.activo,
      // ¿Ya puede entrar? Se guarda el sí o el no, no el identificador.
      entra: !!p.auth_uid,
      externo: !!p.externo, organizacion: p.organizacion || null,
      accesoHasta: _fecha(p.acceso_hasta),
      // Hasta cuándo fue vendedor, si cambió de puesto (26_vendedor_hasta.sql)
      vendedorHasta: _fecha(p.vendedor_hasta) || null
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
        /* No se pedía, así que la columna Origen de cuatro pantallas
           pintaba la palabra «undefined». Los 148 contratos históricos
           la tienen en NULL —la carga masiva nunca la llenó—, de modo
           que se normaliza a cadena vacía y cada pantalla decide cómo
           decir «no se registró». */
        origen: c.origen || '',
        banco: c.banco || '',
        boleta: c.boleta || '',
        obligaciones: []
      };
    });

    DB.pagos = pagos.map(p => ({
      id: p.id, contratoId: p.contrato_id, monto: _num(p.monto),
      fecha: _fecha(p.fecha_pago), forma: p.forma_pago, giroId: p.giro_id || null,
      referencia: p.referencia, estado: p.estado
    }));

    const porContrato = new Map(DB.contratos.map(c => [c.id, c]));
    /* La cartera llega en la segunda fase. Mientras tanto los contratos
       tienen `obligaciones: []`, y las pantallas que dependen de eso lo
       dicen en vez de mostrar ceros como si fueran datos. */
    DB.meta = DB.meta || {};
    DB.meta.carteraLista = false;
    const giros = [], obligaciones = [];
    const oblDe = new Map(obligaciones.map(o => [o.id, o]));

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

    /* Las liquidaciones de comisión. El portal nunca las pedía: «Pagado»
       daba Q0 aunque se hubiera pagado durante meses, y un vendedor no
       podía ver lo suyo. `vendedor` es el nombre, que es como el motor
       de comisiones (comisiones.js) identifica a la persona. */
    DB.liquidaciones = (liquidaciones || []).map(l => {
      const per = porPersona.get(l.persona_id) || {};
      return { id: l.id, numero: l.numero, personaId: l.persona_id, vendedor: per.nombre || '',
               periodo: l.periodo, desde: _fecha(l.periodo_desde), hasta: _fecha(l.periodo_hasta),
               total: _num(l.total), estado: l.estado,
               factura: l.factura_numero ? { numero: l.factura_numero, fecha: _fecha(l.factura_fecha) } : null,
               pagadaEn: _fecha(l.pago_fecha), creada: _fecha(l.created_at), historial: [],
               /* Qué ventas entraron en esta liquidación: el motor de
                  comisiones (liquidados()) las lee de acá. */
               contratos: (comisiones || []).filter(cm => cm.liquidacion_id === l.id)
                 .map(cm => { const ct = porContrato.get(cm.contrato_id) || {}; return { no: ct.no || String(cm.contrato_id), comision: _num(cm.monto) }; }) };
    });


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
/* ============================================================
   SEGUNDA FASE · la cartera

   Los giros son 5,550 filas y la primera pantalla no los necesita.
   Se piden con la aplicación ya abierta, y cuando llegan se vuelve
   a pintar lo que esté en pantalla.

   Mientras tanto `DB.meta.carteraLista` es false, y las pantallas
   que dependen de la cartera lo dicen — en vez de mostrar ceros,
   que se leen igual que un dato.
   ============================================================ */
async function cargarCartera() {
  if (!window.SB) return { ok: false, error: 'sin conexión' };
  const t0 = Date.now();
  try {
    const [obligaciones, giros] = await Promise.all([
      todas('obligacion', 'id,contrato_id,tipo,descripcion,monto_total,orden'),
      todas('giro', 'id,obligacion_id,numero,vencimiento,monto,estado,abonado')
    ]);

    const porContrato = new Map(DB.contratos.map(c => [c.id, c]));
    for (const ct of DB.contratos) ct.obligaciones = [];

    const oblDe = new Map(obligaciones.map(o => [o.id, o]));
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
      if (dest) dest.giros.push({ id: g.id, n: g.numero, vence: _fecha(g.vencimiento),
                                  monto: _num(g.monto), estado: g.estado,
                                  abonado: _num(g.abonado) });
    }
    for (const ct of DB.contratos) {
      ct.obligaciones.sort((a, b) => a.orden - b.orden);
      ct.obligaciones.forEach(o => o.giros.sort((a, b) => a.n - b.n));
      if (typeof planFinanciamiento === 'function')
        ct.plan = planFinanciamiento(ct.precio, ct.enganche, ct.plazo, ct.tasa);
    }

    DB.meta.carteraLista = true;
    if (typeof reindexar === 'function') reindexar();
    console.log(`[datos] cartera: ${giros.length} giros en ${Date.now() - t0} ms`);
    return { ok: true, giros: giros.length, ms: Date.now() - t0 };
  } catch (e) {
    console.error('[datos] no se pudo cargar la cartera:', e);
    return { ok: false, error: e.message };
  }
}

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
  /* Columna por columna: si falta sólo `vendedor_hasta` (migración 26),
     antes se perdía el grupo entero —auth_uid incluido— y todo el equipo
     aparecía «Sin acceso». Se quita la que la base nombra y se reintenta. */
  let lista = nuevas.split(',').map(x => x.trim()).filter(Boolean);
  for (let i = 0; i <= lista.length; i++) {
    try { return await todas(tabla, [base].concat(lista).join(',')); }
    catch (e) {
      const msg = String(e && e.message || e);
      const col = (msg.match(/column\s+[a-z_]+\.([a-z_]+)\s+does not exist/i) || msg.match(/find the ['"]([a-z_]+)['"] column/i) || msg.match(/([a-z_]+) does not exist/i) || [])[1];
      const quitar = col && lista.includes(col) ? col : (lista.length ? lista[lista.length - 1] : null);
      if (!quitar) throw e;
      console.warn(`[datos] ${tabla} sin ${quitar} · falta correr su migración`);
      lista = lista.filter(x => x !== quitar);
    }
  }
  return await todas(tabla, base);
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
window.cargarCartera = cargarCartera;
window.claveLote = claveLote;
window.estadoDePortal = estadoDePortal;
