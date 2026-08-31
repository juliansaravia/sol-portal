/* ============================================================
   Conexión a Supabase

   ── LAS DOS COSAS QUE VAN AQUÍ ──
   Supabase → Project Settings → API

   url  · el "Project URL". Se ve así:
            https://abcdefgh.supabase.co

          NO es la cadena de conexión de la base. Si lo que copiaste
          empieza con "postgresql://" y trae una contraseña adentro,
          esa es la de conectarse al Postgres directamente y NUNCA va
          en el navegador: con ella se lee y se borra toda la base.

   anon · la llave "Publishable" (o "anon public" en el panel viejo).
          Empieza con "sb_publishable_" o con "eyJ".

          Si empieza con "sb_secret_" o dice "service_role", esa es la
          que se salta TODAS las políticas de seguridad. Tampoco va
          aquí. Esa solo se usa desde el servidor, en una variable de
          entorno.

   ── POR QUÉ ESTAS DOS SÍ SE PUEDEN PUBLICAR ──
   La llave publicable no da acceso a nada por sí sola: quien la use
   sin haber iniciado sesión no ve una sola fila, porque las políticas
   de la base preguntan quién es antes de devolver nada.
   ============================================================ */
window.SUPABASE_CONFIG = {
  url:  'https://wdykbczkihveccgujqfc.supabase.co',
  anon: 'sb_publishable_o1VVxTD6s5O4kNJcUtjcuQ_7YZG4Soa',

  // El Hub, para lo que no se puede hacer desde el navegador
  // (generar el PDF de la cotización, por ejemplo).
  hub:  'https://TU-PROYECTO.vercel.app'
};
