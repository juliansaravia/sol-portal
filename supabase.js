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
  return window.supabase.createClient(cfg.url, cfg.anon, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
})();

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

  const { error } = await SB.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password: contrasena || ''
  });
  // Supabase no dice si falló el correo o la contraseña, y está bien:
  // decirlo permitiría averiguar qué correos existen.
  if (error) return { ok: false, error: 'Correo o contraseña incorrectos' };

  const r = await cargarSesion();
  if (!r.ok) await SB.auth.signOut();
  return r;
}

/**
 * Lee de la base quién es el usuario que ya inició sesión.
 * Se llama al entrar y al recargar la página.
 */
async function cargarSesion() {
  if (!SB) return { ok: false, error: 'sin conexión' };

  const { data: { user } } = await SB.auth.getUser();
  if (!user) return { ok: false, error: 'sin sesión' };

  // La fila de persona sale por RLS: solo devuelve la propia.
  const { data: p, error } = await SB
    .from('persona')
    .select('id, nombre, rol, email, activo')
    .limit(1)
    .maybeSingle();

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
  const { data: aj } = await SB.from('ajuste').select('valor').eq('clave', 'modo_consulta').maybeSingle();
  SESION.modoConsulta = !aj || aj.valor === 'true';

  return { ok: true, persona: p };
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
window.hayRemoto = hayRemoto;
window.rolDePortal = rolDePortal;
