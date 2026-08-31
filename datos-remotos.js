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
    const [lotes, contratos, clientes, pagos, giros, equipo] = await Promise.all([
      todas('v_inventario', 'proyecto,fase,manzana,lote_id,lote,area_m2,precio_lista,estado'),
      todas('contrato', 'id,numero,fecha,precio_venta,enganche,plazo_meses,tasa_mensual,estado,banco,boleta,lote_id,cliente_id,persona_id'),
      todas('cliente', 'id,nombre,dpi,nit,telefono,direccion,ocupacion'),
      todas('pago', 'id,contrato_id,monto,fecha_pago,forma_pago,referencia,estado'),
      todas('giro', 'id,obligacion_id,numero,vencimiento,monto,estado,abonado'),
      todas('persona', 'id,nombre,codigo,rol,email,telefono,activo')
    ]);

    const porLote = new Map(lotes.map(l => [l.lote_id, l]));
    const porCliente = new Map(clientes.map(c => [c.id, c]));
    const porPersona = new Map(equipo.map(p => [p.id, p]));

    DB.lotes = lotes.map(l => ({
      id: l.lote_id,
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
      dpi: c.dpi, nit: c.nit, tel: c.telefono,
      direccion: c.direccion, ocupacion: c.ocupacion
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
        estado: c.estado,
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
    // Se traen las obligaciones para poder colgar cada giro de su contrato.
    const obligaciones = await todas('obligacion', 'id,contrato_id,tipo,descripcion,monto_total,orden');
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

    DB.meta = DB.meta || {};
    DB.meta.origen = 'supabase';
    DB.meta.cargadoEn = new Date().toISOString();

    const resumen = {
      lotes: DB.lotes.length, contratos: DB.contratos.length,
      clientes: DB.clientes.length, pagos: DB.pagos.length,
      giros: giros.length, equipo: DB.equipo.length,
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
  const acumulado = [];
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await SB.from(tabla).select(columnas).range(desde, desde + tam - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    acumulado.push(...data);
    if (data.length < tam) return acumulado;
    if (acumulado.length > 100000) throw new Error(`${tabla}: demasiadas filas`);
  }
}

window.cargarDesdeSupabase = cargarDesdeSupabase;
window.claveLote = claveLote;
