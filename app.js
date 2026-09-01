/* ============================================================
   SUITE SOL INMOBILIARIA — motor de la aplicación
   ============================================================ */
const Q  = n => 'Q ' + (Math.round(n*100)/100).toLocaleString('es-GT',{minimumFractionDigits:2,maximumFractionDigits:2});
const Qk = n => 'Q ' + Math.round(n).toLocaleString('es-GT');
const fmtD = iso => iso ? new Date(iso+'T00:00:00').toLocaleDateString('es-GT',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let vista='inicio', filtro='todos', busqueda='', ROLE='admin', SCREEN='login', drawerTab='ficha', drawerCt=null;

/* Los roles y sus vistas salen de la matriz de permisos, no de una
   lista escrita a mano. Antes había dos listas que se desincronizaban. */
const HOME={admin:'inicio',gerencia:'inicio',vendedor:'cotizador',
            cobranza:'agenda',financiero:'confirmacion',confirmacion:'conciliacion'};
const ROLES=Object.fromEntries(Object.entries(MATRIZ).map(([r,c])=>[r,
  {label:c.etiqueta, home:HOME[r]||'inicio', views:vistasDe(r), color:c.color, nota:c.nota}]));
/* 'cobrador' era el nombre viejo del rol de cobranza. */
ROLES.cobrador=ROLES.cobranza;
const PORTAL_CFG={
  admin:   {titulo:'Portal Interno',       sub:'Administración y Cobranza', roles:['admin','cobrador']},
  vendedor:{titulo:'Portal de Vendedores', sub:'Ingreso de ventas',         roles:['vendedor']},
  cliente: {titulo:'Portal de Clientes',   sub:'Compra y estado de cuenta', roles:['cliente']},
};
/* Usuarios DEMO — la autenticación real va en el backend */
/* Los usuarios y contraseñas vivían aquí, en el JavaScript que se
   descarga el navegador. Cualquiera que abriera el inspector los veía.
   Ahora la contraseña la valida Supabase y el rol sale de la tabla
   persona — ver supabase.js.

   Esta tabla queda SOLO para cuando el portal corre sin conexión a la
   base (una demo, una revisión sin internet). En ese modo no hay datos
   reales que proteger: son los data-*.js de julio. */
const AUTH={
  demo: {pass:'demo1234', role:'admin', name:'Modo demostración'},
};
let authState={step:1,user:null};

const TITLES={
  inicio:['Resumen ejecutivo','Estado operativo del proyecto'],
  asuntos:['Centro de asuntos','Todo lo que requiere atención, con su siguiente paso'],
  cotizador:['Cotizador','Calcula el plan de pago y compártelo con el cliente'],
  vender:['Ingresar venta','Registra una venta y envíala a aprobación'],
  inventario:['Mapa del conjunto','Plano real · haz clic en un lote para ver su ficha'],
  contratos:['Contratos','Expedientes de venta'],
  clientes:['Clientes','Información de los socios'],
  aprobacion:['Aprobación de créditos','Bandeja del comité'],
  cobranza:['Cobranza','Cartera, giros y mora'],
  confirmacion:['Confirmación de pagos','Boletas pendientes de verificar'],
  comisiones:['Comisiones','Cálculo sobre cobro efectivo'],
  reporteria:['Reportería','Indicadores del negocio'],
  agenda:['Agenda de cobranza','A quién cobrar esta semana'],
  recaudacion:['Recaudación de la semana','Marca lo que se cobró y lo que no'],
  conciliacion:['Cuadre bancario','Los depósitos de Banrural contra la cartera'],
  equipo:['Equipo','Usuarios, vendedores y códigos'],
  automatizaciones:['Automatizaciones','Integraciones y flujos automáticos'],
  seguridad:['Seguridad y accesos','Quién puede hacer qué, y qué se ha hecho'],
  expedientes:['Expedientes','El papeleo de cada contrato, y qué le falta'],
};
const C = ()=>document.getElementById('content');

/* ============================================================ AUTENTICACIÓN */
function renderAuth(reanudando){
  SCREEN='login';
  window.__reanudando=!!reanudando;
  const p=window.PORTAL||'admin', cfg=PORTAL_CFG[p];
  document.querySelector('.app').hidden=true;
  document.getElementById('portalCliente').hidden=true;
  const L=document.getElementById('login'); L.style.display='flex';

  /* Con la base conectada: correo y contraseña de verdad, y el rol lo
     decide la tabla persona. Sin conexión: el modo demostración de
     siempre, que corre con los datos congelados de julio. */
  if(hayRemoto()){
    L.innerHTML=`<div class="login-box" style="max-width:400px">
      <div class="login-brand">Sol Inmobiliaria</div><div class="login-sub">${cfg.titulo}</div>
      <p class="login-hint">${cfg.sub}</p>
      <div class="field" style="text-align:left;margin-bottom:12px"><label>Correo</label>
        <input id="au-email" type="email" autocomplete="username"
               onkeydown="if(event.key==='Enter')entrar()"></div>
      <div class="field" style="text-align:left;margin-bottom:18px"><label>Contraseña</label>
        <input id="au-pass" type="password" autocomplete="current-password"
               onkeydown="if(event.key==='Enter')entrar()"></div>
      <button id="au-entrar" class="btn btn-primary" style="width:100%" onclick="entrar()" ${reanudando?'disabled':''}>${reanudando?'Reanudando tu sesión…':'Entrar'}</button>
      <div class="login-foot">
        <div id="au-err" class="err" style="min-height:18px;margin:8px 0 4px;color:#C0492B;font-weight:600"></div>
        <div class="hint">¿Olvidaste tu contraseña? Solo administración puede restablecerla: pedísela a Julián.</div>
        <br>Si el correo no te llega, pídele a administración que te reenvíe la invitación.</div></div>`;
    setTimeout(()=>document.getElementById('au-email')?.focus(),50);
    return;
  }

  if(authState.step===1){
    L.innerHTML=`<div class="login-box" style="max-width:400px">
      <div class="login-brand">Sol Inmobiliaria</div><div class="login-sub">${cfg.titulo}</div>
      <p class="login-hint">${cfg.sub}</p>
      <div class="field" style="text-align:left;margin-bottom:12px"><label>Usuario</label>
        <input id="au-user" autocomplete="username" onkeydown="if(event.key==='Enter')submitLogin()"></div>
      <div class="field" style="text-align:left;margin-bottom:18px"><label>Contraseña</label>
        <input id="au-pass" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')submitLogin()"></div>
      <button class="btn btn-primary" style="width:100%" onclick="submitLogin()">Continuar</button>
      <div class="login-foot" style="color:#8a6d1f">
        MODO DEMOSTRACIÓN · datos de julio, sin conexión a la base.<br>
        Entrar: <b>demo</b> · clave <b>demo1234</b></div></div>`;
    setTimeout(()=>document.getElementById('au-user')?.focus(),50);
  } else {
    L.innerHTML=`<div class="login-box" style="max-width:400px">
      <div class="login-brand">Verificación</div><div class="login-sub">Autenticación en dos pasos</div>
      <p class="login-hint">Ingresa el código de 6 dígitos de tu app autenticadora.</p>
      <div class="field" style="text-align:left;margin-bottom:18px"><label>Código 2FA</label>
        <input id="au-code" inputmode="numeric" maxlength="6" placeholder="000000" onkeydown="if(event.key==='Enter')submit2FA()"></div>
      <button class="btn btn-primary" style="width:100%" onclick="submit2FA()">Verificar e ingresar</button>
      <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:8px" onclick="authState.step=1;renderAuth()">← Atrás</button>
      <div class="login-foot">Demostración: cualquier código de 6 dígitos</div></div>`;
    setTimeout(()=>document.getElementById('au-code')?.focus(),50);
  }
}
function submitLogin(){
  const cfg=PORTAL_CFG[window.PORTAL||'admin'];
  const u=(document.getElementById('au-user').value||'').trim().toLowerCase();
  const pass=document.getElementById('au-pass').value||'';
  const acc=AUTH[u];
  if(!acc||acc.pass!==pass||!cfg.roles.includes(acc.role)){toast('Usuario o contraseña incorrectos');return;}
  authState.user=u; authState.step=2; renderAuth();
}
function submit2FA(){
  const code=(document.getElementById('au-code').value||'').trim();
  if(!/^\d{6}$/.test(code)){toast('Ingresa un código de 6 dígitos');return;}
  window.__user=AUTH[authState.user];
  if(window.__user.role==='cliente') startCliente(); else startApp(window.__user.role);
}

/* ---------- Entrar de verdad ----------
   Correo y contraseña contra Supabase. El rol NO lo elige quien entra:
   sale de la tabla persona, que es la misma que consultan las políticas
   de la base. Así la pantalla y la base no pueden contradecirse. */
async function entrar(){
  /* Carrera: al abrir con sesión viva, el formulario se pinta y
     reanudarSesion() corre en paralelo. Si en esos segundos el gestor
     de contraseñas rellena y se da Enter, este login nuevo reemplaza la
     sesión aal2 por una aal1; reanudar termina y arranca la app; y esto
     sigue, ve aal1 y pide el código — sobre la app ya abierta. */
  if(SCREEN==='app' || window.__reanudando){ toast('Ya estás entrando…'); return; }
  const email=(document.getElementById('au-email')||{}).value||'';
  const pass =(document.getElementById('au-pass') ||{}).value||'';
  const btn = document.getElementById('au-entrar');
  if(btn){ btn.disabled=true; btn.textContent='Entrando…'; }

  const r = await iniciarSesion(email, pass);
  if(btn){ btn.disabled=false; btn.textContent='Entrar'; }
  if(!r.ok){
    const e=document.getElementById('au-err'); if(e) e.textContent=r.error;
    const pass=document.getElementById('au-pass'); if(pass){ pass.value=''; pass.focus(); }
    toast(r.error, 6000, true); return;
  }

  /* La contraseña sola no alcanza si esta persona ya enroló su
     teléfono. El token que Supabase acaba de dar es aal1; hasta que no
     suba a aal2, las políticas de la base le niegan los expedientes y
     los libros. */
  if(typeof faltaSegundoFactor==='function' && await faltaSegundoFactor()){
    pedirCodigo2FA();
    return;
  }

  const carga = await cargarDesdeSupabase();
  if(!carga.ok){ toast('Entraste, pero no se pudieron cargar los datos: '+carga.error); return; }

  window.__user = { name: SESION.persona.nombre, role: rolDePortal(SESION.rol) };
  anotar('sesion.entrar', SESION.persona.nombre+' · '+SESION.rol);
  startApp(window.__user.role);
  traerCartera();
  if(SESION.modoConsulta) avisoModoConsulta();
}

/* La cartera —5,550 giros, el 74% de todo— se pide con la aplicación ya
   en pantalla. Cuando llega, se vuelve a pintar lo que esté abierto. */
async function traerCartera(){
  if(typeof cargarCartera!=='function' || !hayRemoto()) return;
  const r = await cargarCartera();
  if(!r.ok){ toast('No se pudo cargar la cartera: '+r.error, 7000, true); return; }
  if(typeof vista!=='undefined' && vista) setView(vista);
  const av=document.getElementById('avisoCartera'); if(av) av.remove();
}

/* El estado del segundo factor, donde todos lo ven: debajo del nombre.
   Si no está activado se ofrece, y si ya está se dice — sin botón, para
   que nadie lo apague por curiosidad. Quitarlo pasa por administración. */
async function pintarEstado2FA(){
  const caja=document.getElementById('footUser');
  if(!caja || typeof tengoSegundoFactor!=='function' || !hayRemoto()) return;

  /* Escribe SIEMPRE en el mismo hueco, en vez de agregar uno nuevo cada
     vez. Así se puede volver a pintar después de activarlo — que es lo
     que hay que hacer: si el botón sigue ahí cuando ya está activo, la
     pantalla está diciendo algo falso. */
  let hueco=document.getElementById('foot2FA');
  if(!hueco){
    caja.insertAdjacentHTML('beforeend','<div id="foot2FA" style="margin-top:6px"></div>');
    hueco=document.getElementById('foot2FA');
  }
  const ya = await tengoSegundoFactor();
  hueco.innerHTML = ya
    ? `<div style="font-size:11px;opacity:.75">Segundo factor activo</div>`
    : `<button class="btn btn-ghost btn-sm" style="width:100%"
         onclick="modalEnrolar2FA()">Activar segundo factor</button>`;
}

/* ---------- El código de seis dígitos ---------- */
function pedirCodigo2FA(){
  /* Traza: desde dónde se pidió el código y qué había en pantalla. Se
     reportó que el modal aparecía con la aplicación ya abierta detrás;
     el código sólo lo pide entrar() y reanudarSesion(), y ninguno lo
     hace después de startApp(). Esto deja el hecho anotado para leerlo
     en Diagnóstico la próxima vez, en vez de reconstruirlo de memoria. */
  try {
    const pila=(new Error().stack||'').split('\n').slice(2,5).map(l=>l.trim().replace(/^at /,'').replace(/https?:\/\/[^\s)]+\//,'')).join(' ← ');
    localStorage.setItem('traza2fa', JSON.stringify({ ts:new Date().toISOString(), desde:pila,
      appVisible: !document.querySelector('.app').hidden, pantalla: typeof SCREEN!=='undefined'?SCREEN:'?',
      vista: typeof vista!=='undefined'?vista:null }));
  } catch(e){}
  openModal(`<div class="modal-h"><h3>Código de tu teléfono</h3>
      <p>Abrí Microsoft Authenticator y escribí el código de seis dígitos</p></div>
    <div class="modal-b">
      <div class="field"><label>Código</label>
        <input id="mfa-cod" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
               placeholder="000000" style="font-size:22px;letter-spacing:6px;text-align:center"
               onkeydown="if(event.key==='Enter')entrarCon2FA()"></div>
      <div class="hint">Cambia cada 30 segundos. Si te lo rechaza estando bien,
        revisá que la hora del teléfono esté en automático.</div>
    </div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="cancelar2FA()">Cancelar</button>
      <button class="btn btn-primary" onclick="entrarCon2FA()">Entrar</button></div>`);
  setTimeout(()=>{ const i=document.getElementById('mfa-cod'); if(i&&i.focus) i.focus(); }, 60);
}
async function cancelar2FA(){ closeModal(); await cerrarSesion(); }
async function entrarCon2FA(){
  const r = await conBoton(async()=>{
    const v = await verificarSegundoFactor(document.getElementById('mfa-cod').value);
    if(!v.ok){ toast(v.error, 7000, true); return null; }
    return v;
  });
  if(!r) return;
  closeModal();
  const carga = await cargarDesdeSupabase();
  if(!carga.ok){ toast('Entraste, pero no se pudieron cargar los datos: '+carga.error, 7000, true); return; }
  window.__user = { name: SESION.persona.nombre, role: rolDePortal(SESION.rol) };
  anotar('sesion.entrar', SESION.persona.nombre+' · '+SESION.rol+' · con segundo factor');
  startApp(window.__user.role);
  /* La cartera es la segunda fase de la carga y este camino no la
     pedía: quien entrara con segundo factor veía Cartera Total en Q0,
     la cobranza vacía y la agenda sin cuotas. Nadie lo notó porque el
     modal del código era invisible y por acá no pasaba nadie. */
  traerCartera();
  if(SESION.modoConsulta) avisoModoConsulta();
}

/* ---------- Enrolar el teléfono ---------- */
async function modalEnrolar2FA(){
  const r = await enrolarSegundoFactor();
  if(!r.ok) return toast(r.error, 8000, true);
  openModal(`<div class="modal-h"><h3>Activar el segundo factor</h3>
      <p>Con Microsoft Authenticator, Google Authenticator o 1Password</p></div>
    <div class="modal-b">
      <div style="text-align:center;margin:4px 0 14px">
        <img src="${r.qr}" alt="Código para escanear" style="width:196px;height:196px">
      </div>
      <div class="hint" style="margin-bottom:12px">Abrí la app, tocá <b>+</b> →
        <b>Cuenta de trabajo o escuela</b> → <b>Escanear código QR</b>.<br>
        Si el teléfono no puede escanear, escribí esta clave a mano:
        <code style="user-select:all">${esc(r.secreto)}</code></div>
      <div class="field"><label>Escribí el código que aparece</label>
        <input id="mfa-nuevo" inputmode="numeric" maxlength="6" placeholder="000000"
               style="font-size:22px;letter-spacing:6px;text-align:center"
               onkeydown="if(event.key==='Enter')confirmar2FA('${r.factorId}')"></div>
    </div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Después</button>
      <button class="btn btn-primary" onclick="confirmar2FA('${r.factorId}')">Activar</button></div>`);
}
async function confirmar2FA(factorId){
  const r = await conBoton(async()=>{
    const v = await confirmarSegundoFactor(factorId, document.getElementById('mfa-nuevo').value);
    if(!v.ok){ toast(v.error, 7000, true); return null; }
    return v;
  });
  if(!r) return;
  closeModal();
  toast('Segundo factor activado ✓ · desde ahora te va a pedir el código al entrar', 6000);
  anotar('seguridad.2fa', 'Activó el segundo factor');
  pintarEstado2FA();      // el botón se va y queda dicho que ya está
}

/* Al recargar la página no hay que volver a escribir la contraseña:
   la sesión de Supabase sigue viva. */
async function reanudarSesion(){
  if(!hayRemoto()) return false;
  const r = await cargarSesion();
  if(!r.ok) return false;

  /* El mismo portón que entrar(). Sin esto el segundo factor se pedía
     al escribir la contraseña y nunca más: con una sesión aal1 viva,
     un F5 entraba directo. Quien dejara la computadora abierta después
     de teclear la contraseña —o antes de escribir el código— le
     regalaba el portal a quien la agarrara.

     renderAuth() ya dejó la pantalla de login puesta; devolver false la
     mantiene, y el modal ahora se dibuja encima de ella. */
  if(typeof faltaSegundoFactor==='function' && await faltaSegundoFactor()){
    pedirCodigo2FA();
    return 'codigo';
  }

  const carga = await cargarDesdeSupabase();
  if(!carga.ok){ console.warn('[sesión] sin datos:', carga.error); return false; }
  window.__user = { name: SESION.persona.nombre, role: rolDePortal(SESION.rol) };
  startApp(window.__user.role);
  traerCartera();
  if(SESION.modoConsulta) avisoModoConsulta();
  return true;
}

function avisoModoConsulta(){
  const b=document.createElement('div');
  b.id='avisoConsulta';
  b.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:999;background:#8a6d1f;'+
    'color:#fff;padding:8px 16px;font:600 13px Arial;text-align:center';
  b.textContent='MODO CONSULTA · se puede ver todo, todavía no se registra nada. '+
    'Se apaga cuando el cuadre esté cerrado.';
  document.body.appendChild(b);
}
function startApp(role){
  ROLE=role; SCREEN='app';
  document.getElementById('login').style.display='none';
  document.getElementById('portalCliente').hidden=true;
  document.querySelector('.app').hidden=false;
  const allow=ROLES[role].views;
  document.querySelectorAll('.nav-item').forEach(b=>{b.style.display=allow.includes(b.dataset.view)?'':'none';});
  document.querySelectorAll('.nav-sec').forEach(sec=>{
    let n=sec.nextElementSibling,vis=false;
    while(n&&n.classList.contains('nav-item')){if(n.style.display!=='none')vis=true;n=n.nextElementSibling;}
    sec.style.display=vis?'':'none';
  });
  document.getElementById('brandRole').textContent=ROLES[role].label;
  document.getElementById('footUser').innerHTML=`<b style="color:#fff">${esc(window.__user.name)}</b><br>${ROLES[role].label}`;
  pintarEstado2FA();
  const destino=(location.hash||'').slice(1);
  setView(ROLES[role].views.includes(destino) ? destino : ROLES[role].home);
}
/* Que nadie dependa de que alguien más esté disponible para volver a
   entrar. El correo lo manda Supabase; el portal solo lo pide. */
/* No hay «olvidé mi contraseña» en el formulario: solo administración
   restablece contraseñas, desde Equipo. Decisión del dueño (1 sept 2026). */
function logout(){
  /* Con la base conectada hay que cerrar la sesión de verdad, no solo
     volver a la pantalla de login: si no, el token sigue vivo y quien
     agarre la computadora entra con un F5. */
  if(hayRemoto() && SESION.persona){ cerrarSesion(); return; }

  closeDrawer(); closeModal(); authState={step:1,user:null}; window.__user=null;
  document.querySelector('.app').hidden=true;
  document.getElementById('portalCliente').hidden=true;
  renderAuth();
}
function startCliente(){
  SCREEN='cliente'; onlineState={paso:1,lote:null,cliente:{},girosSaldo:60,reserva:2500};
  document.getElementById('login').style.display='none';
  document.querySelector('.app').hidden=true;
  document.getElementById('portalCliente').hidden=false;
  renderClientePortal();
}

/* ============================================================ PROYECTO ACTIVO
   Sol Inmobiliaria es el suite; adentro vive cada desarrollo. Hoy
   solo está La Esperanza cargada, pero el esquema ya es multi-proyecto:
   cada uno lleva su propia tasa, enganche mínimo, plazos y comisión. */
let PROYECTO_ACTIVO = 'RLE';

function cambiarProyecto(codigo){
  if(codigo === PROYECTO_ACTIVO || !PROYECTOS[codigo]) return;
  PROYECTO_ACTIVO = codigo;
  PROYECTO = PROYECTOS[codigo];        // las reglas comerciales cambian con él
  toast('Proyecto: ' + PROYECTO.corto);
  setView(vista);
}

/* Nombre del proyecto para títulos y documentos. */
const nombreProyecto = () => PROYECTO.corto;

/* ============================================================ ROUTER */
/* Las pantallas que no se pueden leer sin la cartera. Mientras los
   giros no lleguen, muestran un aviso en vez de ceros — que se leen
   igual que un dato y hacen creer que no hay nada que cobrar. */
const VISTAS_CON_CARTERA = ['cobranza','agenda','recaudacion','reporteria','contratos','comisiones'];

/* Lo que escribe, para quien no puede escribir, no se ofrece.

   Manus entró como «Solo lectura» y vio Crear, Editar, Reasignar, Dar
   de baja y Reiniciar datos: la base los rebotaba, pero la pantalla los
   ofrecía igual. Un botón que no se puede apretar es peor que ninguno.

   Se reconoce por el nombre de lo que invoca: modal*, guardar*, hacer*,
   invitar*, do* (menos los que solo generan o buscan), etc. Se deja
   visible pero deshabilitado y con el motivo, salvo los de alta —los
   «+ Nuevo…», que se quitan— y «Reiniciar datos», que sólo ve el admin. */
const ESCRIBE_RX=/^(modal(?!Enrolar2FA$)|guardar|hacer|invitar|asignar|reactivar|deshacer|crear|cotVender|onlineFirmar|enviarEC|copiarCierre|do(?!Hoja$|CompartirPDF$|BuscarContrato$))/;
const SOLO_LEE_RX=/^(modalNuevoContrato|modalPersona|modalPago|modalCobro|modalNoCobro|modalDocumento|modalGestion|modalIntegrante|modalFactura|modalCierreSemana|crearContrato|cotVender)$/;
function aplicarSoloLectura(){
  const reset=document.querySelector('.btn-reset');
  if(reset) reset.hidden = !(typeof SESION!=='undefined' && SESION && SESION.rol==='admin');
  if(puedeEscribir()) return;
  const porque = (typeof SESION!=='undefined' && SESION && SESION.rol==='consulta')
    ? 'Tu acceso es de solo lectura' : 'Modo consulta: todavía no se registra nada';
  document.querySelectorAll('.content button[onclick], .drawer button[onclick]').forEach(b=>{
    const fn=(b.getAttribute('onclick')||'').match(/^\s*([a-zA-Z_$][\w$]*)\s*\(/);
    if(!fn||!ESCRIBE_RX.test(fn[1])) return;
    if(SOLO_LEE_RX.test(fn[1]) && /^\s*[+＋]/.test(b.textContent)) { b.remove(); return; }
    b.disabled=true; b.title=porque; b.classList.add('btn-bloqueado');
  });
}
function setView(v){
  if(SCREEN==='app' && ROLES[ROLE] && !ROLES[ROLE].views.includes(v)) return;
  try{ if(location.hash.slice(1)!==v) history.replaceState(null,'','#'+v); }catch(e){}
  vista=v;
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  document.getElementById('viewTitle').textContent=TITLES[v][0];
  document.getElementById('viewSub').textContent=TITLES[v][1];
  const faltaCartera = typeof DB!=='undefined' && DB.meta && DB.meta.carteraLista === false
                    && VISTAS_CON_CARTERA.includes(v);
  ({inicio:renderInicio,asuntos:renderAsuntos,cotizador:renderCotizador,vender:renderVender,inventario:renderInventario,contratos:renderContratos,
    clientes:renderClientes,aprobacion:renderAprobacion,cobranza:renderCobranza,
    confirmacion:renderConfirmacion,comisiones:renderComisiones,reporteria:renderReporteria,
    agenda:renderAgenda,recaudacion:renderRecaudacion,conciliacion:renderConciliacion,seguridad:renderSeguridad,expedientes:renderExpedientes,equipo:renderEquipo,automatizaciones:renderAutomatizaciones}[v])();

  aplicarSoloLectura();

  /* El aviso va DESPUÉS de pintar, arriba del todo: si fuera antes, el
     render lo borraría al escribir en el mismo contenedor. */
  if(faltaCartera){
    const c=C();
    if(c && !document.getElementById('avisoCartera'))
      c.insertAdjacentHTML('afterbegin',
        `<div id="avisoCartera" class="aviso-err" style="margin-bottom:14px">
           Cargando la cartera — 5,550 giros. <b>Los saldos y la mora todavía no
           son los buenos.</b> La pantalla se actualiza sola en unos segundos.</div>`);
  }
}

/* ============================================================ INICIO */
/* ============================================================ RESUMEN EJECUTIVO
   Dirección de Manus: qué requiere atención, cuánto importa, cuál es el
   siguiente paso. Cada prioridad lleva a una lista YA filtrada. */
let VISTA_FILTRO={};
function irA(v,filtro){ VISTA_FILTRO[v]=filtro||null; setView(v); }

/* Todo lo que requiere atención, con severidad y a dónde ir. Es la
   única lista: la usan el resumen, el centro de asuntos y la insignia. */
function asuntos(){
  const activos=DB.contratos.filter(c=>c.estado==='aprobado');
  const M=resumenMora();
  const pend=DB.contratos.filter(c=>c.estado==='en_aprobacion').length;
  const porConf=DB.pagos.filter(p=>p.estado==='registrado').length;
  const sinVend=activos.filter(c=>!c.vendedor||!buscarPersona(c.vendedor)).length;
  const sinCli=activos.filter(c=>!c.clienteId||!getCliente(c.clienteId)).length;
  const sinAcceso=DB.equipo.filter(p=>p.activo&&p.entra===false).length;
  const sinAlta=DB.lotes.filter(l=>l.estado===LOTE_ALTA_PENDIENTE).length;
  const sinUbic=DB.lotes.filter(l=>l.x==null).length;
  const A=[];
  if(M.enMora) A.push({sev:'alta',n:M.enMora,t:M.enMora===1?'contrato en mora':'contratos en mora',d:`${Qk(M.saldoVencido)} vencidos · requieren gestión`,ir:()=>irA('cobranza',{f:'mora'})});
  if(M.nuncaPagaron.length) A.push({sev:'alta',n:M.nuncaPagaron.length,t:M.nuncaPagaron.length===1?'venta que nunca pagó una cuota':'ventas que nunca pagaron una cuota',d:'Entró el enganche y nada más',ir:()=>irA('cobranza',{f:'nunca'})});
  if(porConf) A.push({sev:'media',n:porConf,t:'pagos por confirmar',d:'Esperan al financiero para aplicarse a la cartera',ir:()=>setView('confirmacion')});
  if(pend) A.push({sev:'media',n:pend,t:'solicitudes por aprobar',d:'El comité decide y se genera el plan de giros',ir:()=>setView('aprobacion')});
  if(sinVend) A.push({sev:'media',n:sinVend,t:'contratos sin vendedor',d:'Sin responsable no hay comisión ni seguimiento',ir:()=>irA('contratos',{f:'sin_vendedor'})});
  if(sinCli) A.push({sev:'media',n:sinCli,t:'contratos sin cliente vinculado',d:'Existe la venta, falta la ficha del titular',ir:()=>irA('contratos',{f:'sin_cliente'})});
  if(sinAcceso) A.push({sev:'baja',n:sinAcceso,t:'usuarios sin acceso',d:'Pendientes de invitación o de correo',ir:()=>setView('equipo')});
  if(sinAlta) A.push({sev:'baja',n:sinAlta,t:'lotes del plano sin dar de alta',d:'Están dibujados pero no en el inventario',ir:()=>setView('inventario')});
  if(sinUbic) A.push({sev:'baja',n:sinUbic,t:'lotes sin ubicación en el plano',d:'Existen en inventario, no en el dibujo',ir:()=>setView('inventario')});
  const orden={alta:0,media:1,baja:2};
  return A.filter(a=>ROLES[ROLE]&&true).sort((a,b)=>orden[a.sev]-orden[b.sev]||b.n-a.n);
}
const SEV={alta:['Alta','sev-alta'],media:['Media','sev-media'],baja:['Baja','sev-baja']};
function filaAsunto(a,i){
  return `<div class="prio-row"><div class="prio-ico ${SEV[a.sev][1]}">!</div>
    <div class="prio-txt"><b>${a.n} ${esc(a.t)}</b><div class="hint">${esc(a.d)}</div></div>
    <span class="sev ${SEV[a.sev][1]}">${SEV[a.sev][0]}</span>
    <button class="btn btn-ghost btn-sm" onclick="asuntos()[${i}].ir()">Ver casos ›</button></div>`;
}
function pintarBadgeAsuntos(){
  const b=document.getElementById('badgeAsuntos'); if(!b) return;
  const n=asuntos().length; b.textContent=n; b.hidden=!n;
}
function renderAsuntos(){
  const A=asuntos();
  let h=`<div class="card"><div class="card-h"><h2>${A.length?`${A.length} asunto(s) requieren atención`:'Nada pendiente'}</h2>
    <span class="hint">Ordenados por severidad · cada uno abre su lista ya filtrada</span></div><div class="card-b">`;
  h+=A.length?A.map(filaAsunto).join(''):`<div class="empty">Todo al día 🎉</div>`;
  h+=`</div></div>`; C().innerHTML=h; pintarBadgeAsuntos();
}

function renderInicio(){
  const vend=DB.lotes.filter(l=>l.estado==='vendido').length;
  const disp=DB.lotes.filter(l=>l.estado==='disponible').length;
  const activos=DB.contratos.filter(c=>c.estado==='aprobado');
  const K=activos.reduce((a,c)=>{const ec=estadoCuenta(c); a.cartera+=ec.totalGiros; a.rec+=ec.recaudado; a.saldo+=ec.saldo; return a;},{cartera:0,rec:0,saldo:0});
  const M=resumenMora();
  const A=asuntos();
  const hoy=new Date(HOY_ISO+'T00:00:00');
  const mes=hoy.toLocaleDateString('es-GT',{month:'long',year:'numeric'});

  let h=`<div class="alerta-global ${A.length?'':'ok'}">
    <div class="ag-ico">${A.length?'⚠':'✓'}</div>
    <div class="ag-txt"><b>${A.length?`${A.length} asunto(s) requieren atención`:'Todo al día'}</b>
      <div class="hint">${A.length?'Revisá los pendientes críticos para mantener la operación al día.':'No hay pendientes críticos en este momento.'}</div></div>
    ${A.length?`<button class="btn btn-primary" onclick="setView('asuntos')">Revisar ahora ›</button>`:''}
  </div>`;

  const kpis=[
    {l:'Lotes vendidos',v:`${vend} <small>/ ${DB.lotes.length}</small>`,s:`${Math.round(vend/DB.lotes.length*100)}% del total`,t:'Lotes con contrato aprobado sobre el inventario completo'},
    {l:'Disponibles',v:disp,s:'en inventario',t:'Lotes que se pueden vender hoy'},
    {l:'Cartera total',v:Qk(K.cartera),s:'con intereses',t:'Todo lo que los clientes van a pagar: capital, enganche e intereses'},
    {l:'Recaudado',v:Qk(K.rec),s:`${K.cartera?Math.round(K.rec/K.cartera*100):0}% de la cartera`,t:'Dinero confirmado que ya entró, enganches incluidos'},
    {l:'Saldo vencido',v:Qk(M.saldoVencido),s:`${M.enMora} contratos en mora`,t:`Cuotas vencidas y no pagadas · fuente: ${M.fuente}`,cls:'warn'},
  ];
  h+=`<div class="kpis kpis-5">`+kpis.map(k=>`<div class="kpi ${k.cls||''}" title="${esc(k.t)}">
    <div class="kpi-label">${k.l}</div><div class="kpi-value sm">${k.v}</div><div class="kpi-sub">${k.s}</div></div>`).join('')+`</div>`;

  // Prioridades de hoy · las tres más severas
  h+=`<div class="grid2"><div class="card"><div class="card-h"><h2>Prioridades de hoy</h2></div><div class="card-b">`;
  h+=A.length?A.slice(0,3).map(filaAsunto).join(''):`<div class="empty">Nada pendiente 🎉</div>`;
  if(A.length>3) h+=`<div style="text-align:center;margin-top:8px"><button class="btn btn-ghost btn-sm" onclick="setView('asuntos')">Ver todos los asuntos ›</button></div>`;
  h+=`</div></div>`;

  // Ventas por manzana · barras apiladas
  const mz={}; DB.lotes.forEach(l=>{const k=l.manzana||'?';mz[k]=mz[k]||{t:0,v:0};mz[k].t++;if(l.estado==='vendido')mz[k].v++;});
  const claves=Object.keys(mz).sort(); const max=Math.max(1,...claves.map(k=>mz[k].t));
  const W=Math.max(320,claves.length*34+40), H=180, base=150, esc_=(base-20)/max;
  let svg=`<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Ventas por manzana">`;
  [0,.5,1].forEach(f=>{const y=base-(max*f)*esc_; svg+=`<line x1="30" x2="${W}" y1="${y}" y2="${y}" class="grid"/><text x="26" y="${y+4}" class="tick">${Math.round(max*f)}</text>`;});
  claves.forEach((k,i)=>{const x=40+i*34, t=mz[k].t*esc_, v=mz[k].v*esc_;
    svg+=`<rect x="${x}" y="${base-t}" width="20" height="${t}" class="b-disp"/><rect x="${x}" y="${base-v}" width="20" height="${v}" class="b-vend"/>
          <text x="${x+10}" y="${base+14}" class="tick" text-anchor="middle">${esc(k)}</text>`;});
  svg+=`</svg>`;
  h+=`<div class="card"><div class="card-h"><h2>Ventas por manzana</h2>
      <span class="hint"><i class="dot b-vend"></i> Vendidos &nbsp; <i class="dot b-disp"></i> Total</span></div>
      <div class="card-b" style="overflow-x:auto">${svg}</div></div></div>`;

  // Actividad reciente · con siguiente paso
  h+=`<div class="grid2"><div class="card"><div class="card-h"><h2>Actividad reciente</h2>
      <button class="btn btn-ghost btn-sm" onclick="setView('contratos')">Ver toda la actividad ›</button></div>
    <div class="card-b" style="padding:0"><table class="data"><thead><tr>
      <th>Contrato</th><th>Lote</th><th>Cliente</th><th>Estado</th><th>Próximo paso</th></tr></thead><tbody>`;
  DB.contratos.slice().sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))||b.no.localeCompare(a.no)).slice(0,6).forEach(c=>{
    const ec=estadoCuenta(c), cli=getCliente(c.clienteId);
    const paso = ec.enMora ? ['Gestionar',`abrirContrato('${c.id}')`]
               : (!cli ? ['Completar datos',`abrirContrato('${c.id}')`] : ['Abrir ficha',`abrirContrato('${c.id}')`]);
    h+=`<tr><td><b>${c.no}</b></td><td>${esc(c.lote)}</td><td>${cli?esc(cli.nombre):'<span class="hint">Pendiente de datos</span>'}</td>
      <td>${ec.enMora?'<span class="badge b-mora">Mora</span>':estadoBadge(c.estado)}</td>
      <td><a href="#" onclick="${paso[1]};return false;">${paso[0]} ›</a></td></tr>`;});
  h+=`</tbody></table></div></div>`;

  // Calidad de datos
  const total=activos.length||1;
  const conCli=activos.filter(c=>getCliente(c.clienteId)).length;
  const conVend=activos.filter(c=>c.vendedor&&buscarPersona(c.vendedor)).length;
  const conUbic=activos.filter(c=>{const l=getLote(c.clave||c.lote);return l&&l.x!=null;}).length;
  const pct=Math.round((conCli+conVend+conUbic)/(3*total)*100);
  h+=`<div class="card"><div class="card-h"><h2>Calidad de datos</h2></div><div class="card-b">
      <div class="calidad"><div class="calidad-pct">${pct}%</div>
        <div style="flex:1"><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="hint">completo · ${activos.length} contratos activos</div></div></div>
      <div class="calidad-links">
        <a href="#" onclick="irA('contratos',{f:'sin_cliente'});return false;">Clientes <b>${conCli}/${total}</b> ›</a>
        <a href="#" onclick="setView('inventario');return false;">Ubicaciones <b>${conUbic}/${total}</b> ›</a>
        <a href="#" onclick="irA('contratos',{f:'sin_vendedor'});return false;">Vendedores <b>${conVend}/${total}</b> ›</a>
      </div></div></div></div>`;
  C().innerHTML=h; pintarBadgeAsuntos();
}

