/* ============================================================
   PERMISOS · quién puede hacer qué

   Hasta ahora los permisos estaban repartidos: una lista de
   vistas por rol en app.js, unas políticas RLS en Postgres, y
   varios `if (ROLE === 'admin')` sueltos. Tres lugares donde
   cambiar lo mismo es tres lugares donde se olvida uno.

   Aquí está la matriz completa, en un solo sitio. La pantalla de
   seguridad la muestra tal cual — lo que se ve es lo que rige.

   ── Lo que este archivo NO hace ──
   Esto es la capa de la interfaz: esconde botones y bloquea
   pantallas. NO es seguridad. Cualquiera con la consola abierta
   puede saltárselo.

   La seguridad de verdad son las políticas RLS de Postgres, que
   viven en la base y no en el navegador. Esta matriz y aquellas
   políticas tienen que decir lo mismo — por eso `contrastarRLS()`
   compara ambas y avisa cuando se separan.
   ============================================================ */

/* ---------- Las acciones que existen ----------
   Se agrupan por área para que la pantalla se pueda leer. */
const ACCIONES = {
  Ventas: {
    'venta.crear':       'Ingresar una venta nueva',
    'venta.ver_todas':   'Ver las ventas de todos, no solo las propias',
    'venta.aprobar':     'Aprobar o rechazar una solicitud',
    'venta.desistir':    'Registrar el desistimiento de un contrato',
    'cotizar':           'Usar el cotizador y emitir cotizaciones',
  },
  Cartera: {
    'cobranza.ver':      'Ver la cartera y la mora',
    'cobranza.gestionar':'Registrar gestiones y recordatorios',
    'recaudo.marcar':    'Marcar una cuota como cobrada o no cobrada',
    'estado.editar':     'Corregir un estado de cuenta',
  },
  Dinero: {
    'banco.importar':    'Subir el estado de cuenta del banco',
    'banco.conciliar':   'Asignar un depósito a un contrato',
    'pago.confirmar':    'Confirmar un pago · lo aplica a la cartera',
    'pago.anular':       'Anular un pago ya confirmado',
    'contable.exportar': 'Exportar las partidas contables',
  },
  Comisiones: {
    'comision.ver_propia':  'Ver sus propias comisiones',
    'comision.ver_todas':   'Ver las comisiones de todo el equipo',
    'comision.liquidar':    'Crear la liquidación de la quincena',
    'comision.facturar':    'Subir la factura de una comisión',
    'comision.pagar':       'Autorizar el pago de una comisión',
    'comision.liberar':     'Liberar una comisión retenida por expediente incompleto',
  },
  Documentos: {
    'doc.ver_propios':   'Ver documentos de sus propios contratos',
    'doc.ver_todos':     'Ver contratos y boletas de cualquier cliente',
    'doc.ver_expedientes':'Ver expedientes · DPI, ingresos, referencias',
    'doc.subir':         'Subir documentos al expediente',
    'doc.borrar':        'Borrar un documento',
  },
  Administración: {
    'equipo.ver':        'Ver el equipo',
    'equipo.editar':     'Dar de alta, editar o desactivar personas',
    'permisos.editar':   'Cambiar quién puede hacer qué',
    'reglas.editar':     'Cambiar tasas, comisión y reglas del negocio',
    'bitacora.ver':      'Ver la bitácora de todo lo que se hizo',
    'proyecto.crear':    'Dar de alta un proyecto nuevo',
  },
};

const TODAS = Object.values(ACCIONES).flatMap(g => Object.keys(g));

/* ---------- La matriz ----------
   Pensada con dos reglas:
     · Nadie confirma su propio trabajo. Quien concilia no
       confirma, quien vende no aprueba, quien factura no paga.
     · Cada quien ve lo suyo. El vendedor no ve la cartera de
       los demás ni sus comisiones.                            */
const MATRIZ = {
  admin: {
    etiqueta: 'Administrador', color: '#B0562F',
    nota: 'Acceso completo. Debería haber pocos.',
    acciones: TODAS.slice(),
  },
  gerencia: {
    etiqueta: 'Gerencia', color: '#5C6B47',
    nota: 'Ve todo y aprueba, pero no toca la configuración ni los permisos.',
    acciones: ['venta.ver_todas','venta.aprobar','venta.desistir','cotizar',
               'cobranza.ver','cobranza.gestionar',
               'contable.exportar',
               'comision.ver_todas','comision.liquidar','comision.liberar',
               'doc.ver_todos','doc.ver_expedientes','doc.subir',
               'equipo.ver','bitacora.ver'],
  },
  vendedor: {
    etiqueta: 'Vendedor', color: '#7A8B5A',
    nota: 'Solo lo suyo: cotiza, ingresa ventas y ve sus propias comisiones.',
    acciones: ['venta.crear','cotizar',
               'comision.ver_propia','comision.facturar',
               'doc.ver_propios','doc.subir'],
  },
  cobranza: {
    etiqueta: 'Cobranza', color: '#8A7F76',
    nota: 'Gestiona la cartera y concilia, pero no confirma pagos.',
    acciones: ['cobranza.ver','cobranza.gestionar','recaudo.marcar',
               'banco.importar','banco.conciliar',
               'doc.ver_todos','doc.subir',
               'venta.ver_todas'],
    // No lleva doc.ver_expedientes: no necesita el DPI ni los ingresos
    // de nadie para cobrar, y son los datos más sensibles del sistema.
  },
  financiero: {
    etiqueta: 'Financiero', color: '#3A2318',
    nota: 'Confirma el dinero y autoriza comisiones. No las concilia ni las factura.',
    acciones: ['cobranza.ver','pago.confirmar','pago.anular','contable.exportar',
               'comision.ver_todas','comision.pagar',
               'doc.ver_todos','doc.ver_expedientes','venta.ver_todas','bitacora.ver'],
  },
  confirmacion: {
    etiqueta: 'Confirmación de pagos', color: '#9A8C7E',
    nota: 'Confirma que el pago entró de verdad. Por eso no concilia: quien asigna un depósito no lo confirma.',
    acciones: ['cobranza.ver','pago.confirmar',
               'doc.ver_todos','doc.ver_expedientes','doc.subir'],
  },
};

