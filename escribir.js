/* ============================================================
   LOS DATOS, A LA BASE

   `datos-remotos.js` trae. Este archivo lleva.

   Faltaba justo esta mitad: el portal leía de Supabase pero
   guardaba en `localStorage`. Norman registraba un pago, lo veía
   él, y nadie más — ni Pedro, ni la cartera, ni la contabilidad,
   que se entera de un cobro cuando una fila entra a `pago`.

   ── Tres reglas ──

   1 · Primero la base, después la pantalla.
       Cada operación escribe, espera la respuesta y solo entonces
       actualiza el objeto DB con la fila que devolvió el servidor.
       Nada de pintar el pago y rezar: si falló, el usuario se
       entera en el momento, con el motivo.

   2 · Los identificadores los pone la base.
       El portal ya no inventa ids con uid(). Insertamos con
       `.select().single()` y nos quedamos con el id real, que es
       el que después usan las demás operaciones.

   3 · Esto NO es la seguridad.
       Las políticas RLS de Postgres deciden quién escribe qué.
       Acá se comprueba lo mismo antes de salir a la red para dar
       un mensaje decente en vez de un 403 pelado, pero quien se
       salte esta comprobación choca igual contra la base.
   ============================================================ */
'use strict';

/* ¿Hay base al otro lado y alguien identificado? Si no, el portal
   corre en modo demostración contra localStorage, como siempre. */
const hayBase = () => !!(window.SB && window.SESION && SESION.persona);

/** El id de quien está operando, para las columnas de auditoría. */
const yo = () => (window.SESION && SESION.persona) ? SESION.persona.id : null;

/* ------------------------------------------------------------
   Errores que se pueden leer

   PostgREST devuelve cosas como «new row violates row-level
   security policy for table "pago"». Eso es correcto y es
   inservible para quien está parado frente a la pantalla.
   ------------------------------------------------------------ */
function traducirError(e, queHacia) {
  const m = String((e && e.message) || e || '');

  if (/row-level security|permission denied/i.test(m))
    return `No tienes permiso para ${queHacia}. Si crees que sí deberías, avisa a administración.`;
  if (/modo consulta/i.test(m))
    return 'El sistema está en modo consulta: todavía no se registra nada.';
  if (/duplicate key|already exists|unique constraint/i.test(m))
    return 'Eso ya estaba registrado. Actualiza la pantalla antes de volver a intentarlo.';
  if (/violates foreign key/i.test(m))
    return 'Falta un dato relacionado. Puede que el contrato o el lote ya no exista.';
  if (/violates check constraint/i.test(m))
    return 'Los datos no cumplen una regla del sistema: ' + m.replace(/.*constraint "([^"]+)".*/, '$1');
  if (/Failed to fetch|NetworkError|network/i.test(m))
    return 'No hay conexión con el servidor. Lo que escribiste NO se guardó.';
  if (/JWT|token|expired/i.test(m))
    return 'Tu sesión caducó. Vuelve a entrar.';
  return m || `No se pudo ${queHacia}.`;
}

/** Envoltura común: comprueba, ejecuta y devuelve algo uniforme. */
async function escribir(queHacia, fn) {
  if (!hayBase())
    return { ok: false, error: 'El portal no está conectado a la base.' };
  if (SESION.modoConsulta)
    return { ok: false, error: 'Modo consulta: el sistema está abierto para mirar, no para registrar.' };

  try {
    const dato = await fn();
    return { ok: true, dato };
  } catch (e) {
    console.error('[escribir]', queHacia, e);
    return { ok: false, error: traducirError(e, queHacia) };
  }
}

/** Lanza si Supabase devolvió error; si no, entrega los datos. */
function oExplota({ data, error }) {
  if (error) throw error;
  return data;
}

/* ------------------------------------------------------------
   Catálogos que la base guarda como filas y el portal como texto
   ------------------------------------------------------------ */
const _cache = { tipoGestion: null, resultadoGestion: null, cuentas: null };

async function idDeCatalogo(tabla, nombre, cacheKey) {
  if (!nombre) return null;
  if (!_cache[cacheKey]) {
    const filas = oExplota(await SB.from(tabla).select('id,nombre'));
    _cache[cacheKey] = new Map(filas.map(f => [f.nombre.toLowerCase(), f.id]));
  }
  return _cache[cacheKey].get(String(nombre).toLowerCase()) || null;
}