/* ============================================================ MAPA REAL DEL PLANO */
const ESTADO_MAP={
  disponible:{fill:'#8FB09B',stroke:'#5d8a71',label:'Disponible'},
  reservado :{fill:'#E0A72E',stroke:'#a87c15',label:'Reservado'},
  vendido   :{fill:'#B85042',stroke:'#8a382c',label:'Vendido'},
};
let vb=null, dragMoved=false, geomLista=false;

/* Calcula, para cada lote, la orientación y el tamaño reales según el plano:
   - ángulo: dirección de la fila (vecinos de la misma manzana)
   - ancho: frente del lote (separación al vecino)
   - fondo: 15 m ≈ 40 px (constante, verificado contra la separación entre filas) */
const DEPTH_PX = 40, MAX_NEIGHBOR = 36;
function calcularGeometria(){
  if(geomLista) return;
  // 1) Geometría exacta medida del plano (assets/lotes-shape.js)
  const S=window.LOT_SHAPE||{};
  DB.lotes.forEach(l=>{
    const s=S[l.codigo];
    if(s){ l.x=s.x; l.y=s.y; l.poly=s.p; l.exacto=true; }
  });
  // 2) Los que no tengan forma exacta se estiman por vecinos
  const by={};
  DB.lotes.filter(l=>l.x!=null&&!l.exacto).forEach(l=>{(by[l.manzana]=by[l.manzana]||[]).push(l);});
  Object.values(by).forEach(list=>{
    // ángulo mediano de la manzana (respaldo estable)
    const angs=[];
    for(let i=1;i<list.length;i++){
      const a=list[i-1],b=list[i], d=Math.hypot(b.x-a.x,b.y-a.y);
      if(d<MAX_NEIGHBOR) angs.push(norm(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI));
    }
    const angMz = angs.length? mediana(angs) : -51.5;
    const spans=[];
    list.forEach(l=>{
      const cercanos=list.filter(o=>o!==l).map(o=>({o,d:Math.hypot(o.x-l.x,o.y-l.y)}))
                         .filter(x=>x.d<MAX_NEIGHBOR).sort((a,b)=>a.d-b.d).slice(0,2);
      // solo vecinos alineados con la fila (descarta el de la fila de enfrente)
      const enFila=cercanos.filter(c=>{
        const a=norm(Math.atan2(c.o.y-l.y,c.o.x-l.x)*180/Math.PI);
        return Math.abs(difAng(a,angMz))<=30;
      });
      if(enFila.length){
        const as=enFila.map(c=>norm(Math.atan2(c.o.y-l.y,c.o.x-l.x)*180/Math.PI));
        l.ang = mediana(as.concat(angMz));
        l.w = Math.max(11, enFila[0].d*0.94);
        spans.push(enFila[0].d);
      } else { l.ang=angMz; l.w=null; }
      l.h = DEPTH_PX;
    });
    const wMz = spans.length? mediana(spans)*0.94 : 17;
    list.forEach(l=>{ if(l.w==null) l.w=wMz; });
  });
  geomLista=true;
}
function norm(a){ while(a>90)a-=180; while(a<-90)a+=180; return a; }
function difAng(a,b){ return norm(a-b); }
function mediana(arr){ const s=arr.slice().sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }
function renderInventario(){
  const conCoord=DB.lotes.filter(l=>l.x!=null).length;
  let h=`<div class="chips">`+
    [['todos','Todos'],['disponible','Disponibles'],['reservado','Reservados'],['vendido','Vendidos']].map(([k,l])=>
      `<button class="chip ${filtro===k?'active':''}" onclick="setFiltro('${k}')">${l}</button>`).join('')+
    `<input id="qmap" class="chip" style="min-width:220px" placeholder="Buscar lote o cliente…" value="${esc(busqueda)}" oninput="busqueda=this.value;pintarMapa()"></div>`;
  h+=`<div class="map-legend">`+Object.keys(ESTADO_MAP).map(k=>
      `<span><i class="dot" style="background:${ESTADO_MAP[k].fill}"></i>${ESTADO_MAP[k].label}</span>`).join('')+
      `<span style="margin-left:auto;color:var(--muted)">${conCoord} de ${DB.lotes.length} lotes ubicados en el plano</span></div>`;
  h+=`<div class="card"><div class="map-wrap">
      <svg id="mapSvg" preserveAspectRatio="xMidYMid meet"></svg>
      <div class="map-zoom">
        <button onclick="zoomBtn(0.75)" title="Acercar">+</button>
        <button onclick="zoomBtn(1.33)" title="Alejar">−</button>
        <button onclick="zoomReset()" title="Ver todo">⤢</button>
      </div>
      <div class="tooltip" id="tip" hidden></div>
    </div></div>`;
  const sin=DB.lotes.filter(l=>l.x==null);
  if(sin.length){
    h+=`<div class="card"><div class="card-h"><h2>Sin ubicación en el plano · ${sin.length} lotes</h2></div>
      <div class="card-b"><div class="lot-grid">`+
      sin.map(l=>`<div class="lot ${l.estado==='vendido'?'vend':(l.estado==='reservado'?'apar':'disp')}" onclick="abrirLote('${l.codigo}')">
        <div class="lc">${l.codigo}</div><div class="la">${l.area} m²</div></div>`).join('')+
      `</div><div class="hint">Estos lotes existen en el CRM pero no traen coordenadas en el plano.</div></div></div>`;
  }
  C().innerHTML=h;
  dibujarMapa();
}
function dibujarMapa(){
  const svg=document.getElementById('mapSvg'); if(!svg||!window.PLAN_CLIP)return;
  const clip=window.PLAN_CLIP, NS='http://www.w3.org/2000/svg';
  svg.innerHTML='';
  const img=document.createElementNS(NS,'image');
  img.setAttribute('x',clip.x);img.setAttribute('y',clip.y);
  img.setAttribute('width',clip.w);img.setAttribute('height',clip.h);
  img.setAttribute('preserveAspectRatio','none');
  img.setAttribute('href','assets/plano.png');
  img.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href','assets/plano.png');
  svg.appendChild(img);
  calcularGeometria();
  DB.lotes.forEach(l=>{
    if(l.x==null)return;
    const m=ESTADO_MAP[l.estado]||ESTADO_MAP.disponible;
    let r;
    if(l.poly&&l.poly.length>2){                       // contorno exacto del plano
      r=document.createElementNS(NS,'polygon');
      r.setAttribute('points', l.poly.map(p=>p.join(',')).join(' '));
    } else {                                            // respaldo: rectángulo estimado
      const w=l.w||17, h=l.h||DEPTH_PX;
      r=document.createElementNS(NS,'rect');
      r.setAttribute('x',l.x-w/2); r.setAttribute('y',l.y-h/2);
      r.setAttribute('width',w); r.setAttribute('height',h); r.setAttribute('rx',1.5);
      r.setAttribute('transform',`rotate(${l.ang||-51.5} ${l.x} ${l.y})`);
    }
    r.setAttribute('fill',m.fill); r.setAttribute('fill-opacity',0.55);
    r.setAttribute('stroke',m.stroke); r.setAttribute('stroke-width',0.6);
    r.setAttribute('class','lotm'); r.dataset.id=l.codigo;
    r.addEventListener('click',()=>{if(!dragMoved)abrirLote(l.codigo);});
    r.addEventListener('mousemove',e=>mostrarTip(e,l));
    r.addEventListener('mouseleave',()=>{document.getElementById('tip').hidden=true;});
    svg.appendChild(r);
  });
  setViewBox(clip.x,clip.y,clip.w,clip.h);
  panZoom(svg);
  pintarMapa();
}
function pintarMapa(){
  const t=(busqueda||'').toLowerCase();
  document.querySelectorAll('.lotm').forEach(r=>{
    const l=getLote(r.dataset.id); if(!l)return;
    let ok = filtro==='todos'||l.estado===filtro;
    if(ok&&t){ const ct=contratoDeLote(l.codigo);
      const hay=[l.codigo,ct?nombreCliente(ct.clienteId):''].join(' ').toLowerCase();
      ok=hay.includes(t); }
    r.style.opacity=ok?1:0.12;
    r.style.pointerEvents=ok?'auto':'none';
  });
  /* La búsqueda centra el primer lote que coincide, una vez por texto:
     escribir «A-01» tiene que llevarte al lote, no sólo atenuar el resto. */
  if(t && t!==window.__mapaCentrado){
    const primero=[...document.querySelectorAll('.lotm')].find(r=>r.style.opacity==='1');
    if(primero && primero.getBBox && window.PLAN_CLIP){
      try{ const b=primero.getBBox(), clip=window.PLAN_CLIP, w=Math.max(clip.w*0.18,b.width*6), h=w*(clip.h/clip.w);
           setViewBox(b.x+b.width/2-w/2, b.y+b.height/2-h/2, w, h); }catch(e){}
    }
    window.__mapaCentrado=t;
  }
  if(!t) window.__mapaCentrado='';
}
function setFiltro(f){filtro=f;renderInventario();}
function mostrarTip(e,l){
  const tip=document.getElementById('tip'), wrap=document.querySelector('.map-wrap');
  const ct=contratoDeLote(l.codigo), m=ESTADO_MAP[l.estado]||ESTADO_MAP.disponible;
  tip.innerHTML=`<b>Lote ${l.codigo}</b>${l.fase?` <span style="opacity:.75">· ${esc(l.fase)}</span>`:''} · ${l.area} m²<br>${l.precio?Qk(l.precio):'Precio por definir'}
    ${ct?'<br>'+esc(nombreCliente(ct.clienteId)):''}
    <div class="tt-badge" style="background:${m.fill}">${m.label}</div>`;
  tip.hidden=false;
  const r=wrap.getBoundingClientRect();
  tip.style.left=(e.clientX-r.left+12)+'px'; tip.style.top=(e.clientY-r.top-10)+'px';
}
function setViewBox(x,y,w,h){vb={x,y,w,h};document.getElementById('mapSvg').setAttribute('viewBox',`${x} ${y} ${w} ${h}`);}
function zoomAt(cx,cy,scale){
  const svg=document.getElementById('mapSvg'),clip=window.PLAN_CLIP,r=svg.getBoundingClientRect();
  const mx=vb.x+(cx-r.left)/r.width*vb.w, my=vb.y+(cy-r.top)/r.height*vb.h;
  const nw=Math.max(clip.w*0.08,Math.min(clip.w,vb.w*scale)), nh=nw*(clip.h/clip.w);
  setViewBox(mx-(mx-vb.x)*(nw/vb.w), my-(my-vb.y)*(nh/vb.h), nw, nh);
}
function zoomBtn(s){const r=document.getElementById('mapSvg').getBoundingClientRect();zoomAt(r.left+r.width/2,r.top+r.height/2,s);}
function zoomReset(){const c=window.PLAN_CLIP;setViewBox(c.x,c.y,c.w,c.h);}
function panZoom(svg){
  let drag=false,sx=0,sy=0,pid=null,cap=false;
  svg.onwheel=e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,e.deltaY<0?0.85:1.18);};
  svg.onpointerdown=e=>{drag=true;dragMoved=false;cap=false;pid=e.pointerId;sx=e.clientX;sy=e.clientY;};
  svg.onpointermove=e=>{
    if(!drag)return;
    if(!dragMoved&&Math.abs(e.clientX-sx)+Math.abs(e.clientY-sy)>3){dragMoved=true;cap=true;svg.classList.add('grabbing');try{svg.setPointerCapture(pid);}catch(_){}}
    if(!dragMoved)return;
    const r=svg.getBoundingClientRect();
    setViewBox(vb.x-(e.clientX-sx)*vb.w/r.width, vb.y-(e.clientY-sy)*vb.h/r.height, vb.w, vb.h);
    sx=e.clientX;sy=e.clientY;
  };
  const end=()=>{drag=false;svg.classList.remove('grabbing');if(cap){try{svg.releasePointerCapture(pid);}catch(_){}cap=false;}};
  svg.onpointerup=end;svg.onpointercancel=end;
}

/* ============================================================ VENDER */
function renderVender(){
  const mios=DB.contratos.filter(c=>ROLE!=='vendedor'||c.vendedor===(window.__user&&window.__user.name)||true);
  let h=`<div class="card"><div class="card-b" style="text-align:center;padding:34px 24px">
    <h2 style="color:var(--dark);font-size:20px;margin-bottom:6px">Registra una nueva venta</h2>
    <p class="hint" style="margin-bottom:18px">Captura el lote y los datos del cliente. La venta se envía al comité de crédito.</p>
    <button class="btn btn-primary" style="font-size:15px;padding:12px 26px" onclick="modalNuevoContrato()">＋ Ingresar venta</button>
    </div></div>
    <div class="card"><div class="card-h"><h2>Ventas ingresadas</h2></div><div class="card-b" style="padding:0">
    <table class="data"><thead><tr><th>No.</th><th>Lote</th><th>Cliente</th><th>Fecha</th><th class="num">Valor</th><th>Estado</th></tr></thead><tbody>`;
  if(!mios.length)h+=`<tr><td colspan="6" class="empty">Aún no hay ventas registradas</td></tr>`;
  mios.slice().sort((a,b)=>b.no.localeCompare(a.no)).forEach(c=>{
    h+=`<tr class="click" onclick="abrirContrato('${c.id}')"><td><b>${c.no}</b></td><td>${c.lote}</td>
      <td>${esc(nombreCliente(c.clienteId))}</td><td>${fmtD(c.fecha)}</td>
      <td class="num">${Qk(c.precio)}</td><td>${estadoBadge(c.estado)}</td></tr>`;});
  h+=`</tbody></table></div></div>`;
  C().innerHTML=h;
}

/* ============================================================ CONTRATOS */
const FILTROS_CT={
  todos:{t:'Todos',f:()=>true},
  mora:{t:'En mora',f:(c,ec)=>c.estado==='aprobado'&&ec.enMora},
  sin_vendedor:{t:'Sin vendedor',f:c=>c.estado==='aprobado'&&(!c.vendedor||!buscarPersona(c.vendedor))},
  sin_cliente:{t:'Sin cliente',f:c=>c.estado==='aprobado'&&!getCliente(c.clienteId)},
  bajo_recaudo:{t:'Bajo % recaudado',f:(c,ec)=>c.estado==='aprobado'&&ec.totalGiros>0&&ec.recaudado/ec.totalGiros<0.15},
  anulados:{t:'Anulados',f:c=>c.estado==='anulado'},
};
let ctBusca='', ctOrden={k:'no',asc:false};
function ctOrdenar(k){ ctOrden = ctOrden.k===k ? {k,asc:!ctOrden.asc} : {k,asc:true}; renderContratos(); }
function renderContratos(){
  const F=(VISTA_FILTRO.contratos&&VISTA_FILTRO.contratos.f)||'todos';
  const q=ctBusca.trim().toLowerCase();
  let filas=DB.contratos.map(c=>({c,ec:estadoCuenta(c),cli:nombreCliente(c.clienteId)}))
    .filter(x=>FILTROS_CT[F].f(x.c,x.ec))
    .filter(x=>!q||[x.c.no,x.c.lote,x.cli,x.c.vendedor].some(v=>String(v||'').toLowerCase().includes(q)));
  const val={no:x=>x.c.no,lote:x=>x.c.lote,cliente:x=>x.cli,fecha:x=>x.c.fecha||'',valor:x=>x.c.precio,recaudado:x=>x.ec.recaudado,vencido:x=>x.ec.montoVencido,estado:x=>x.c.estado}[ctOrden.k]||(x=>x.c.no);
  filas.sort((a,b)=>{const A=val(a),B=val(b);const r=typeof A==='number'?A-B:String(A).localeCompare(String(B));return ctOrden.asc?r:-r;});
  const th=(k,t,num)=>`<th class="${num?'num ':''}click" onclick="ctOrdenar('${k}')">${t}${ctOrden.k===k?(ctOrden.asc?' ↑':' ↓'):''}</th>`;
  let h=`<div class="card"><div class="card-h" style="flex-wrap:wrap;gap:10px"><h2>Contratos · ${filas.length}${F!=='todos'?` <span class="hint">de ${DB.contratos.length}</span>`:''}</h2>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input class="chip" style="min-width:220px" placeholder="Buscar por número, lote, cliente o vendedor…" value="${esc(ctBusca)}" oninput="ctBusca=this.value;renderContratos();document.querySelector('.card-h input').focus()">
      <button class="btn btn-primary btn-sm" onclick="modalNuevoContrato()">+ Nuevo contrato</button></div></div>
    <div class="card-b chips">${Object.entries(FILTROS_CT).map(([k,v])=>`<button class="chip ${k===F?'on':''}" onclick="irA('contratos',{f:'${k}'})">${v.t}</button>`).join('')}</div>
    <div class="card-b" style="padding:0;overflow-x:auto"><table class="data"><thead><tr>
    ${th('no','No.')}${th('lote','Lote')}${th('cliente','Cliente')}<th>Vendedor</th>${th('fecha','Fecha')}
    ${th('valor','Valor',1)}${th('recaudado','Recaudado',1)}${th('vencido','Vencido',1)}${th('estado','Estado')}</tr></thead><tbody>`;
  if(!filas.length) h+=`<tr><td colspan="9"><div class="empty">${q?'Nada coincide con la búsqueda.':'No hay contratos en este filtro.'}</div></td></tr>`;
  filas.forEach(({c,ec,cli})=>{
    h+=`<tr class="click" onclick="abrirContrato('${c.id}')"><td><b>${c.no}</b></td><td>${esc(c.lote)}${c.fase?` <span class="hint">${esc(c.fase)}</span>`:''}</td>
      <td>${cli&&cli!=='(sin titular)'?esc(cli):'<span class="hint">Sin cliente</span>'}</td><td>${c.vendedor?esc(c.vendedor):'<span class="hint">Sin vendedor</span>'}</td>
      <td>${fmtD(c.fecha)}</td><td class="num">${Qk(c.precio)}</td><td class="num">${Qk(ec.recaudado)}</td>
      <td class="num">${ec.montoVencido?`<span style="color:var(--mora)">${Qk(ec.montoVencido)}</span>`:'—'}</td>
      <td>${ec.enMora?'<span class="badge b-mora">Mora</span>':estadoBadge(c.estado)}</td></tr>`;});
  h+=`</tbody></table></div></div>`;
  C().innerHTML=h;
}
/* Un lote que está en el plano pero sin alta completa. */
const LOTE_ALTA_PENDIENTE = 'por_dar_de_alta';

function estadoBadge(e){
  const m={aprobado:['b-ok','Aprobado'],en_aprobacion:['b-pend','En aprobación'],anulado:['b-mora','Anulado'],borrador:['b-nod','Borrador']};
  const [c,l]=m[e]||['b-nod',e];return `<span class="badge ${c}">${l}</span>`;
}

/* ============================================================ CLIENTES */
function renderClientes(){
  /* «Clientes · 0» con 148 contratos no es un dato: es que este rol no
     ve la tabla cliente (la base se la esconde a «consulta»). Se dice. */
  if(!DB.clientes.length && DB.contratos.length){
    C().innerHTML=`<div class="card"><div class="empty">
      <b>Tu rol no ve la ficha de los clientes.</b><br>
      Hay ${DB.contratos.length} contratos, pero los datos personales de sus titulares
      (nombre, DPI, teléfono) sólo los ven administración, ventas y cobranza.
      No falta información: está protegida.</div></div>`;
    return;
  }
  let h=`<div class="card"><div class="card-h"><h2>Clientes · ${DB.clientes.length}</h2>
    <input class="chip" style="min-width:220px" placeholder="Buscar por nombre o DPI…" oninput="filtrarClientes(this.value)"></div>
    <div class="card-b" style="padding:0"><table class="data" id="tblClientes"><thead><tr>
    <th>Cliente</th><th>DPI / CUI</th><th>Teléfono</th><th>Correo</th><th>Contratos</th></tr></thead><tbody>`;
  h+=filasClientes(''); h+=`</tbody></table></div></div>`;
  C().innerHTML=h;
}
function filasClientes(t){
  t=(t||'').toLowerCase();
  const list=DB.clientes.filter(c=>!t||`${c.nombre} ${c.apellido} ${c.dpi}`.toLowerCase().includes(t));
  if(!list.length)return `<tr><td colspan="5" class="empty">Sin clientes que coincidan</td></tr>`;
  return list.map(c=>{
    const cts=DB.contratos.filter(x=>x.clienteId===c.id);
    return `<tr class="click" onclick="abrirCliente('${c.id}')">
      <td><b>${esc(c.nombre)} ${esc(c.apellido)}</b></td><td>${esc(c.dpi)||'<span class="muted">—</span>'}</td>
      <td>${esc(c.telefono)||'—'}</td><td>${esc(c.email)||'—'}</td>
      <td>${cts.map(x=>`<span class="pill">${x.no}</span>`).join(' ')||'—'}</td></tr>`;
  }).join('');
}
function filtrarClientes(t){document.querySelector('#tblClientes tbody').innerHTML=filasClientes(t);}

/* ============================================================ COTIZADOR */
let cot={lote:null,precio:0,enganche:ENGANCHE_MIN,plazo:60,cliente:''};
/* Los datos que van en cualquiera de las dos hojas. */
function datosCotizacion(){
  return { lote:cot.lote, precio:cot.precio,
           enganche:+cot.enganche||ENGANCHE_MIN, plazo:+cot.plazo||60,
           cliente:cot.cliente, telefono:cot.telefono,
           vendedor:(window.__user?window.__user.name:''),
           ingreso:+cot.ingreso||0 };
}
function doHoja(tipo){ abrirHoja(tipo, datosCotizacion()); }
/* El cliente debe recibir UN archivo, no una ristra de mensajes. Un PDF
   se guarda, se reenvía al esposo y se lleva al banco.

   Cuando el hub esté desplegado, este botón lo manda solo: el endpoint
   /cotizacion/whatsapp arma el PDF con pdfkit y lo envía como documento.
   Mientras tanto abre la hoja lista para guardar como PDF y deja el
   mensaje copiado. Antes fallaba en silencio contra una URL que no
   existe. */
