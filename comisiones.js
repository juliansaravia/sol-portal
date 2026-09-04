/* ============================================================
   LIQUIDACIÓN DE COMISIONES

   El 2% del valor del lote no se paga solo por vender: hay un
   camino que recorrer y cada paso deja rastro.

     1. DEVENGADA   la venta está aprobada y genera comisión
     2. LIQUIDADA   entra en la liquidación de una quincena
     3. FACTURADA   el vendedor sube su factura
     4. PAGADA      finanzas la paga y anota la referencia

   Dos reglas que el código impide romper:
     · Un contrato solo puede estar en UNA liquidación. Si ya se
       liquidó, no vuelve a aparecer. Así no se paga dos veces.
     · No se paga sin factura. En Guatemala eso es un gasto que
       no se puede deducir.

   Nada se borra: una liquidación pagada queda cerrada y el
   historial guarda quién hizo qué y cuándo.
   ============================================================ */

/* Quincenas: del 1 al 15, y del 16 al fin de mes. */
function periodoDe(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return d <= 15 ? `${a}-${String(m).padStart(2, '0')}-Q1` : `${a}-${String(m).padStart(2, '0')}-Q2`;
}
function rangoPeriodo(p) {
  const [a, m, q] = p.split('-');
  const fin = new Date(Number(a), Number(m), 0).getDate();
  return q === 'Q1' ? { desde: `${a}-${m}-01`, hasta: `${a}-${m}-15` }
                    : { desde: `${a}-${m}-16`, hasta: `${a}-${m}-${fin}` };
}
function etiquetaPeriodo(p) {
  const { desde, hasta } = rangoPeriodo(p);
  const mes = new Date(desde + 'T00:00:00').toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  return `${desde.slice(8)} al ${hasta.slice(8)} de ${mes}`;
}

const ESTADOS_LIQ = {
  borrador:  { label: 'Por facturar',  clase: 'b-pend' },
  facturada: { label: 'Facturada',     clase: 'b-apar' },
  pagada:    { label: 'Pagada',        clase: 'b-ok'   },
  anulada:   { label: 'Anulada',       clase: 'b-mora' },
};

/* ---------- Qué está pendiente de liquidar ---------- */

const liquidados = () => new Set(
  (DB.liquidaciones || [])
    .filter(l => l.estado !== 'anulada')
    .flatMap(l => (l.contratos || []).map(c => c.no)));

/**
 * Comisiones devengadas que todavía no entran en ninguna liquidación.
 * Solo comisiona el rol Vendedor — David es financiero, no cobra comisión.
 */
/* ---------- Retención por expediente incompleto ----------

   Una comisión no se liquida si al contrato le falta documentación
   grave. Pero NO se esconde: se muestra retenida, con el detalle de
   lo que falta. El vendedor es quien puede conseguir ese papel, así
   que tiene que ver cuánto le cuesta no conseguirlo.

   Tres válvulas para que la regla no sea injusta:
     · Solo aplica a ventas desde REGLA_EXPEDIENTE.desde. Lo anterior
       se regulariza aparte, sin congelar pagos que ya se ganaron.
     · Gerencia puede liberar una comisión, con motivo y registro.
       Sin esto, un cliente que nunca entrega su papel congela al
       vendedor para siempre.
     · Si el módulo de expedientes no está cargado, no retiene nada.
       Un error de carga no puede convertirse en un no-pago.          */

const REGLA_EXPEDIENTE = {
  activa: true,
  desde:  '2026-09-01',
};

const comisionesLiberadas = () =>
  new Set((DB.comisionesLiberadas || []).map(x => x.contrato));

/** Qué le falta al contrato para que su comisión sea liquidable.
    Devuelve null si no hay nada que retener. */