/** La cuenta bancaria por su descripción. El portal las maneja por nombre. */
async function idDeCuenta(descripcion) {
  if (!descripcion) return null;
  if (!_cache.cuentas) {
    const filas = oExplota(await SB.from('cuenta_bancaria').select('id,descripcion,numero'));
    _cache.cuentas = filas;
  }
  const d = String(descripcion).toLowerCase();
  const c = _cache.cuentas.find(x =>
    (x.descripcion || '').toLowerCase().includes(d) ||
    d.includes((x.descripcion || '').toLowerCase()) ||
    (x.numero && d.includes(x.numero)));
  return c ? c.id : null;
}

/* ============================================================
   CLIENTES
   ============================================================ */
async function sbCrearCliente(datos) {
  return escribir('crear el cliente', async () => {
    const fila = oExplota(await SB.from('cliente').insert({
      nombre: datos.nombre,
      dpi: datos.dpi || null,
      nit: datos.nit || null,
      telefono: datos.telefono || null,
      email: datos.email || null,
      direccion: datos.direccion || null,
      ocupacion: datos.ocupacion || null
    }).select('id,nombre,dpi,nit,telefono,email,direccion,ocupacion').single());

    DB.clientes.push({
      id: fila.id, nombre: fila.nombre, apellido: '',
      dpi: fila.dpi, nit: fila.nit, tel: fila.telefono, correo: fila.email,
      direccion: fila.direccion, ocupacion: fila.ocupacion
    });
    return fila;
  });
}

async function sbActualizarCliente(id, datos) {
  return escribir('guardar el cliente', async () => {
    const fila = oExplota(await SB.from('cliente').update({
      nombre: datos.nombre, dpi: datos.dpi || null, telefono: datos.telefono || null,
      email: datos.email || null, direccion: datos.direccion || null,
      ocupacion: datos.ocupacion || null, updated_at: new Date().toISOString()
    }).eq('id', id).select().single());

    const c = DB.clientes.find(x => x.id === id);
    if (c) Object.assign(c, { nombre: fila.nombre, dpi: fila.dpi, tel: fila.telefono,
                              correo: fila.email, direccion: fila.direccion, ocupacion: fila.ocupacion });
    return fila;
  });
}

/* ============================================================
   CONTRATOS

   El número lo da `siguiente_contrato()` y el plan de giros lo
   arma `generar_giros()`, las dos en la base. El portal tiene su
   propio cálculo en planFinanciamiento() y coincide al centavo,
   pero si algún día dejaran de coincidir, la que manda es la de
   la base: es la que ve la contabilidad.
   ============================================================ */
async function sbCrearContrato({ lote, cliente_id, persona_id, enganche, plazo, origen, banco, boleta }) {
  return escribir('crear el contrato', async () => {
    if (!lote || !lote.id) throw new Error('No se identificó el lote.');
    if (!lote.proyecto_id) throw new Error('El lote no trae proyecto. Recarga la página.');

    const numero = oExplota(await SB.rpc('siguiente_contrato', { p_proyecto_id: lote.proyecto_id }));

    const fila = oExplota(await SB.from('contrato').insert({
      proyecto_id: lote.proyecto_id,
      lote_id: lote.id,
      cliente_id,
      persona_id: persona_id || null,
      numero,
      fecha: new Date().toISOString().slice(0, 10),
      precio_venta: lote.precio,
      enganche: enganche,
      plazo_meses: plazo,
      tasa_mensual: lote.tasa || TASA_MENSUAL,
      estado: 'en_aprobacion',
      origen: origen || 'Campo',
      banco: banco || null,
      boleta: boleta || null,
      fuente: 'Suite'
    }).select('id,numero,fecha,precio_venta,enganche,plazo_meses,tasa_mensual,estado').single());

    // El plan de pago lo arma la base, no el navegador.
    oExplota(await SB.rpc('generar_giros', { p_contrato_id: fila.id }));

    // El lote queda reservado hasta que el comité apruebe.
    oExplota(await SB.from('lote').update({ estado: 'reservado' }).eq('id', lote.id).select('id'));

    return fila;
  });
}

/* Del vocabulario del portal al de la base. Es el camino de vuelta de
   `estadoDePortal()`: el portal dice «aprobado», la base entiende
   «activo», y quien decide es la base. */