function doCompartirPDF(){
  const d=datosCotizacion();
  if(window.API_URL && d.telefono){ enviarCotizacionWhatsApp(d); return; }
  compartirCotizacionPDF(d);
}

/* Se conserva el envío automático para cuando el hub esté arriba. */
function doWhatsAppCot(){
  const d=datosCotizacion();
  if(!d.telefono){ toast('Anota el teléfono del cliente para poder enviarle el PDF'); return; }
  if(!window.API_URL){
    toast('El envío automático necesita el hub desplegado. Por ahora: «Compartir PDF por WhatsApp».', 7000, true);
    return;
  }
  enviarCotizacionWhatsApp(d);
}

function renderCotizador(){
  const disp=DB.lotes.filter(l=>l.estado==='disponible'&&l.precio>0)
                     .sort((a,b)=>claveDe(a).localeCompare(claveDe(b)));

  /* El cotizador identificaba el lote por su CÓDIGO, y 97 códigos
     existen en dos fases. La lista mostraba el precio del lote de
     verdad, pero al elegirlo getLote() recibía «A-01» a secas,
     encontraba dos y devolvía el primero: la etiqueta decía Q70,051 y
     el precio saltaba a Q55,000, el del A-01 de la otra fase. Quien
     cotizaba se llevaba el número equivocado, y «Convertir en venta»
     lo arrastraba al contrato.

     La clave (fase·código) es la que manda, igual que en la pantalla
     de nueva venta. Y la fase va en la etiqueta: con dos A-01 en la
     lista, quien elige también tiene que poder distinguirlos. */
  const claves = new Set(disp.map(claveDe));
  if(cot.lote!=='__libre' && !claves.has(cot.lote)){
    /* O es la primera vez, o el lote que estaba elegido ya se vendió y
       salió de la lista. En ese caso el <select> mostraba la primera
       opción como si fuera la elegida mientras cot.precio seguía
       apuntando al lote viejo. */
    if(disp.length){ cot.lote=claveDe(disp[0]); cot.precio=disp[0].precio; }
    else { cot.lote=null; }
  }
  const loteSel = cot.lote!=='__libre' ? getLote(cot.lote) : null;
  const avisoLote = loteSel && loteSel.estado!=='disponible'
    ? `<div class="aviso-err" style="margin-top:8px">Este lote está <b>${esc(loteSel.estado)}</b>: la cotización es orientativa, no se puede convertir en venta.</div>` : '';
  const paso=(n,t)=>`<div class="paso"><span class="paso-n">${n}</span><span>${t}</span></div>`;
  let h=`<div class="cot">
    <div class="cot-form card">
      <div class="card-h"><h2>Cotización</h2><span class="hint">Cinco pasos · el resumen se actualiza solo</span></div>
      <div class="card-b">
        ${paso(1,'Prospecto')}
        <div class="field" style="margin-bottom:12px"><label>Nombre (opcional)</label>
          <input id="ct-cli" value="${esc(cot.cliente)}" placeholder="Nombre del prospecto" oninput="cot.cliente=this.value"></div>
        ${paso(2,'Lote')}
        <div class="field" style="margin-bottom:12px"><label>Lote</label>
          <select id="ct-lote" onchange="cotLote(this.value)">
            ${disp.map(l=>`<option value="${esc(claveDe(l))}" ${claveDe(l)===cot.lote?'selected':''}>${l.codigo}${l.fase?` · ${l.fase}`:''} · ${l.area} m² · ${Qk(l.precio)}</option>`).join('')}
            <option value="__libre" ${cot.lote==='__libre'?'selected':''}>— Precio libre —</option>
          </select>${avisoLote}</div>
        <div class="field" style="margin-bottom:12px"><label>Precio de venta (Q)</label>
          <input id="ct-precio" type="number" value="${cot.precio}" oninput="cot.precio=+this.value||0;pintarCot()">
          <div class="hint" id="ct-precio-fmt">${Q(cot.precio)}</div></div>
        ${paso(3,'Enganche')}
        <div class="field" style="margin-bottom:4px"><label>Enganche (Q) · mínimo ${Qk(ENGANCHE_MIN)}</label>
          <input id="ct-eng" type="number" min="${ENGANCHE_MIN}" value="${cot.enganche}" oninput="cot.enganche=+this.value||0;pintarCot()"></div>
        <div class="cot-quick">${[2500,5000,10000,20000].map(v=>
          `<button class="chip" onclick="cot.enganche=${v};renderCotizador()">${Qk(v)}</button>`).join('')}</div>
        ${paso(4,'Plazo')}
        <div class="field" style="margin:4px 0 4px"><label>Plazo</label>
          <select id="ct-plazo" onchange="cot.plazo=+this.value;pintarCot()">
            ${PLAZOS.map(p=>`<option value="${p}" ${p===cot.plazo?'selected':''}>${p} meses (${(p/12).toFixed(0)} años)</option>`).join('')}
          </select></div>
        <div class="hint">Tasa ${(TASA_MENSUAL*100).toFixed(1)}% mensual sobre el saldo financiado.</div>
      </div>
    </div>
    <div class="cot-res" id="cotRes"></div>
  </div>`;
  C().innerHTML=h; pintarCot();
}
function cotLote(v){
  cot.lote=v;
  if(v!=='__libre'){const l=getLote(v); if(l)cot.precio=l.precio;}
  renderCotizador();
}
function pintarCot(){
  if(cot.enganche<ENGANCHE_MIN) cot.enganche=ENGANCHE_MIN;
  const p=planFinanciamiento(cot.precio,cot.enganche,cot.plazo);
  const l=cot.lote!=='__libre'?getLote(cot.lote):null;
  let h=`<div class="cot-card">
    <div class="cot-top">
      <div class="cot-lbl">Cuota mensual</div>
      <div class="cot-big">${Q(p.cuota)}</div>
      <div class="cot-sub">${p.plazo} pagos mensuales</div>
    </div>
    <div class="cot-body">
      ${l?`<div class="cot-row"><span>Lote</span><b>${l.codigo} · ${l.area} m²</b></div>`:''}
      <div class="cot-row"><span>Precio de venta</span><b>${Q(p.precio)}</b></div>
      <div class="cot-row"><span>Enganche (cuota inicial)</span><b>${Q(p.enganche)}</b></div>
      <div class="cot-row"><span>Saldo a financiar</span><b>${Q(p.saldo)}</b></div>
      <div class="cot-row"><span>Plazo</span><b>${p.plazo} meses</b></div>
      <div class="cot-row tot"><span>Total del plan</span><b>${Q(p.total)}</b></div>
    </div>
    <div class="cot-body" style="border-top:1px solid var(--line)">
      <div class="cot-row"><span>Saldo financiado</span><b>${Q(p.saldo)}</b></div>
      <div class="cot-row"><span>Tasa aplicada</span><b>${(TASA_MENSUAL*100).toFixed(1)}% mensual</b></div>
      <div class="cot-row"><span>Intereses del plan</span><b>${Q(p.total-p.precio)}</b></div>
    </div>
    <div class="cot-acc">
      <div class="paso" style="margin-bottom:8px"><span class="paso-n">5</span><span>Resumen y compartir</span></div>
      <button class="btn btn-primary" onclick="doHoja('cliente')">Generar cotización</button>
      <button class="btn btn-ghost" onclick="doCompartirPDF()">WhatsApp</button>
      <button class="btn btn-ghost" onclick="doHoja('interna')">Hoja interna</button>
      <button class="btn btn-ghost" onclick="cotCompartir()">Copiar resumen</button>
      <button class="btn btn-ghost" onclick="window.print()">Imprimir</button>
      ${(l&&l.estado==='disponible')?`<button class="btn btn-gold" onclick="cotVender()">Convertir en venta →</button>`:''}
    </div>
  </div>`;
  // comparativa de plazos
  h+=`<div class="card"><div class="card-h"><h2>Compara los plazos</h2></div>
    <div class="card-b" style="padding:0"><table class="data"><thead><tr>
    <th>Plazo</th><th class="num">Cuota mensual</th><th class="num">Total del plan</th></tr></thead><tbody>`;
  PLAZOS.forEach(n=>{const q=planFinanciamiento(cot.precio,cot.enganche,n);
    h+=`<tr class="click ${n===cot.plazo?'cot-sel':''}" onclick="cot.plazo=${n};renderCotizador()">
      <td><b>${n} meses</b></td><td class="num">${Q(q.cuota)}</td>
      <td class="num">${Qk(q.total)}</td></tr>`;});
  h+=`</tbody></table></div></div>`;
  document.getElementById('cotRes').innerHTML=h;
}
function cotCompartir(){
  const p=planFinanciamiento(cot.precio,cot.enganche,cot.plazo);
  const l=cot.lote!=='__libre'?getLote(cot.lote):null;
  const txt=`*La Esperanza Residencial*\n`+
    (cot.cliente?`Cotización para ${cot.cliente}\n`:'')+
    (l?`Lote ${l.codigo} · ${l.area} m²\n`:'')+
    `\nPrecio: ${Q(p.precio)}\nEnganche: ${Q(p.enganche)}\n`+
    `Plazo: ${p.plazo} meses\n*Cuota mensual: ${Q(p.cuota)}*\n`+
    `Total del plan: ${Q(p.total)}\n\nSOL Desarrollos`;
  window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank');
  toast('Cotización lista para enviar');
}
function cotVender(){
  if(cot.lote==='__libre'){toast('Elige un lote real para crear la venta');return;}
  modalNuevoContrato(cot.lote,{enganche:cot.enganche,plazo:cot.plazo,nombre:cot.cliente});
}