function retencionDe(c) {
  if (!REGLA_EXPEDIENTE.activa) return null;
  if ((c.fecha || '') < REGLA_EXPEDIENTE.desde) return null;
  if (comisionesLiberadas().has(c.no)) return null;
  if (typeof faltantesDe !== 'function') return null;
  const graves = faltantesDe(c).filter(f => f.grave).map(f => f.que);
  return graves.length ? graves : null;
}

/** Libera una comisión retenida. Queda registrado quién y por qué. */
function liberarComision(contratoNo, motivo) {
  if (typeof puede === 'function' && !puede('comision.liberar'))
    throw new Error('No tenés permiso para liberar comisiones');
  const m = (motivo || '').trim();
  if (m.length < 10) throw new Error('Escribí el motivo de la liberación');
  if (comisionesLiberadas().has(contratoNo)) throw new Error('Esa comisión ya está liberada');
  DB.comisionesLiberadas = DB.comisionesLiberadas || [];
  DB.comisionesLiberadas.push({ contrato: contratoNo, motivo: m,
                                quien: usuarioActual(), cuando: ahora() });
  saveDB();
}

function comisionesPendientes() {
  const ya = liquidados();
  const por = {};
  DB.contratos
    /* Dos filtros de «ya se liquidó»: el del portal, por número de
       contrato, y el de la base, que es el que manda cuando hay base —
       una comisión 'liquidada' o 'pagada' ya está en otra liquidación y
       el índice único de 05_liquidacion.sql no dejaría meterla en dos. */
    .filter(c => c.estado === 'aprobado' && !ya.has(c.no)
                 && !['liquidada','pagada','anulada'].includes(c.comisionEstado))
    .forEach(c => {
      const p = buscarPersona(c.vendedor);
      if (!comisionaEn(p, c.fecha)) return;
      const e = (por[p.nombre] = por[p.nombre] ||
        { persona: p, contratos: [], retenidos: [], total: 0, totalRetenido: 0 });
      const com  = calcularComision(c);
      const fila = { no: c.no, lote: c.lote, precio: c.precio,
                     comision: com, fecha: c.fecha || HOY_ISO,
                     comisionId: c.comisionId || null };
      const falta = retencionDe(c);
      if (falta) {
        e.retenidos.push(Object.assign({ falta }, fila));
        e.totalRetenido = Math.round((e.totalRetenido + com) * 100) / 100;
      } else {
        e.contratos.push(fila);
        e.total = Math.round((e.total + com) * 100) / 100;
      }
    });
  return Object.values(por)
    .filter(x => x.contratos.length || x.retenidos.length)
    .sort((a, b) => b.total - a.total);
}

/* ---------- Crear la liquidación ---------- */