/* ---------- Consultas ---------- */

const accionesDe = rol => (MATRIZ[rol] || {}).acciones || [];

/** ¿Puede esta persona hacer esto? */
function puede(accion, rol) {
  const r = rol || (typeof ROLE !== 'undefined' ? ROLE : null);
  if (!r) return false;
  return accionesDe(r).includes(accion);
}

/** El detalle de una acción, para poder explicarla. */
function detalleAccion(a) {
  for (const [grupo, acc] of Object.entries(ACCIONES))
    if (acc[a]) return { grupo, accion: a, texto: acc[a] };
  return null;
}

/**
 * Las separaciones de funciones que no se pueden romper.
 * Si alguien le da las dos a un mismo rol, la pantalla lo marca.
 */
const INCOMPATIBLES = [
  { a: 'banco.conciliar', b: 'pago.confirmar',
    porque: 'Quien asigna un depósito a un contrato no debe ser quien lo confirma.' },
  { a: 'comision.facturar', b: 'comision.pagar',
    porque: 'Quien sube su factura no debe autorizar su propio pago.' },
  { a: 'venta.crear', b: 'venta.aprobar',
    porque: 'Quien ingresa una venta no debe aprobarla.' },
  { a: 'recaudo.marcar', b: 'pago.confirmar',
    porque: 'Quien marca una cuota como cobrada no debe confirmarla.' },
];

/** Revisa la matriz completa y devuelve los conflictos. */
function conflictos(matriz = MATRIZ) {
  const out = [];
  for (const [rol, cfg] of Object.entries(matriz)) {
    if (rol === 'admin') continue;         // el administrador puede todo, a propósito
    for (const i of INCOMPATIBLES)
      if (cfg.acciones.includes(i.a) && cfg.acciones.includes(i.b))
        out.push({ rol, etiqueta: cfg.etiqueta, ...i });
  }
  return out;
}

/**
 * ¿Coincide esta matriz con lo que dicen las políticas RLS?
 * Se compara contra lo declarado en db/04_storage.sql y auth_rls.sql.
 * Cuando se separan, manda la base — pero hay que enterarse.
 */
const RLS_DECLARADO = {
  // De db/04_storage.sql · política exp_leer del bucket «expedientes»
  'doc.ver_expedientes': ['admin','gerencia','financiero','confirmacion'],
  'doc.ver_todos':  ['admin','cobranza','confirmacion','financiero','gerencia'],
  'doc.subir':      ['admin','gerencia','vendedor','cobranza','confirmacion'],
  'doc.borrar':     ['admin'],
  'pago.confirmar': ['admin','financiero','confirmacion'],
};

function contrastarRLS() {
  const dif = [];
  for (const [accion, rolesSQL] of Object.entries(RLS_DECLARADO)) {
    const rolesUI = Object.keys(MATRIZ).filter(r => accionesDe(r).includes(accion)).sort();
    const sql = rolesSQL.slice().sort();
    if (rolesUI.join(',') !== sql.join(','))
      dif.push({ accion, enPantalla: rolesUI, enLaBase: sql });
  }
  return dif;
}

/* ---------- Vistas que puede abrir cada rol ----------
   Se deriva de las acciones para que no haya dos listas que
   mantener. Antes esto estaba escrito a mano en app.js. */
const VISTA_REQUIERE = {
  inicio: null,
  cotizador: 'cotizar',
  vender: 'venta.crear',
  inventario: null,
  contratos: 'venta.ver_todas',
  clientes: null,
  expedientes: 'doc.ver_todos',
  leads: 'venta.ver_todas',
  online: 'venta.ver_todas',
  aprobacion: 'venta.aprobar',
  cobranza: 'cobranza.ver',
  agenda: 'cobranza.gestionar',
  recaudacion: 'recaudo.marcar',
  conciliacion: 'banco.conciliar',
  confirmacion: 'pago.confirmar',
  comisiones: 'comision.ver_propia',
  reporteria: 'venta.ver_todas',
  equipo: 'equipo.ver',
  seguridad: 'permisos.editar',
  automatizaciones: 'reglas.editar',
};

const vistasDe = rol => Object.entries(VISTA_REQUIERE)
  .filter(([, req]) => !req || accionesDe(rol).includes(req))
  .map(([v]) => v);