const ESTADO_BASE = { aprobado: 'activo' };
const estadoDeBase = e => ESTADO_BASE[e] || e;

async function sbEstadoContrato(contrato_id, estado, estadoLote) {
  estado = estadoDeBase(estado);
  return escribir('cambiar el estado del contrato', async () => {
    const fila = oExplota(await SB.from('contrato')
      .update({ estado, updated_at: new Date().toISOString() })
      .eq('id', contrato_id).select('id,lote_id,estado').single());

    if (estadoLote && fila.lote_id)
      oExplota(await SB.from('lote').update({ estado: estadoLote }).eq('id', fila.lote_id).select('id'));

    const ct = DB.contratos.find(c => c.id === contrato_id);
    if (ct) { ct.estado = estadoDePortal(fila.estado); ct.estadoBase = fila.estado; }
    return fila;
  });
}

async function sbReasignarContratos(idsContrato, persona_id) {
  return escribir('reasignar los contratos', async () => {
    if (!idsContrato.length) return 0;
    const filas = oExplota(await SB.from('contrato')
      .update({ persona_id, updated_at: new Date().toISOString() })
      .in('id', idsContrato).select('id'));
    return filas.length;
  });
}

/* ============================================================
   PAGOS

   Un pago nace 'registrado'. Quien cobra no confirma: eso lo hace
   el financiero. Y hasta que no se confirma, la contabilidad no
   asienta nada — el disparador espera el estado 'confirmado'.
   ============================================================ */
async function sbRegistrarPago(contrato_id, { monto, forma, cuenta, referencia, fecha, giro_id }) {
  return escribir('registrar el pago', async () => {
    const fila = oExplota(await SB.from('pago').insert({
      contrato_id,
      giro_id: giro_id || null,
      cuenta_bancaria_id: await idDeCuenta(cuenta),
      monto: +monto,
      fecha_pago: fecha || new Date().toISOString().slice(0, 10),
      forma_pago: forma || null,
      referencia: referencia || null,
      estado: 'registrado',
      registrado_por: yo()
    }).select('id,contrato_id,monto,fecha_pago,forma_pago,referencia,estado').single());

    DB.pagos.push({
      id: fila.id, contratoId: fila.contrato_id, monto: Number(fila.monto),
      fecha: fila.fecha_pago, forma: fila.forma_pago,
      referencia: fila.referencia, estado: fila.estado
    });
    return fila;
  });
}