async function crearLiquidacion(nombreVendedor, periodo) {
  const pend = comisionesPendientes().find(x => x.persona.nombre === nombreVendedor);
  if (!pend) throw new Error('No hay comisiones para ' + nombreVendedor);
  if (!pend.contratos.length) {
    const r = pend.retenidos.length;
    throw new Error(r
      ? `Las ${r} comisiones de ${nombreVendedor} están retenidas por expediente incompleto`
      : 'No hay comisiones pendientes para ' + nombreVendedor);
  }

  DB.liquidaciones = DB.liquidaciones || [];
  const l = {
    id: uid(),
    numero: 'LQ-' + String((DB.liquidaciones.length + 1)).padStart(4, '0'),
    periodo: periodo || periodoDe(HOY_ISO),
    vendedor: nombreVendedor,
    codigo: pend.persona.codigo,
    contratos: pend.contratos,
    total: pend.total,
    estado: 'borrador',
    factura: null,
    pago: null,
    creada: HOY_ISO,
    historial: [{ que: 'Liquidación creada', quien: usuarioActual(), cuando: ahora(),
                  detalle: `${pend.contratos.length} contrato(s) · ${_Qc(pend.total)}` }]
  };
  /* Con base, la liquidación es una fila de `liquidacion` y las comisiones
     quedan amarradas a ella: una comisión no puede estar en dos. Ese
     candado lo pone el índice único de 05_liquidacion.sql, no el portal. */
  if (typeof hayBase === 'function' && hayBase()) {
    /* El período va del contrato más viejo al más nuevo de los que entran
       en esta liquidación. Antes ponía la fecha de hoy en los dos extremos,
       que cumple el CHECK y no dice nada. */
    const fechas = pend.contratos.map(c => c.fecha).filter(Boolean).sort();
    const ids = pend.contratos.map(c => c.comisionId).filter(Boolean);
    if (!ids.length) {
      avisar('Ninguna de esas comisiones está registrada en la base todavía. '
           + 'Recarga la página; si sigue igual, avisa a administración.');
      return null;
    }
    const r = await sbCrearLiquidacion({
      persona_id: pend.persona.id,
      periodo: periodo || periodoDe(HOY_ISO),
      desde: fechas[0] || HOY_ISO, hasta: fechas[fechas.length - 1] || HOY_ISO,
      total: pend.total,
      comisiones: ids
    });
    if (!r.ok) { avisar(r.error); return null; }
    // Que la pantalla no siga ofreciendo lo que ya quedó amarrado.
    pend.contratos.forEach(c => {
      const ct = indices().contratosPorNo.get(String(c.no));
      if (ct) ct.comisionEstado = 'liquidada';
    });
    l.id = r.dato.id;
    l.numero = r.dato.numero;
  }

  DB.liquidaciones.push(l);
  saveDB();
  return l;
}

const usuarioActual = () => (window.__user ? window.__user.name : 'Sistema');
const ahora = () => new Date().toISOString().slice(0, 16).replace('T', ' ');
const _Qc = n => 'Q ' + (Math.round(n * 100) / 100).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- La factura ----------
   Mientras esto viva en el navegador, los archivos chicos se
   guardan completos y de los grandes solo queda la ficha. Al
   pasar a Supabase, el archivo va a Storage y aquí queda la
   referencia — por eso `url` ya existe en el registro.        */

const LIMITE_ARCHIVO = 400 * 1024;   // 400 KB: más que eso no cabe en el navegador

/* ---------- El pago ---------- */

function marcarPagada(liqId, { fecha, forma, referencia, cuenta, nota }) {
  const l = (DB.liquidaciones || []).find(x => mismoId(x.id, liqId));
  if (!l) throw new Error('No existe esa liquidación');
  if (l.estado === 'pagada') throw new Error('Ya estaba pagada');
  if (!l.factura) throw new Error('No se puede pagar sin la factura del vendedor');
  if (!referencia) throw new Error('Anota la referencia del pago');
  if (l.historial[0] && l.factura.subidaPor === usuarioActual() && l.vendedor === usuarioActual())
    throw new Error('Nadie autoriza el pago de su propia comisión');

  l.pago = { fecha: fecha || HOY_ISO, forma: forma || 'Transferencia',
             referencia, cuenta: cuenta || '', nota: nota || '',
             pagadaPor: usuarioActual(), registrada: ahora() };
  l.estado = 'pagada';
  l.historial.push({ que: 'Pagada', quien: usuarioActual(), cuando: ahora(),
                     detalle: `${forma || 'Transferencia'} · ref ${referencia}` });
  saveDB();
  return l;
}

function anularLiquidacion(liqId, motivo) {
  const l = (DB.liquidaciones || []).find(x => mismoId(x.id, liqId));
  if (!l) throw new Error('No existe esa liquidación');
  if (l.estado === 'pagada') throw new Error('Una liquidación pagada no se anula — se hace una nota de crédito');
  l.estado = 'anulada';
  l.motivoAnulacion = motivo || '';
  l.historial.push({ que: 'Anulada', quien: usuarioActual(), cuando: ahora(), detalle: motivo || '' });
  saveDB();
  return l;
}

/* ---------- Consultas ---------- */

const liquidacionesDe = nombre => (DB.liquidaciones || []).filter(l => l.vendedor === nombre);

