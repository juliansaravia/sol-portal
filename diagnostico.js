/* ============================================================
   QUÉ FUNCIONA Y QUÉ NO, Y POR QUÉ

   El portal se despliega solo, con cada push. La base no: cada
   archivo SQL alguien lo pega a mano. Así que el código puede
   estar semanas por delante de la base, y desde la pantalla eso
   se ve como «faltan funcionalidades» — sin decir cuáles ni por
   qué.

   Esto lo pregunta. Cada funcionalidad depende de algo concreto
   —una tabla, una función, un interruptor— y se comprueba pidiéndolo.
   Si no está, dice qué archivo lo trae.

   No adivina: pregunta.
   ============================================================ */
'use strict';

/* Qué necesita cada cosa para funcionar. */
const REQUISITOS = [
  { que: 'Entrar y ver los datos', archivo: '—', esencial: true,
    prueba: async () => !!(await SB.from('contrato').select('id').limit(1)).data },

  { que: 'Registrar pagos y ventas', archivo: '—', esencial: true,
    prueba: async () => {
      const { data } = await SB.from('ajuste').select('valor').eq('clave','modo_consulta').maybeSingle();
      return !data || data.valor !== 'true';
    },
    siNo: 'El modo consulta está encendido: el equipo entra a mirar, no a registrar. '
        + "Se apaga con: update ajuste set valor='false' where clave='modo_consulta';" },

  { que: 'Contabilidad', archivo: '12_contabilidad.sql',
    prueba: async () => !(await SB.from('partida').select('id').limit(1)).error },

  { que: 'Contabilidad encendida', archivo: '15_catalogo_base.sql',
    prueba: async () => {
      const { data, error } = await SB.from('ajuste').select('valor')
        .eq('clave','contabilidad_automatica').maybeSingle();
      return !error && data && data.valor === 'true';
    },
    siNo: 'El catálogo está creado pero la contabilidad no se ha encendido. '
        + 'Mirá: select * from v_catalogo_pendiente;' },

  { que: 'Cuadre bancario', archivo: '13_conciliacion.sql',
    prueba: async () => !(await SB.from('movimiento_banco').select('id').limit(1)).error },

  { que: 'Subir DPI y contratos', archivo: '14_documentos.sql',
    prueba: async () => !(await SB.from('documento_requerido').select('codigo').limit(1)).error },

  { que: 'Respaldo en todo lo demás', archivo: '20_adjuntos.sql',
    prueba: async () => !(await SB.from('adjunto').select('id').limit(1)).error },

  { que: 'Login rápido', archivo: '16_login.sql',
    prueba: async () => !(await SB.rpc('mi_sesion').maybeSingle()).error },

  { que: 'Segundo factor exigido', archivo: '17_dos_factores.sql',
    prueba: async () => {
      const { data, error } = await SB.from('ajuste').select('valor').eq('clave','exige_2fa').maybeSingle();
      return !error && !!data;
    },
    siNo: 'Se puede activar el segundo factor, pero la base todavía no lo exige a nadie.' },

  { que: 'Comisiones ya pagadas', archivo: '19_comision_historica.sql',
    prueba: async () => !(await SB.from('v_comisiones_por_vendedor').select('persona_id').limit(1)).error },

  { que: 'Accesos de solo lectura', archivo: '21_rol_consulta.sql',
    prueba: async () => !(await SB.rpc('solo_mira')).error },

  { que: 'Accesos externos con vencimiento', archivo: '23_externos.sql',
    prueba: async () => !(await SB.from('v_accesos_externos').select('id').limit(1)).error },
];

/**
 * Pregunta por cada cosa y devuelve qué funciona y qué no.
 * Las pruebas van en paralelo: son independientes.
 */
async function diagnosticar() {
  if (!window.SB) return [];
  return Promise.all(REQUISITOS.map(async r => {
    let ok = false, error = null;
    try { ok = !!(await r.prueba()); }
    catch (e) { error = e.message; }
    return { ...r, ok, error };
  }));
}

window.diagnosticar = diagnosticar;
window.REQUISITOS = REQUISITOS;
