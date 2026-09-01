/* ============================================================
   SESIÓN · quién entró y qué puede ver

   Reemplaza el login de mentira que traía el portal: usuarios y
   contraseñas escritos en app.js, a la vista de cualquiera que
   abriera el inspector.

   Ahora la contraseña la valida Supabase, y quién es cada quien
   sale de la tabla `persona` — la misma que usan las políticas
   RLS de la base. Un solo lugar donde decir que Norman es de
   cobranza, en vez de dos que se contradicen.

   La sesión la guarda la librería de Supabase y sobrevive a
   recargar la página. El token caduca solo.
   ============================================================ */
'use strict';

const SB = (() => {
  const cfg = window.SUPABASE_CONFIG || {};
  if (!window.supabase || !cfg.url || !cfg.anon || /PEGAR-AQUI/.test(cfg.anon)) {
    console.warn('[sesión] Supabase no está configurado · ver config-supabase.js');
    return null;
  }

  /* El panel de Supabase muestra la llave publicable y la secreta una al
     lado de la otra, y se copia la que no es. Si la secreta llega al
     navegador, cualquiera que abra el portal puede leer y borrar toda la
     base: esa llave se salta las políticas de seguridad.

     Mejor que el portal no arranque a que arranque abierto de par en par. */
  if (/^sb_secret_/.test(cfg.anon) || /service_role/.test(cfg.anon)) {
    const aviso = 'La llave de config-supabase.js es la SECRETA, no la publicable. ' +
                  'Esa llave da acceso total a la base y no puede estar en el navegador. ' +
                  'Cámbiala por la que empieza con sb_publishable_ y rota la secreta en Supabase.';
    console.error('[SEGURIDAD]', aviso);
    document.addEventListener('DOMContentLoaded', () => {
      document.body.innerHTML =
        '<div style="max-width:640px;margin:80px auto;font:15px/1.6 Arial;color:#7f1d1d;' +
        'background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:28px">' +
        '<b style="font-size:17px">El portal no arrancó a propósito</b><p>' + aviso + '</p></div>';
    });
    return null;
  }

  if (/^postgresql:/.test(cfg.url)) {
    console.error('[SEGURIDAD] En url va el Project URL (https://…supabase.co), ' +
                  'no la cadena de conexión de Postgres: esa trae la contraseña de la base.');
    return null;
  }
  /* SIN Web Locks.

     supabase-js coordina sus llamadas de auth con la API de Web Locks
     del navegador. Cuando un candado queda huérfano —pasa después de
     un login fallido, o al volver a una pestaña dormida— TODOS los
     métodos de auth se quedan esperando ese candado para siempre:
     signInWithPassword() y getUser() no devuelven nada, ni resultado
     ni error. El botón se queda en "Entrando..." y la consola limpia.
     Es un bug conocido de la librería (supabase-js #2013 y #2111).

     Este portal se usa en una sola pestaña por persona, así que el
     candado no coordina nada que valga la pena. Se reemplaza por uno
     que ejecuta y ya. */
  const sinCandado = async (_nombre, _espera, fn) => await fn();

  return window.supabase.createClient(cfg.url, cfg.anon, {
    auth: { persistSession: true, autoRefreshToken: true, lock: sinCandado }
  });
})();

/* Nada de esperar para siempre.

   Aunque el candado ya no cuelgue, una petición puede quedarse sin
   respuesta por mil razones —red caída, proyecto pausado, un bug que
   todavía no conocemos—. Un portal que se queda en "Entrando..." sin
   decir nada es peor que uno que falla: el usuario no sabe si esperar,
   reintentar o llamar a alguien. */
function conLimite(promesa, segundos, queHacia) {
  return Promise.race([
    promesa,
    new Promise((_, rechazar) =>
      setTimeout(() => rechazar(new Error(
        `${queHacia}: el servidor no respondió en ${segundos} segundos.`)),
        segundos * 1000))
  ]);
}

/* Quién está usando el portal ahora mismo. */
const SESION = { persona: null, rol: null, email: null, modoConsulta: true };

/** ¿Está configurado el acceso remoto? Si no, el portal corre con datos locales. */
const hayRemoto = () => SB !== null;

/**
 * Entra con correo y contraseña.
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function iniciarSesion(email, contrasena) {
  if (!SB) return { ok: false, error: 'El portal no está conectado a la base' };

  let error, datos;
  try {
    ({ data: datos, error } = await conLimite(SB.auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password: contrasena || ''
    }), 20, 'Al iniciar sesión'));
  } catch (e) {
    return { ok: false, error: e.message };
  }
  // Supabase no dice si falló el correo o la contraseña, y está bien:
  // decirlo permitiría averiguar qué correos existen.
  if (error) return { ok: false, error: 'Correo o contraseña incorrectos' };

  /* `signInWithPassword` ya devolvió el usuario. Volver a pedirlo con
     getUser() era un viaje entero al servidor para saber algo que ya
     estaba en la mano. */
  const r = await cargarSesion(datos && datos.user);
  if (!r.ok) await SB.auth.signOut();
  return r;
}

/**
 * Lee de la base quién es el usuario que ya inició sesión.
 * Se llama al entrar y al recargar la página.
 */