function resumenComisiones() {
  const liq = DB.liquidaciones || [];
  const pend = comisionesPendientes();
  return {
    porLiquidar:  pend.reduce((t, x) => t + x.total, 0),
    retenido:     pend.reduce((t, x) => t + (x.totalRetenido || 0), 0),
    contratosRetenidos: pend.reduce((t, x) => t + (x.retenidos || []).length, 0),
    vendedoresPend: pend.filter(x => x.contratos.length).length,
    porFacturar:  liq.filter(l => l.estado === 'borrador').reduce((t, l) => t + l.total, 0),
    porPagar:     liq.filter(l => l.estado === 'facturada').reduce((t, l) => t + l.total, 0),
    pagado:       liq.filter(l => l.estado === 'pagada').reduce((t, l) => t + l.total, 0),
    cuentaPorPagar: liq.filter(l => l.estado === 'facturada').length,
    pendientes: pend, liquidaciones: liq
  };
}

/** Historial completo de un vendedor: lo pagado y lo que falta. */
function estadoVendedor(nombre) {
  const ls = liquidacionesDe(nombre);
  const pend = comisionesPendientes().find(x => x.persona.nombre === nombre);
  return {
    nombre,
    pagado:    ls.filter(l => l.estado === 'pagada').reduce((t, l) => t + l.total, 0),
    enProceso: ls.filter(l => l.estado === 'borrador' || l.estado === 'facturada').reduce((t, l) => t + l.total, 0),
    porLiquidar: pend ? pend.total : 0,
    contratosPend: pend ? pend.contratos.length : 0,
    liquidaciones: ls.sort((a, b) => (b.creada || '').localeCompare(a.creada || ''))
  };
}


/* ============================================================
   EXPEDIENTE DEL COMPRADOR — lo que no puede faltar

   Toda la cobranza automática se cae si no hay a quién llamar.
   Hoy 90 contratos en mora no tienen teléfono registrado. La
   forma de que eso no vuelva a pasar no es perseguir el dato
   después: es no dejar cerrar la venta sin él.

   Por eso estos campos son obligatorios en el formulario, no
   una sugerencia.
   ============================================================ */

const CAMPOS_VENTA = [
  { id:'nom',      label:'Nombres',                     grupo:'comprador', req:true },
  { id:'ape',      label:'Apellidos',                   grupo:'comprador', req:true },
  { id:'dpi',      label:'DPI (CUI)',                   grupo:'comprador', req:true, tipo:'dpi' },
  { id:'tel',      label:'Teléfono celular',            grupo:'comprador', req:true, tipo:'tel' },
  { id:'mail',     label:'Correo electrónico',          grupo:'comprador', req:true, tipo:'mail' },
  /* Dirección en cuatro partes (4 sept 2026): sin número de casa, calle,
     municipio y departamento no se acepta, ni la del comprador ni la del
     fiador. Se guarda como un solo texto separado por comas. */
  { id:'dir_casa',  label:'Número de casa o lote',            grupo:'comprador', req:true },
  { id:'dir_calle', label:'Calle, avenida, zona o aldea',     grupo:'comprador', req:true },
  { id:'dir_muni',  label:'Municipio',                        grupo:'comprador', req:true },
  { id:'dir_depto', label:'Departamento',                     grupo:'comprador', req:true, tipo:'depto' },
  { id:'ocup',     label:'Ocupación u oficio',          grupo:'ingresos',  req:true },
  { id:'ingreso',  label:'Ingreso promedio al mes (Q)', grupo:'ingresos',  req:true, tipo:'monto' },
  /* Opcional (4 sept 2026): la constancia de ingresos no es parte del expediente estándar. */
  { id:'fuente',   label:'¿Cómo comprueba su ingreso?', grupo:'ingresos',  req:false, tipo:'lista' },
  { id:'pnom',     label:'Nombre del pariente',         grupo:'pariente',  req:true },
  { id:'ptel',     label:'Teléfono celular del pariente',grupo:'pariente', req:true, tipo:'tel' },
  { id:'pmail',    label:'Correo del pariente',         grupo:'pariente',  req:true, tipo:'mail' },
  { id:'pdir_casa',  label:'Número de casa o lote del pariente', grupo:'pariente', req:true },
  { id:'pdir_calle', label:'Calle, avenida, zona o aldea del pariente', grupo:'pariente', req:true },
  { id:'pdir_muni',  label:'Municipio del pariente',           grupo:'pariente',  req:true },
  { id:'pdir_depto', label:'Departamento del pariente',        grupo:'pariente',  req:true, tipo:'depto' },
];

