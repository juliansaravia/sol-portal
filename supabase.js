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
const SESION = { persona: null, rol: null, email: null, modoConsulta: true, debeCambiar: false };

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
  /* Que el correo y la contraseña se confundan en un solo mensaje es
     deliberado: distinguirlos permitiría averiguar qué correos existen.

     Pero eso vale SOLO para las credenciales. Aquí se estaba diciendo
     «correo o contraseña incorrectos» también cuando el correo estaba
     sin confirmar, cuando el servidor había cortado por intentos y
     cuando la red se caía — errores que no delatan a nadie y que quien
     entra sí puede arreglar. Se los mandaba a probar contraseñas que
     nunca iban a funcionar. */
  if (error) {
    const cod = String(error.code || error.name || '').toLowerCase();
    const msg = String(error.message || '');
    if (cod === 'email_not_confirmed' || /email not confirmed/i.test(msg))
      return { ok: false, error: 'Tu correo todavía no está confirmado. '
        + 'Abrí el correo de invitación y seguí el enlace antes de entrar.' };
    if (cod === 'over_request_rate_limit' || error.status === 429)
      return { ok: false, error: 'Demasiados intentos seguidos. '
        + 'Esperá un minuto y volvé a probar.' };
    if (cod === 'user_banned')
      return { ok: false, error: 'Tu usuario está suspendido. Hablá con administración.' };
    /* Sin `status` no hubo respuesta del servidor: es la red, no la clave. */
    if (!error.status)
      return { ok: false, error: 'No se pudo hablar con el servidor: ' + msg };
    console.warn('[login] auth respondió', error.status, cod || msg);
    return { ok: false, error: 'Contraseña o correo equivocados. Revisá y volvé a intentar.' };
  }

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
    /* Administración le asignó una contraseña temporal: al entrar elige la suya. */
    SESION.debeCambiar = !!(user.user_metadata && user.user_metadata.debe_cambiar);
    SESION.modoConsulta = p.modo_consulta !== false;
    return { ok: true, persona: SESION.persona };
  }
  if (!rapida.error && !rapida.data) return {
    ok: false,
    error: 'Tu usuario existe pero no está enlazado a una persona del equipo. ' +
           'Que administración corra el UPDATE de persona.auth_uid.'
  };
  /* Hasta aquí solo se llega con `rapida.error`. Antes se asumía que
     la causa era siempre la misma —la migración sin correr— y se
     seguía al camino largo. Eso tapaba el error de verdad: un permiso
     revocado, una columna que no existe, el servidor caído. El síntoma
     era un login que fallaba sin decir por qué.

     Solo «la función no existe» justifica el camino largo. Cualquier
     otra cosa se reporta tal cual, que para eso el servidor la mandó. */
  {
    const cod = String(rapida.error.code || '');
    const falta = cod === 'PGRST202' || cod === '42883'
      || /could not find the function|does not exist/i.test(String(rapida.error.message || ''));
    if (!falta) {
      console.error('[sesión] mi_sesion() falló', cod, rapida.error.message);
      return { ok: false, error: cod === '42501'
        ? 'La base le negó el permiso a mi_sesion(). Falta correr 18_permisos_funciones.sql.'
        : 'No se pudo leer tu sesión: ' + (rapida.error.message || cod) };
    }
    console.warn('[sesión] mi_sesion() no está · falta correr 16_login.sql');
  }

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

  /* Microsoft tarda ~11 s en aceptar el correo y el gateway de Supabase
     corta a los 10 s con 504 «context deadline exceeded»; el servidor de
     Auth sigue y lo manda igual (visto en los logs del 3 sept 2026:
     tres 504 y luego el 200 a los 11 s). Ese 504 no es un fallo: se
     avisa que va en camino y no se reintenta, para no mandar dos. */
  let r;
  try {
    r = await conLimite(SB.auth.resetPasswordForEmail(correo, {
      redirectTo: location.origin + location.pathname
    }), 20, 'Al pedir la contraseña');
  } catch (e) {
    if (/20 segundos|no respondió/i.test(String(e.message))) return { ok: true, lento: true };
    return { ok: false, error: e.message };
  }
  const err = r && r.error;
  if (err) {
    if (err.status === 504 || /request_timeout|deadline exceeded|timeout/i.test(String(err.code || '') + ' ' + String(err.message || '')))
      return { ok: true, lento: true };
    return { ok: false, error: err.message };
  }
  return { ok: true };
}

/* ¿Se llegó desde el enlace del correo (invitación o «olvidé mi
   contraseña»)? Supabase pone los tokens en el #hash con type=invite o
   type=recovery; supabase-js abre la sesión sola. Sin esto, la persona
   entraba con sesión y sin contraseña propia. Se lee UNA vez, antes de
   que setView() pise el hash. */
const LLEGO_POR_CORREO = /[#&?]type=(invite|recovery|signup|magiclink)/.test(location.hash + location.search)
                      || /[?&]code=[A-Za-z0-9-]/.test(location.search);   // flujo PKCE

/* Política de contraseña (ciberseguridad, decisión del dueño 1 sept 2026):
   12+ caracteres, mayúscula, minúscula, número y símbolo, sin el correo
   ni el nombre adentro, y sin las obvias. La misma regla vive en la
   función de servidor `contrasena`. */
function validarContrasenaFuerte(c, pistas) {
  c = String(c || '');
  const faltan = [];
  if (c.length < 12) faltan.push('12 caracteres o más');
  if (!/[A-ZÁÉÍÓÚÑ]/.test(c)) faltan.push('una mayúscula');
  if (!/[a-záéíóúñ]/.test(c)) faltan.push('una minúscula');
  if (!/\d/.test(c)) faltan.push('un número');
  if (!/[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ]/.test(c)) faltan.push('un símbolo (. , - _ ! @ # …)');
  if (/(.)\1{3,}/.test(c)) faltan.push('sin el mismo carácter cuatro veces seguidas');
  // Las obvias, completas: «Sol.Esperanza2026!» empieza con «sol» y es válida.
  if (/^(password|contrasena|contraseña|123456\d*|qwerty\w*|admin\d*|solinmobiliaria\d*)[!.]?$/i.test(c)) faltan.push('nada obvio');
  for (const p of (pistas || [])) {
    const t = String(p || '').split('@')[0].toLowerCase();
    if (t.length >= 4 && c.toLowerCase().includes(t)) { faltan.push('no puede contener tu nombre o correo'); break; }
  }
  return { ok: faltan.length === 0, faltan };
}

async function definirContrasena(nueva) {
  if (!SB) return { ok: false, error: 'El portal no está conectado a la base' };
  const c = String(nueva || '');
  const v = validarContrasenaFuerte(c, [SESION.email, SESION.persona && SESION.persona.nombre]);
  if (!v.ok) return { ok: false, error: 'Falta: ' + v.faltan.join(' · ') };
  const { error } = await SB.auth.updateUser({ password: c, data: { debe_cambiar: false } });
  if (error) return { ok: false, error: error.message };
  SESION.debeCambiar = false;
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
window.definirContrasena = definirContrasena;
window.validarContrasenaFuerte = validarContrasenaFuerte;
window.LLEGO_POR_CORREO = LLEGO_POR_CORREO;
window.cerrarSesion = cerrarSesion;
window.pedirContrasenaNueva = pedirContrasenaNueva;
window.hayRemoto = hayRemoto;
window.rolDePortal = rolDePortal;