/* ============================================================ AGENDA DE COBRANZA */
let agSemana=0;   // 0 = esta semana, 1 = la siguiente…
const HOY_D = ()=>new Date(HOY_ISO+'T00:00:00');
const isoMas = (base,n)=>{const d=new Date(base+'T00:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
const diasEnt = (a,b)=>Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/86400000);

function renderAgenda(){
  /* El calendario ya no es un archivo: sale de los giros de la base.
     Si no hay ni una cuota es porque no hay contratos con plan, no
     porque falte un archivo — y eso se dice abajo, en su lugar. */
  const desde=isoMas(HOY_ISO, agSemana*7);
  const hasta=isoMas(desde,6);
  /* Una sola vez: calendario() recorre los 5,550 giros y acá se pedía
     dos veces por dibujado. */
  const cal=calendario();
  const sem=cal.filter(c=>c.f>=desde&&c.f<=hasta);
  const vencidas=cal.filter(c=>c.f<HOY_ISO);
  const monto=sem.reduce((s,c)=>s+c.m,0);

  let h=`<div class="kpis">
    <div class="kpi"><div class="kpi-label">Cuotas de la semana</div><div class="kpi-value">${sem.length}</div>
      <div class="kpi-sub">${fmtD(desde)} al ${fmtD(hasta)}</div></div>
    <div class="kpi accent"><div class="kpi-label">Por cobrar</div><div class="kpi-value sm">${Qk(monto)}</div>
      <div class="kpi-sub">esta semana</div></div>
    <div class="kpi warn"><div class="kpi-label">Vencidas acumuladas</div><div class="kpi-value">${vencidas.length}</div>
      <div class="kpi-sub">${Qk(vencidas.reduce((s,c)=>s+c.m,0))}</div></div>
    <div class="kpi"><div class="kpi-label">Contratos en el plan</div><div class="kpi-value">${new Set(cal.map(c=>c.c)).size}</div>
      <div class="kpi-sub">${cal.length} cuotas programadas</div></div>
  </div>`;

  h+=`<div class="card"><div class="card-b" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-ghost btn-sm" onclick="agSemana--;renderAgenda()">← Semana anterior</button>
    <b style="color:var(--dark)">${agSemana===0?'Esta semana':(agSemana===1?'Próxima semana':'Semana '+(agSemana+1))}</b>
    <button class="btn btn-ghost btn-sm" onclick="agSemana++;renderAgenda()">Semana siguiente →</button>
    ${agSemana!==0?'<button class="btn btn-ghost btn-sm" onclick="agSemana=0;renderAgenda()">Volver a hoy</button>':''}
    <span style="margin-left:auto" class="hint">Toca una fila para copiar el mensaje</span>
  </div></div>`;

  // agrupado por día
  const porDia={};
  sem.forEach(c=>{(porDia[c.f]=porDia[c.f]||[]).push(c);});
  const dias=Object.keys(porDia).sort();
  if(!dias.length) h+=`<div class="card"><div class="empty">No hay cuotas programadas esta semana.</div></div>`;
  dias.forEach(f=>{
    const lista=porDia[f], mt=lista.reduce((s,c)=>s+c.m,0);
    const dif=diasEnt(HOY_ISO,f);
    const etiqueta = dif===0?'HOY':(dif===1?'mañana':(dif<0?`hace ${-dif} días`:`en ${dif} días`));
    h+=`<div class="card"><div class="card-h">
      <h2>${(d=>d.charAt(0).toUpperCase()+d.slice(1))(lista[0].d||diaSemana(f))} ${fmtD(f)}
        <span class="pill" style="margin-left:8px">${etiqueta}</span></h2>
      <div><b>${lista.length} cuota(s)</b> · ${Qk(mt)}</div></div>
      <div class="card-b" style="padding:0"><table class="data"><thead><tr>
      <th>Contrato</th><th>Cliente</th><th>Teléfono</th><th>Lote</th><th>Cuota</th>
      <th class="num">Monto</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>`;
    lista.forEach(c=>{
      const ct=indices().contratosPorNo.get(String(c.c)); const tel=(ct&&ct.tel||'').replace(/\D/g,'');
      const wa=tel?`https://wa.me/${tel.length===8?'502'+tel:tel}?text=${encodeURIComponent(mensajeRecordatorio(c))}`:'';
      h+=`<tr>
        <td><b>${c.c}</b></td><td>${esc(c.n)}</td><td>${tel?esc(ct.tel):'<span class="hint">Sin teléfono</span>'}</td><td>${c.l}</td>
        <td>${c.q}/${c.p}</td><td class="num">${Q(c.m)}</td>
        <td>${c.r?'<span class="badge b-mora">Vencida</span>':(c.f<HOY_ISO?'<span class="badge b-pend">Vencida</span>':'<span class="badge b-info">Próxima</span>')}</td>
        <td class="acciones">
          ${wa?`<a class="btn btn-primary btn-sm" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>`:''}
          <button class="btn btn-ghost btn-sm" onclick="copiarRecordatorio('${c.c}','${c.f}')">Copiar mensaje</button>
          ${ct?`<button class="btn btn-ghost btn-sm" onclick="modalGestion('${ct.id}')">Marcar seguimiento</button>`:''}
        </td></tr>`;});
    h+=`</tbody></table></div></div>`;
  });
  C().innerHTML=h;
}

/* Redacta el recordatorio según el momento y lo copia al portapapeles. */
function mensajeRecordatorio(c){
  const nombre=String(c.n||'').split(' ')[0];
  const dif=diasEnt(HOY_ISO,c.f);
  const fecha=new Date(c.f+'T00:00:00').toLocaleDateString('es-GT',{day:'2-digit',month:'long'});
  /* El pago es por transferencia o depósito a la cuenta recaudadora,
     no por Recurrente: ese enlace era de otra operación y mandaba al
     cliente a pagar a otro lado. */
  const cta=CUENTAS_COBRO[0];
  const pago=`Puede pagar por transferencia o depósito en Banrural:\n*Cuenta ${cta.tipo.toLowerCase()} ${cta.numero}*\nA nombre de *${cta.dueno}*\n\nDespués de pagar, envíenos la foto de la boleta por este medio.`;
  if(dif>0) return `Hola ${nombre}, le saluda La Esperanza 🌿\n\nLe recordamos su cuota ${c.q}/${c.p} del lote ${c.l} por *${Q(c.m)}*, con fecha de pago el *${fecha}*.\n\n${pago}\n\nGracias por su puntualidad.`;
  if(dif===0) return `Hola ${nombre}, hoy vence su cuota ${c.q}/${c.p} del lote ${c.l} por *${Q(c.m)}*.\n\n${pago}`;
  return `Hola ${nombre}, notamos que su cuota ${c.q}/${c.p} del lote ${c.l} por ${Q(c.m)} sigue pendiente.\n\nA partir del vencimiento corre una mora del 2% mensual.\n\n${pago}\n\nSi tiene alguna dificultad, escríbanos — buscamos la manera de ayudarle.`;
}
function copiarRecordatorio(contrato,fecha){
  const c=calendario().find(x=>x.c===contrato&&x.f===fecha); if(!c)return;
  const txt=mensajeRecordatorio(c);
  const fin=()=>toast('Mensaje de '+esc(c.n).split(' ')[0]+' copiado ✓');
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(fin).catch(()=>modalMensaje(txt));
  else modalMensaje(txt);
}
function modalMensaje(txt){
  openModal(`<div class="modal-h"><h3>Mensaje de cobranza</h3><p>Cópialo y pégalo en WhatsApp</p></div>
    <div class="modal-b"><div class="wa"><div class="wa-b bot" style="max-width:100%">${esc(txt).replace(/\n/g,'<br>')}</div></div></div>
    <div class="modal-f"><button class="btn btn-primary" onclick="closeModal()">Listo</button></div>`);
}



/* ============================================================ CUADRE BANCARIO
   La pantalla de Edwin y David.

   Edwin sube el estado de cuenta y resuelve a quién le pertenece
   cada depósito. David confirma. Ninguno hace las dos cosas: el
   sistema lo impide, no es una regla de buena voluntad.

   Lo que se buscó al diseñarla: que la mayor parte del tiempo
   Edwin no tenga que decidir nada — solo revisar lo que ya se
   resolvió solo y atender los pocos casos con duda real. */
let cnTab='resolver';

function esFinanciero(){
  const p=DB.equipo.find(x=>x.nombre===(window.__user?window.__user.name:''));
  return ROLE==='admin' || (p && (p.rol==='financiero'||p.rol==='confirmacion'));
}

function renderConciliacion(){
  const R=correrConciliacion();
  const pendientes=R.ambiguos.length+R.revisar.length+R.huerfanos.length;

  let h=`<div class="kpis">
    <div class="kpi"><div class="kpi-label">Depósitos sin aplicar</div><div class="kpi-value">${R.total}</div>
      <div class="kpi-sub">${Qk(R.montoDepositado)} en el banco</div></div>
    <div class="kpi accent"><div class="kpi-label">Se resolvieron solos</div><div class="kpi-value">${R.automaticos.length}</div>
      <div class="kpi-sub">${Math.round(R.automatizable*100)}% de lo que entró</div></div>
    <div class="kpi warn"><div class="kpi-label">Necesitan que decidas</div><div class="kpi-value">${pendientes}</div>
      <div class="kpi-sub">ambiguos, parciales y huérfanos</div></div>
    <div class="kpi"><div class="kpi-label">Esperan a David</div><div class="kpi-value">${R.pendConfirmar.length}</div>
      <div class="kpi-sub">${Qk(R.montoConfirmado)} ya confirmado</div></div>
  </div>`;

  h+=`<div class="card"><div class="card-b" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    ${[['resolver','Por resolver ('+pendientes+')'],
       ['sugeridos','Listos para aplicar ('+(R.automaticos.length+R.sugeridos.length)+')'],
       ['confirmar','Por confirmar ('+R.pendConfirmar.length+')'],
       ['faltantes','Sin depósito ('+R.sinDeposito.length+')'],
       ['importar','Subir estado de cuenta']]
      .map(([k,l])=>`<button class="btn btn-sm ${cnTab===k?'btn-primary':'btn-ghost'}" onclick="cnTab='${k}';renderConciliacion()">${l}</button>`).join('')}
  </div></div>`;

  if(cnTab==='importar')       h+=vistaImportar();
  else if(cnTab==='sugeridos') h+=vistaSugeridos(R);
  else if(cnTab==='confirmar') h+=vistaPorConfirmar(R);
  else if(cnTab==='faltantes') h+=vistaSinDeposito(R);
  else                         h+=vistaPorResolver(R);

  C().innerHTML=h;
}

/* --- Subir el estado de cuenta --- */
function vistaImportar(){
  return `<div class="card"><div class="card-h"><h2>Estado de cuenta de Banrural</h2>
      <div class="hint">Pega aquí lo que descargues de la banca en línea</div></div>
    <div class="card-b">
      <div class="field"><label>Cuenta</label>
        <select id="cnCuenta">${opcionesCuenta()}
          <option>Banco Industrial</option></select></div>
      <div class="field"><label>Pega el contenido (CSV, o copiado de Excel)</label>
        <textarea id="cnTexto" rows="9" placeholder="Fecha,Documento,Descripcion,Credito
06/08/2026,65813833,DEPOSITO,1393.51
07/08/2026,835716978,TRANSFERENCIA,2902.00"></textarea></div>
      <div class="hint" style="margin-bottom:12px">Reconozco las columnas por el nombre del encabezado — sirve <b>fecha</b>, <b>monto</b> o <b>crédito</b>, <b>documento</b> o <b>referencia</b>. Los cargos se ignoran: solo entran los abonos. Si subes dos veces el mismo archivo, no se duplica.</div>
      <button class="btn btn-primary" onclick="doImportarEstado()">Leer y cargar</button>
      ${(DB.movimientos||[]).length?`<span class="hint" style="margin-left:12px">${DB.movimientos.length} movimiento(s) cargados</span>`:''}
    </div></div>`;
}
async function doImportarEstado(){
  const t=document.getElementById('cnTexto').value;
  const r=leerEstadoCuenta(t);
  if(r.error){toast(r.error);return;}
  if(!r.movimientos.length){toast('No encontré ningún abono en lo que pegaste');return;}
  const imp=await importarMovimientos(r.movimientos, document.getElementById('cnCuenta').value);
  toast(`${imp.nuevos} movimiento(s) cargados${imp.repetidos?' · '+imp.repetidos+' ya estaban':''}`);
  cnTab='resolver'; renderConciliacion();
}

/* --- Lo que se resolvió solo --- */
function vistaSugeridos(R){
  const todos=[...R.automaticos,...R.sugeridos];
  if(!todos.length) return `<div class="card"><div class="empty">No hay depósitos resueltos pendientes de aplicar.</div></div>`;
  let h='';
  if(R.automaticos.length)
    h+=`<div class="card"><div class="card-b" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="doAplicarTodo()">Aplicar los ${R.automaticos.length} que calzan por referencia</button>
      <span class="hint">Solo estos: la referencia del banco coincide con la del cliente. Los demás los decides tú.</span>
    </div></div>`;
  else
    h+=`<div class="hint" style="margin-bottom:14px">Ninguno calza por número de referencia, así que ninguno se aplica solo. Los de abajo coinciden en monto y fecha — es indicio, no prueba. Revísalos antes de aplicar.</div>`;
  h+=`<div class="card"><div class="card-b" style="padding:0"><table class="data"><thead><tr>
    <th>Fecha</th><th>Referencia</th><th class="num">Monto</th><th>Se aplica a</th><th>Por qué</th><th></th></tr></thead><tbody>`;
  todos.forEach(s=>{
    const d=repartir(s.libre,s.cuota.c);
    h+=`<tr><td>${fmtD(s.mov.fecha)}</td><td>${esc(s.mov.ref||'—')}</td><td class="num">${Q(s.libre)}</td>
      <td><b>${s.cuota.c}</b> · ${esc(s.cuota.n)}<div class="hint">lote ${s.cuota.l} · ${d.partes.length>1?d.partes.length+' cuotas':'cuota '+s.cuota.q+'/'+s.cuota.p}${d.sobrante>0.009?' · sobran '+Q(d.sobrante):''}</div></td>
      <td>${viaTexto(s.via)}<div class="hint">${s.nota||''}</div></td>
      <td><button class="btn ${s.confianza>=0.9?'btn-primary':'btn-ghost'} btn-sm" onclick="doAplicarUno('${s.mov.id}','${s.cuota.c}')">Aplicar</button></td></tr>`;});
  h+=`</tbody></table></div></div>`;
  return h;
}
const viaTexto = v => ({referencia:'<span class="badge b-ok">Referencia coincide</span>',
  monto_fecha:'<span class="badge">Monto y fecha únicos</span>',
  parcial:'<span class="badge b-pend">Monto parcial</span>'}[v]||'<span class="badge">'+esc(v||'')+'</span>');

async function doAplicarTodo(){
  const r=await aplicarTodoSugerido();
  toast(`${r.aplicados} depósito(s) aplicados${r.fallos.length?' · '+r.fallos.length+' con problema':''}`);
  renderConciliacion();
}
async function doAplicarUno(movId,contrato){
  const mov=DB.movimientos.find(m=>mismoId(m.id,movId));
  const d=repartir(saldoLibre(mov),contrato);
  if(!d.partes.length){toast('Ese contrato ya no tiene cuotas pendientes');return;}
  try{ await aplicarConciliacion({movimientoId:movId,asignaciones:d.partes,via:'manual'});
       toast('Aplicado · queda esperando a David'); }
  catch(e){ toast(e.message); }
  renderConciliacion();
}

/* --- Lo que necesita una persona --- */
function vistaPorResolver(R){
  const items=[...R.ambiguos,...R.revisar,...R.huerfanos];
  if(!items.length) return `<div class="card"><div class="empty">Nada pendiente de resolver. Todo lo que entró tiene dueño.</div></div>`;
  let h='';
  items.forEach(s=>{
    const etiqueta={ambiguo:'<span class="badge b-pend">Varios candidatos</span>',
                    revisar:'<span class="badge b-pend">Revisar</span>',
                    huerfano:'<span class="badge b-mora">Sin dueño</span>'}[s.estado];
    h+=`<div class="card"><div class="card-h">
      <h2>${Q(s.libre)} · ${fmtD(s.mov.fecha)} ${etiqueta}</h2>
      <div class="hint">${s.mov.ref?'Ref '+esc(s.mov.ref):'sin referencia'}${s.mov.descripcion?' · '+esc(s.mov.descripcion):''}</div></div>
      <div class="card-b">
      <p class="hint" style="margin-bottom:12px">${esc(s.nota||'')}</p>`;

    if(s.candidatos&&s.candidatos.length){
      h+=`<table class="data"><thead><tr><th>Contrato</th><th>Cliente</th><th>Lote</th>
        <th>Cuota</th><th class="num">Debe</th><th>Señales</th><th></th></tr></thead><tbody>`;
      s.candidatos.slice(0,8).forEach(c=>{
        const q=c.cuota;
        h+=`<tr><td><b>${q.c}</b></td><td>${esc(q.n)}</td><td>${q.l}</td><td>${q.q}/${q.p}</td>
          <td class="num">${Q(q.m)}</td><td class="hint">${c.señales.join(' · ')||'—'}</td>
          <td><button class="btn btn-primary btn-sm" onclick="doAsignar('${s.mov.id}','${q.c}','${q.f}')">Es de este</button></td></tr>`;});
      h+=`</tbody></table>`;
    }
    h+=`<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="doBuscarContrato('${s.mov.id}')">Buscar otro contrato</button>
        <button class="btn btn-ghost btn-sm" onclick="doMarcarAjeno('${s.mov.id}')">No es de La Esperanza</button>
      </div></div></div>`;});
  return h;
}

function doAsignar(movId,contrato,vence){
  const mov=DB.movimientos.find(m=>mismoId(m.id,movId));
  const libre=saldoLibre(mov);
  const d=repartir(libre,contrato);
  const resumen=d.partes.map(p=>`cuota ${p.cuota} · ${Q(p.monto)}${p.completa?'':' (parcial)'}`).join('<br>');
  openModal(`<div class="modal-h"><h3>Aplicar ${Q(libre)} a ${contrato}</h3>
      <p>Así se repartiría entre sus cuotas pendientes</p></div>
    <div class="modal-b">
      <div class="hint" style="margin-bottom:10px">${resumen||'Sin cuotas pendientes'}</div>
      ${d.sobrante>0.009?`<div class="hint">Sobrarían <b>${Q(d.sobrante)}</b> sin aplicar — quedan disponibles en el depósito.</div>`:''}
      <div class="field" style="margin-top:12px"><label>Nota (por qué decidiste esto)</label>
        <input id="cnNota" placeholder="Ej. el cliente confirmó por WhatsApp"></div>
      <div class="hint">Queda <b>conciliado</b>, no confirmado. Lo confirma el financiero.</div>
    </div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="doAsignarOk('${movId}','${contrato}')">Aplicar</button></div>`);
}
async function doAsignarOk(movId,contrato){
  const mov=DB.movimientos.find(m=>mismoId(m.id,movId));
  const d=repartir(saldoLibre(mov),contrato);
  try{ await aplicarConciliacion({movimientoId:movId,asignaciones:d.partes,via:'manual',
        nota:document.getElementById('cnNota').value.trim()});
       closeModal(); toast('Aplicado · queda esperando confirmación'); }
  catch(e){ toast(e.message); }
  renderConciliacion();
}
function doBuscarContrato(movId){
  openModal(`<div class="modal-h"><h3>Buscar contrato</h3><p>Escribe el número, el lote o el nombre</p></div>
    <div class="modal-b"><div class="field"><input id="cnBusca" placeholder="SD-34, G-05, Rosa..." oninput="cnResultados('${movId}')"></div>
      <div id="cnLista"></div></div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cerrar</button></div>`);
  setTimeout(()=>document.getElementById('cnBusca').focus(),50);
}
function cnResultados(movId){
  const t=document.getElementById('cnBusca').value.trim().toLowerCase();
  const L=document.getElementById('cnLista');
  if(t.length<2){L.innerHTML='';return;}
  const vistos={};
  calendario().forEach(c=>{
    if(vistos[c.c])return;
    if(String(c.c).toLowerCase().includes(t)||String(c.l).toLowerCase().includes(t)||String(c.n).toLowerCase().includes(t))
      vistos[c.c]=c;});
  const arr=Object.values(vistos).slice(0,10);
  L.innerHTML=arr.length?`<table class="data"><tbody>${arr.map(c=>
    `<tr><td><b>${c.c}</b></td><td>${esc(c.n)}</td><td>${c.l}</td>
     <td><button class="btn btn-primary btn-sm" onclick="closeModal();doAsignar('${movId}','${c.c}','${c.f}')">Elegir</button></td></tr>`).join('')}</tbody></table>`
    :`<div class="empty">Sin resultados</div>`;
}
function doMarcarAjeno(movId){
  const m=DB.movimientos.find(x=>mismoId(x.id,movId)); if(!m)return;
  m.ajeno=true; saveDB();
  toast('Marcado como ajeno a La Esperanza');
  renderConciliacion();
}

/* --- La bandeja de David --- */
function vistaPorConfirmar(R){
  if(!R.pendConfirmar.length) return `<div class="card"><div class="empty">No hay nada esperando confirmación.</div></div>`;
  const puedo=esFinanciero();
  let h=`<div class="hint" style="margin-bottom:14px">${puedo
    ? 'Al confirmar, el pago entra a la cartera del contrato. No se puede deshacer después.'
    : 'Solo el financiero puede confirmar. Aquí ves el estado de lo que conciliaste.'}</div>`;
  h+=`<div class="card"><div class="card-b" style="padding:0"><table class="data"><thead><tr>
    <th>Fecha</th><th>Contrato</th><th>Cliente</th><th>Cuota</th><th class="num">Monto</th>
    <th>Referencia</th><th>Concilió</th><th></th></tr></thead><tbody>`;
  R.pendConfirmar.forEach(k=>{
    const mio=k.conciliadoPor===(window.__user?window.__user.name:'');
    h+=`<tr><td>${fmtD(k.fecha)}</td><td><b>${k.contrato}</b></td><td>${esc(k.cliente)}</td>
      <td>${fmtD(k.vence)}${k.completa?'':' <span class="badge b-pend">parcial</span>'}</td>
      <td class="num">${Q(k.monto)}</td><td>${esc(k.ref||'—')}</td>
      <td>${esc(k.conciliadoPor)}${k.nota?'<div class="hint">'+esc(k.nota)+'</div>':''}</td>
      <td>${puedo&&!mio
        ? `<button class="btn btn-primary btn-sm" onclick="doConfirmarCn('${k.id}',true)">Confirmar</button>
           <button class="btn btn-ghost btn-sm" onclick="doConfirmarCn('${k.id}',false)">Rechazar</button>`
        : (mio?'<span class="hint">lo conciliaste tú</span>':'<span class="hint">—</span>')}</td></tr>`;});
  h+=`</tbody></table></div></div>`;
  return h;
}
async function doConfirmarCn(id,ok){
  try{ await confirmarConciliacion(id,ok); toast(ok?'Confirmado · entró a la cartera':'Rechazado'); }
  catch(e){ toast(e.message); }
  renderConciliacion();
}

/* --- Cuotas de las que no entró nada --- */
function vistaSinDeposito(R){
  if(!R.sinDeposito.length) return `<div class="card"><div class="empty">Todas las cuotas del período tienen su depósito.</div></div>`;
  const total=R.sinDeposito.reduce((t,c)=>t+c.m,0);
  let h=`<div class="hint" style="margin-bottom:14px">Cuotas que vencieron entre ${fmtD(R.desde)} y ${fmtD(R.hasta)} y de las que <b>no entró dinero</b> — ${Qk(total)} en total. Es el otro lado del cuadre.</div>`;
  h+=`<div class="card"><div class="card-b" style="padding:0"><table class="data"><thead><tr>
    <th>Vence</th><th>Contrato</th><th>Cliente</th><th>Lote</th><th>Cuota</th><th class="num">Monto</th><th>Estado</th></tr></thead><tbody>`;
  R.sinDeposito.slice(0,60).forEach(c=>{
    h+=`<tr><td>${fmtD(c.f)}</td><td><b>${c.c}</b></td><td>${esc(c.n)}</td><td>${c.l}</td>
      <td>${c.q}/${c.p}</td><td class="num">${Q(c.m)}</td>
      <td>${c.r?'<span class="badge b-mora">Venía en mora</span>':'<span class="badge b-pend">Sin pago</span>'}</td></tr>`;});
  h+=`</tbody></table></div></div>`;
  if(R.sinDeposito.length>60) h+=`<div class="hint">Se muestran las primeras 60 de ${R.sinDeposito.length}.</div>`;
  return h;
}

/* ============================================================ RECAUDACIÓN DE LA SEMANA
   Aquí se cierra el ciclo: Slack avisó qué vence, y aquí se
   registra qué pasó con cada cuota. Nada se da por cobrado solo
   por estar programado. */
let recSemana=0, recFiltro='pendiente';

function renderRecaudacion(){
  /* Antes preguntaba si CALENDARIO existía. datos-julio.js lo declara
     vacío justamente para que nada reviente, así que la respuesta era
     siempre «sí» y la pantalla seguía con cero cuotas y sin explicar
     por qué. La pregunta útil es si hay cuotas. */
  if(!calendario().length){
    C().innerHTML=`<div class="card"><div class="empty">No hay cuotas programadas.
      Se arman al crear contratos con plan de pagos.</div></div>`;return;}
  const desde=isoMas(HOY_ISO, recSemana*7), hasta=isoMas(desde,6);
  const R=resumenRecaudacion(desde,hasta);
  const pct=Math.round(R.efectividad*100);

  let h=`<div class="kpis">
    <div class="kpi"><div class="kpi-label">Programado</div><div class="kpi-value sm">${Qk(R.programado)}</div>
      <div class="kpi-sub">${R.filas.length} cuota(s) · ${fmtD(desde)} al ${fmtD(hasta)}</div></div>
    <div class="kpi accent"><div class="kpi-label">Recaudado</div><div class="kpi-value sm">${Qk(R.recaudado)}</div>
      <div class="kpi-sub">${pct}% de lo programado</div></div>
    <div class="kpi warn"><div class="kpi-label">Sin gestionar</div><div class="kpi-value">${R.pendientes.length}</div>
      <div class="kpi-sub">${Qk(R.pendientes.reduce((s,f)=>s+f.cuota.m,0))} sin marcar</div></div>
    <div class="kpi"><div class="kpi-label">Por confirmar</div><div class="kpi-value">${R.porConfirmar}</div>
      <div class="kpi-sub">esperan al financiero</div></div>
  </div>`;

  // barra de avance
  const anchoCob=R.programado?Math.min(100,R.recaudado/R.programado*100):0;
  h+=`<div class="card"><div class="card-b">
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
      <button class="btn btn-ghost btn-sm" onclick="recSemana--;renderRecaudacion()">← Semana anterior</button>
      <b style="color:var(--dark)">${recSemana===0?'Esta semana':(recSemana===-1?'Semana pasada':(recSemana===1?'Próxima semana':fmtD(desde)))}</b>
      <button class="btn btn-ghost btn-sm" onclick="recSemana++;renderRecaudacion()">Semana siguiente →</button>
      ${recSemana!==0?'<button class="btn btn-ghost btn-sm" onclick="recSemana=0;renderRecaudacion()">Volver a hoy</button>':''}
      <span style="margin-left:auto;display:flex;gap:6px">
        ${['pendiente','cobrada','no_cobrada','todas'].map(f=>
          `<button class="btn btn-sm ${recFiltro===f?'btn-primary':'btn-ghost'}" onclick="recFiltro='${f}';renderRecaudacion()">${
            {pendiente:'Sin gestionar',cobrada:'Cobradas',no_cobrada:'No cobradas',todas:'Todas'}[f]}</button>`).join('')}
      </span>
    </div>
    <div style="height:10px;border-radius:99px;background:#eceae4;overflow:hidden;display:flex">
      <div style="width:${anchoCob}%;background:var(--accent,#7a8b5a)"></div>
    </div>
    <div class="hint" style="margin-top:8px">${R.cobradas.length} cobrada(s) · ${R.noCobradas.length} no cobrada(s) · ${R.pendientes.length} sin gestionar</div>
  </div></div>`;

  const filas=R.filas.filter(f=>recFiltro==='todas'||f.estado===recFiltro)
                     .sort((a,b)=>a.cuota.f<b.cuota.f?-1:1);

  h+=`<div class="card"><div class="card-h"><h2>Cuotas de la semana</h2>
      <div class="hint">Marca lo que ocurrió con cada una</div></div>
    <div class="card-b" style="padding:0"><table class="data"><thead><tr>
    <th>Vence</th><th>Contrato</th><th>Cliente</th><th>Lote</th><th>Cuota</th>
    <th class="num">Monto</th><th>Estado</th><th>Acción</th></tr></thead><tbody>`;
  if(!filas.length) h+=`<tr><td colspan="8" class="empty">No hay cuotas en este filtro.</td></tr>`;
  filas.forEach(f=>{
    const c=f.cuota, r=f.reg;
    let est, acc;
    if(f.estado==='cobrada'){
      const pago=DB.pagos.find(p=>mismoId(p.id,r.pagoId));
      const eP=pago?pago.estado:'registrado';
      est=`<span class="badge b-ok">Cobrada</span>${eP==='confirmado'?' <span class="badge b-ok">Confirmada</span>':(eP==='rechazado'?' <span class="badge b-mora">Rechazada</span>':' <span class="badge">Por confirmar</span>')}
           <div class="hint">${esc(r.referencia||'sin boleta')} · ${Q(r.monto)}</div>`;
      acc=`<button class="btn btn-ghost btn-sm" onclick="deshacerRecaudo('${c.c}','${c.f}')">Deshacer</button>`;
    } else if(f.estado==='no_cobrada'){
      est=`<span class="badge b-mora">No cobrada</span>
           <div class="hint">${esc(motivoLabel(r.motivo))}${r.promesa?' · promete el '+fmtD(r.promesa):''}</div>`;
      acc=`<button class="btn btn-ghost btn-sm" onclick="deshacerRecaudo('${c.c}','${c.f}')">Deshacer</button>`;
    } else {
      est=c.r?'<span class="badge b-mora">Venía en mora</span>':'<span class="badge">Sin gestionar</span>';
      acc=`<button class="btn btn-primary btn-sm" onclick="modalCobro('${c.c}','${c.f}')">Cobrada</button>
           <button class="btn btn-ghost btn-sm" onclick="modalNoCobro('${c.c}','${c.f}')">No se cobró</button>`;
    }
    h+=`<tr><td>${fmtD(c.f)}</td><td><b>${c.c}</b></td><td>${esc(c.n)}</td><td>${c.l}</td>
      <td>${c.q}/${c.p}</td><td class="num">${Q(c.m)}</td><td>${est}</td><td>${acc}</td></tr>`;});
  h+=`</tbody></table></div></div>`;

  // Cierre de semana
  h+=`<div class="card"><div class="card-h"><h2>Cierre de la semana</h2></div><div class="card-b">
    <p class="hint" style="margin-bottom:12px">${R.pendientes.length
      ? `Faltan <b>${R.pendientes.length}</b> cuota(s) por gestionar. Cuando no quede ninguna sin marcar, se puede cerrar la semana y el resultado vuelve a Slack.`
      : 'Toda la semana está gestionada. Puedes publicar el cierre al canal de cobranza.'}</p>
    <button class="btn ${R.pendientes.length?'btn-ghost':'btn-primary'}" onclick="modalCierreSemana()">Ver el reporte de cierre</button>
  </div></div>`;
  C().innerHTML=h;
}

/* --- Registrar un cobro --- */
function modalCobro(contrato,fecha){
  const c=calendario().find(x=>x.c===contrato&&x.f===fecha); if(!c)return;
  openModal(`<div class="modal-h"><h3>Registrar cobro</h3>
      <p>${esc(c.n)} · lote ${c.l} · cuota ${c.q}/${c.p}</p></div>
    <div class="modal-b">
      <div class="field"><label>Monto recibido</label>
        <input id="rcMonto" type="number" step="0.01" value="${(Math.round(c.m*100)/100)}"></div>
      <div class="field"><label>Forma de pago</label>
        <select id="rcForma"><option>Depósito bancario</option><option>Transferencia</option>
          <option>Efectivo en sala de venta</option><option>Pago en línea</option></select></div>
      <div class="field"><label>Cuenta acreditada</label>
        <select id="rcCuenta">${opcionesCuenta()}</select></div>
      <div class="field"><label>No. de boleta o referencia</label>
        <input id="rcRef" placeholder="Ej. 4429871"></div>
      <div class="field"><label>Foto de la boleta *</label>
        <input id="rcFoto" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment">
        <div class="hint">JPG, PNG o PDF · máximo 5 MB. Sin la boleta el financiero no tiene contra qué confirmar.</div></div>
      <div class="field"><label>Nota (opcional)</label><input id="rcNota" placeholder=""></div>
      <div class="hint">Queda como <b>pago registrado</b>. Lo aplica a la cartera el financiero al confirmarlo — quien cobra no confirma su propio cobro.</div>
    </div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarCobro('${contrato}','${fecha}')">Registrar cobro</button></div>`);
}
async function guardarCobro(contrato,fecha){
  const monto=+document.getElementById('rcMonto').value;
  if(!(monto>0)){toast('El monto debe ser mayor que cero');return;}
  const ref=document.getElementById('rcRef').value.trim();
  if(!ref){toast('Anota el número de boleta o referencia');return;}
  const foto=(document.getElementById('rcFoto')||{}).files;
  const archivo=foto&&foto[0];
  if(!archivo){toast('Adjuntá la foto de la boleta: sin ella no se puede confirmar el pago',6000,true);return;}
  const r=await conBoton(async()=>{
    const reg=await marcarCobrada(contrato,fecha,{monto,
      forma:document.getElementById('rcForma').value,
      cuenta:document.getElementById('rcCuenta').value,
      referencia:ref, nota:document.getElementById('rcNota').value.trim()});
    if(!reg) return null;
    /* La boleta cuelga del pago. Si la subida falla, el pago ya quedó
       registrado y se dice: es mejor un pago sin foto que un cobro
       hecho dos veces por reintentar. */
    if(reg.pagoId && typeof hayBase==='function' && hayBase()){
      const a=await sbAdjuntar('pago', reg.pagoId, archivo, 'Boleta '+ref);
      if(!a.ok) toast('El cobro quedó registrado, pero la foto no subió: '+a.error+' · Subila desde el contrato.',9000,true);
    }
    return reg;
  });
  if(!r) return;                      // el motivo ya se mostró
  closeModal(); toast('Cobro registrado con su boleta · pendiente de confirmar ✓'); renderRecaudacion();
}

/* --- Registrar que no se cobró --- */
function modalNoCobro(contrato,fecha){
  const c=calendario().find(x=>x.c===contrato&&x.f===fecha); if(!c)return;
  openModal(`<div class="modal-h"><h3>No se cobró</h3>
      <p>${esc(c.n)} · lote ${c.l} · cuota ${c.q}/${c.p} · ${Q(c.m)}</p></div>
    <div class="modal-b">
      <div class="field"><label>¿Qué pasó?</label><select id="ncMotivo" onchange="ncToggle()">
        ${MOTIVOS_NO_COBRO.map(m=>`<option value="${m.id}">${m.label}</option>`).join('')}</select></div>
      <div class="field" id="ncPromesaBox" hidden><label>¿Para qué fecha prometió pagar?</label>
        <input id="ncPromesa" type="date" value="${isoMas(HOY_ISO,7)}"></div>
      <div class="field"><label>Detalle</label><input id="ncNota" placeholder="Lo que dijo el cliente"></div>
      <div class="hint">Esto no es burocracia: el motivo alimenta el resumen del lunes y decide a quién se escala.</div>
    </div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarNoCobro('${contrato}','${fecha}')">Guardar</button></div>`);
  ncToggle();
}
function ncToggle(){
  const m=document.getElementById('ncMotivo'); if(!m)return;
  document.getElementById('ncPromesaBox').hidden = m.value!=='promesa';
}
async function guardarNoCobro(contrato,fecha){
  const motivo=document.getElementById('ncMotivo').value;
  const r=await conBoton(()=>marcarNoCobrada(contrato,fecha,{motivo,
    nota:document.getElementById('ncNota').value.trim(),
    promesa: motivo==='promesa'?document.getElementById('ncPromesa').value:null}));
  if(!r) return;
  closeModal(); toast('Registrado'); renderRecaudacion();
}
async function deshacerRecaudo(contrato,fecha){
  await desmarcarCuota(contrato,fecha); toast('Marca deshecha'); renderRecaudacion();
}

/* --- Reporte de cierre: lo que vuelve a Slack --- */
function textoCierre(R){
  const l=[];
  l.push(`*✅ Cierre de cobranza · ${fmtD(R.desde)} al ${fmtD(R.hasta)}*`);
  l.push('');
  l.push(`• Programado: *${Qk(R.programado)}* en ${R.filas.length} cuota(s)`);
  l.push(`• Recaudado: *${Qk(R.recaudado)}* (${Math.round(R.efectividad*100)}%)`);
  l.push(`• Cobradas: ${R.cobradas.length} · No cobradas: ${R.noCobradas.length} · Sin gestionar: ${R.pendientes.length}`);
  if(R.porConfirmar) l.push(`• ${R.porConfirmar} pago(s) esperan confirmación del financiero`);
  l.push('');
  if(R.noCobradas.length){
    const porMotivo={};
    R.noCobradas.forEach(f=>{porMotivo[f.reg.motivo]=(porMotivo[f.reg.motivo]||0)+1;});
    l.push('*Por qué no se cobró:*');
    Object.keys(porMotivo).sort((a,b)=>porMotivo[b]-porMotivo[a])
      .forEach(m=>l.push(`• ${motivoLabel(m)} — ${porMotivo[m]}`));
    l.push('');
    const prom=R.noCobradas.filter(f=>f.reg.promesa);
    if(prom.length){
      l.push('*Promesas de pago a dar seguimiento:*');
      prom.sort((a,b)=>a.reg.promesa<b.reg.promesa?-1:1)
        .forEach(f=>l.push(`• ${f.cuota.n} (${f.cuota.c}) — ${Q(f.cuota.m)} el ${fmtD(f.reg.promesa)}`));
      l.push('');
    }
  }
  if(R.pendientes.length){
    l.push(`⚠️ *${R.pendientes.length} cuota(s) quedaron sin gestionar* por ${Qk(R.pendientes.reduce((s,f)=>s+f.cuota.m,0))}. Pasan al resumen del próximo lunes.`);
    l.push('');
  }
  l.push('_🌿 Suite Sol Inmobiliaria · generado desde la Recaudación de la semana_');
  return l.join('\n');
}
function modalCierreSemana(){
  const desde=isoMas(HOY_ISO,recSemana*7);
  const R=resumenRecaudacion(desde,isoMas(desde,6));
  const txt=textoCierre(R);
  openModal(`<div class="modal-h"><h3>Reporte de cierre</h3>
      <p>Esto es lo que se publica en #proy-la-esperanza-cobranza</p></div>
    <div class="modal-b"><div class="wa"><div class="wa-b bot" style="max-width:100%">${esc(txt).replace(/\n/g,'<br>')}</div></div></div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cerrar</button>
      <button class="btn btn-primary" onclick="copiarCierre()">Copiar el reporte</button></div>`);
  window.__cierreTxt=txt;
}
function copiarCierre(){
  const t=window.__cierreTxt||'';
  const fin=()=>toast('Reporte copiado ✓');
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(fin).catch(fin);
  else fin();
}

/* ============================================================ EQUIPO */
function renderEquipo(){
  const act=DB.equipo.filter(p=>p.activo), inac=DB.equipo.filter(p=>!p.activo);
  const sinAsig=DB.contratos.filter(c=>c.estado!=='anulado'&&(!c.vendedor||c.vendedor==='Sin asignar'));
  let h=`<div class="kpis">
    <div class="kpi"><div class="kpi-label">Personas activas</div><div class="kpi-value">${act.length}</div><div class="kpi-sub">${vendedores().length} vendedores</div></div>
    <div class="kpi"><div class="kpi-label">Inactivas</div><div class="kpi-value">${inac.length}</div><div class="kpi-sub">sin acceso</div></div>
    <div class="kpi ${sinAsig.length?'warn':''}"><div class="kpi-label">Contratos sin vendedor</div><div class="kpi-value">${sinAsig.length}</div><div class="kpi-sub">${sinAsig.length?'requieren asignación':'todo asignado'}</div></div>
  </div>`;
  /* Poner el equipo en marcha: los avisos administrativos convertidos
     en un checklist con contador, explicación y acción (dirección de
     Manus). Cada paso se tacha solo cuando su contador llega a cero. */
  const sinAccesoT = act.filter(p=>!p.entra), invitablesT = sinAccesoT.filter(p=>p.email), sinCorreoT = sinAccesoT.filter(p=>!p.email);
  const sinComT = p => contratosDe(p.nombre).filter(c=>!comisionaEn(p,c.fecha));
  const rarosT = act.filter(p=>sinComT(p).length);
  const perdida = rarosT.reduce((s,p)=>s+sinComT(p).reduce((t,c)=>t+calcularComision(c),0),0);
  const pasos=[
    {n:sinCorreoT.length, t:'Completar correos', d:sinCorreoT.length?`Sin correo no se puede invitar: ${sinCorreoT.map(p=>esc(p.nombre)).join(', ')}`:'Todos tienen correo',
     b:sinCorreoT.length?`<button class="btn btn-ghost btn-sm" onclick="modalPersona('${sinCorreoT[0].id}')">Editar a ${esc(sinCorreoT[0].nombre.split(' ')[0])}</button>`:''},
    {n:invitablesT.length, t:'Invitar usuarios', d:invitablesT.length?'Reciben un correo y eligen su propia contraseña':'Todos los que tienen correo ya entran',
     b:invitablesT.length?`<button class="btn btn-gold btn-sm" onclick="invitarATodos()">Invitar a ${invitablesT.length===1?'esa persona':'las '+invitablesT.length}</button>`:''},
    {n:sinAsig.length, t:'Asignar vendedores', d:sinAsig.length?`${sinAsig.length} contrato(s) sin responsable: sin vendedor no hay comisión ni seguimiento`:'Todos los contratos tienen vendedor',
     b:sinAsig.length?`<button class="btn btn-gold btn-sm" onclick="modalReasignar('Sin asignar')">Asignarlos</button> <button class="btn btn-ghost btn-sm" onclick="irA('contratos',{f:'sin_vendedor'})">Ver casos</button>`:''},
    {n:rarosT.length, t:'Revisar roles sin comisión', d:rarosT.length?`${rarosT.map(p=>`${esc(p.nombre)} (${rolLabel(p.rol)}, ${sinComT(p).length})`).join(' · ')} — ${Q(perdida)} de comisión sin dueño. Si vendió y cambió de puesto, anotá «Vendió hasta» en su ficha.`:'Toda venta comisiona a alguien',
     b:rarosT.length?`<button class="btn btn-ghost btn-sm" onclick="modalPersona('${rarosT[0].id}')">Revisar a ${esc(rarosT[0].nombre.split(' ')[0])}</button>`:''},
  ];
  const pendientes=pasos.filter(x=>x.n).length;
  h+=`<div class="card"><div class="card-h"><h2>Poner el equipo en marcha</h2><span class="hint">${pendientes?`${pendientes} paso(s) pendientes`:'Todo listo'}</span></div>
    <div class="card-b">${pasos.map(x=>`<div class="check-row ${x.n?'':'hecho'}">
      <div class="check-ico">${x.n?'○':'✓'}</div>
      <div class="check-txt"><b>${x.t}${x.n?` <span class="nav-badge">${x.n}</span>`:''}</b><div class="hint">${x.d}</div></div>
      <div class="check-acc">${x.b}</div></div>`).join('')}</div></div>`;

  const FE=(window.__eqFiltro||{rol:'',estado:'',q:''});
  const filtroEq=p=>(!FE.rol||p.rol===FE.rol)&&(!FE.estado||(FE.estado==='activo'?p.activo:FE.estado==='inactivo'?!p.activo:FE.estado==='sinacceso'?(p.activo&&p.entra===false):true))
    &&(!FE.q||`${p.nombre} ${p.codigo||''} ${p.email||''}`.toLowerCase().includes(FE.q.toLowerCase()));
  h+=`<div class="card"><div class="card-h" style="flex-wrap:wrap;gap:10px"><h2>Equipo · ${act.filter(filtroEq).length+inac.filter(filtroEq).length}</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input class="chip" style="min-width:200px" placeholder="Buscar nombre, código o correo…" value="${esc(FE.q)}" oninput="setEq('q',this.value);document.querySelector('.card-h input').focus()">
      <select class="chip" onchange="setEq('rol',this.value)"><option value="">Todos los roles</option>${ROLES_EQUIPO.map(r=>`<option value="${r.id}" ${FE.rol===r.id?'selected':''}>${r.label}</option>`).join('')}</select>
      <select class="chip" onchange="setEq('estado',this.value)"><option value="">Todos</option><option value="activo" ${FE.estado==='activo'?'selected':''}>Activos</option><option value="sinacceso" ${FE.estado==='sinacceso'?'selected':''}>Sin acceso</option><option value="inactivo" ${FE.estado==='inactivo'?'selected':''}>Inactivos</option></select>
      <button class="btn btn-primary btn-sm" onclick="modalPersona()">+ Agregar persona</button></div></div>
    <div class="card-b" style="padding:0"><table class="data"><thead><tr>
    <th>Nombre</th><th>Código</th><th>Rol</th><th class="num">Contratos</th>
    <th class="num">Vendido</th><th class="num">Comisión 2%</th><th>Estado</th><th>Acción</th></tr></thead><tbody>`;
  const fila=p=>{
    const cts=contratosDe(p.nombre);
    const val=cts.reduce((s,c)=>s+c.precio,0);
    const com=cts.reduce((s,c)=>s+(comisionaEn(p,c.fecha)?calcularComision(c):0),0);
    return `<tr${p.activo?'':' style="opacity:.55"'}>
      <td><b>${esc(p.nombre)}</b>${p.nota?`<div class="ec-obl">${esc(p.nota)}</div>`:''}</td>
      <td><span class="pill">${esc(p.codigo||'—')}</span></td>
      <td>${rolLabel(p.rol)}</td>
      <td class="num">${cts.length}</td>
      <td class="num">${val?Qk(val):'—'}</td>
      <td class="num">${com?Q(com):(cts.length?`<span title="Su rol no genera comisión" style="color:#B0562F">sin comisión</span>`:'—')}</td>
      <td>${p.activo
        ? (p.entra===false ? '<span class="badge b-pend">Sin acceso</span>'
                           : '<span class="badge b-ok">Activo</span>')
        : '<span class="badge b-nod">Inactivo</span>'}
        ${p.externo?`<div class="ec-obl">${esc(p.organizacion||'externo')}${p.accesoHasta?` · hasta ${fmtD(p.accesoHasta)}`:''}</div>`:''}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="modalPersona('${p.id}')">Editar</button>
        ${cts.length?`<button class="btn btn-ghost btn-sm" onclick="modalReasignar('${esc(p.nombre)}')">Reasignar</button>`:''}
        ${p.activo?`<button class="btn btn-ghost btn-sm" onclick="modalDarDeBaja('${p.id}')">Dar de baja</button>`
                  :`<button class="btn btn-ghost btn-sm" onclick="reactivarPersona('${p.id}')">Reactivar</button>`}
        ${p.activo && !p.entra ? (p.email
            ? `<button class="btn btn-gold btn-sm" onclick="invitarA('${p.id}')">Invitar</button>`
            : `<span class="hint" title="Sin correo no se le puede invitar">sin correo</span>`) : ''}
        ${p.activo && p.email && SESION.rol==='admin'
            ? `<button class="btn btn-ghost btn-sm" onclick="modalContrasena('${p.id}')">Contraseña</button>` : ''}
      </td></tr>`;
  };
  /* Cuando alguien tiene contratos a su nombre pero su rol no comisiona,
     esa comisión no la cobra nadie. No es un error de cálculo: es una
     pregunta sin contestar sobre quién vendió de verdad. */
  /* Quién todavía no puede entrar. Es lo primero que hay que resolver
     el día que arranca el equipo, y hasta ahora no se veía en ninguna
     pantalla: había que ir a mirarlo a Supabase. */
  const sinAcceso = act.filter(p=>!p.entra);
  const invitables = sinAcceso.filter(p=>p.email);
  const sinCorreo  = sinAcceso.filter(p=>!p.email);
  const sinComision = p => contratosDe(p.nombre).filter(c=>!comisionaEn(p,c.fecha));
  const raros = act.filter(p=>sinComision(p).length);
  /* Confirmar el pago de un cliente y aprobar una comisión son dos
     controles distintos: el segundo lo tiene sólo el financiero al
     liquidar. Que quien confirma pagos tenga ventas a su nombre no es
     juez y parte — el aviso que decía eso se quitó por decisión del
     dueño (1 sept 2026). */

  act.filter(filtroEq).forEach(p=>h+=fila(p));
  if(inac.filter(filtroEq).length){h+=`<tr><td colspan="8" style="background:var(--tint);font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);font-weight:700">Inactivos</td></tr>`;
    inac.filter(filtroEq).forEach(p=>h+=fila(p));}
  h+=`</tbody></table></div></div>
    <div class="hint">Solo el rol <b>Vendedor</b> genera comisión. Desactivar a alguien conserva su historial pero le quita el acceso.</div>`;
  C().innerHTML=h;
}
/* Filtros de la tabla de Equipo. A nivel superior, para que los
   onclick los encuentren siempre (y la prueba de botones también). */
function setEq(k,v){ window.__eqFiltro={...(window.__eqFiltro||{rol:'',estado:'',q:''}),[k]:v}; renderEquipo(); }
function modalPersona(id){
  const p=id?DB.equipo.find(x=>mismoId(x.id,id)):null;
  openModal(`<div class="modal-h"><h3>${p?'Editar persona':'Agregar persona'}</h3>
    <p>${p?esc(p.nombre):'Nuevo miembro del equipo'}</p></div>
    <div class="modal-b"><div class="form-grid">
      <div class="field"><label>Nombre completo *</label><input id="e-nom" value="${esc(p?p.nombre:'')}"></div>
      <div class="field"><label>Código</label><input id="e-cod" value="${esc(p?p.codigo:'')}" placeholder="Ej. AND"></div>
      <div class="field"><label>Rol</label><select id="e-rol">
        ${ROLES_EQUIPO.map(r=>`<option value="${r.id}" ${p&&p.rol===r.id?'selected':''}>${r.label}${r.comisiona?' · comisiona':''}</option>`).join('')}</select></div>
      <div class="field"><label>Estado</label><select id="e-act">
        <option value="1" ${!p||p.activo?'selected':''}>Activo</option>
        <option value="0" ${p&&!p.activo?'selected':''}>Inactivo</option></select></div>
      <div class="field"><label>Teléfono</label><input id="e-tel" value="${esc(p?p.telefono:'')}"></div>
      <div class="field"><label>Correo</label><input id="e-mail" value="${esc(p?p.email:'')}"></div>
      <div class="field full"><label>Nota</label><input id="e-nota" value="${esc(p?(p.nota||''):'')}" placeholder="Ej. ya no labora en la empresa"></div>
      <div class="field"><label>¿Es externo?</label><select id="e-ext" onchange="document.getElementById('e-extBox').hidden=this.value!=='1'">
        <option value="0" ${!p||!p.externo?'selected':''}>No · es del equipo</option>
        <option value="1" ${p&&p.externo?'selected':''}>Sí · proveedor o consultor</option></select></div>
      <div class="field" id="e-extBox" ${p&&p.externo?'':'hidden'}><label>Organización · acceso hasta *</label>
        <div style="display:flex;gap:8px"><input id="e-org" value="${esc(p?(p.organizacion||''):'')}" placeholder="Ej. Manus, NUO" style="flex:1">
        <input id="e-hasta" type="date" value="${esc(p&&p.accesoHasta?p.accesoHasta:'')}"></div>
        <div class="hint">Un externo siempre vence: ese día deja de poder entrar, solo. Para revisar UX/UI alcanza «Solo lectura».</div></div>
      <div class="field full"><label>Vendió hasta</label>
        <input id="e-vhasta" type="date" value="${esc(p&&p.vendedorHasta?p.vendedorHasta:'')}">
        <div class="hint">Solo si vendió y después cambió de puesto: sus ventas con fecha hasta ese día
          siguen comisionando aunque hoy tenga otro rol. Vacío = decide el rol de hoy.</div></div>
    </div></div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarEquipo('${id||''}')">Guardar</button></div>`);
}
async function guardarEquipo(id){
  const nom=v('e-nom').trim(); if(!nom){toast('El nombre es obligatorio');return;}
  if(v('e-ext')==='1'&&!v('e-hasta')){toast('Un externo necesita fecha de vencimiento: es lo que apaga su acceso solo',6000,true);return;}
  const antes=id?(DB.equipo.find(x=>mismoId(x.id,id))||{}).nombre:null;
  const r=await conBoton(()=>guardarPersona({id:id||undefined,nombre:nom,codigo:v('e-cod').trim().toUpperCase(),
    rol:v('e-rol'),activo:v('e-act')==='1',telefono:v('e-tel'),email:v('e-mail'),nota:v('e-nota').trim(),
    vendedorHasta:v('e-vhasta')||null,
    externo:v('e-ext')==='1', organizacion:v('e-org').trim()||null, accesoHasta:v('e-hasta')||null}));
  if(!r) return;
  if(antes&&antes!==nom) await reasignarContratos(antes,nom);   // mantiene el historial ligado
  closeModal(); toast('Equipo actualizado ✓'); renderEquipo();
}
/* ---------- Restablecer contraseña · solo administración ----------
   No hay «olvidé mi contraseña» en el login: quien la pierda se la
   pide a administración, y desde acá se le manda el enlace. La nueva
   la elige la persona; nadie la ve ni la reparte. */
async function restablecerContrasenaDe(id){
  if(SESION.rol!=='admin') return toast('Solo administración restablece contraseñas', 5000, true);
  const p=DB.equipo.find(x=>mismoId(x.id,id)); if(!p) return;
  if(!p.email) return toast('Esa persona no tiene correo en su ficha', 5000, true);
  if(!confirm(`Mandarle a ${p.nombre} un enlace a ${p.email} para que elija una contraseña nueva.\n\nLa actual sigue sirviendo hasta que la cambie.`)) return;
  const r=await conBoton(()=>pedirContrasenaNueva(p.email));
  if(!r||!r.ok){ if(r) toast(r.error, 7000, true); return; }
  anotar('equipo.contrasena', p.nombre+' · '+p.email);
  toast(`Enlace enviado a ${p.email}. Si no le llega, que revise no deseados.`, 7000);
}

/* Dos maneras, en un solo lugar: mandarle el enlace (elige ella) o
   asignarle una ahora (para quien no tiene bandeja, como un agente).
   La contraseña se escribe acá y viaja a la función; el portal no la
   guarda ni la muestra en ningún otro sitio. */
function modalContrasena(id){
  const p=DB.equipo.find(x=>mismoId(x.id,id)); if(!p) return;
  openModal(`<div class="modal-h"><h3>Contraseña de ${esc(p.nombre)}</h3><p>${esc(p.email)}</p></div>
    <div class="modal-b">
      <div class="sect-t">Opción 1 · que la elija la persona</div>
      <p class="hint" style="margin-bottom:8px">Le llega un correo con un enlace. ${p.entra?'La actual sigue sirviendo hasta que la cambie.':'Necesita tener cuenta: usá «Invitar» primero.'}</p>
      <button class="btn btn-ghost" ${p.entra?'':'disabled'} onclick="closeModal();restablecerContrasenaDe('${p.id}')">Mandar enlace</button>
      <div class="sect-t" style="margin-top:18px">Opción 2 · asignarle una ahora</div>
      <p class="hint" style="margin-bottom:8px">${p.entra?'Reemplaza la actual de inmediato.':'Le crea la cuenta ya confirmada — no espera ningún correo.'} Mínimo 10 caracteres, letras y números.</p>
      <div class="form-grid">
        <div class="field"><label>Contraseña nueva</label><input id="pw-1" type="password" autocomplete="new-password"></div>
        <div class="field"><label>Repetila</label><input id="pw-2" type="password" autocomplete="new-password"></div>
      </div>
      <label class="hint" style="display:block;margin-top:6px"><input type="checkbox" onchange="['pw-1','pw-2'].forEach(i=>document.getElementById(i).type=this.checked?'text':'password')"> Mostrar</label>
    </div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="asignarContrasena('${p.id}')">Asignar contraseña</button></div>`);
}
async function asignarContrasena(id){
  const p=DB.equipo.find(x=>mismoId(x.id,id)); if(!p) return;
  const a=v('pw-1'), b=v('pw-2');
  if(a.length<10) return toast('Mínimo 10 caracteres', 5000, true);
  if(!/[a-z]/i.test(a)||!/\d/.test(a)) return toast('Mezclá letras y números', 5000, true);
  if(a!==b) return toast('No coinciden', 5000, true);
  const r=await conBoton(()=>sbContrasena(p.id, a));
  if(!r||!r.ok) return;
  ['pw-1','pw-2'].forEach(i=>{ const e=document.getElementById(i); if(e) e.value=''; });
  if(r.dato.creada) p.entra=true;
  anotar('equipo.contrasena', p.nombre+' · asignada'+(r.dato.creada?' · cuenta creada':''));
  closeModal(); toast(r.dato.creada?`Cuenta creada para ${p.nombre}. Ya puede entrar.`:`Contraseña de ${p.nombre} cambiada.`, 6000);
  renderEquipo();
}

/* ---------- Invitar al equipo ----------
   El correo lo manda Supabase; cada quien pone su propia contraseña.
   Nadie tiene que repartir claves por WhatsApp. */
async function invitarA(id){
  const p=DB.equipo.find(x=>mismoId(x.id,id)); if(!p) return;
  if(!p.email) return toast('Primero ponele su correo: es la llave con la que entra', 6000, true);
  if(!confirm(`Mandarle a ${p.nombre} una invitación a ${p.email}.\n\n`
            + `Va a recibir un enlace para poner su propia contraseña. `
            + `Vos nunca la vas a ver.`)) return;

  const r=await conBoton(()=>sbInvitar({ persona_id: Number(p.id) }));
  if(!r||!r.ok) return;
  const d=r.dato;
  if(d.fallaron?.length) return toast(d.fallaron[0].error, 8000, true);
  if(!d.invitados?.length) return toast(d.nota || 'Esa persona ya entra al portal', 6000);
  anotar('equipo.invitar', p.nombre+' · '+p.email);
  toast(`Invitación enviada a ${p.email}. Si no le llega, que revise no deseados.`, 7000);
  renderEquipo();
}

async function invitarATodos(){
  const faltan=DB.equipo.filter(p=>p.activo && p.email && !p.entra);
  if(!faltan.length) return toast('Todos los que tienen correo ya entran al portal');
  if(!confirm(`Mandarle invitación a ${faltan.length} persona(s):\n\n`
            + faltan.map(p=>`· ${p.nombre} — ${p.email}`).join('\n')
            + `\n\nCada quien pone su propia contraseña.`)) return;

  const r=await conBoton(()=>sbInvitar({ todos: true }));
  if(!r||!r.ok) return;
  const d=r.dato;
  anotar('equipo.invitar', (d.invitados||[]).length+' invitaciones');
  let msg=`${(d.invitados||[]).length} invitación(es) enviadas`;
  if(d.fallaron?.length) msg+=` · ${d.fallaron.length} fallaron: ${d.fallaron[0].error}`;
  toast(msg, 8000, !!d.fallaron?.length);
  renderEquipo();
}

/* ---------- Dar de baja a alguien ----------
   No se borra: se desactiva. Un vendedor que se fue sigue siendo quien
   vendió 47 contratos, y esa historia no se puede perder — la comisión
   que se le debe, el cliente que preguntará por él.

   Y no se le da de baja con contratos vivos encima sin decir qué pasa
   con ellos: la cartera se quedaría sin quien la atienda. */
function modalDarDeBaja(id){
  const p=DB.equipo.find(x=>mismoId(x.id,id)); if(!p) return;
  const cts=contratosDe(p.nombre);
  const com=cts.reduce((s,c)=>s+(comisionaEn(p,c.fecha)?calcularComision(c):0),0);

  openModal(`<div class="modal-h"><h3>Dar de baja a ${esc(p.nombre)}</h3>
      <p>${rolLabel(p.rol)}${p.codigo?' · '+esc(p.codigo):''}</p></div>
    <div class="modal-b">
      <div class="hint" style="margin-bottom:12px">
        No se borra a nadie. Queda <b>inactivo</b>: pierde el acceso al portal, pero su
        historial se conserva entero — quién vendió qué, y qué se le debe.</div>
      ${cts.length?`<div class="aviso-err" style="margin-bottom:12px">
        Tiene <b>${cts.length} contrato(s)</b> a su nombre${com?` y <b>${Q(com)}</b> en comisión`:''}.
        Antes de darle de baja hay que decidir quién los atiende.</div>
        <div class="field"><label>Pasar sus contratos a</label>
          <select id="baja-dest">
            <option value="">— dejarlos a su nombre por ahora —</option>
            ${vendedores().filter(v=>!mismoId(v.id,p.id)).map(v=>`<option value="${esc(v.nombre)}">${esc(v.nombre)}</option>`).join('')}
          </select></div>
        <div class="hint">Si los dejás a su nombre, van a seguir apareciendo como suyos
          en cartera y comisiones. Es válido —a veces es lo correcto— pero que sea
          a propósito.</div>`
        :`<div class="hint" style="margin-bottom:12px">No tiene contratos a su nombre.</div>`}
      <div class="field" style="margin-top:12px"><label>¿Por qué se va?</label>
        <input id="baja-motivo" placeholder="Renunció, se le terminó el contrato, cambió de área…"></div>
    </div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="hacerBaja('${p.id}')">Dar de baja</button></div>`);
}

async function hacerBaja(id){
  const p=DB.equipo.find(x=>mismoId(x.id,id)); if(!p) return;
  const motivo=v('baja-motivo').trim();
  if(motivo.length<4){toast('Escribí por qué se va — dentro de seis meses nadie se va a acordar');return;}

  const dest=document.getElementById('baja-dest');
  const destino=dest?dest.value:'';

  const ok = await conBoton(async()=>{
    if(destino){
      const n=await reasignarContratos(p.nombre,destino);
      if(!n) return null;                    // el motivo ya se mostró
    }
    return await borrarPersona(p.id);
  });
  if(!ok) return;

  anotar('equipo.baja', p.nombre+' · '+motivo, {destino: destino||null});
  closeModal();
  toast(esc(p.nombre)+' quedó inactivo'+(destino?' · sus contratos pasaron a '+destino:''), 5000);
  renderEquipo();
}

async function reactivarPersona(id){
  const p=DB.equipo.find(x=>mismoId(x.id,id)); if(!p) return;
  if(!confirm(`Reactivar a ${p.nombre}. Va a recuperar el acceso al portal con su rol de ${rolLabel(p.rol)}.`)) return;
  const r=await guardarPersona({id:p.id, nombre:p.nombre, codigo:p.codigo, rol:p.rol,
                                activo:true, telefono:p.tel||'', email:p.email||''});
  if(!r) return;
  anotar('equipo.reactivar', p.nombre);
  toast(esc(p.nombre)+' vuelve a tener acceso'); renderEquipo();
}

function modalReasignar(de){
  const cts=de==='Sin asignar'
    ? DB.contratos.filter(c=>c.estado!=='anulado'&&(!c.vendedor||c.vendedor==='Sin asignar'))
    : contratosDe(de);
  const opts=vendedores().filter(p=>p.nombre!==de);
  openModal(`<div class="modal-h"><h3>Reasignar contratos</h3>
    <p>${cts.length} contrato(s) de <b>${esc(de)}</b></p></div>
    <div class="modal-b">
      <div class="field"><label>Asignar a</label><select id="r-dest">
        ${opts.map(p=>`<option value="${esc(p.nombre)}">${esc(p.nombre)} · ${esc(p.codigo||'')}</option>`).join('')}
      </select></div>
      <div class="hint">Se moverán los ${cts.length} contratos y su comisión al nuevo vendedor.</div>
      <div style="max-height:180px;overflow:auto;margin-top:12px">
        ${cts.slice(0,40).map(c=>`<div class="money-row"><span>${c.no} · Lote ${c.lote}</span><span>${Qk(c.precio)}</span></div>`).join('')}
        ${cts.length>40?`<div class="hint">…y ${cts.length-40} más</div>`:''}
      </div></div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="hacerReasignacion('${esc(de)}')">Reasignar</button></div>`);
}
async function hacerReasignacion(de){
  const dest=v('r-dest'); if(!dest){toast('Elige un vendedor');return;}
  const n=await conBoton(()=>reasignarContratos(de,dest));
  if(!n) return;
  closeModal(); toast(n+' contrato(s) reasignados a '+dest); renderEquipo();
}

/* ============================================================ LEADS DEL EMBUDO */
function renderLeads(){
  const L=(DB.leadsFunnel||[]).slice().reverse();
  const conv=L.filter(x=>x.estado==='convertido').length;
  const porOrigen={}; L.forEach(x=>{const k=x.origen||'Sin registrar';porOrigen[k]=(porOrigen[k]||0)+1;});
  let h=`<div class="kpis">
    <div class="kpi"><div class="kpi-label">Leads capturados</div><div class="kpi-value">${L.length}</div><div class="kpi-sub">desde el embudo público</div></div>
    <div class="kpi accent"><div class="kpi-label">Convertidos</div><div class="kpi-value">${conv}</div><div class="kpi-sub">${L.length?Math.round(conv/L.length*100):0}% de conversión</div></div>
    <div class="kpi"><div class="kpi-label">Sin cerrar</div><div class="kpi-value">${L.length-conv}</div><div class="kpi-sub">para dar seguimiento</div></div>
  </div>`;
  if(Object.keys(porOrigen).length){
    h+=`<div class="card"><div class="card-h"><h2>Por origen</h2></div><div class="card-b">`;
    const max=Math.max(...Object.values(porOrigen));
    Object.entries(porOrigen).sort((a,b)=>b[1]-a[1]).forEach(([o,n])=>{
      h+=`<div class="bar-row"><div class="bar-lbl">${esc(o)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${n/max*100}%"></div></div>
        <div class="bar-val">${n} lead(s)</div></div>`;});
    h+=`</div></div>`;
  }
  h+=`<div class="card"><div class="card-h"><h2>Prospectos</h2></div><div class="card-b" style="padding:0">
    <table class="data"><thead><tr><th>Nombre</th><th>Teléfono</th><th>Lote</th>
    <th class="num">Enganche</th><th>Origen</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>`;
  if(!L.length)h+=`<tr><td colspan="7" class="empty">Aún no hay leads. Se capturan desde <b>comprar.html</b> (el link para redes sociales).</td></tr>`;
  L.forEach(x=>{h+=`<tr><td><b>${esc(x.nombre)}</b></td><td>${esc(x.telefono)}</td><td>${esc(x.lote)}</td>
    <td class="num">${Qk(x.enganche||0)}</td><td><span class="pill">${esc(x.origen||'—')}</span></td>
    <td>${(x.fecha||'').slice(0,10)}</td>
    <td>${x.estado==='convertido'?`<span class="badge b-ok">Convertido ${esc(x.contrato||'')}</span>`:'<span class="badge b-pend">Por contactar</span>'}</td></tr>`;});
  h+=`</tbody></table></div></div>
    <div class="hint">Los leads se guardan aunque el prospecto no termine la solicitud — ahí está el valor del embudo. Al conectar KOMMO, cada uno entra automáticamente a su embudo.</div>`;
  C().innerHTML=h;
}

/* ============================================================ APROBACIÓN */
function renderAprobacion(){
  const pend=DB.contratos.filter(c=>c.estado==='en_aprobacion');
  let h=`<div class="card"><div class="card-h"><h2>Bandeja del comité · ${pend.length} pendientes</h2></div>
    <div class="card-b" style="padding:0"><table class="data"><thead><tr>
    <th>No.</th><th>Lote</th><th>Cliente</th><th>Origen</th><th class="num">Valor</th><th>Expediente</th><th>Acción</th></tr></thead><tbody>`;
  if(!pend.length)h+=`<tr><td colspan="7" class="empty">Sin solicitudes pendientes</td></tr>`;
  pend.forEach(c=>{
    const cli=getCliente(c.clienteId), docs=documentosDe(c.id).length;
    const completo=cli&&cli.dpi&&cli.telefono;
    h+=`<tr><td><b>${c.no}</b></td><td>${c.lote}</td><td>${esc(nombreCliente(c.clienteId))}</td>
      <td><span class="pill">${esc(c.origen||'—')}</span></td><td class="num">${Qk(c.precio)}</td>
      <td>${completo?'<span class="badge b-ok">Completo</span>':'<span class="badge b-pend">Falta info</span>'} <span class="muted">${docs} doc.</span></td>
      <td><button class="btn btn-ghost btn-sm" onclick="abrirContrato('${c.id}')">Ver</button>
          <button class="btn btn-primary btn-sm" onclick="doAprobar('${c.id}')">Aprobar</button>
          <button class="btn btn-ghost btn-sm" onclick="doRechazar('${c.id}')">Rechazar</button></td></tr>`;});
  h+=`</tbody></table></div></div>
    <div class="hint">Aprobar genera el plan de giros (Reserva + Cuota Inicial + Saldo Deudor) y marca el lote como vendido.</div>`;
  C().innerHTML=h;
}
async function doAprobar(id){ if(await aprobarContrato(id)){toast('Contrato aprobado ✓');renderAprobacion();} }
async function doRechazar(id){ if(await rechazarContrato(id)){toast('Contrato rechazado · lote liberado');renderAprobacion();} }

/* Dónde el portal y el modelo no coinciden. Se muestra, no se esconde. */
function verCuadreMora(){
  const d=discrepanciasMora();
  const mal=d.filter(x=>x.portal==='en mora'), corto=d.filter(x=>x.portal==='vigente');
  openModal(`<div class="modal-h"><h3>Cuadre de mora</h3>
      <p>El portal y el modelo financiero no dicen lo mismo en ${d.length} contrato(s)</p></div>
    <div class="modal-b">
      <div class="hint" style="margin-bottom:12px">
        <b>${mal.length}</b> que el portal marcaba en mora y el modelo dice que están al día.
        El portal reconstruye el calendario de pagos y no reproduce la lógica del CRM.<br>
        <b>${corto.length}</b> que el portal daba por vigentes y el modelo reporta con atraso — esos sí hay que revisarlos.
      </div>
      ${corto.length?`<div class="sect-t">El portal se quedó corto</div>
        <table class="data"><thead><tr><th>Contrato</th><th>Lote</th><th>Cliente</th><th class="num">Atraso según el modelo</th></tr></thead><tbody>
        ${corto.map(x=>`<tr><td><b>${x.contrato}</b></td><td>${x.lote}</td><td>${esc(x.cliente)}</td><td class="num">${x.atrasoModelo}</td></tr>`).join('')}
        </tbody></table>`:''}
      <div class="sect-t" style="margin-top:16px">El portal marcaba de más (${mal.length})</div>
      <div class="hint">${mal.slice(0,40).map(x=>x.contrato).join(', ')}${mal.length>40?'…':''}</div>
    </div>
    <div class="modal-f"><button class="btn btn-primary" onclick="closeModal()">Entendido</button></div>`);
}

/* ============================================================ COBRANZA */
function renderCobranza(){
  const activos=DB.contratos.filter(c=>c.estado==='aprobado');
  const filas=activos.map(c=>({c,ec:estadoCuenta(c)}));
  const M=resumenMora();
  const mora=filas.filter(x=>x.ec.enMora);
  const disc=discrepanciasMora();
  let h=`<div class="kpis">
    <div class="kpi"><div class="kpi-label">Contratos activos</div><div class="kpi-value">${activos.length}</div><div class="kpi-sub">${M.vigentes} al día</div></div>
    <div class="kpi warn"><div class="kpi-label">En mora</div><div class="kpi-value">${M.enMora}</div><div class="kpi-sub">${M.cuotasAtraso} cuota(s) en atraso</div></div>
    <div class="kpi accent"><div class="kpi-label">Saldo vencido</div><div class="kpi-value sm">${Qk(M.saldoVencido)}</div><div class="kpi-sub">a gestionar</div></div>
    <div class="kpi"><div class="kpi-label">Nunca pagaron</div><div class="kpi-value">${M.nuncaPagaron.length}</div><div class="kpi-sub">ventas que no arrancaron</div></div>
  </div>
  <div class="hint" style="margin-bottom:14px">Fuente: <b>${M.fuente}</b>. El portal calcula la mora por su cuenta y no coincide — hasta que reproduzca la lógica del CRM, manda el modelo.
    ${disc.length?` · <a href="#" onclick="verCuadreMora();return false;"><b>${disc.length} contrato(s) no cuadran</b></a>`:''}</div>`;

  // Los que nunca han pagado: van primero, son otro problema
  if(M.nuncaPagaron.length){
    h+=`<div class="card"><div class="card-h"><h2>Ventas que nunca pagaron una cuota · ${M.nuncaPagaron.length}</h2>
        <div class="hint">Entró el enganche y de ahí nada más</div></div>
      <div class="card-b" style="padding:0"><table class="data"><thead><tr>
      <th>Contrato</th><th>Lote</th><th>Cliente</th><th>Vendedor</th><th>Fecha</th>
      <th class="num">Vencido</th><th class="num">Comisión generada</th></tr></thead><tbody>`;
    M.nuncaPagaron.forEach(m=>{
      const ct=indices().contratosPorNo.get(String(m.no));
      h+=`<tr class="click" ${ct?`onclick="abrirContrato('${ct.id}')"`:''}>
        <td><b>${m.no}</b></td><td>${m.lote}</td>
        <td>${ct?esc(nombreCliente(ct.clienteId)):'—'}</td>
        <td>${ct?esc(ct.vendedor):'—'}</td><td>${ct?fmtD(ct.fecha):'—'}</td>
        <td class="num">${Q(m.saldoVenc)}</td>
        <td class="num">${ct?Q(calcularComision(ct)):'—'}</td></tr>`;});
    h+=`</tbody></table></div></div>`;
  }
  h+=cartaCartera();
  C().innerHTML=h;
}
/* La cartera, priorizada: lo más vencido arriba, con días de atraso,
   último contacto, responsable y qué sigue. Manus: «no obligar a
   revisar listados largos sin priorización». */
const FILTROS_COB={todos:'Todos',mora:'En mora',aldia:'Al día',nunca:'Nunca pagaron'};
let cobBusca='', cobFiltro='mora', cobOrden={k:'vencido',asc:false};
function cobOrdenar(k){ cobOrden = cobOrden.k===k ? {k,asc:!cobOrden.asc} : {k,asc:k==='cliente'}; renderCobranza(); }
function diasAtraso(ec){
  // estadoCuenta() entrega los giros con `venc`; la cartera de la base, con `vence`.
  const f=x=>x.vence||x.venc;
  const g=(ec.giros||[]).filter(x=>x.estado!=='pagado'&&f(x)&&f(x)<HOY_ISO).sort((a,b)=>f(a)<f(b)?-1:1)[0];
  return g?diasEnt(f(g),HOY_ISO):0;
}
function cartaCartera(){
  const F=(VISTA_FILTRO.cobranza&&VISTA_FILTRO.cobranza.f)||cobFiltro; cobFiltro=F;
  const q=cobBusca.trim().toLowerCase();
  const M=resumenMora(); const nunca=new Set(M.nuncaPagaron.map(x=>x.no));
  let filas=DB.contratos.filter(c=>c.estado==='aprobado').map(c=>{
    const ec=estadoCuenta(c), g=gestionesDe(c.id)[0];
    return {c,ec,cli:nombreCliente(c.clienteId),dias:diasAtraso(ec),ult:g?`${fmtD(g.fecha)} · ${g.tipo||''}`:'',ultF:g?g.fecha:''};
  }).filter(x=>F==='todos'||(F==='mora'&&x.ec.enMora)||(F==='aldia'&&!x.ec.enMora)||(F==='nunca'&&nunca.has(x.c.no)))
    .filter(x=>!q||`${x.c.no} ${x.c.lote} ${x.cli} ${x.c.vendedor}`.toLowerCase().includes(q));
  const val={contrato:x=>x.c.no,cliente:x=>x.cli,vencido:x=>x.ec.montoVencido||0,dias:x=>x.dias,cuotas:x=>x.ec.vencidas||0,ult:x=>x.ultF,saldo:x=>x.ec.saldo}[cobOrden.k]||(x=>x.ec.montoVencido||0);
  filas.sort((a,b)=>{const A=val(a),B=val(b);const r=typeof A==='number'?A-B:String(A).localeCompare(String(B));return cobOrden.asc?r:-r;});
  const th=(k,t,num)=>`<th class="${num?'num ':''}click" onclick="cobOrdenar('${k}')">${t}${cobOrden.k===k?(cobOrden.asc?' ↑':' ↓'):''}</th>`;
  let h=`<div class="card"><div class="card-h" style="flex-wrap:wrap;gap:10px"><h2>Cartera · ${filas.length}</h2>
    <input class="chip" style="min-width:220px" placeholder="Buscar cliente, lote, contrato o vendedor…" value="${esc(cobBusca)}" oninput="cobBusca=this.value;renderCobranza();document.querySelector('.card-h input').focus()"></div>
    <div class="card-b chips">${Object.entries(FILTROS_COB).map(([k,t])=>`<button class="chip ${k===F?'on':''}" onclick="irA('cobranza',{f:'${k}'})">${t}</button>`).join('')}</div>
    <div class="card-b" style="padding:0;overflow-x:auto"><table class="data" id="tblCartera"><thead><tr>
    ${th('contrato','Contrato')}${th('cliente','Cliente')}<th>Lote</th>${th('vencido','Vencido',1)}${th('dias','Días',1)}${th('cuotas','Cuotas venc.',1)}
    ${th('saldo','Saldo',1)}${th('ult','Último contacto')}<th>Responsable</th><th>Próxima acción</th></tr></thead><tbody>`;
  if(!filas.length) h+=`<tr><td colspan="10"><div class="empty">${q?'Nada coincide con la búsqueda.':'Nada en este filtro.'}</div></td></tr>`;
  filas.forEach(({c,ec,cli,dias,ult})=>{
    const accion = ec.enMora ? (dias>60?'Escalar':'Gestionar') : (ec.prox?'Recordar':'—');
    h+=`<tr class="click" onclick="abrirContrato('${c.id}','cuenta')"><td><b>${c.no}</b></td>
      <td>${esc(cli)}</td><td>${esc(c.lote)}</td>
      <td class="num">${ec.montoVencido?`<span style="color:var(--mora);font-weight:600">${Qk(ec.montoVencido)}</span>`:'—'}</td>
      <td class="num">${dias||'—'}</td><td class="num">${ec.vencidas||'—'}</td><td class="num">${Qk(ec.saldo)}</td>
      <td>${ult?esc(ult):'<span class="hint">Sin gestión</span>'}</td><td>${c.vendedor?esc(c.vendedor):'<span class="hint">Sin vendedor</span>'}</td>
      <td>${accion==='—'?'—':`<a href="#" onclick="event.stopPropagation();abrirContrato('${c.id}','gestiones');return false;">${accion} ›</a>`}</td></tr>`;});
  h+=`</tbody></table></div></div>`;
  return h;
}
function filtrarCartera(t){ cobBusca=t||''; renderCobranza(); }

/* ============================================================ CONFIRMACIÓN DE PAGOS */
function renderConfirmacion(){
  const pend=DB.pagos.filter(p=>p.estado==='registrado');
  let h=`<div class="card"><div class="card-h"><h2>Pagos por confirmar · ${pend.length}</h2></div>
    <div class="card-b" style="padding:0"><table class="data"><thead><tr>
    <th>Contrato</th><th>Cliente</th><th>Cuenta acreditada</th><th>Forma</th>
    <th>Referencia</th><th class="num">Monto</th><th>Acción</th></tr></thead><tbody>`;
  if(!pend.length)h+=`<tr><td colspan="7" class="empty">No hay pagos pendientes de confirmar</td></tr>`;
  pend.forEach(p=>{const ct=getContrato(p.contratoId);
    h+=`<tr><td><b>${ct?ct.no:'—'}</b></td><td>${ct?esc(nombreCliente(ct.clienteId)):'—'}</td>
      <td>${esc(p.cuenta)}</td><td>${esc(p.forma)}</td><td>${esc(p.referencia)||'—'}</td>
      <td class="num">${Q(p.monto)}</td>
      <td><button class="btn btn-primary btn-sm" onclick="doConfirmar('${p.id}',true)">Confirmar</button>
          <button class="btn btn-ghost btn-sm" onclick="doConfirmar('${p.id}',false)">Rechazar</button></td></tr>`;});
  h+=`</tbody></table></div></div>
    <div class="hint">Flujo real del CRM: la boleta se registra y luego contabilidad verifica el depósito antes de aplicarlo a la cartera.</div>`;
  C().innerHTML=h;
}
async function doConfirmar(id,ok){ if(await confirmarPago(id,ok)){toast(ok?'Pago confirmado ✓':'Pago rechazado');renderConfirmacion();} }

/* ============================================================ COMISIONES
   Tres pestañas: lo que se debe, lo que está en proceso, y el
   historial de lo ya pagado. Nada se borra nunca. */
let comTab='pendientes';

function renderComisiones(){
  const R=resumenComisiones();
  let h=`<div class="kpis">
    <div class="kpi"><div class="kpi-label">Por liquidar</div><div class="kpi-value sm">${Qk(R.porLiquidar)}</div>
      <div class="kpi-sub">${R.vendedoresPend} vendedor(es)</div></div>
    <div class="kpi ${R.retenido?'warn':''}"><div class="kpi-label">Retenidas</div><div class="kpi-value sm">${Qk(R.retenido)}</div>
      <div class="kpi-sub">${R.contratosRetenidos} contrato(s) sin expediente</div></div>
    <div class="kpi warn"><div class="kpi-label">Esperan factura</div><div class="kpi-value sm">${Qk(R.porFacturar)}</div>
      <div class="kpi-sub">no se paga sin factura</div></div>
    <div class="kpi accent"><div class="kpi-label">Listas para pagar</div><div class="kpi-value sm">${Qk(R.porPagar)}</div>
      <div class="kpi-sub">${R.cuentaPorPagar} liquidación(es)</div></div>
    <div class="kpi"><div class="kpi-label">Pagado</div><div class="kpi-value sm">${Qk(R.pagado)}</div>
      <div class="kpi-sub">histórico</div></div>
  </div>`;

  h+=`<div class="card"><div class="card-b" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    ${[['pendientes','Por liquidar'],['proceso','En proceso'],['historial','Historial de pagos'],['vendedores','Por vendedor']]
      .map(([k,l])=>`<button class="btn btn-sm ${comTab===k?'btn-primary':'btn-ghost'}" onclick="comTab='${k}';renderComisiones()">${l}</button>`).join('')}
    <button class="btn btn-sm btn-ghost" onclick="modalYaPagado()">Registrar lo ya pagado</button>
    <span class="hint" style="margin-left:auto">Base: ${(COMISION_PCT*100).toFixed(0)}% del valor del lote · liquidación quincenal</span>
  </div></div>`;

  if(R.pagado===0 && R.total>0)
    h+=`<div class="aviso-err" style="margin-bottom:14px">
      Dice <b>Q0 pagado</b>, y eso no es cierto: se ha pagado comisión durante meses,
      por fuera del sistema. Mientras no se cargue, <b>${Qk(R.total)}</b> aparece como
      pendiente cuando gran parte ya se pagó — y esa cifra no sirve ni para pagar ni
      para provisionar. Cargalo con <b>«Registrar lo ya pagado»</b>.</div>`;

  if(comTab==='proceso')         h+=comProceso(R);
  else if(comTab==='historial')  h+=comHistorial(R);
  else if(comTab==='vendedores') h+=comPorVendedor();
  else                           h+=comPendientes(R);
  C().innerHTML=h;
}

function comPendientes(R){
  if(!R.pendientes.length) return `<div class="card"><div class="empty">No hay comisiones pendientes de liquidar.</div></div>`;
  const puedeLiberar = (typeof puede==='function') ? puede('comision.liberar') : false;
  let h='';
  R.pendientes.forEach(p=>{
    h+=`<div class="card"><div class="card-h">
      <h2>${esc(p.persona.nombre)} <span class="pill">${p.persona.codigo}</span></h2>
      <div><b>${Q(p.total)}</b> · ${p.contratos.length} contrato(s)${p.retenidos.length?` <span class="hint">· ${Q(p.totalRetenido)} retenidos</span>`:''}</div></div>`;
    if(p.contratos.length){
      h+=`<div class="card-b" style="padding:0"><table class="data"><thead><tr>
        <th>Contrato</th><th>Lote</th><th class="num">Valor del lote</th><th class="num">Comisión</th></tr></thead><tbody>`;
      p.contratos.forEach(c=>h+=`<tr><td><b>${c.no}</b></td><td>${c.lote}</td>
        <td class="num">${Qk(c.precio)}</td><td class="num">${Q(c.comision)}</td></tr>`);
      h+=`</tbody><tfoot><tr><td colspan="3" style="text-align:right;font-weight:800;padding:10px 12px">Total</td>
        <td class="num" style="font-weight:800">${Q(p.total)}</td></tr></tfoot></table></div>
        <div class="card-b"><button class="btn btn-primary" onclick="doCrearLiq('${esc(p.persona.nombre)}')">Crear liquidación de la quincena</button>
        <span class="hint" style="margin-left:10px">Al crearla, estos contratos quedan apartados y no se vuelven a liquidar.</span></div>`;
    }
    if(p.retenidos.length){
      h+=`<div class="card-b" style="padding:0;border-top:1px solid var(--linea,#ddd)">
        <div style="padding:10px 12px;font-weight:700">Retenidas por expediente incompleto
        <span class="hint" style="font-weight:400">— se liquidan solas en cuanto se suba lo que falta</span></div>
        <table class="data"><thead><tr><th>Contrato</th><th>Lote</th><th>Qué falta</th>
        <th class="num">Comisión</th>${puedeLiberar?'<th></th>':''}</tr></thead><tbody>`;
      p.retenidos.forEach(c=>h+=`<tr><td><b>${c.no}</b></td><td>${c.lote}</td>
        <td style="color:#B0562F">${c.falta.map(esc).join(' · ')}</td>
        <td class="num">${Q(c.comision)}</td>
        ${puedeLiberar?`<td><button class="btn btn-ghost btn-sm" onclick="doLiberar('${esc(c.no)}')">Liberar</button></td>`:''}</tr>`);
      h+=`</tbody><tfoot><tr><td colspan="3" style="text-align:right;font-weight:800;padding:10px 12px">Retenido</td>
        <td class="num" style="font-weight:800">${Q(p.totalRetenido)}</td>${puedeLiberar?'<td></td>':''}</tr></tfoot></table></div>`;
    }
    h+=`</div>`;});
  return h;
}
function doLiberar(contratoNo){
  openModal(`<div class="modal-h"><h3>Liberar la comisión de ${esc(contratoNo)}</h3>
      <p>Se va a pagar sin que el expediente esté completo.</p></div>
    <div class="modal-b">
      <div class="field"><label>Motivo de la liberación</label>
        <input id="libMotivo" placeholder="Por qué se paga sin el expediente completo"></div>
      <div class="hint">Queda registrado quién autorizó y cuándo. Si esto se vuelve costumbre,
        el problema no es el expediente: es el proceso que lo produce.</div>
    </div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarLiberacion('${esc(contratoNo)}')">Liberar</button></div>`);
}
function guardarLiberacion(contratoNo){
  try{ liberarComision(contratoNo, document.getElementById('libMotivo').value);
       closeModal(); toast('Comisión liberada'); renderComisiones(); }
  catch(e){ toast(e.message); }
}
/* ---------- Registrar comisiones ya pagadas ----------
   Lo que se pagó antes de que existiera el sistema. No es una
   liquidación nueva: es cargar historia para que la cifra pendiente
   sea real. */
function modalYaPagado(vendedorSel){
  const R=comisionesPendientes();
  if(!R.length){toast('No hay comisiones pendientes que marcar como pagadas');return;}
  const sel=R.find(x=>x.persona.nombre===vendedorSel)||R[0];

  openModal(`<div class="modal-h"><h3>Registrar lo ya pagado</h3>
      <p>Comisiones que se pagaron antes de que existiera el sistema</p></div>
    <div class="modal-b">
      <div class="hint" style="margin-bottom:12px">
        Esto no crea una liquidación nueva ni mueve dinero: <b>carga historia</b>, para
        que lo que aparece como pendiente sea de verdad lo que se debe.</div>
      <div class="field"><label>Vendedor</label>
        <select id="yp-vend" onchange="modalYaPagado(this.value)">
          ${R.map(x=>`<option value="${esc(x.persona.nombre)}" ${x.persona.nombre===sel.persona.nombre?'selected':''}>${esc(x.persona.nombre)} · ${x.contratos.length} contrato(s) · ${Qk(x.total)}</option>`).join('')}
        </select></div>
      <div class="form-grid">
        <div class="field"><label>¿Cuándo se pagó? *</label>
          <input id="yp-fecha" type="date" value="${HOY_ISO}"></div>
        <div class="field"><label>Referencia</label>
          <input id="yp-ref" placeholder="Transferencia, cheque, recibo…"></div>
      </div>
      <div class="field full"><label>Nota</label>
        <input id="yp-nota" placeholder="Por qué se está cargando ahora"></div>

      <div style="display:flex;align-items:center;gap:10px;margin:12px 0 6px">
        <b style="font-size:13px">¿Cuáles se le pagaron?</b>
        <button class="btn btn-ghost btn-sm" onclick="ypTodos(true)">Todas</button>
        <button class="btn btn-ghost btn-sm" onclick="ypTodos(false)">Ninguna</button>
        <span class="hint" id="yp-suma" style="margin-left:auto"></span>
      </div>
      <div style="max-height:240px;overflow:auto;border:1px solid var(--line);border-radius:8px">
        <table class="data"><tbody>
        ${sel.contratos.map(c=>`<tr>
          <td style="width:34px"><input type="checkbox" class="yp-chk" data-com="${c.comisionId||''}"
              data-monto="${c.comision}" onchange="ypSuma()" checked></td>
          <td><b>${esc(c.no)}</b> · ${esc(c.lote)}</td>
          <td style="font-size:12px;color:var(--muted)">${fmtD(c.fecha)}</td>
          <td class="num">${Q(c.comision)}</td></tr>`).join('')}
        </tbody></table>
      </div>
      ${sel.contratos.some(c=>!c.comisionId)?`<div class="hint" style="margin-top:8px;color:#B0562F">
        Algunas comisiones todavía no están registradas en la base. Esas no se pueden
        marcar hasta que se corra la carga.</div>`:''}
    </div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="hacerYaPagado('${esc(sel.persona.nombre)}')">Registrar como pagado</button></div>`);
  ypSuma();
}
function ypTodos(v){ document.querySelectorAll('.yp-chk').forEach(c=>c.checked=v); ypSuma(); }
function ypSuma(){
  const chk=[...document.querySelectorAll('.yp-chk:checked')];
  const t=chk.reduce((s,c)=>s+Number(c.dataset.monto||0),0);
  const el=document.getElementById('yp-suma');
  if(el) el.innerHTML=`<b>${chk.length}</b> seleccionada(s) · <b>${Q(t)}</b>`;
}
async function hacerYaPagado(nombre){
  const R=comisionesPendientes().find(x=>x.persona.nombre===nombre);
  if(!R) return;
  const fecha=v('yp-fecha');
  if(!fecha){toast('Poné la fecha en que se pagó');return;}
  const ids=[...document.querySelectorAll('.yp-chk:checked')]
    .map(c=>c.dataset.com).filter(Boolean).map(Number);
  if(!ids.length){toast('Marcá al menos una comisión');return;}

  const r=await conBoton(()=>sbRegistrarComisionPagada(
    R.persona.id, ids, fecha, v('yp-ref').trim(), v('yp-nota').trim()));
  if(!r||!r.ok){ if(r&&r.error) toast(r.error,7000,true); return; }

  anotar('comision.historica', nombre+' · '+ids.length+' comisiones · '+fecha);
  closeModal();
  toast(`${r.dato.liq_comisiones} comisión(es) de ${nombre} quedaron como pagadas · ${Q(r.dato.liq_total)}`, 6000);
  renderComisiones();
}

async function doCrearLiq(nombre){
  try{ const l=await crearLiquidacion(nombre); if(!l) return; toast('Liquidación '+l.numero+' creada'); comTab='proceso'; }
  catch(e){ toast(e.message); }
  renderComisiones();
}

function comProceso(R){
  const ls=R.liquidaciones.filter(l=>l.estado==='borrador'||l.estado==='facturada');
  if(!ls.length) return `<div class="card"><div class="empty">No hay liquidaciones en proceso.</div></div>`;
  return ls.map(l=>tarjetaLiq(l,true)).join('');
}
function comHistorial(R){
  const ls=R.liquidaciones.filter(l=>l.estado==='pagada'||l.estado==='anulada')
                          .sort((a,b)=>(b.creada||'').localeCompare(a.creada||''));
  if(!ls.length) return `<div class="card"><div class="empty">Todavía no se ha pagado ninguna comisión.</div></div>`;
  const tot=ls.filter(l=>l.estado==='pagada').reduce((t,l)=>t+l.total,0);
  return `<div class="hint" style="margin-bottom:14px">${ls.length} liquidación(es) cerradas · ${Qk(tot)} pagados. Este historial no se puede editar ni borrar.</div>`
    + ls.map(l=>tarjetaLiq(l,false)).join('');
}

function tarjetaLiq(l,acciones){
  const e=ESTADOS_LIQ[l.estado]||{label:l.estado,clase:''};
  let h=`<div class="card"><div class="card-h">
    <h2>${l.numero} · ${esc(l.vendedor)} <span class="badge ${e.clase}">${e.label}</span></h2>
    <div><b>${Q(l.total)}</b> · ${etiquetaPeriodo(l.periodo)}</div></div>
    <div class="card-b">
    <div class="hint" style="margin-bottom:10px">${l.contratos.length} contrato(s): ${l.contratos.map(c=>c.no).join(', ')}</div>`;

  if(l.factura){
    const f=l.factura;
    h+=`<div class="money-row"><span>Factura ${esc(f.serie?f.serie+'-':'')}${esc(f.numero)} · ${fmtD(f.fecha)}${f.nit?' · NIT '+esc(f.nit):''}</span><span>${Q(f.monto)}</span></div>`;
    if(f.difMonto>0.5)
      h+=`<div class="aviso-err" style="margin:8px 0">La factura dice ${Q(f.monto)} y la liquidación es de ${Q(l.total)} — diferencia de ${Q(f.difMonto)}.</div>`;
    if(f.contenido)
      h+=`<div style="margin:8px 0"><a class="btn btn-ghost btn-sm" href="${f.contenido}" download="${esc(f.archivo||'factura')}">Ver la factura (${esc(f.archivo||'')})</a></div>`;
    else if(f.soloFicha)
      h+=`<div class="hint" style="margin:8px 0">Archivo <b>${esc(f.archivo)}</b> (${Math.round(f.tamaño/1024)} KB) — demasiado grande para guardarlo en el navegador. Al pasar a Supabase se sube completo.</div>`;
  }
  if(l.pago)
    h+=`<div class="money-row"><span>Pagada el ${fmtD(l.pago.fecha)} · ${esc(l.pago.forma)} ref ${esc(l.pago.referencia)}</span><span>por ${esc(l.pago.pagadaPor)}</span></div>`;

  if(acciones){
    h+=`<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">`;
    if(l.estado==='borrador'||l.estado==='facturada')
      h+=`<button class="btn ${l.estado==='borrador'?'btn-primary':'btn-ghost'} btn-sm" onclick="modalFactura('${l.id}')">${l.factura?'Cambiar la factura':'Subir factura'}</button>`;
    if(l.estado==='facturada'&&esFinanciero())
      h+=`<button class="btn btn-primary btn-sm" onclick="modalPagarLiq('${l.id}')">Marcar como pagada</button>`;
    if(l.estado!=='pagada')
      h+=`<button class="btn btn-ghost btn-sm" onclick="doAnularLiq('${l.id}')">Anular</button>`;
    h+=`</div>`;
  }

  h+=`<details style="margin-top:12px"><summary class="hint" style="cursor:pointer">Historial (${l.historial.length})</summary>
    <table class="data" style="margin-top:8px"><tbody>${l.historial.map(x=>
      `<tr><td>${esc(x.que)}</td><td>${esc(x.detalle||'')}</td><td class="hint">${esc(x.quien)} · ${esc(x.cuando)}</td></tr>`).join('')}
    </tbody></table></details></div></div>`;
  return h;
}

/* --- Subir la factura --- */
function modalFactura(id){
  const l=DB.liquidaciones.find(x=>mismoId(x.id,id)); if(!l)return;
  openModal(`<div class="modal-h"><h3>Factura de ${esc(l.vendedor)}</h3>
      <p>${l.numero} · la liquidación es de ${Q(l.total)}</p></div>
    <div class="modal-b"><div class="form-grid">
      <div class="field"><label>Serie</label><input id="fa-serie" placeholder="A"></div>
      <div class="field"><label>Número *</label><input id="fa-num"></div>
      <div class="field"><label>Fecha</label><input id="fa-fec" type="date" value="${HOY_ISO}"></div>
      <div class="field"><label>Monto (Q)</label><input id="fa-monto" type="number" step="0.01" value="${l.total}"></div>
      <div class="field full"><label>NIT del vendedor</label><input id="fa-nit"></div>
      <div class="field full"><label>Archivo de la factura (PDF o imagen)</label>
        <input id="fa-file" type="file" accept=".pdf,image/*"></div>
    </div>
    <div class="hint">Se compara con el monto de la liquidación: si no cuadra, queda marcado. Sin factura no se puede pagar.</div></div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="doSubirFactura('${id}')">Guardar factura</button></div>`);
}
function doSubirFactura(id){
  const num=v('fa-num'); if(!num){toast('Falta el número de factura');return;}
  const el=document.getElementById('fa-file');
  const f=el&&el.files&&el.files[0];
  const guardar=contenido=>{
    try{ adjuntarFactura(id,{serie:v('fa-serie'),numero:num,fecha:v('fa-fec'),
          monto:+v('fa-monto'),nit:v('fa-nit'),
          nombre:f?f.name:null,tipo:f?f.type:null,tamaño:f?f.size:0,contenido});
         closeModal(); toast('Factura guardada'); renderComisiones(); }
    catch(e){ toast(e.message); }
  };
  if(f&&f.size<=LIMITE_ARCHIVO){ const r=new FileReader(); r.onload=()=>guardar(r.result); r.readAsDataURL(f); }
  else guardar(null);
}

/* --- Marcar pagada --- */
function modalPagarLiq(id){
  const l=DB.liquidaciones.find(x=>mismoId(x.id,id)); if(!l)return;
  openModal(`<div class="modal-h"><h3>Pagar ${Q(l.total)}</h3><p>${l.numero} · ${esc(l.vendedor)}</p></div>
    <div class="modal-b"><div class="form-grid">
      <div class="field"><label>Fecha</label><input id="pl-fec" type="date" value="${HOY_ISO}"></div>
      <div class="field"><label>Forma</label><select id="pl-forma"><option>Transferencia</option><option>Cheque</option><option>Efectivo</option></select></div>
      <div class="field full"><label>Referencia o número de cheque *</label><input id="pl-ref"></div>
      <div class="field full"><label>Nota</label><input id="pl-nota"></div>
    </div><div class="hint">Al confirmar, la liquidación queda cerrada. No se puede editar después.</div></div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="doPagarLiq('${id}')">Confirmar el pago</button></div>`);
}
function doPagarLiq(id){
  try{ marcarPagada(id,{fecha:v('pl-fec'),forma:v('pl-forma'),referencia:v('pl-ref'),nota:v('pl-nota')});
       closeModal(); toast('Comisión pagada ✓'); }
  catch(e){ toast(e.message); }
  renderComisiones();
}
function doAnularLiq(id){
  openModal(`<div class="modal-h"><h3>Anular liquidación</h3><p>Los contratos vuelven a quedar pendientes</p></div>
    <div class="modal-b"><div class="field"><label>Motivo</label><input id="an-mot"></div></div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="doAnularOk('${id}')">Anular</button></div>`);
}
function doAnularOk(id){
  try{ anularLiquidacion(id,v('an-mot')); closeModal(); toast('Anulada'); }
  catch(e){ toast(e.message); }
  renderComisiones();
}

/* --- Estado por vendedor --- */
function comPorVendedor(){
  let h=`<div class="card"><div class="card-b" style="padding:0"><table class="data"><thead><tr>
    <th>Vendedor</th><th class="num">Por liquidar</th><th class="num">En proceso</th>
    <th class="num">Pagado</th><th class="num">Liquidaciones</th></tr></thead><tbody>`;
  vendedores().forEach(p=>{
    const e=estadoVendedor(p.nombre);
    h+=`<tr><td><b>${esc(p.nombre)}</b> <span class="pill">${p.codigo}</span>
        ${e.contratosPend?`<div class="hint">${e.contratosPend} contrato(s) sin liquidar</div>`:''}</td>
      <td class="num">${e.porLiquidar?Q(e.porLiquidar):'—'}</td>
      <td class="num">${e.enProceso?Q(e.enProceso):'—'}</td>
      <td class="num">${e.pagado?Q(e.pagado):'—'}</td>
      <td class="num">${e.liquidaciones.length||'—'}</td></tr>`;});
  h+=`</tbody></table></div></div>`;
  return h;
}

/* ============================================================ REPORTERÍA */
function renderReporteria(){
  const n = repNumeros();
  const Qk_ = typeof Qk==='function' ? Qk : (x=>x);

  let h = `<div class="card"><div class="card-b" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
      <div class="field" style="margin:0"><label>Desde</label>
        <input type="date" id="rep-desde" value="${n.desde}" onchange="REP.desde=this.value;renderReporteria()"></div>
      <div class="field" style="margin:0"><label>Hasta</label>
        <input type="date" id="rep-hasta" value="${n.hasta}" onchange="REP.hasta=this.value;renderReporteria()"></div>
      <div style="display:flex;gap:6px;margin-left:auto">
        ${[['Este mes',0],['Mes pasado',1],['Este año',9]].map(([l,k])=>
          `<button class="btn btn-ghost btn-sm" onclick="repRango(${k})">${l}</button>`).join('')}
      </div></div></div>`;

  /* Lo del período arriba, porque es lo que se pregunta primero:
     cuánto entró y cuánto falta por entrar. */
  h += `<div class="kpis">
    <div class="kpi accent"><div class="kpi-label">Cobrado en el período</div>
      <div class="kpi-value sm">${Qk_(n.cobrado)}</div>
      <div class="kpi-sub">${n.cobros} pago(s) confirmado(s)</div></div>
    <div class="kpi ${n.nPorConfirmar?'warn':''}"><div class="kpi-label">Esperando confirmación</div>
      <div class="kpi-value sm">${Qk_(n.porConfirmar)}</div>
      <div class="kpi-sub">${n.nPorConfirmar} boleta(s) sin verificar</div></div>
    <div class="kpi"><div class="kpi-label">Ventas del período</div>
      <div class="kpi-value">${n.ventas}</div>
      <div class="kpi-sub">${Qk_(n.valorVentas)} en valor</div></div>
    <div class="kpi warn"><div class="kpi-label">En mora</div>
      <div class="kpi-value">${n.enMora}</div>
      <div class="kpi-sub">${Qk_(n.montoMora)} vencido</div></div>
  </div>`;

  const pct = n.cartera ? Math.round(n.recaudado/n.cartera*100) : 0;
  h += `<div class="card"><div class="card-h"><h2>La cartera completa</h2>
      <span class="hint">${n.activos} contratos activos · mora según ${esc(n.fuenteMora)}</span></div>
    <div class="card-b">
      <div class="bar-row"><div class="bar-lbl">Recaudado</div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="bar-val">${Qk_(n.recaudado)}</div></div>
      <div class="bar-row"><div class="bar-lbl">Por cobrar</div>
        <div class="bar"><div class="bar-fill apar" style="width:${100-pct}%"></div></div>
        <div class="bar-val">${Qk_(n.saldo)}</div></div>
      <div class="hint" style="margin-top:8px">${pct}% recaudado de una cartera de ${Qk_(n.cartera)}.</div>
    </div></div>`;

  /* Y abajo lo que de verdad se lleva uno al cierre. */
  h += `<div class="card"><div class="card-h"><h2>Descargar para el cierre</h2>
      <span class="hint">CSV listo para Excel · del ${fmtD(n.desde)} al ${fmtD(n.hasta)}</span></div>
    <div class="card-b" style="padding:0"><table class="data"><tbody>`;
  REPORTES.forEach(r=>{
    h += `<tr>
      <td><b>${esc(r.nombre)}</b><div class="ec-obl">${esc(r.que)}</div></td>
      <td style="font-size:12px;color:var(--muted);max-width:230px">${esc(r.para)}</td>
      <td style="width:120px;text-align:right">
        ${typeof descargarReporte==='function'
            ? `<button class="btn btn-ghost btn-sm" onclick="descargarReporte('${r.id}')">Descargar ${esc(String(r.nombre||r.id).toLowerCase())}</button>`
            : `<span class="hint">reportes.js no cargado</span>`}</td>
    </tr>`;
  });
  h += `</tbody></table></div>
    <div class="card-b"><div class="hint">
      Los archivos salen con punto y coma y con BOM, que es lo que abre bien el Excel
      configurado en español: con coma, los montos se parten en columnas equivocadas y
      los acentos se rompen. <b>La cartera y la antigüedad salen al corte de hoy</b>; los
      cobros y las ventas, del período de arriba.</div></div></div>`;

  /* El cuadre contra el modelo financiero. Va antes que las gráficas
     porque es la pregunta que de verdad se hace en un cierre: ¿el
     sistema dice lo mismo que el Excel que la gerencia da por bueno? */
  const cu = cuadreConModelo();
  const malas = cu.filas.filter(x=>!x.cuadra && !x.nota).length;
  h+=`<div class="card"><div class="card-h"><h2>Cuadre con el modelo financiero</h2>
      <span class="hint">${esc(MODELO.archivo)} · al ${fmtD(cu.corte)}</span></div>
    <div class="card-b" style="padding:0"><table class="data"><thead><tr>
      <th>Indicador</th><th class="num">Modelo</th><th class="num">Sistema</th>
      <th class="num">Diferencia</th><th></th></tr></thead><tbody>`;
  cu.filas.forEach(x=>{
    const esDinero = x.modelo > 1000;
    const fmt = v => esDinero ? Qk(v) : String(v);
    h+=`<tr>
      <td><b>${esc(x.que)}</b>${x.nota?`<div class="ec-obl">${esc(x.nota)}</div>`:''}</td>
      <td class="num">${fmt(x.modelo)}</td>
      <td class="num">${fmt(x.sistema)}</td>
      <td class="num" style="${x.cuadra?'':'color:#B0562F;font-weight:600'}">${x.dif?fmt(x.dif):'—'}</td>
      <td style="width:90px">${x.cuadra
        ? '<span class="badge b-ok">Cuadra</span>'
        : (x.nota ? '<span class="badge b-apar">Explicado</span>'
                  : '<span class="badge b-mora">Revisar</span>')}</td></tr>`;
  });
  h+=`</tbody></table></div>
    <div class="card-b"><div class="hint">
      ${malas===0
        ? 'Todo lo que se compara directo cuadra, y lo que difiere tiene su explicación escrita.'
        : `<b style="color:#B0562F">${malas} indicador(es) no cuadran y no hay explicación.</b> Eso hay que resolverlo antes de cerrar.`}
      El régimen de ISR del modelo es <b>${esc(MODELO.regimenISR)}</b>.</div></div></div>`;

  /* Lo de siempre, que sirve para mirar de un vistazo. */
  const mz={}; DB.lotes.forEach(l=>{mz[l.manzana]=mz[l.manzana]||{t:0,v:0};mz[l.manzana].t++;if(l.estado==='vendido')mz[l.manzana].v++;});
  const maxV=Math.max(1,...Object.values(mz).map(m=>m.v));
  h+=`<div class="card"><div class="card-h"><h2>Lotes vendidos por manzana</h2></div><div class="card-b">`;
  Object.keys(mz).sort().forEach(m=>{h+=`<div class="bar-row"><div class="bar-lbl">Mz ${m}</div>
    <div class="bar"><div class="bar-fill" style="width:${mz[m].v/maxV*100}%"></div></div>
    <div class="bar-val">${mz[m].v} vendidos</div></div>`;});
  h+=`</div></div>`;

  C().innerHTML=h;
}

/* Atajos de período. 9 es el año corriente. */
function repRango(k){
  const hoy = HOY_ISO, a = hoy.slice(0,4), m = +hoy.slice(5,7);
  if(k===9){ REP.desde = a+'-01-01'; REP.hasta = hoy; }
  else {
    const mm = m - k;
    const anio = mm > 0 ? +a : +a - 1;
    const mes  = mm > 0 ? mm : 12 + mm;
    const p = `${anio}-${String(mes).padStart(2,'0')}`;
    REP.desde = p + '-01';
    REP.hasta = k === 0 ? hoy : new Date(anio, mes, 0).toISOString().slice(0,10);
  }
  renderReporteria();
}

/* ---------- Qué falta y por qué ----------
   Va en la pantalla de Seguridad, que es donde un administrador busca
   por qué algo no funciona. */
async function renderDiagnostico(destino){
  const caja=document.getElementById(destino); if(!caja) return;
  caja.innerHTML=`<div class="hint">Preguntándole a la base…</div>`;
  const r=await diagnosticar();
  const faltan=r.filter(x=>!x.ok);

  let h=`<div class="card"><div class="card-h"><h2>Qué está funcionando</h2>
      <span class="hint">${r.length-faltan.length} de ${r.length}</span></div>`;

  if(faltan.length)
    h+=`<div class="card-b"><div class="aviso-err">
      <b>${faltan.length} cosa(s) no funcionan todavía.</b> El portal se despliega solo
      con cada cambio; la base no — cada archivo SQL alguien lo pega a mano. Cuando el
      código va por delante de la base, se ve como funcionalidad que falta.</div></div>`;

  h+=`<div class="card-b" style="padding:0"><table class="data"><tbody>`;
  r.forEach(x=>{
    h+=`<tr>
      <td style="width:26px">${x.ok?'✓':(x.esencial?'✗':'○')}</td>
      <td><b>${esc(x.que)}</b>${!x.ok&&x.siNo?`<div class="ec-obl">${esc(x.siNo)}</div>`:''}
        ${!x.ok&&x.error&&!x.siNo?`<div class="ec-obl">${esc(x.error.slice(0,110))}</div>`:''}</td>
      <td style="font-family:monospace;font-size:11px;color:var(--muted)">${x.ok?'':esc(x.archivo)}</td>
      <td style="width:100px;text-align:right">${x.ok
        ? '<span class="badge b-ok">Funciona</span>'
        : (x.esencial ? '<span class="badge b-mora">Bloqueado</span>'
                      : `<span class="badge b-pend">${esc(x.pendiente||'Falta correrlo')}</span>`)}</td></tr>`;
  });
  h+=`</tbody></table></div>`;

  const porCorrer=[...new Set(faltan.map(x=>x.archivo).filter(a=>a&&a!=='—'))];
  if(porCorrer.length)
    h+=`<div class="card-b"><div class="hint">
      Falta pegar en el SQL Editor, en este orden:
      <b>${porCorrer.map(esc).join(' → ')}</b>.
      Y después <b>18_permisos_funciones.sql</b>, <b>22_lints.sql</b> y
      <b>24_rendimiento.sql</b>, que van siempre al final.</div></div>`;
  h+=`</div>`;
  caja.innerHTML=h;
}

/* ============================================================ AUTOMATIZACIONES

   Este suite es el ERP CENTRAL: inventario, cartera, contratos,
   expedientes y contabilidad. Es la fuente de la verdad.

   NUO es el CRM y el cobrador por WhatsApp con IA — conversa, recuerda
   la cuota, manda el enlace de pago. La inteligencia es suya.

   WABI es el canal: NUO no habla WhatsApp directo, pasa por Wabi.

   Y la regla que ordena todo: NUO conversa, nosotros sabemos. NUO no
   puede saber por su cuenta qué lote se vendió hace diez minutos ni si
   un pago ya entró. Por eso la integración va en los dos sentidos, y
   sin el segundo NUO ofrece lotes vendidos y cobra cuotas pagadas.

   Se retiraron, con su motivo escrito para que nadie los reproponga:
   KOMMO (era el CRM), el bot propio de WhatsApp (NUO trae el suyo) y
   la sincronía con sistemasenlaza (ya se importó la cartera).
   ============================================================ */
const AUTOS=[
  {ic:'◆',t:'Este suite · ERP central',cad:'La fuente de la verdad',st:'ok',
   pasos:['Inventario, cartera, contratos, expedientes y contabilidad.',
          'Lo que diga el suite es lo que hay: NUO y el equipo leen de aquí.'],
   esc:'Nada se eleva: es la base de todo lo demás.'},
  {ic:'⇄',t:'NUO consulta al suite',cad:'Tiempo real · 18 endpoints',st:'pend',
   pasos:['Qué lotes hay libres y a qué precio.',
          'Cuánto debe un cliente, su próxima cuota y su mora.',
          'Cuánto sale un lote a cada plazo.'],
   esc:'Falta generar la llave de NUO y pasársela · node tools/llave-nuo.js'},
  {ic:'↗',t:'El suite le avisa a NUO',cad:'Por evento',st:'pend',
   pasos:['Se vendió un lote — que deje de ofrecerlo.',
          'Entró un pago — que deje de cobrarlo.',
          'Un contrato cayó en mora — que empiece a recordarlo.'],
   esc:'Falta lo que solo Wabi puede dar: la URL, cómo se autentica y qué forma espera el cuerpo. Mientras tanto los eventos solo se registran.'},
  {ic:'✆',t:'NUO · cobrador por WhatsApp con IA',cad:'De NUO, por el canal de Wabi',st:'ext',
   pasos:['Conversa con el cliente y le recuerda su cuota.',
          'Manda el enlace de pago y el estado de cuenta.',
          'Atiende al prospecto y cotiza con nuestros números.'],
   esc:'La inteligencia es de NUO. Nosotros le damos las cifras y le avisamos lo que cambia.'},
  {ic:'❒',t:'Cobro confirmado → partida contable',cad:'Por evento',st:'ok',
   pasos:['Al confirmarse un pago se asienta solo, en las dos sociedades.',
          'Si falta una cuenta por mapear, el asiento se encola en vez de tumbar el cobro.'],
   esc:'Se enciende cuando el catálogo esté mapeado · select * from v_catalogo_pendiente;'},
  {ic:'⇄',t:'Cuadre bancario',cad:'Al subir el estado de cuenta',st:'ok',
   pasos:['Cruza cada depósito de Banrural contra la cuota que le toca.',
          'Lo que casa por referencia y monto queda listo para aplicar.'],
   esc:'Lo ambiguo, parcial o huérfano espera a que alguien decida. Y quien concilia no confirma.'},
  {ic:'%',t:'Comisiones quincenales',cad:'Día 15 y fin de mes',st:'design',
   pasos:['Calcula sobre el cobro efectivo del período.',
          'Arma la liquidación por vendedor y amarra sus comisiones.'],
   esc:'Retiene la comisión mientras el expediente esté incompleto.'},
  {ic:'✉',t:'Recordatorios de cobranza del hub',cad:'Todos los días a las 9:00',st:'pend',
   pasos:['Arma la lista de a quién le vence hoy y quién ya venció.',
          'Con MODO_SIMULACION dice a quién le escribiría, sin escribirle.'],
   esc:'Falta desplegar el hub (sol-hub) en Vercel. No hace falta para que el equipo trabaje.'},
];

function renderAutomatizaciones(){
  const badge=s=>({
    ok:   '<span class="badge b-ok">Funcionando</span>',
    pend: '<span class="badge b-pend">Falta conectar</span>',
    ext:  '<span class="badge b-apar">Lo hace NUO</span>',
    design:'<span class="badge">Diseñada</span>'
  })[s] || '';
  let h=`<div class="hint" style="margin-bottom:14px">
    <b>Este suite es el ERP central</b> — inventario, cartera, contratos, expedientes y
    contabilidad. <b>NUO</b> es el CRM y el cobrador por WhatsApp con IA, y habla por el
    canal de <b>Wabi</b>.<br>
    La regla que ordena todo: <b>NUO conversa, nosotros sabemos</b>. NUO no puede saber por su
    cuenta qué lote se vendió hace diez minutos ni si un pago ya entró — por eso la
    integración va en los dos sentidos.
  </div><div class="auto-grid">`;
  AUTOS.forEach(a=>{h+=`<div class="auto-card"><div class="auto-h"><div class="auto-ic">${a.ic}</div>
    <div><div class="auto-t">${a.t}</div><div class="auto-cad">${a.cad}</div></div>
    <div style="margin-left:auto">${badge(a.st)}</div></div>
    <ul class="auto-steps">${a.pasos.map(p=>`<li>${p}</li>`).join('')}</ul>
    <div class="auto-esc">↑ ${a.esc}</div></div>`;});
  /* La conversación la lleva NUO, no nosotros. Lo que sale acá es de
     dónde salen sus cifras — que es lo único que nos toca. */
  h+=`</div><div class="card"><div class="card-h"><h2>Quién dice qué</h2>
      <div class="hint">La conversación es de NUO. Los números son nuestros.</div></div>
    <div class="card-b"><div class="wa">
      <div class="wa-b bot">Hola Keyla, le saluda La Esperanza. Su cuota de este mes por
        <b>Q 1,208.00</b> vence el <b>20</b>. Puede pagar aquí: <u>pago.recurrente.com/…</u></div>
      <div class="wa-b me">Ya deposité, aquí la boleta</div>
      <div class="wa-b bot">¡Gracias! Su pago quedó registrado y pasa a verificación.
        Saldo: <b>Q 84,585.00</b>. Próxima cuota: <b>el 20 del mes que viene</b>.</div>
      <div class="wa-b me">¿Tienen lotes de esquina disponibles?</div>
      <div class="wa-b bot">Sí, tenemos el <b>K-04 (203 m²)</b>. ¿Le agendo una llamada con un asesor?</div>
    </div>
    <div class="hint" style="margin-top:14px">
      Las palabras las pone la IA de NUO. <b>Cada cifra en negrita sale de este suite</b>:
      el monto de la cuota y su vencimiento del plan de giros, el saldo de la cartera, y el
      lote libre del inventario. Si el suite no le avisa que K-04 se vendió, NUO lo sigue
      ofreciendo — por eso el aviso de vuelta no es un adorno.
    </div></div></div>`;
  C().innerHTML=h;
}

/* ============================================================ COMPRA EN LÍNEA */
let onlineState={paso:1,lote:null,cliente:{},girosSaldo:60,reserva:2500};
function wizardBody(){
  const s=onlineState;
  let h=`<div class="steps">${['Elegir lote','Tus datos','Financiamiento','Firma'].map((t,i)=>{
    const n=i+1,cls=s.paso===n?'active':(s.paso>n?'done':'');
    return `<div class="step ${cls}">${n}. ${t}</div>`;}).join('')}</div>`;
  if(s.paso===1){
    const disp=DB.lotes.filter(l=>l.estado==='disponible'&&l.precio>0);
    h+=`<div class="field full"><label>Elige tu lote disponible</label>
      <select id="ol-lote">${disp.map(l=>`<option value="${esc(claveDe(l))}">${l.codigo}${l.fase?` · ${l.fase}`:''} · ${l.area} m² · ${Qk(l.precio)}</option>`).join('')}</select></div>
      <div class="hint">${disp.length} lotes disponibles en La Esperanza.</div>
      <div class="btn-row"><button class="btn btn-primary" onclick="onlineNext(1)">Continuar →</button></div>`;
  } else if(s.paso===2){
    h+=`<div class="form-grid">
      <div class="field"><label>Nombres</label><input id="ol-nom" value="${esc(s.cliente.nom||'')}"></div>
      <div class="field"><label>Apellidos</label><input id="ol-ape" value="${esc(s.cliente.ape||'')}"></div>
      <div class="field"><label>DPI (CUI)</label><input id="ol-dpi" value="${esc(s.cliente.dpi||'')}"></div>
      <div class="field"><label>Teléfono</label><input id="ol-tel" value="${esc(s.cliente.tel||'')}"></div>
      <div class="field full"><label>Correo</label><input id="ol-mail" value="${esc(s.cliente.mail||'')}"></div>
      </div><div class="btn-row"><button class="btn btn-ghost" onclick="onlineBack()">← Atrás</button>
      <button class="btn btn-primary" onclick="onlineNext(2)">Continuar →</button></div>`;
  } else if(s.paso===3){
    const l=getLote(s.clave || s.lote);
    h+=`<div class="fgrid"><div><div class="f-lbl">Lote</div><div class="f-val">${l.codigo} · ${Qk(l.precio)}</div></div></div>
      <div class="form-grid" style="margin-top:14px">
      <div class="field"><label>Reserva (Q)</label><input id="ol-res" type="number" value="${s.reserva}"></div>
      <div class="field"><label>Plazo del saldo (meses)</label><input id="ol-plz" type="number" value="${s.girosSaldo}"></div>
      </div><div class="hint">Estructura del contrato: Reserva + Cuota Inicial (10%) + Saldo Deudor.</div>
      <div class="btn-row"><button class="btn btn-ghost" onclick="onlineBack()">← Atrás</button>
      <button class="btn btn-primary" onclick="onlineNext(3)">Continuar →</button></div>`;
  } else if(s.paso===4){
    const l=getLote(s.clave || s.lote), ini=Math.round(l.precio*0.10), sal=l.precio-s.reserva-ini;
    h+=`<div class="sect-t">Resumen de tu compra</div>
      <div class="money-row"><span>Lote ${l.codigo} (${l.area} m²)</span><span>${Q(l.precio)}</span></div>
      <div class="money-row"><span>Reserva</span><span>${Q(s.reserva)}</span></div>
      <div class="money-row"><span>Cuota inicial (10%) · 6 giros</span><span>${Q(ini)}</span></div>
      <div class="money-row"><span>Saldo deudor · ${s.girosSaldo} giros</span><span>${Q(sal)}</span></div>
      <div class="money-row total"><span>Cuota mensual del saldo</span><span>${Q(sal/s.girosSaldo)}</span></div>
      <div class="hint">Al firmar aceptas el contrato (firma electrónica válida en Guatemala, Decreto 47-2008).</div>
      <div class="btn-row"><button class="btn btn-ghost" onclick="onlineBack()">← Atrás</button>
      <button class="btn btn-gold" onclick="onlineFirmar()">✓ Firmar y enviar solicitud</button></div>`;
  } else {
    h+=`<div class="empty"><div style="font-size:40px">✓</div>
      <h2 style="color:var(--green);margin:8px 0">¡Solicitud enviada!</h2>
      <p>Tu contrato <b>${esc(s.creado||'')}</b> fue firmado y enviado al comité de crédito.</p>
      <div class="btn-row" style="justify-content:center"><button class="btn btn-primary" onclick="onlineReset()">Nueva compra</button></div></div>`;
  }
  return h;
}
function renderOnline(){C().innerHTML=`<div class="card"><div class="card-b">${wizardBody()}</div></div>`;}
function renderClientePortal(){
  document.getElementById('portalCliente').innerHTML=`
    <div class="portal-top"><div class="pt-brand">Sol Inmobiliaria<small>La Esperanza Residencial</small></div>
      <button class="btn btn-ghost btn-sm" onclick="logout()">← Salir</button></div>
    <div class="portal-hero"><h1>Compra tu lote en línea</h1>
      <p>Elige tu lote, completa tus datos y envía tu solicitud de financiamiento — 100% en línea.</p></div>
    <div class="portal-wrap"><div class="card"><div class="card-b">${wizardBody()}</div></div></div>
    <div class="portal-foot">SOL Desarrollos · San Miguel Pochuta, Guatemala</div>`;
}
function refreshWizard(){SCREEN==='cliente'?renderClientePortal():renderOnline();}
const v = id => document.getElementById(id)?.value||'';
function onlineNext(p){
  const s=onlineState;
  if(p===1)s.lote=v('ol-lote');
  if(p===2){s.cliente={nom:v('ol-nom'),ape:v('ol-ape'),dpi:v('ol-dpi'),tel:v('ol-tel'),mail:v('ol-mail')};
    if(!s.cliente.nom){toast('Ingresa tu nombre');return;}}
  if(p===3){s.reserva=+v('ol-res')||0;s.girosSaldo=+v('ol-plz')||60;}
  s.paso=p+1; refreshWizard();
}
function onlineBack(){onlineState.paso--;refreshWizard();}
async function onlineFirmar(){
  const s=onlineState;
  const ct=await nuevoContrato({lote:s.lote,nombre:`${s.cliente.nom} ${s.cliente.ape}`.trim(),dpi:s.cliente.dpi,
    telefono:s.cliente.tel,email:s.cliente.mail,vendedor:'Compra en línea',reserva:s.reserva,
    girosSaldo:s.girosSaldo,origen:'En línea'});
  if(!ct) return;                     // no se creó · el motivo ya se mostró
  s.creado=ct.no; s.paso=5; refreshWizard(); toast('Contrato '+ct.no+' creado');
}
function onlineReset(){onlineState={paso:1,lote:null,cliente:{},girosSaldo:60,reserva:2500};refreshWizard();}

/* ============================================================ DRAWER */
function abrirLote(codigo){
  const l=getLote(codigo), ct=contratoDeLote(codigo);
  if(ct){abrirContrato(ct.id);return;}
  const m=ESTADO_MAP[l.estado]||ESTADO_MAP.disponible;
  let h=drawerHead(`Lote ${l.codigo}`,`Manzana ${l.manzana} · ${l.area} m² · ${l.precio?Qk(l.precio):'Precio por definir'}`,
    l.estado==='vendido'?'b-vend':(l.estado==='reservado'?'b-apar':'b-disp'), m.label);
  h+=`<div class="drawer-b"><div class="sect-t">Ficha del lote</div>
    <div class="fgrid">
      <div><div class="f-lbl">Código</div><div class="f-val">${l.codigo}</div></div>
      <div><div class="f-lbl">Área</div><div class="f-val">${l.area} m²</div></div>
      <div><div class="f-lbl">Precio lista</div><div class="f-val">${l.precio?Q(l.precio):'—'}</div></div>
      <div><div class="f-lbl">Precio / m²</div><div class="f-val">${l.precio?Q(l.precio/l.area):'—'}</div></div>
      <div><div class="f-lbl">Tipo</div><div class="f-val">${l.tipo||'—'}</div></div>
      <div><div class="f-lbl">En el plano</div><div class="f-val">${l.x!=null?'Ubicado':'Sin coordenadas'}</div></div>
    </div>`;
  if(l.estado==='disponible'&&ROLE!=='cobrador')
    h+=`<div class="btn-row"><button class="btn btn-primary" onclick="modalNuevoContrato('${l.codigo}')">Vender este lote</button></div>`;
  h+=`</div>`; openDrawer(h);
}
function abrirCliente(id){
  const c=getCliente(id); if(!c)return;
  const cts=DB.contratos.filter(x=>x.clienteId===id);
  let h=drawerHead(`${esc(c.nombre)} ${esc(c.apellido)}`,`Cliente · ${cts.length} contrato(s)`,'b-ok','Socio');
  h+=`<div class="drawer-b"><div class="sect-t">Información del cliente</div>
    <div class="fgrid">
      <div class="f-full"><div class="f-lbl">Nombre completo</div><div class="f-val">${esc(c.nombre)} ${esc(c.apellido)}</div></div>
      <div><div class="f-lbl">DPI / CUI</div><div class="f-val">${esc(c.dpi)||'—'}</div></div>
      <div><div class="f-lbl">Teléfono</div><div class="f-val">${esc(c.telefono)||'—'}</div></div>
      <div class="f-full"><div class="f-lbl">Correo</div><div class="f-val">${esc(c.email)||'—'}</div></div>
      <div class="f-full"><div class="f-lbl">Dirección</div><div class="f-val">${esc(c.direccion)||'—'}</div></div>
    </div>
    <div class="btn-row"><button class="btn btn-ghost btn-sm" onclick="modalEditarCliente('${c.id}')">Editar información</button></div>
    <div class="sect-t">Contratos</div>`;
  if(!cts.length)h+=`<div class="empty">Sin contratos</div>`;
  cts.forEach(ct=>{const ec=estadoCuenta(ct);
    h+=`<div class="pay-item" style="cursor:pointer" onclick="abrirContrato('${ct.id}')">
      <div class="pay-ico">◫</div><div class="pay-main"><div class="pay-title">${ct.no} · Lote ${ct.lote}</div>
      <div class="pay-sub">${fmtD(ct.fecha)} · saldo ${Qk(ec.saldo)}</div></div>
      <div class="pay-amt">${Qk(ct.precio)}</div></div>`;});
  h+=`</div>`; openDrawer(h);
}
function abrirContrato(id,tab){
  const ct=getContrato(id); if(!ct)return;
  drawerCt=id; drawerTab=tab||'ficha';
  pintarContrato();
}
function pintarContrato(){
  const ct=getContrato(drawerCt); if(!ct)return;
  const ec=estadoCuenta(ct), cli=getCliente(ct.clienteId);
  let h=drawerHead(ct.no,`Lote ${ct.lote} · ${esc(nombreCliente(ct.clienteId))}`,
    ct.estado==='aprobado'?'b-ok':(ct.estado==='anulado'?'b-mora':'b-pend'),
    {aprobado:'Aprobado',en_aprobacion:'En aprobación',anulado:'Anulado'}[ct.estado]||ct.estado);
  h+=`<div class="tabs">`+[['ficha','Ficha'],['cuenta','Estado de cuenta'],['gestiones','Gestiones'],['docs','Documentos']]
    .map(([k,l])=>`<button class="tab ${drawerTab===k?'active':''}" onclick="drawerTab='${k}';pintarContrato()">${l}</button>`).join('')+`</div>`;
  h+=`<div class="drawer-b">`;

  if(drawerTab==='ficha'){
    h+=`<div class="sect-t">Datos del contrato</div><div class="fgrid">
      <div><div class="f-lbl">No. contrato</div><div class="f-val">${ct.no}</div></div>
      <div><div class="f-lbl">Fecha</div><div class="f-val">${fmtD(ct.fecha)}</div></div>
      <div><div class="f-lbl">Lote</div><div class="f-val">${ct.lote}</div></div>
      <div><div class="f-lbl">Precio de venta</div><div class="f-val">${Q(ct.precio)}</div></div>
      <div><div class="f-lbl">Vendedor</div><div class="f-val">${esc(ct.vendedor)}</div></div>
      <div><div class="f-lbl">Origen</div><div class="f-val">${esc(ct.origen||'—')}</div></div>
      <div><div class="f-lbl">Firma</div><div class="f-val">${ct.firma}</div></div>
      <div><div class="f-lbl">Fuente</div><div class="f-val">${ct.fuente||'Suite'}</div></div>
    </div>
    <div class="sect-t">Cliente</div><div class="fgrid">
      <div class="f-full"><div class="f-lbl">Nombre</div><div class="f-val">${esc(nombreCliente(ct.clienteId))}</div></div>
      <div><div class="f-lbl">DPI / CUI</div><div class="f-val">${esc(cli&&cli.dpi)||'—'}</div></div>
      <div><div class="f-lbl">Teléfono</div><div class="f-val">${esc(cli&&cli.telefono)||'—'}</div></div>
      <div class="f-full"><div class="f-lbl">Correo</div><div class="f-val">${esc(cli&&cli.email)||'—'}</div></div>
    </div>
    <div class="btn-row">${typeof generarContrato==='function'
        ? `<button class="btn btn-gold btn-sm" onclick="generarContrato('${ct.id}')">📄 Generar contrato</button>`
        : ''}
      <button class="btn btn-ghost btn-sm" onclick="abrirCliente('${ct.clienteId}')">Ver ficha del cliente</button></div>
    <div class="sect-t">Integrantes del contrato</div>`;
    const ints=ct.integrantes||[];
    if(!ints.length)h+=`<div class="hint">Sin cotitulares registrados.</div>`;
    ints.forEach(i=>{h+=`<div class="money-row"><span>${esc(i.nombre)}</span><span class="pill">${esc(i.cargo)}</span></div>`;});
    h+=`<div class="btn-row"><button class="btn btn-ghost btn-sm" onclick="modalIntegrante('${ct.id}')">+ Agregar integrante</button></div>`;
    if(ct.estado==='en_aprobacion')
      h+=`<div class="btn-row"><button class="btn btn-primary" onclick="doAprobar('${ct.id}');closeDrawer()">Aprobar crédito</button>
        <button class="btn btn-ghost" onclick="doRechazar('${ct.id}');closeDrawer()">Rechazar</button></div>`;
  }

  if(drawerTab==='cuenta'){
    h+=estadoCuentaHTML(ct,ec);
    if(ct.estado==='aprobado')
      h+=`<div class="btn-row"><button class="btn btn-primary" onclick="modalPago('${ct.id}')">Registrar pago</button>
        <button class="btn btn-ghost" onclick="verEstadoCuenta('${ct.id}')">Ver completo / imprimir</button>
        <button class="btn btn-ghost" onclick="enviarEC('${ct.id}')">Enviar por WhatsApp</button></div>`;
  }

  if(drawerTab==='gestiones'){
    h+=`<div class="btn-row" style="margin-top:0"><button class="btn btn-primary btn-sm" onclick="modalGestion('${ct.id}')">+ Registrar gestión</button></div>`;
    const gs=gestionesDe(ct.id);
    if(!gs.length)h+=`<div class="empty">Sin gestiones registradas</div>`;
    gs.forEach(g=>{h+=`<div class="pay-item"><div class="pay-ico">✎</div>
      <div class="pay-main"><div class="pay-title">${esc(g.tipo)} · <span class="pill">${esc(g.resultado)}</span></div>
      <div class="pay-sub">${esc(g.fecha)} · ${esc(g.usuario)}</div>
      ${g.comentario?`<div style="font-size:12.5px;margin-top:3px">${esc(g.comentario)}</div>`:''}</div></div>`;});
  }

  if(drawerTab==='docs'){
    h+=`<div class="btn-row" style="margin-top:0"><button class="btn btn-primary btn-sm" onclick="modalDocumento('${ct.id}')">+ Subir respaldo</button></div>`;

    /* Lo que falta va arriba. Un expediente completo no necesita que
       nadie lo mire; lo accionable es el hueco. */
    const falta=(typeof faltantesDe==='function'?faltantesDe(ct):[]).filter(f=>f.grave);
    if(falta.length)
      h+=`<div class="aviso-err" style="margin:10px 0">Falta respaldo: ${falta.map(f=>esc(f.que)).join(' · ')}</div>`;

    const ds=documentosDe(ct.id);
    if(!ds.length)h+=`<div class="empty">Expediente vacío</div>`;
    ds.forEach(d=>{
      const hayArchivo=!!(d.bucket&&d.ruta);
      const peso=d.bytes?` · ${(d.bytes/1048576).toFixed(1)} MB`:'';
      const cara=d.cara?` · ${esc(d.cara)}`:'';
      h+=`<div class="pay-item"><div class="pay-ico">${hayArchivo?'🗎':'⚠'}</div>
      <div class="pay-main"><div class="pay-title">${esc(d.nombre)}</div>
      <div class="pay-sub">${esc(d.tipo)}${cara} · ${fmtD(d.fecha)}${peso}${
        hayArchivo?'':' · <b>anotado, sin archivo</b>'}</div></div>
      ${hayArchivo?`<button class="btn btn-ghost btn-sm" onclick="verDocumento('${d.id}')">Ver</button>`:''}</div>`;});
  }
  h+=`</div>`; openDrawer(h);
}
/* ---------- ESTADO DE CUENTA (sin desglose capital/interés) ---------- */
/* Filas: Monto debido (saldo antes) → Cuota → Monto final (saldo después) */
function filasEstadoCuenta(ct){
  const plan=ct.plan||planFinanciamiento(ct.precio,(ct.obligaciones[0]||{}).monto||ENGANCHE_MIN,
             (ct.obligaciones[1]||{}).nGiros||60);
  const filas=[]; let saldo=0;
  ct.obligaciones.forEach(o=>{ saldo+=o.monto; });
  const totalPlan=saldo;
  let restante=totalPlan;
  ct.obligaciones.forEach(o=>{
    o.giros.forEach(g=>{
      const antes=restante; restante=r2(restante-g.monto);
      filas.push({obl:o.desc,n:g.n,de:o.nGiros,venc:g.venc,cuota:g.monto,
                  debido:antes,final:Math.max(0,restante),estado:g.estado});
    });
  });
  return {filas,totalPlan,plan};
}
function estadoCuentaHTML(ct,ec,completo){
  const {filas,totalPlan,plan}=filasEstadoCuenta(ct);
  const pagado=filas.filter(f=>f.estado==='pagado').reduce((s,f)=>s+f.cuota,0);
  const pend=Math.max(0,totalPlan-pagado);
  const prox=filas.find(f=>f.estado!=='pagado');
  const venc=filas.filter(f=>f.estado==='vencido');
  const pct=totalPlan?Math.round(pagado/totalPlan*100):0;
  const mora=calcularMora(ct);
  let h=`<div class="ec">
    <div class="ec-hero">
      <div class="ec-hero-l">
        <div class="ec-lbl">Saldo pendiente</div>
        <div class="ec-big">${Q(pend)}</div>
        <div class="ec-bar"><span style="width:${pct}%"></span></div>
        <div class="ec-mini">${pct}% pagado · ${filas.filter(f=>f.estado==='pagado').length} de ${filas.length} cuotas</div>
      </div>
      <div class="ec-hero-r">
        ${prox?`<div class="ec-next"><span>Próxima cuota</span><b>${Q(prox.cuota)}</b><i>vence ${fmtD(prox.venc)}</i></div>`
              :`<div class="ec-next ok"><span>Plan</span><b>Liquidado</b><i>sin saldo</i></div>`}
        ${venc.length?`<div class="ec-mora"><span>${venc.length} cuota(s) vencida(s)</span><b>${Q(venc.reduce((s,f)=>s+f.cuota,0))}</b>
          ${mora.total>0?`<i style="display:block;font-size:11.5px;color:#f3cfc8;font-style:normal;margin-top:4px">+ ${Q(mora.total)} de mora (${(TASA_MORA*100).toFixed(0)}% mensual)</i>`:''}</div>`:''}
      </div>
    </div>
    <div class="ec-grid">
      <div><span>Precio de venta</span><b>${Q(ct.precio)}</b></div>
      <div><span>Cuota inicial</span><b>${Q(plan.enganche)}</b></div>
      <div><span>Plazo</span><b>${plan.plazo} meses</b></div>
      <div><span>Cuota mensual</span><b>${Q(plan.cuota)}</b></div>
      <div><span>Total del plan</span><b>${Q(totalPlan)}</b></div>
      <div><span>Pagado a la fecha</span><b>${Q(pagado)}</b></div>
      ${mora.total>0?`<div><span>Mora acumulada</span><b style="color:var(--vend)">${Q(mora.total)}</b></div>
      <div><span>Total a pagar hoy</span><b>${Q(venc.reduce((s,f)=>s+f.cuota,0)+mora.total)}</b></div>`:''}
    </div>
    <div class="hint" style="margin:-6px 0 14px">La cuota inicial se constituye en <b>arras</b> y derecho de reserva (cláusula quinta del contrato).</div>`;
  const muestra = completo? filas : filas.slice(0, Math.min(filas.length, Math.max(8,(filas.findIndex(f=>f.estado!=='pagado')+6))));
  h+=`<table class="ec-tbl"><thead><tr>
      <th>Cuota</th><th>Vence</th><th class="num">Monto debido</th>
      <th class="num">Cuota</th><th class="num">Monto final</th><th></th></tr></thead><tbody>`;
  muestra.forEach(f=>{
    const cls=f.estado==='pagado'?'pg':(f.estado==='vencido'?'vn':(f.estado==='parcial'?'pc':''));
    const ic={pagado:'✓',vencido:'!',parcial:'≈'}[f.estado]||'';
    h+=`<tr class="${cls}">
      <td><b>${f.n}</b><span class="ec-de">/${f.de}</span><div class="ec-obl">${f.obl}</div></td>
      <td>${fmtD(f.venc)}</td>
      <td class="num">${Q(f.debido)}</td>
      <td class="num"><b>${Q(f.cuota)}</b></td>
      <td class="num">${Q(f.final)}</td>
      <td class="ec-st">${ic}</td></tr>`;});
  h+=`</tbody></table>`;
  if(!completo&&muestra.length<filas.length)
    h+=`<div class="hint" style="text-align:center">Mostrando ${muestra.length} de ${filas.length} cuotas · <a href="#" onclick="verEstadoCuenta('${ct.id}');return false;">ver el plan completo</a></div>`;
  h+=`</div>`;
  return h;
}
function verEstadoCuenta(id){
  const ct=getContrato(id); if(!ct)return;
  const ec=estadoCuenta(ct), cli=getCliente(ct.clienteId);
  const w=window.open('','_blank'); if(!w){toast('Permite las ventanas emergentes');return;}
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
    <title>Estado de cuenta ${ct.no}</title><link rel="stylesheet" href="styles.css">
    <style>body{background:#fff;padding:28px;max-width:860px;margin:0 auto}
      .ec-print-h{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #14342B;padding-bottom:14px;margin-bottom:18px}
      .ec-print-h h1{font-size:20px;color:#14342B}.ec-print-h p{font-size:13px;color:#6B7A72;margin-top:3px}
      .ec-print-h .brand{text-align:right;font-weight:800;color:#14342B}
      .ec-print-h .brand small{display:block;font-size:10px;letter-spacing:2px;color:#E0A72E}
      @media print{.noprint{display:none}}</style></head><body>
    <div class="ec-print-h"><div><h1>Estado de cuenta</h1>
      <p><b>${ct.no}</b> · Lote ${ct.lote}<br>${esc(nombreCliente(ct.clienteId))}${cli&&cli.dpi?' · DPI '+esc(cli.dpi):''}</p></div>
      <div class="brand">SOL Desarrollos<small>LA ESPERANZA</small>
      <p style="font-weight:400;font-size:11px;color:#6B7A72;margin-top:6px">Emitido ${fmtD(HOY_ISO)}</p></div></div>
    ${estadoCuentaHTML(ct,ec,true)}
    <div class="noprint" style="text-align:center;margin-top:24px">
      <button class="btn btn-primary" onclick="window.print()">Imprimir / Guardar PDF</button></div>
    </body></html>`);
  w.document.close();
}
function enviarEC(id){
  const ct=getContrato(id); const {filas,totalPlan,plan}=filasEstadoCuenta(ct);
  const pagado=filas.filter(f=>f.estado==='pagado').reduce((s,f)=>s+f.cuota,0);
  const prox=filas.find(f=>f.estado!=='pagado');
  const cli=getCliente(ct.clienteId);
  const txt=`*Estado de cuenta · ${ct.no}*\n${nombreCliente(ct.clienteId)} · Lote ${ct.lote}\n\n`+
    `Total del plan: ${Q(totalPlan)}\nPagado: ${Q(pagado)}\n*Saldo: ${Q(totalPlan-pagado)}*\n`+
    (prox?`\nPróxima cuota: ${Q(prox.cuota)}\nVence: ${fmtD(prox.venc)}\n`:'\nPlan liquidado\n')+
    `\nSOL Desarrollos · La Esperanza`;
  const tel=(cli&&cli.telefono||'').replace(/\D/g,'');
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(txt)}`,'_blank');
  /* Anotación de bitácora: no se espera a propósito. Si falla, se queda
     en consola y no estorba el envío, que es lo que el usuario pidió. */
  void registrarGestion(id,'Recordatorio de Pago','Contactado','Estado de cuenta enviado por WhatsApp');
  toast('Estado de cuenta listo para enviar');
}

function drawerHead(id,meta,cls,txt){
  return `<div class="drawer-head"><button class="close" onclick="closeDrawer()">×</button>
    <div class="lid">${id}</div><div class="lmeta">${meta}</div>
    <span class="badge ${cls}" style="margin-top:10px">${txt}</span></div>`;
}
function openDrawer(h){const d=document.getElementById('drawer');d.innerHTML=h;d.hidden=false;document.getElementById('scrim').hidden=false;}
function closeDrawer(){document.getElementById('drawer').hidden=true;document.getElementById('scrim').hidden=true;drawerCt=null;}

/* ============================================================ MODALES */
function modalNuevoContrato(loteSel,pre){
  pre=pre||{};
  const disp=DB.lotes.filter(l=>l.estado==='disponible'&&l.precio>0);
  const nom=(pre.nombre||'').split(' ');
  const campo=(id,label,extra,ancho)=>`<div class="field ${ancho||''}">
    <label>${label} *</label><input id="n-${id}" ${extra||''}><div class="err" id="e-${id}"></div></div>`;
  openModal(`<div class="modal-h"><h3>Nueva venta</h3>
      <p>Sin el expediente completo no se puede cerrar — sin teléfono no hay a quién cobrarle</p></div>
    <div class="modal-b">
      <div class="sect-t">El lote</div>
      <div class="form-grid">
        <div class="field"><label>Lote *</label><select id="n-lote" onchange="prevPlan()">${disp.map(l=>`<option value="${esc(claveDe(l))}" ${claveDe(l)===loteSel||l.codigo===loteSel?'selected':''}>${l.codigo}${l.fase?` · ${l.fase}`:''} · ${l.area} m² · ${Qk(l.precio)}</option>`).join('')}</select></div>
        <div class="field"><label>Vendedor</label><select id="n-vend">${vendedores().map(x=>`<option>${esc(x.nombre)}</option>`).join('')}</select></div>
        <div class="field"><label>Enganche (Q)</label><input id="n-res" type="number" value="${pre.enganche||ENGANCHE_MIN}" oninput="prevPlan()"></div>
        <div class="field"><label>Plazo (meses)</label><select id="n-plz" onchange="prevPlan()">
          ${PLAZOS.map(p=>`<option value="${p}" ${p===(pre.plazo||60)?'selected':''}>${p} meses</option>`).join('')}</select></div>
      </div>
      <div id="n-prev" class="prev-plan"></div>

      <div class="sect-t" style="margin-top:18px">El comprador</div>
      <div class="form-grid">
        ${campo('nom','Nombres',`value="${esc(nom.slice(0,2).join(' '))}"`)}
        ${campo('ape','Apellidos',`value="${esc(nom.slice(2).join(' '))}"`)}
        ${campo('dpi','DPI (CUI)','placeholder="13 dígitos" inputmode="numeric"')}
        ${campo('tel','Teléfono celular','placeholder="5555 5555" inputmode="numeric"')}
        ${campo('mail','Correo electrónico','type="email" placeholder="nombre@correo.com"','full')}
        ${campo('dir','Dirección de residencia','placeholder="Aldea, municipio, departamento"','full')}
      </div>

      <div class="sect-t" style="margin-top:18px">Ocupación e ingresos</div>
      <div class="form-grid">
        ${campo('ocup','Ocupación u oficio','placeholder="Agricultor, comerciante, maestra..."')}
        <div class="field"><label>Ingreso promedio al mes (Q) *</label>
          <input id="n-ingreso" type="number" oninput="prevCarga()"><div class="err" id="e-ingreso"></div></div>
        <div class="field full"><label>¿Cómo comprueba su ingreso? *</label>
          <select id="n-fuente" onchange="pistaConstancia()">
            <option value="">— elegir —</option>
            ${CONSTANCIAS.map(c=>`<option value="${c.id}">${c.label}</option>`).join('')}
          </select><div class="err" id="e-fuente"></div>
          <div class="hint" id="n-pista" style="margin-top:6px"></div></div>
      </div>
      <div id="n-carga"></div>

      <!-- No siempre es un pariente: a veces es el fiador, el patrono o
           un amigo. Lo que importa es que sea OTRA persona a quien se
           pueda llamar, no de quién es pariente. -->
      <div class="sect-t" style="margin-top:18px">Referencia · pariente, fiador o quien responda</div>
      <div class="hint" style="margin-bottom:10px">Tiene que ser un contacto distinto: si el cliente cambia de número, es a quien se llama.</div>
      <div class="form-grid">
        ${campo('pnom','Nombre')}
        ${campo('ptel','Teléfono celular','placeholder="5555 5555" inputmode="numeric"')}
        ${campo('pmail','Correo','type="email"','full')}
        ${campo('pdir','Dirección','','full')}
      </div>
      <div id="n-errores"></div>
    </div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="crearContrato()">Generar contrato</button></div>`);
  prevPlan();
}

/* Qué documento sirve de constancia, según lo que la persona haga. */
const CONSTANCIAS = [
  { id:'boleta',     label:'Trabajo formal · boleta de pago o constancia laboral', peso:3,
    pista:'Pídele la constancia con sello y firma del patrono, o las últimas dos boletas.' },
  { id:'igss',       label:'Trabajo formal · certificación del IGSS',              peso:3,
    pista:'La historia laboral del IGSS se saca en línea y es difícil de falsificar.' },
  { id:'banco',      label:'Estados de cuenta bancarios (3 a 6 meses)',            peso:3,
    pista:'Es la mejor prueba para quien no tiene patrono. Ya tiene cuenta si deposita en Banrural.' },
  { id:'sat',        label:'Inscrito en SAT · RTU o pequeño contribuyente',        peso:2,
    pista:'Sirve el RTU actualizado o las últimas declaraciones de pequeño contribuyente.' },
  { id:'patente',    label:'Negocio propio · patente de comercio',                 peso:2,
    pista:'Acompáñala de fotos del negocio y, si se puede, de un cuaderno de ventas.' },
  { id:'cooperativa',label:'Agricultor · constancia de cooperativa o beneficio',   peso:2,
    pista:'En Pochuta sirve la liquidación de cosecha del beneficio de café.' },
  { id:'municipal',  label:'Constancia de la municipalidad o alcalde auxiliar',    peso:1,
    pista:'Vale como referencia de arraigo, no tanto de ingreso. Combínala con otra.' },
  { id:'jurada',     label:'Solo declaración jurada del cliente',                  peso:0,
    pista:'⚠ Es la más débil. El comité debería pedir algo más o bajar el monto financiado.' },
];
const pesoConstancia = id => (CONSTANCIAS.find(c=>c.id===id)||{}).peso ?? 0;

function pistaConstancia(){
  const c=CONSTANCIAS.find(x=>x.id===v('n-fuente'));
  const el=document.getElementById('n-pista'); if(!el)return;
  el.innerHTML=c?esc(c.pista):'';
  prevCarga();
}
/* Relación cuota / ingreso — no bloquea, avisa. */
function prevCarga(){
  const el=document.getElementById('n-carga'); if(!el)return;
  const l=getLote(v('n-lote')); if(!l){el.innerHTML='';return;}
  const p=planFinanciamiento(l.precio,+v('n-res')||0,+v('n-plz')||60);
  const r=cargaSobreIngreso(p.cuota,+v('n-ingreso')||0);
  if(!r){el.innerHTML='';return;}
  const color=r.nivel==='riesgoso'?'var(--mora)':(r.nivel==='ajustado'?'#b8860b':'var(--green)');
  el.innerHTML=`<div class="hint" style="margin-top:8px">La cuota de <b>${Q(p.cuota)}</b> es el
    <b style="color:${color}">${Math.round(r.pct*100)}%</b> del ingreso declarado (${r.nivel}).
    ${r.aviso?'<br>'+esc(r.aviso):''}</div>`;
}

function prevPlan(){
  const l=getLote(v('n-lote')); if(!l)return;
  const p=planFinanciamiento(l.precio,+v('n-res')||0,+v('n-plz')||60);
  const el=document.getElementById('n-prev'); if(!el)return;
  el.innerHTML=`<div class="pp-row"><span>Saldo a financiar</span><b>${Q(p.saldo)}</b></div>
    <div class="pp-row"><span>Cuota mensual</span><b class="pp-big">${Q(p.cuota)}</b></div>
    <div class="pp-row"><span>Total del plan</span><b>${Q(p.total)}</b></div>`;
}
async function crearContrato(){
  const d={}; CAMPOS_VENTA.forEach(c=>{ d[c.id]=v('n-'+c.id); });
  document.querySelectorAll('.err').forEach(e=>e.textContent='');

  const r=validarVenta(d);
  if(!r.ok){
    r.errores.forEach(e=>{const el=document.getElementById('e-'+e.campo); if(el) el.textContent=e.msg;});
    const caja=document.getElementById('n-errores');
    if(caja) caja.innerHTML=`<div class="aviso-err">Faltan ${r.errores.length} dato(s) para poder cerrar la venta.
      <br><span class="hint">Sin teléfono ni referencia no hay a quién cobrarle después. Hoy hay 90 contratos en mora sin un solo número registrado.</span></div>`;
    const primero=document.getElementById('n-'+r.errores[0].campo);
    if(primero&&primero.scrollIntoView) primero.scrollIntoView({block:'center',behavior:'smooth'});
    toast('Faltan '+r.errores.length+' dato(s) obligatorio(s)');
    return;
  }

  const ct=await conBoton(()=>nuevoContrato({lote:v('n-lote'),nombre:`${d.nom} ${d.ape}`.trim(),dpi:validaDPI(d.dpi).valor,
    telefono:validaTel(d.tel).valor,email:validaMail(d.mail).valor,
    direccion:d.dir, ocupacion:d.ocup, ingresoMensual:+String(d.ingreso).replace(/[^\d.]/g,''),
    constancia:d.fuente, pesoConstancia:pesoConstancia(d.fuente),
    pariente:{nombre:d.pnom, telefono:validaTel(d.ptel).valor, email:validaMail(d.pmail).valor, direccion:d.pdir},
    vendedor:v('n-vend'),enganche:+v('n-res')||ENGANCHE_MIN,
    plazo:+v('n-plz')||60,origen:'Campo'}));
  if(!ct) return;                     // no se creó · el motivo ya se mostró

  const carga=cargaSobreIngreso(planFinanciamiento(getLote(v('n-lote')).precio,+v('n-res')||0,+v('n-plz')||60).cuota,
                                +String(d.ingreso).replace(/[^\d.]/g,''));
  if(carga) ct.cargaIngreso=carga.pct;
  saveDB();

  closeModal();
  toast('Contrato '+ct.no+' generado → Aprobación');
  if(carga&&carga.nivel==='riesgoso')
    setTimeout(()=>toast('Ojo: la cuota es el '+Math.round(carga.pct*100)+'% del ingreso declarado'),2800);
  setView(ROLE==='vendedor'?'vender':'aprobacion');
}
function modalPago(id){
  const ct=getContrato(id), ec=estadoCuenta(ct);
  openModal(`<div class="modal-h"><h3>Registrar pago</h3><p>${ct.no} · ${esc(nombreCliente(ct.clienteId))}</p></div>
    <div class="modal-b"><div class="form-grid">
      <div class="field"><label>Monto (Q) *</label><input id="p-monto" type="number" value="${ec.prox?ec.prox.monto:''}"></div>
      <div class="field"><label>Forma de pago</label><select id="p-forma">${CATALOGOS.formasPago.map(f=>`<option>${f}</option>`).join('')}</select></div>
      <div class="field"><label>Cuenta acreditada</label><select id="p-cta">${CATALOGOS.cuentas.map(f=>`<option>${f}</option>`).join('')}</select></div>
      <div class="field"><label>No. boleta / referencia</label><input id="p-ref"></div>
    </div><div class="hint">Queda como <b>registrado</b> y pasa a Confirmación de pagos.</div></div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarPago('${id}')">Guardar boleta</button></div>`);
}
async function guardarPago(id){
  const monto=+v('p-monto'); if(!monto||monto<=0){toast('Ingresa un monto válido');return;}
  const p=await conBoton(()=>registrarPago(id,{monto,forma:v('p-forma'),cuenta:v('p-cta'),referencia:v('p-ref')}));
  if(!p) return;
  await registrarGestion(id,'Cobranza','Cobranza Satisfactória','Boleta registrada por '+Q(monto));
  closeModal(); toast('Pago registrado · pendiente de confirmar'); pintarContrato();
}
function modalGestion(id){
  openModal(`<div class="modal-h"><h3>Registrar gestión</h3><p>Bitácora de seguimiento</p></div>
    <div class="modal-b"><div class="form-grid">
      <div class="field"><label>Tipo</label><select id="g-tipo">${CATALOGOS.tiposGestion.map(x=>`<option>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Resultado</label><select id="g-res">${CATALOGOS.resultadosGestion.map(x=>`<option>${x}</option>`).join('')}</select></div>
      <div class="field full"><label>Comentario</label><input id="g-com" placeholder="Detalle de la gestión"></div>
    </div></div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarGestion('${id}')">Guardar</button></div>`);
}
async function guardarGestion(id){
  await conBoton(()=>registrarGestion(id,v('g-tipo'),v('g-res'),v('g-com')));
  closeModal(); toast('Gestión registrada ✓'); drawerTab='gestiones'; pintarContrato();
}
/* ---------- Subir el respaldo ----------
   Antes esto pedía el NOMBRE del archivo y avisaba «en producción esto
   sube el archivo al expediente digital». O sea: el expediente se daba
   por completo con papeles que nadie había subido nunca.

   Ahora sube el archivo de verdad, a un bucket privado, y la fila solo
   cuenta como respaldo si el archivo llegó. Qué papeles se piden lo dice
   el catálogo de la base, no esta lista. */
const DOCS_REQ = () => (typeof DB !== 'undefined' && DB.documentosRequeridos && DB.documentosRequeridos.length)
  ? DB.documentosRequeridos
  : [{codigo:'dpi',        nombre:'DPI del titular',      caras:2, obligatorio:true},
     {codigo:'contrato',   nombre:'Contrato firmado',     caras:1, obligatorio:true},
     {codigo:'plan_pagos', nombre:'Plan de pagos firmado',caras:1, obligatorio:true}];

function modalDocumento(id){
  const reqs=DOCS_REQ();
  openModal(`<div class="modal-h"><h3>Subir respaldo</h3><p>Expediente del contrato</p></div>
    <div class="modal-b"><div class="form-grid">
      <div class="field"><label>¿Qué documento es?</label><select id="d-tipo" onchange="docCaras()">
        ${reqs.map(r=>`<option value="${r.codigo}" data-caras="${r.caras}">${esc(r.nombre)}${r.obligatorio?' *':''}</option>`).join('')}
      </select></div>
      <div class="field" id="d-caraBox" hidden><label>¿Qué cara?</label>
        <select id="d-cara"><option value="frente">Frente</option><option value="reverso">Reverso</option></select></div>
      <div class="field full"><label>Archivo</label>
        <input id="d-archivo" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></div>
    </div>
    <div class="hint">Foto o PDF. El DPI va por las dos caras — el reverso trae la dirección.
      Queda en un expediente privado: no hay enlace público a un DPI.</div></div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarDoc('${id}')">Subir</button></div>`);
  docCaras();
}
function docCaras(){
  const sel=document.getElementById('d-tipo'); if(!sel)return;
  const op=sel.options[sel.selectedIndex];
  const caja=document.getElementById('d-caraBox');
  if(caja) caja.hidden = !(op && +op.dataset.caras > 1);
}
async function guardarDoc(id){
  const codigo=v('d-tipo');
  const entrada=document.getElementById('d-archivo');
  const archivo=entrada&&entrada.files&&entrada.files[0];
  if(!archivo){toast('Elige el archivo a subir');return;}
  const caja=document.getElementById('d-caraBox');
  const cara=(caja&&!caja.hidden)?v('d-cara'):null;

  const r=await conBoton(()=>agregarDocumento(id,codigo,archivo,cara));
  if(!r) return;
  closeModal(); toast('Documento subido ✓'); drawerTab='docs'; pintarContrato();
}

/* Abrir un documento es pedir una URL firmada que caduca a los dos
   minutos. Nunca hay un enlace permanente a un DPI. */
async function verDocumento(docId){
  const d=(DB.documentos||[]).find(x=>String(x.id)===String(docId));
  if(!d) return toast('No se encontró el documento');
  if(!d.bucket||!d.ruta)
    return toast('Ese documento se anotó pero nunca se subió el archivo',6000,true);
  const r=await sbVerDocumento(d.bucket,d.ruta);
  if(!r.ok) return toast(r.error,6000,true);
  window.open(r.dato,'_blank','noopener');
}
function modalIntegrante(id){
  const cargos=['Titular','Cotitular','Fiador','Beneficiario','Representante'];
  openModal(`<div class="modal-h"><h3>Agregar integrante</h3><p>Cotitular del contrato</p></div>
    <div class="modal-b"><div class="form-grid">
      <div class="field"><label>Nombre completo</label><input id="i-nom"></div>
      <div class="field"><label>Cargo ejercido</label><select id="i-cargo">${cargos.map(x=>`<option>${x}</option>`).join('')}</select></div>
    </div></div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarIntegrante('${id}')">Agregar</button></div>`);
}
async function guardarIntegrante(id){
  const n=v('i-nom'); if(!n){toast('Ingresa el nombre');return;}
  const r=await conBoton(()=>agregarIntegrante(id,n,v('i-cargo')));
  if(!r) return;
  closeModal(); toast('Integrante agregado ✓'); drawerTab='ficha'; pintarContrato();
}
function modalEditarCliente(id){
  const c=getCliente(id);
  openModal(`<div class="modal-h"><h3>Editar cliente</h3><p>${esc(c.nombre)} ${esc(c.apellido)}</p></div>
    <div class="modal-b"><div class="form-grid">
      <div class="field"><label>Nombres</label><input id="c-nom" value="${esc(c.nombre)}"></div>
      <div class="field"><label>Apellidos</label><input id="c-ape" value="${esc(c.apellido)}"></div>
      <div class="field"><label>DPI (CUI)</label><input id="c-dpi" value="${esc(c.dpi)}"></div>
      <div class="field"><label>Teléfono</label><input id="c-tel" value="${esc(c.telefono)}"></div>
      <div class="field full"><label>Correo</label><input id="c-mail" value="${esc(c.email)}"></div>
      <div class="field full"><label>Dirección</label><input id="c-dir" value="${esc(c.direccion)}"></div>
    </div></div>
    <div class="modal-f"><button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="guardarCliente('${id}')">Guardar</button></div>`);
}
function guardarCliente(id){
  const c=getCliente(id);
  c.nombre=v('c-nom');c.apellido=v('c-ape');c.dpi=v('c-dpi');
  c.telefono=v('c-tel');c.email=v('c-mail');c.direccion=v('c-dir');
  saveDB(); closeModal(); toast('Cliente actualizado ✓'); abrirCliente(id);
  if(vista==='clientes')renderClientes();
}
function openModal(h){document.getElementById('modal').innerHTML=h;document.getElementById('modalScrim').hidden=false;}
function closeModal(){document.getElementById('modalScrim').hidden=true;}

/* ============================================================ BUSCADOR GLOBAL */
function buscarGlobal(t){
  t=(t||'').trim().toLowerCase();
  const box=document.getElementById('searchResults'); if(!box)return;
  if(t.length<2){box.hidden=true;return;}
  const lotes=DB.lotes.filter(l=>l.codigo.toLowerCase().includes(t)).slice(0,5);
  const cts=DB.contratos.filter(c=>`${c.no} ${nombreCliente(c.clienteId)}`.toLowerCase().includes(t)).slice(0,5);
  const cls=DB.clientes.filter(c=>`${c.nombre} ${c.apellido} ${c.dpi}`.toLowerCase().includes(t)).slice(0,5);
  let h='';
  if(lotes.length)h+=`<div class="sr-sec">Lotes</div>`+lotes.map(l=>
    `<div class="sr-item" onclick="cerrarBusqueda();abrirLote('${l.codigo}')"><b>${l.codigo}</b> · ${l.area} m² · ${ESTADO_MAP[l.estado].label}</div>`).join('');
  if(cts.length)h+=`<div class="sr-sec">Contratos</div>`+cts.map(c=>
    `<div class="sr-item" onclick="cerrarBusqueda();abrirContrato('${c.id}')"><b>${c.no}</b> · ${esc(nombreCliente(c.clienteId))}</div>`).join('');
  if(cls.length)h+=`<div class="sr-sec">Clientes</div>`+cls.map(c=>
    `<div class="sr-item" onclick="cerrarBusqueda();abrirCliente('${c.id}')"><b>${esc(c.nombre)} ${esc(c.apellido)}</b>${c.dpi?' · '+esc(c.dpi):''}</div>`).join('');
  box.innerHTML=h||`<div class="sr-item muted">Sin resultados</div>`;
  box.hidden=false;
}
function cerrarBusqueda(){const b=document.getElementById('searchResults');if(b)b.hidden=true;
  const i=document.getElementById('globalSearch');if(i)i.value='';}

/* ---------- Toast ---------- */
let tt;
/* ------------------------------------------------------------
   Guardar tarda, y mientras tarda el botón no puede seguir vivo.

   Antes todo era instantáneo porque escribía en localStorage. Ahora
   hay un viaje a Guatemala y de vuelta, y en ese medio segundo un
   doble clic registra el pago dos veces. Esto apaga el botón, avisa
   que está guardando y lo devuelve pase lo que pase.
   ------------------------------------------------------------ */
let _guardando=false;
async function conBoton(fn){
  if(_guardando) return null;                 // ya hay una escritura en vuelo
  _guardando=true;
  const btn=document.querySelector('.modal-f .btn-primary');
  const antes=btn?btn.textContent:null;
  if(btn){btn.disabled=true;btn.textContent='Guardando…';}
  try{ return await fn(); }
  finally{
    _guardando=false;
    if(btn&&document.body.contains(btn)){btn.disabled=false;btn.textContent=antes;}
  }
}

/* Un aviso de error no puede verse igual que uno de éxito ni durar lo
   mismo: si «no se guardó el pago» desaparece en 2.6 segundos con el
   mismo color que «pago registrado», nadie se entera de nada. */
function toast(m,ms,esError){clearTimeout(tt);document.querySelector('.toast')?.remove();
  const t=document.createElement('div');t.className='toast'+(esError?' toast-error':'');t.textContent=m;document.body.appendChild(t);
  tt=setTimeout(()=>t.remove(),ms||2600);}

/* ---------- Init ---------- */
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.getElementById('scrim').addEventListener('click',closeDrawer);
document.getElementById('modalScrim').addEventListener('click',e=>{if(e.target.id==='modalScrim')closeModal();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeDrawer();closeModal();cerrarBusqueda();}});
document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))cerrarBusqueda();});
/* Con la base conectada no se siembra nada local: los datos llegan al
   entrar. Sin conexión, el portal arranca con los data-*.js de julio.

   Y si la sesión de Supabase sigue viva de la visita anterior, se entra
   directo sin volver a pedir la contraseña. */
if(hayRemoto()){
  /* Bloqueado hasta saber si hay sesión: si la hay, se entra; si pide
     código, el modal va encima; si no hay, se habilita el formulario. */
  renderAuth(true);
  reanudarSesion()
    .catch(e=>{ console.warn('[sesión]', e.message); return false; })
    .then(r=>{ window.__reanudando=false; if(r===false) renderAuth(); });
}else{
  initDB();
  renderAuth();
}