async function cargarSesion(usuarioYaConocido) {
  if (!SB) return { ok: false, error: 'sin conexión' };

  /* Al entrar, el usuario viene del propio signIn. Al recargar la página
     no hay de dónde sacarlo y sí hay que preguntarlo. */
  let user = usuarioYaConocido || null;
  if (!user) {
    try {
      ({ data: { user } } = await conLimite(SB.auth.getUser(), 20, 'Al leer la sesión'));
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  if (!user) return { ok: false, error: 'sin sesión' };

  /* Un solo viaje: quién soy y si puedo escribir.
     Si `mi_sesion()` todavía no existe —falta correr 16_login.sql— se
     cae al camino largo. Un despliegue del portal no puede dejar a
     nadie afuera por una migración sin pegar. */
  const rapida = await SB.rpc('mi_sesion').maybeSingle();
  if (!rapida.error && rapida.data) {
    const p = rapida.data;
    if (!p.activo) return { ok: false, error: 'Tu usuario está desactivado' };
    SESION.persona = { id: p.persona_id, nombre: p.nombre, rol: p.rol,
                       email: p.email, activo: p.activo };
    SESION.rol = p.rol;
    SESION.email = user.email;
    SESION.modoConsulta = p.modo_consulta !== false;
    return { ok: true, persona: SESION.persona };
  }
  if (!rapida.error && !rapida.data) return {
    ok: false,
    error: 'Tu usuario existe pero no está enlazado a una persona del equipo. ' +
           'Que administración corra el UPDATE de persona.auth_uid.'
  };
  console.warn('[sesión] mi_sesion() no está · falta correr 16_login.sql');

  /* Quién soy lo decide la BASE, no el portal.

     Acá había un error grave: se pedía `persona` con `.limit(1)` y el
     comentario decía "la RLS solo devuelve la propia". Eso es cierto
     para un vendedor, pero NO para admin, gerencia y financiero: su
     política les deja leer a todo el equipo. Entonces `.limit(1)`
     devolvía una fila cualquiera — la primera que saliera— y el portal
     te daba la identidad, el rol y el estado de OTRA persona.

     Por eso a Julián le decía "tu usuario está desactivado": estaba
     mirando la fila de un vendedor dado de baja.

     Ahora se le pregunta a la base con mi_persona(), que es la misma
     función que usan todas las políticas RLS. Un solo criterio de
     identidad para el portal y para los permisos, imposible que se
     contradigan. Y si mi_persona() devuelve un id, la persona ya está
     activa: la función lo exige. */
  const { data: idPersona, error: eId } = await SB.rpc('mi_persona');
  if (eId) return { ok: false, error: eId.message };
  if (!idPersona) return {
    ok: false,
    error: 'Tu usuario existe pero no está enlazado a una persona del equipo. ' +
           'Que administración corra el UPDATE de persona.auth_uid.'
  };

  /* La fila y el modo consulta se piden a la vez: son independientes.
     En serie eran dos viajes al servidor, uno detrás del otro. */
  const [rPersona, rAjuste] = await Promise.all([
    SB.from('persona').select('id, nombre, rol, email, activo')
      .eq('id', idPersona).maybeSingle(),
    SB.from('ajuste').select('valor').eq('clave', 'modo_consulta').maybeSingle()
  ]);
  const { data: p, error } = rPersona;

  if (error) return { ok: false, error: error.message };
  if (!p) return {
    ok: false,
    error: 'Tu usuario existe pero no está enlazado a una persona del equipo. ' +
           'Que administración corra el UPDATE de persona.auth_uid.'
  };
  if (!p.activo) return { ok: false, error: 'Tu usuario está desactivado' };

  SESION.persona = p;
  SESION.rol = p.rol;
  SESION.email = user.email;

  // El modo consulta es de la base, no del navegador: mientras esté
  // encendido nadie escribe aunque le den la vuelta a la pantalla.
  SESION.modoConsulta = !rAjuste.data || rAjuste.data.valor === 'true';

  return { ok: true, persona: p };
}

/**
 * Manda el correo para poner una contraseña nueva.
 *
 * Sirve para dos cosas: el que la olvidó, y el que nunca la recibió
 * porque la invitación se le perdió. No necesita llave de administrador
 * —funciona con la pública— así que cualquiera puede pedirlo desde la
 * pantalla de entrada.
 *
 * No dice si el correo existe o no. Decirlo permitiría averiguar quién
 * trabaja aquí probando direcciones.
 */
async function pedirContrasenaNueva(email) {
  if (!SB) return { ok: false, error: 'El portal no está conectado a la base' };
  const correo = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo))
    return { ok: false, error: 'Escribí un correo válido' };

  try {
    await conLimite(SB.auth.resetPasswordForEmail(correo, {
      redirectTo: location.origin + location.pathname
    }), 20, 'Al pedir la contraseña');
  } catch (e) {
    return { ok: false, error: e.message };
  }
  return { ok: true };
}

async function cerrarSesion() {
  if (SB) await SB.auth.signOut();
  SESION.persona = SESION.rol = SESION.email = null;
  location.reload();
}

/* El portal usa 'cobrador' donde la base dice 'cobranza'. Se traduce
   aquí y no en veinte lugares del app. */
const ROL_PORTAL = { cobranza: 'cobrador' };
const rolDePortal = r => ROL_PORTAL[r] || r;

window.SB = SB;
window.SESION = SESION;
window.iniciarSesion = iniciarSesion;
window.cargarSesion = cargarSesion;
window.cerrarSesion = cerrarSesion;
window.pedirContrasenaNueva = pedirContrasenaNueva;
window.hayRemoto = hayRemoto;
window.rolDePortal = rolDePortal;