/* ---------- Dirección ---------- */
const DEPARTAMENTOS = ['Alta Verapaz','Baja Verapaz','Chimaltenango','Chiquimula','El Progreso','Escuintla','Guatemala',
  'Huehuetenango','Izabal','Jalapa','Jutiapa','Petén','Quetzaltenango','Quiché','Retalhuleu','Sacatepéquez','San Marcos',
  'Santa Rosa','Sololá','Suchitepéquez','Totonicapán','Zacapa'];
const PARTES_DIRECCION = [
  { suf:'casa',  label:'Número de casa o lote',        ph:'Casa 12 · Lote 5, manzana B' },
  { suf:'calle', label:'Calle, avenida, zona o aldea', ph:'3a calle 4-20, zona 2 · Aldea El Rosario' },
  { suf:'muni',  label:'Municipio',                    ph:'San Miguel Pochuta' },
  { suf:'depto', label:'Departamento',                 tipo:'depto' },
];
const validaDepto = v => DEPARTAMENTOS.includes(String(v || '').trim())
  ? { ok:true, valor:String(v).trim() } : { ok:false, msg:'Elegí el departamento de la lista' };
/** Las cuatro partes en un texto: «Casa 12, 3a calle zona 2, San Miguel Pochuta, Chimaltenango». */
function direccionCompleta(datos, pref) {
  return PARTES_DIRECCION.map(p => String(datos[`${pref}_${p.suf}`] || '').trim().replace(/,/g, ' ').replace(/\s+/g, ' ')).join(', ');
}
/** Lo contrario: de un texto guardado a sus partes. Una dirección vieja
 *  (texto libre) cae entera en «calle» para que la completen. */
function partesDireccion(texto) {
  const t = String(texto || '').trim();
  const partes = t ? t.split(',').map(x => x.trim()) : [];
  if (partes.length === 4 && DEPARTAMENTOS.includes(partes[3])) return { casa:partes[0], calle:partes[1], muni:partes[2], depto:partes[3] };
  return { casa:'', calle:t, muni:'', depto:'' };
}
/** ¿Trae casa, calle, municipio y departamento? Devuelve qué falta. */
function validaDireccion(datos, pref) {
  const faltan = PARTES_DIRECCION.filter(p => !String(datos[`${pref}_${p.suf}`] || '').trim()).map(p => p.label.toLowerCase());
  const d = datos[`${pref}_depto`];
  if (d && !validaDepto(d).ok) faltan.push('departamento de la lista');
  return { ok: faltan.length === 0, faltan };
}

/* ---------- Validaciones ---------- */

/** Celular de Guatemala: 8 dígitos que empiezan en 3,4,5 (fijo: 2,6,7). */
function validaTel(v, exigeCelular = true) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('502')) d = d.slice(3);
  if (d.length !== 8) return { ok:false, msg:'Debe tener 8 dígitos' };
  if (exigeCelular && !/^[345]/.test(d)) return { ok:false, msg:'No parece celular (los celulares empiezan en 3, 4 o 5)' };
  return { ok:true, valor:d };
}