async function sbConfirmarPago(pago_id, ok = true) {
  return escribir(ok ? 'confirmar el pago' : 'rechazar el pago', async () => {
    const fila = oExplota(await SB.from('pago').update({
      estado: ok ? 'confirmado' : 'rechazado',
      aprobado_por: yo(),
      aprobado_en: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', pago_id).select('id,contrato_id,estado').single());

    // Que la cartera refleje el cobro: saldos, giros y mora los
    // recalcula la base, que es donde están las reglas.
    if (ok && fila.contrato_id)
      oExplota(await SB.rpc('recalcular_contrato', { p_contrato_id: fila.contrato_id }));

    const p = DB.pagos.find(x => x.id === pago_id);
    if (p) p.estado = fila.estado;
    return fila;
  });
}

async function sbBorrarPago(pago_id) {
  return escribir('deshacer el pago', async () => {
    // Solo se borra lo que todavía nadie confirmó.
    const filas = oExplota(await SB.from('pago').delete()
      .eq('id', pago_id).eq('estado', 'registrado').select('id'));
    if (!filas.length)
      throw new Error('Ese pago ya fue confirmado: no se deshace, se anula con nota.');
    const i = DB.pagos.findIndex(x => x.id === pago_id);
    if (i >= 0) DB.pagos.splice(i, 1);
    return filas[0];
  });
}

/* ============================================================
   RECAUDACIÓN · lo que cobranza marca cada semana
   ============================================================ */

/** El giro que vence ese día en ese contrato, si existe. */
async function giroDeVencimiento(contrato_id, vence) {
  const obl = oExplota(await SB.from('obligacion').select('id').eq('contrato_id', contrato_id));
  if (!obl.length) return null;
  const giros = oExplota(await SB.from('giro').select('id,vencimiento')
    .in('obligacion_id', obl.map(o => o.id)).eq('vencimiento', vence).limit(1));
  return giros.length ? giros[0].id : null;
}

async function sbMarcarCobrada(contrato_id, vence, { monto, forma, cuenta, referencia, nota }) {
  return escribir('marcar la cuota como cobrada', async () => {
    const giro_id = await giroDeVencimiento(contrato_id, vence);

    const pago = oExplota(await SB.from('pago').insert({
      contrato_id, giro_id,
      cuenta_bancaria_id: await idDeCuenta(cuenta),
      monto: +monto,
      fecha_pago: new Date().toISOString().slice(0, 10),
      forma_pago: forma || null, referencia: referencia || null,
      estado: 'registrado', registrado_por: yo()
    }).select('id,contrato_id,monto,fecha_pago,forma_pago,referencia,estado').single());

    const fila = oExplota(await SB.from('recaudacion').upsert({
      contrato_id, giro_id, vence,
      estado: 'cobrada', pago_id: pago.id, monto: +monto,
      motivo: null, promesa_pago: null,
      nota: nota || null, marcado_por: yo(), marcado_en: new Date().toISOString()
    }, { onConflict: 'contrato_id,vence' }).select().single());

    DB.pagos.push({
      id: pago.id, contratoId: pago.contrato_id, monto: Number(pago.monto),
      fecha: pago.fecha_pago, forma: pago.forma_pago,
      referencia: pago.referencia, estado: pago.estado
    });
    return { recaudo: fila, pago };
  });
}

async function sbMarcarNoCobrada(contrato_id, vence, { motivo, nota, promesa }) {
  return escribir('registrar que no se cobró', async () => {
    const giro_id = await giroDeVencimiento(contrato_id, vence);
    return oExplota(await SB.from('recaudacion').upsert({
      contrato_id, giro_id, vence,
      estado: 'no_cobrada', pago_id: null, monto: 0,
      motivo, promesa_pago: motivo === 'promesa' ? (promesa || null) : null,
      nota: nota || null, marcado_por: yo(), marcado_en: new Date().toISOString()
    }, { onConflict: 'contrato_id,vence' }).select().single());
  });
}

async function sbDesmarcarCuota(contrato_id, vence) {
  return escribir('deshacer la marca', async () => {
    const filas = oExplota(await SB.from('recaudacion').select('id,pago_id')
      .eq('contrato_id', contrato_id).eq('vence', vence).limit(1));
    if (!filas.length) return null;

    const r = filas[0];
    oExplota(await SB.from('recaudacion').delete().eq('id', r.id).select('id'));
    if (r.pago_id) {
      oExplota(await SB.from('pago').delete()
        .eq('id', r.pago_id).eq('estado', 'registrado').select('id'));
      const i = DB.pagos.findIndex(x => x.id === r.pago_id);
      if (i >= 0) DB.pagos.splice(i, 1);
    }
    return r;
  });
}

/* ============================================================
   GESTIONES, DOCUMENTOS E INTEGRANTES
   ============================================================ */
async function sbGestion(contrato_id, tipo, resultado, comentario, canal) {
  return escribir('registrar la gestión', async () => {
    const fila = oExplota(await SB.from('gestion').insert({
      contrato_id,
      tipo_gestion_id: await idDeCatalogo('tipo_gestion', tipo, 'tipoGestion'),
      resultado_gestion_id: await idDeCatalogo('resultado_gestion', resultado, 'resultadoGestion'),
      persona_id: yo(),
      canal: canal || null,
      comentario: comentario || null
    }).select('id,contrato_id,comentario,fecha').single());

    DB.gestiones.push({ id: fila.id, contratoId: contrato_id, tipo, resultado,
                        comentario: fila.comentario,
                        fecha: String(fila.fecha).slice(0, 16).replace('T', ' '),
                        usuario: SESION.persona.nombre });
    return fila;
  });
}

/* `documento.url` es obligatorio en la base y con razón: un
   documento sin archivo no es un documento. Mientras el portal no
   suba el archivo al bucket, se guarda la intención con el
   prefijo `pendiente:` y la pantalla de expedientes puede
   distinguirlos. La subida de verdad la hace tools/subir-documentos.js. */
async function sbDocumento(contrato_id, tipo, nombre, url) {
  return escribir('agregar el documento', async () => {
    const fila = oExplota(await SB.from('documento').insert({
      contrato_id, tipo, nombre,
      url: url || ('pendiente:' + nombre),
      subido_por: yo()
    }).select('id,contrato_id,tipo,nombre,url,created_at').single());

    DB.documentos.push({ id: fila.id, contratoId: fila.contrato_id,
                         tipo: fila.tipo, nombre: fila.nombre,
                         url: fila.url, fecha: String(fila.created_at).slice(0, 10) });
    return fila;
  });
}

/* ============================================================
   SUBIR EL RESPALDO

   El DPI, el contrato firmado y el plan de pagos firmado. Hasta
   ahora el portal solo anotaba el nombre del archivo: la fila
   decía «dpi_frente.pdf» y no había ningún dpi_frente.pdf en
   ninguna parte. El expediente se daba por completo con papeles
   que nadie había subido.

   El archivo va a un bucket PRIVADO. La primera carpeta de la
   ruta es el id del contrato, y de eso dependen las políticas de
   Storage: un vendedor solo puede subir y ver los expedientes de
   los contratos que él vendió.

   Para mirarlo después se pide una URL firmada de vida corta.
   Nunca hay un enlace permanente a un DPI.
   ============================================================ */

const MIMES_OK = ['image/jpeg','image/png','image/webp','application/pdf'];
const EXT = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'application/pdf':'pdf' };

/** Lo que cabe en cada bucket, en bytes. Igual que en 04_storage.sql. */
const TOPE = { expedientes: 10485760, contratos: 20971520, boletas: 5242880, facturas: 5242880 };

/**
 * Sube un archivo de respaldo y deja la fila que lo registra.
 * @param {number} contrato_id
 * @param {string} codigo     del catálogo: 'dpi', 'contrato', 'plan_pagos'…
 * @param {File}   archivo
 * @param {string} [cara]     'frente' o 'reverso', para el DPI
 */
async function sbSubirDocumento(contrato_id, codigo, archivo, cara) {
  return escribir('subir el documento', async () => {
    if (!archivo) throw new Error('No se eligió ningún archivo.');

    const tipo = archivo.type || '';
    if (!MIMES_OK.includes(tipo))
      throw new Error('Solo se aceptan fotos (JPG, PNG, WEBP) o PDF. '
                    + (tipo ? `Ese archivo es ${tipo}.` : 'Ese archivo no dice qué es.'));

    // Qué papel es y a qué bucket va lo dice el catálogo, no el portal.
    const reqs = oExplota(await SB.from('documento_requerido')
      .select('codigo,nombre,bucket,caras').eq('codigo', codigo).maybeSingle());
    if (!reqs) throw new Error(`«${codigo}» no está en el catálogo de documentos.`);

    const tope = TOPE[reqs.bucket] || 10485760;
    if (archivo.size > tope)
      throw new Error(`El archivo pesa ${(archivo.size/1048576).toFixed(1)} MB y el máximo es `
                    + `${Math.round(tope/1048576)} MB. Si es una foto, bájale la resolución.`);
    if (archivo.size === 0) throw new Error('El archivo está vacío.');

    /* La primera carpeta ES el permiso: `carpeta_id()` la lee y la
       política de Storage decide con ella. Si esto deja de ser el id
       del contrato, el vendedor pierde acceso a lo suyo. */
    const sufijo = cara ? '-' + cara : '';
    const marca = Date.now().toString(36);
    const ruta = `${contrato_id}/${codigo}${sufijo}-${marca}.${EXT[tipo]}`;

    const { error: eSubida } = await SB.storage.from(reqs.bucket)
      .upload(ruta, archivo, { contentType: tipo, upsert: false });
    if (eSubida) throw eSubida;

    /* Si la fila falla, el archivo queda huérfano en el bucket y el
       expediente diría que falta. Se limpia antes de propagar el error. */
    try {
      const fila = oExplota(await SB.from('documento').insert({
        contrato_id, tipo: codigo,
        nombre: archivo.name,
        url: `${reqs.bucket}/${ruta}`,
        bucket: reqs.bucket, ruta, mime: tipo, bytes: archivo.size,
        cara: cara || null,
        subido_por: yo()
      }).select('id,contrato_id,tipo,nombre,bucket,ruta,mime,bytes,cara,created_at').single());

      DB.documentos.push({ id: fila.id, contratoId: fila.contrato_id, tipo: fila.tipo,
                           nombre: fila.nombre, bucket: fila.bucket, ruta: fila.ruta,
                           mime: fila.mime, bytes: fila.bytes, cara: fila.cara,
                           fecha: String(fila.created_at).slice(0, 10) });
      return fila;
    } catch (e) {
      await SB.storage.from(reqs.bucket).remove([ruta]);
      throw e;
    }
  });
}

/** Una URL para ver el archivo. Caduca; no se guarda ni se comparte. */
async function sbVerDocumento(bucket, ruta, segundos = 120) {
  return escribir('abrir el documento', async () => {
    const { data, error } = await SB.storage.from(bucket).createSignedUrl(ruta, segundos);
    if (error) throw error;
    return data.signedUrl;
  });
}

/** El visto bueno de quien revisó que el papel es el que dice ser. */
async function sbVerificarDocumento(id) {
  return escribir('verificar el documento', async () =>
    oExplota(await SB.from('documento')
      .update({ verificado_por: yo(), verificado_en: new Date().toISOString() })
      .eq('id', id).select('id,verificado_en').single()));
}

/** Qué le falta al expediente de un contrato, según la base. */
async function sbFaltantes(contrato_id) {
  return escribir('consultar el expediente', async () =>
    oExplota(await SB.from('v_expediente_documentos')
      .select('codigo,nombre,obligatorio,caras,subidos,completo')
      .eq('contrato_id', contrato_id).order('orden')));
}

async function sbIntegrante(contrato_id, nombre, cargo) {
  return escribir('agregar el integrante', async () =>
    oExplota(await SB.from('integrante_contrato')
      .insert({ contrato_id, nombre, cargo }).select().single()));
}

/* ============================================================
   EQUIPO
   ============================================================ */
async function sbGuardarPersona(datos) {
  return escribir('guardar la persona', async () => {
    /* El correo y el rol son llaves de acceso, no datos de contacto:
       `11_correos.sql` solo deja cambiarlos al dueño del sistema. Si
       la base los rechaza, el mensaje de traducirError() lo explica. */
    const campos = {
      nombre: datos.nombre,
      codigo: datos.codigo || null,
      telefono: datos.telefono || null,
      nota: datos.nota || null
    };
    if (datos.rol)    campos.rol = datos.rol === 'cobrador' ? 'cobranza' : datos.rol;
    if (datos.email)  campos.email = datos.email;
    if (datos.activo !== undefined) campos.activo = !!datos.activo;

    const fila = datos.id
      ? oExplota(await SB.from('persona').update(campos).eq('id', datos.id).select().single())
      : oExplota(await SB.from('persona').insert(campos).select().single());

    const p = DB.equipo.find(x => x.id === fila.id);
    const mapeada = { id: fila.id, nombre: fila.nombre, codigo: fila.codigo,
                      rol: rolDePortal(fila.rol), email: fila.email,
                      tel: fila.telefono, activo: fila.activo };
    if (p) Object.assign(p, mapeada); else DB.equipo.push(mapeada);
    return fila;
  });
}

async function sbDesactivarPersona(id) {
  return escribir('desactivar la persona', async () => {
    const fila = oExplota(await SB.from('persona')
      .update({ activo: false }).eq('id', id).select('id,activo').single());
    const p = DB.equipo.find(x => x.id === id);
    if (p) p.activo = false;
    return fila;
  });
}

/* ============================================================
   CONCILIACIÓN BANCARIA

   Las tablas son de `13_conciliacion.sql`. Antes esto vivía en
   `DB.movimientos` y `DB.conciliaciones`, o sea en el navegador
   de quien subía el archivo.
   ============================================================ */

/* La huella identifica una línea del estado de cuenta. El banco no
   da un identificador propio, así que se arma con lo que sí trae.
   Sin esto, reimportar el archivo del mes duplicaría todo. */
function huellaMovimiento(m) {
  const base = [m.fecha, m.monto, m.referencia || '', (m.descripcion || '').slice(0, 60)].join('|');
  let h = 0;
  for (let i = 0; i < base.length; i++) { h = ((h << 5) - h + base.charCodeAt(i)) | 0; }
  return m.fecha.replace(/-/g, '') + '-' + (h >>> 0).toString(36);
}

async function sbImportarMovimientos(movimientos, cuenta, archivo) {
  return escribir('importar el estado de cuenta', async () => {
    const cuenta_bancaria_id = await idDeCuenta(cuenta);
    if (!cuenta_bancaria_id)
      throw new Error(`No se encontró la cuenta bancaria «${cuenta}». Dala de alta antes de importar.`);

    const filas = movimientos.map(m => ({
      cuenta_bancaria_id,
      fecha: m.fecha,
      tipo: (+m.monto >= 0 && m.tipo !== 'cargo') ? 'abono' : 'cargo',
      monto: Math.abs(+m.monto),
      descripcion: m.descripcion || null,
      referencia: m.referencia || null,
      saldo: m.saldo != null ? +m.saldo : null,
      huella: huellaMovimiento(m),
      archivo: archivo || null,
      importado_por: yo()
    }));

    /* ignoreDuplicates: reimportar el mismo archivo no duplica ni
       falla — simplemente no vuelve a insertar lo que ya estaba. */
    const guardadas = oExplota(await SB.from('movimiento_banco')
      .upsert(filas, { onConflict: 'cuenta_bancaria_id,huella', ignoreDuplicates: true })
      .select('id,fecha,monto,descripcion,referencia,tipo'));

    return { insertados: guardadas.length, recibidos: filas.length };
  });
}

async function sbConciliar(movimiento_id, { contrato_id, pago_id, monto, certeza }) {
  return escribir('conciliar el depósito', async () =>
    oExplota(await SB.from('conciliacion').insert({
      movimiento_id, contrato_id: contrato_id || null, pago_id: pago_id || null,
      monto: +monto, certeza: certeza != null ? +certeza : null,
      estado: 'propuesta', conciliado_por: yo()
    }).select().single()));
}

/* Confirmar o descartar una conciliación ya propuesta. Confirmar es del
   lado del dinero: la política `conc_confirmar` solo deja a financiero,
   confirmación y administración. */
async function sbActualizarConciliacion(id, estado, motivo) {
  return escribir('actualizar la conciliación', async () =>
    oExplota(await SB.from('conciliacion')
      .update({ estado, motivo: motivo || null, conciliado_por: yo(),
                conciliado_en: new Date().toISOString() })
      .eq('id', id).select().single()));
}

async function sbDescartarConciliacion(id, motivo) {
  return escribir('descartar la conciliación', async () => {
    if (!motivo) throw new Error('Hay que decir por qué se descarta.');
    return oExplota(await SB.from('conciliacion')
      .update({ estado: 'descartada', motivo, conciliado_por: yo() })
      .eq('id', id).select().single());
  });
}

/* ============================================================
   COMISIONES
   ============================================================ */
async function sbCrearLiquidacion({ persona_id, proyecto_id, periodo, desde, hasta, total, comisiones }) {
  return escribir('crear la liquidación', async () => {
    const numero = 'LIQ-' + periodo + '-' + String(persona_id).padStart(3, '0');

    const fila = oExplota(await SB.from('liquidacion').insert({
      numero, persona_id, proyecto_id: proyecto_id || null,
      periodo, periodo_desde: desde, periodo_hasta: hasta,
      total: +total, estado: 'borrador', creada_por: yo()
    }).select().single());

    // Las comisiones quedan amarradas: una comisión, una liquidación.
    if (comisiones && comisiones.length)
      oExplota(await SB.from('comision')
        .update({ liquidacion_id: fila.id, estado: 'liquidada' })
        .in('id', comisiones).select('id'));

    return fila;
  });
}

/* ============================================================
   Lo que ve el resto del portal
   ============================================================ */
Object.assign(window, {
  hayBase, escribir, traducirError,
  sbCrearCliente, sbActualizarCliente,
  sbCrearContrato, sbEstadoContrato, sbReasignarContratos,
  sbRegistrarPago, sbConfirmarPago, sbBorrarPago,
  sbMarcarCobrada, sbMarcarNoCobrada, sbDesmarcarCuota,
  sbGestion, sbDocumento, sbIntegrante,
  sbSubirDocumento, sbVerDocumento, sbVerificarDocumento, sbFaltantes,
  MIMES_OK,
  sbGuardarPersona, sbDesactivarPersona,
  sbImportarMovimientos, sbConciliar, sbActualizarConciliacion, sbDescartarConciliacion,
  huellaMovimiento,
  sbCrearLiquidacion
});
