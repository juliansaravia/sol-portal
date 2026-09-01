/* ============================================================
   SEGUNDO FACTOR · Microsoft Authenticator

   Un código de seis dígitos que cambia cada treinta segundos y
   que solo puede generar el teléfono de esa persona. Sirve para
   lo que la contraseña no: si a alguien le roban la clave —o la
   escribió en un papel, o la repite en otro sitio— la cuenta
   sigue cerrada.

   Microsoft Authenticator es un generador TOTP estándar. Lo que
   se enrola acá funciona igual con Google Authenticator o
   1Password; no hace falta cuenta de Microsoft ni Azure.

   ── Lo que este archivo NO hace ──

   No es la seguridad. Es la pantalla. Quien exige el segundo
   factor es la base: las políticas de `17_dos_factores.sql`
   preguntan por el claim `aal` del token, que firma Supabase.
   Saltarse esta pantalla no abre nada.
   ============================================================ */
'use strict';

/** ¿Ya tiene esta persona un segundo factor verificado? */
async function tengoSegundoFactor() {
  if (!SB) return false;
  const { data, error } = await SB.auth.mfa.listFactors();
  if (error) return false;
  return (data.totp || []).some(f => f.status === 'verified');
}

/**
 * ¿Le falta el segundo factor a esta sesión?
 * Supabase compara el nivel con el que entró contra el que debería
 * tener: si ya enroló un factor, `nextLevel` es 'aal2'.
 */
async function faltaSegundoFactor() {
  if (!SB) return false;
  const { data, error } = await SB.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return false;
  return data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
}

/**
 * Empieza el enrolamiento. Devuelve el QR para escanear y el
 * secreto escrito, por si el teléfono no puede leer el código.
 */
async function enrolarSegundoFactor(nombreAmable) {
  if (!SB) return { ok: false, error: 'El portal no está conectado a la base.' };

  /* Un enrolamiento a medias —empezado y nunca verificado— deja un
     factor 'unverified' que después estorba. Se limpian antes. */
  const { data: previos } = await SB.auth.mfa.listFactors();
  for (const f of (previos?.all || []).filter(f => f.status === 'unverified'))
    await SB.auth.mfa.unenroll({ factorId: f.id });

  const { data, error } = await SB.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: nombreAmable || ('Authenticator · ' + new Date().toISOString().slice(0, 10))
  });

  if (error) {
    if (/not enabled|disabled/i.test(error.message))
      return { ok: false, error: 'El segundo factor está apagado en Supabase. '
                               + 'Authentication → Multi-Factor → TOTP (App Authenticator).' };
    if (/already exists|maximum/i.test(error.message))
      return { ok: false, error: 'Ya tienes un segundo factor enrolado. '
                               + 'Para cambiar de teléfono, que administración quite el anterior.' };
    return { ok: false, error: error.message };
  }

  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret };
}

/**
 * Confirma el enrolamiento con el primer código que da la app.
 * Hasta que esto pase, el factor no cuenta.
 */
async function confirmarSegundoFactor(factorId, codigo) {
  if (!SB) return { ok: false, error: 'sin conexión' };
  const limpio = String(codigo || '').replace(/\D/g, '');
  if (limpio.length !== 6) return { ok: false, error: 'El código son seis dígitos.' };

  const { data: reto, error: eReto } = await SB.auth.mfa.challenge({ factorId });
  if (eReto) return { ok: false, error: eReto.message };

  const { error } = await SB.auth.mfa.verify({
    factorId, challengeId: reto.id, code: limpio
  });
  if (error) return { ok: false, error: codigoNoCuadra(error.message) };
  return { ok: true };
}

/** El código que se pide al entrar, cuando ya hay un factor enrolado. */
async function verificarSegundoFactor(codigo) {
  if (!SB) return { ok: false, error: 'sin conexión' };
  const limpio = String(codigo || '').replace(/\D/g, '');
  if (limpio.length !== 6) return { ok: false, error: 'El código son seis dígitos.' };

  const { data, error: eLista } = await SB.auth.mfa.listFactors();
  if (eLista) return { ok: false, error: eLista.message };
  const factor = (data.totp || []).find(f => f.status === 'verified');
  if (!factor) return { ok: false, error: 'No hay ningún segundo factor enrolado.' };

  const { data: reto, error: eReto } = await SB.auth.mfa.challenge({ factorId: factor.id });
  if (eReto) return { ok: false, error: eReto.message };

  const { error } = await SB.auth.mfa.verify({
    factorId: factor.id, challengeId: reto.id, code: limpio
  });
  if (error) return { ok: false, error: codigoNoCuadra(error.message) };
  return { ok: true };
}

/* El reloj del teléfono desfasado es la causa número uno de que un
   código correcto sea rechazado, y el mensaje de Supabase no lo dice. */
function codigoNoCuadra(msg) {
  if (/invalid|incorrect|not valid/i.test(msg))
    return 'Ese código no es. Fíjate que sea el de la cuenta correcta y que no se haya '
         + 'vencido — cambia cada 30 segundos. Si sigue fallando, revisa que la hora del '
         + 'teléfono esté en automático.';
  if (/expired/i.test(msg))
    return 'El código se venció mientras lo escribías. Poné el siguiente.';
  if (/rate|too many/i.test(msg))
    return 'Demasiados intentos. Esperá un minuto.';
  return msg;
}

Object.assign(window, {
  tengoSegundoFactor, faltaSegundoFactor,
  enrolarSegundoFactor, confirmarSegundoFactor, verificarSegundoFactor
});