/** DPI (CUI): 13 dígitos. Se verifica el dígito verificador y el código de municipio. */
/* Municipios por departamento. El CUI termina en depto+municipio, así
   que un 0002 en el lugar del departamento delata un dedazo aunque el
   dígito verificador cuadre. Sin esta tabla el validador dejaba pasar
   códigos que no existen. */
const MUNICIPIOS_POR_DEPTO = [17,8,16,16,13,14,19,8,24,21,9,30,33,21,8,17,14,5,11,11,7,17];

function validaDPI(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 13) return { ok:false, msg:'El DPI tiene 13 dígitos' };
  const num = d.slice(0, 8), ver = Number(d[8]);
  const depto = Number(d.slice(9, 11)), muni = Number(d.slice(11, 13));
  if (depto < 1 || depto > 22) return { ok:false, msg:'El código de departamento no existe' };
  if (muni < 1 || muni > MUNICIPIOS_POR_DEPTO[depto - 1])
    return { ok:false, msg:'Ese municipio no existe en ese departamento' };
  let suma = 0;
  for (let i = 0; i < 8; i++) suma += Number(num[i]) * (i + 2);
  if (suma % 11 % 10 !== ver) return { ok:false, msg:'El número de DPI no es válido — revísalo' };
  return { ok:true, valor:d };
}

const validaMail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v||'').trim())
  ? { ok:true, valor:String(v).trim().toLowerCase() }
  : { ok:false, msg:'El correo no tiene forma válida' };

/**
 * Revisa el formulario completo. Devuelve TODOS los errores de una vez:
 * al vendedor que está en el campo no se le corrige de uno en uno.
 */
function validarVenta(datos) {
  const errores = [];
  for (const c of CAMPOS_VENTA) {
    const v = String(datos[c.id] || '').trim();
    if (c.req && !v) { errores.push({ campo:c.id, msg:`Falta ${c.label.toLowerCase()}` }); continue; }
    if (!v) continue;
    let r = { ok:true };
    if (c.tipo === 'tel')   r = validaTel(v);
    if (c.tipo === 'dpi')   r = validaDPI(v);
    if (c.tipo === 'mail')  r = validaMail(v);
    if (c.tipo === 'depto') r = validaDepto(v);
    if (c.tipo === 'monto' && !(Number(String(v).replace(/[^\d.]/g,'')) > 0))
      r = { ok:false, msg:'Anota un monto mayor que cero' };
    if (!r.ok) errores.push({ campo:c.id, msg:`${c.label}: ${r.msg}` });
  }

  // El pariente no puede ser el mismo teléfono del comprador: entonces no sirve de contacto alterno
  const t1 = validaTel(datos.tel), t2 = validaTel(datos.ptel);
  if (t1.ok && t2.ok && t1.valor === t2.valor)
    errores.push({ campo:'ptel', msg:'El teléfono del pariente es el mismo del comprador — se necesita otro contacto' });
  if (datos.mail && datos.pmail && String(datos.mail).trim().toLowerCase() === String(datos.pmail).trim().toLowerCase())
    errores.push({ campo:'pmail', msg:'El correo del pariente es el mismo del comprador' });

  return { ok: errores.length === 0, errores };
}

/**
 * Relación entre la cuota y lo que la persona dice ganar.
 * No bloquea la venta — la señala, para que el comité decida.
 */
function cargaSobreIngreso(cuota, ingresoMensual) {
  const ing = Number(ingresoMensual || 0);
  if (!(ing > 0)) return null;
  const pct = cuota / ing;
  return {
    pct,
    nivel: pct <= 0.30 ? 'holgado' : pct <= 0.40 ? 'ajustado' : 'riesgoso',
    aviso: pct > 0.40
      ? `La cuota es el ${Math.round(pct*100)}% del ingreso declarado. Por encima del 40% la mora sube mucho — conviene bajar el monto o alargar el plazo.`
      : pct > 0.30
      ? `La cuota es el ${Math.round(pct*100)}% del ingreso declarado. Está al límite de lo cómodo.`
      : null
  };
}
