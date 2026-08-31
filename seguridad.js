/* ============================================================
   PANTALLA DE SEGURIDAD Y ACCESOS

   Cuatro preguntas, en este orden:

     1. ¿Quién tiene entrada?           · personas y su estado
     2. ¿Qué puede hacer cada rol?      · la matriz completa
     3. ¿Hay algo mal configurado?      · conflictos y desfases
     4. ¿Qué se ha hecho?               · la bitácora

   La matriz que se ve aquí es la misma que rige la interfaz —
   sale de permisos.js, no de una copia. Pero la interfaz no es
   la seguridad: eso lo dice la pantalla en voz alta, porque un
   administrador que crea que apagando un botón cerró una puerta
   es más peligroso que uno que sabe que no la cerró.
   ============================================================ */

/* ---------- Estado de la sesión que administra ---------- */
let SEG_ROL_VISTO = 'vendedor';   // qué rol se está inspeccionando

/* ============================================================
   1 · Personas
   ============================================================ */
function segPersonas() {
  const act = DB.equipo.filter(p => p.activo);
  const inact = DB.equipo.filter(p => !p.activo);
  const admins = act.filter(p => p.rol === 'admin');
  const sinCorreo = act.filter(p => !p.email);

  let h = `<div class="card"><div class="card-h"><h2>Quién tiene entrada</h2>
    <button class="btn btn-primary btn-sm" onclick="modalPersona()">+ Dar acceso a alguien</button></div>`;

  const avisos = [];
  if (admins.length > 3)
    avisos.push(`Hay ${admins.length} administradores. Cada uno puede cambiar reglas, borrar documentos y dar accesos. Entre menos, mejor.`);
  if (sinCorreo.length)
    avisos.push(`${sinCorreo.length} persona${sinCorreo.length>1?'s':''} sin correo registrado. Sin correo no pueden entrar al sistema ni recuperar su clave.`);
  if (avisos.length)
    h += `<div class="card-b" style="border-bottom:1px solid var(--line);background:#FDF8F2">
      ${avisos.map(a=>`<div style="font-size:13px;color:var(--dark);margin-bottom:6px">▲ ${esc(a)}</div>`).join('')}</div>`;

  h += `<div class="card-b" style="padding:0"><table class="data"><thead><tr>
    <th>Persona</th><th>Rol</th><th>Correo de acceso</th><th>Doble factor</th>
    <th class="num">Puede hacer</th><th>Estado</th><th>Acción</th></tr></thead><tbody>`;

  const fila = p => {
    const n = accionesDe(p.rol).length;
    const c = (MATRIZ[p.rol] || {}).color || '#8A7F76';
    const dosFactores = p.mfa === true;
    const criticoSinMfa = !dosFactores && ['admin','gerencia','financiero'].includes(p.rol);
    return `<tr${p.activo ? '' : ' style="opacity:.5"'}>
      <td><b>${esc(p.nombre)}</b> <span class="pill">${esc(p.codigo||'—')}</span></td>
      <td><span class="badge" style="background:${c}18;color:${c}">
          <span class="dot" style="background:${c}"></span>${esc(rolLabel(p.rol))}</span></td>
      <td style="font-size:12px">${p.email ? esc(p.email)
          : '<span style="color:#B0562F">falta —  no puede entrar</span>'}</td>
      <td style="font-size:12px">${dosFactores ? '<span style="color:var(--green)">activo</span>'
          : criticoSinMfa ? '<span style="color:#B0562F">sin activar ▲</span>'
          : '<span style="color:#8A7F76">sin activar</span>'}</td>
      <td class="num">${n} de ${TODAS.length}</td>
      <td>${p.activo ? '<span class="badge" style="background:#5C6B4718;color:#5C6B47">Activo</span>'
                     : '<span class="badge" style="background:#8A7F7618;color:#8A7F76">Sin acceso</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="modalPersona('${p.id}')">Editar</button>
          ${p.activo
            ? `<button class="btn btn-ghost btn-sm" onclick="segQuitarAcceso('${p.id}')">Quitar acceso</button>`
            : `<button class="btn btn-ghost btn-sm" onclick="segDevolverAcceso('${p.id}')">Devolver acceso</button>`}</td>
    </tr>`;
  };

  h += act.map(fila).join('');
  if (inact.length)
    h += `<tr><td colspan="7" style="background:var(--tint);font-size:11px;letter-spacing:.06em;
      text-transform:uppercase;color:#8A7F76;padding:8px 14px">Sin acceso</td></tr>` + inact.map(fila).join('');
  h += `</tbody></table></div></div>`;
  return h;
}

/** Quitar el acceso no borra a la persona: sus ventas y comisiones siguen ahí. */
function segQuitarAcceso(id) {
  const p = DB.equipo.find(x => x.id === id);
  if (!p) return;
  const cts = contratosDe(p.nombre).filter(c => c.estado !== 'anulado');
  const msg = `Quitarle el acceso a ${p.nombre}.\n\n` +
    `No se borra nada: sus ${cts.length} contratos y su historial de comisiones quedan intactos.\n` +
    `Lo que pierde es la entrada al sistema.\n\n¿Continuar?`;
  if (!confirm(msg)) return;
  p.activo = false;
  anotar('acceso.quitado', `Se le quitó el acceso a ${p.nombre} (${rolLabel(p.rol)})`, { personaId: p.id });
  saveDB(); setView('seguridad');
}

function segDevolverAcceso(id) {
  const p = DB.equipo.find(x => x.id === id);
  if (!p) return;
  p.activo = true;
  anotar('acceso.devuelto', `Se le devolvió el acceso a ${p.nombre} (${rolLabel(p.rol)})`, { personaId: p.id });
  saveDB(); setView('seguridad');
}

/* ============================================================
   2 · La matriz
   ============================================================ */
function segMatriz() {
  const roles = Object.keys(MATRIZ);
  const cfg = MATRIZ[SEG_ROL_VISTO];
  const cuantos = r => DB.equipo.filter(p => p.activo && p.rol === r).length;

  let h = `<div class="card"><div class="card-h"><h2>Qué puede hacer cada rol</h2>
    <span style="font-size:12px;color:#8A7F76">${TODAS.length} acciones · ${roles.length} roles</span></div>
    <div class="card-b" style="border-bottom:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap">`;

  roles.forEach(r => {
    const c = MATRIZ[r].color, sel = r === SEG_ROL_VISTO;
    h += `<button class="btn btn-sm" onclick="SEG_ROL_VISTO='${r}';setView('seguridad')"
      style="background:${sel ? c : 'var(--tint)'};color:${sel ? '#fff' : 'var(--ink)'};
             border:1px solid ${sel ? c : 'var(--line)'}">
      ${esc(MATRIZ[r].etiqueta)} <span style="opacity:.7">· ${cuantos(r)}</span></button>`;
  });
  h += `</div>`;

  h += `<div class="card-b" style="background:var(--tint);border-bottom:1px solid var(--line)">
    <div style="font-size:13px;color:var(--dark)"><b>${esc(cfg.etiqueta)}</b> — ${esc(cfg.nota)}</div>
    <div style="font-size:12px;color:#8A7F76;margin-top:4px">
      ${cfg.acciones.length} de ${TODAS.length} acciones · entra a ${vistasDe(SEG_ROL_VISTO).length} pantallas
      · ${cuantos(SEG_ROL_VISTO)} persona${cuantos(SEG_ROL_VISTO)===1?'':'s'} con este rol</div></div>`;

  h += `<div class="card-b" style="padding:0">`;
  for (const [grupo, acciones] of Object.entries(ACCIONES)) {
    const tiene = Object.keys(acciones).filter(a => cfg.acciones.includes(a));
    h += `<div style="padding:10px 20px;background:var(--tint);font-size:11px;letter-spacing:.06em;
      text-transform:uppercase;color:#8A7F76;border-top:1px solid var(--line)">
      ${esc(grupo)} <span style="float:right;text-transform:none;letter-spacing:0">
      ${tiene.length} de ${Object.keys(acciones).length}</span></div>`;
    for (const [a, texto] of Object.entries(acciones)) {
      const si = cfg.acciones.includes(a);
      h += `<div style="display:flex;align-items:center;gap:12px;padding:9px 20px;
        border-top:1px solid #F0EDE8;${si ? '' : 'opacity:.45'}">
        <span style="width:18px;text-align:center;font-weight:700;
          color:${si ? 'var(--green)' : '#C4BDB4'}">${si ? '✓' : '·'}</span>
        <span style="flex:1;font-size:13px;color:var(--ink)">${esc(texto)}</span>
        <code style="font-size:11px;color:#B5AEA5">${esc(a)}</code></div>`;
    }
  }
  h += `</div></div>`;
  return h;
}

/* ============================================================
   3 · Revisión de la configuración
   ============================================================ */
function segRevision() {
  const confl = conflictos();
  const desfase = contrastarRLS();
  const bien = !confl.length && !desfase.length;

  let h = `<div class="card"><div class="card-h"><h2>Revisión de la configuración</h2>
    <span class="badge" style="background:${bien?'#5C6B4718':'#B0562F18'};color:${bien?'#5C6B47':'#B0562F'}">
      <span class="dot" style="background:${bien?'#5C6B47':'#B0562F'}"></span>
      ${bien ? 'Sin observaciones' : (confl.length + desfase.length) + ' por revisar'}</span></div>`;

  h += `<div class="card-b" style="border-bottom:1px solid var(--line)">
    <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8A7F76;margin-bottom:8px">
      Separación de funciones</div>
    <div style="font-size:13px;color:#6B635B;margin-bottom:10px">
      Hay pares de acciones que no debería tener la misma persona. No es desconfianza:
      es que un error deja de verse cuando quien lo comete es quien lo revisa.</div>`;
  if (!confl.length) {
    h += `<div style="font-size:13px;color:var(--green)">✓ Ningún rol tiene un par incompatible.</div>
      <div style="margin-top:10px">${INCOMPATIBLES.map(i =>
        `<div style="font-size:12px;color:#8A7F76;padding:5px 0;border-top:1px solid #F0EDE8">
          <code>${esc(i.a)}</code> ↮ <code>${esc(i.b)}</code> — ${esc(i.porque)}</div>`).join('')}</div>`;
  } else {
    h += confl.map(c => `<div style="padding:10px 12px;background:#FDF3EE;border-left:3px solid #B0562F;
      border-radius:4px;margin-bottom:8px">
      <b style="color:#B0562F">${esc(c.etiqueta)}</b>
      <div style="font-size:13px;color:var(--ink);margin-top:3px">${esc(c.porque)}</div>
      <code style="font-size:11px;color:#8A7F76">${esc(c.a)} + ${esc(c.b)}</code></div>`).join('');
  }
  h += `</div>`;

  h += `<div class="card-b">
    <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8A7F76;margin-bottom:8px">
      Esta pantalla contra la base de datos</div>
    <div style="font-size:13px;color:#6B635B;margin-bottom:10px">
      Lo que se ve aquí esconde botones. Lo que de verdad bloquea son las políticas
      que viven dentro de la base de datos. Si las dos dicen cosas distintas,
      manda la base — y esta lista sirve para enterarse.</div>`;
  if (!desfase.length) {
    h += `<div style="font-size:13px;color:var(--green)">✓ Coinciden en las ${Object.keys(RLS_DECLARADO).length} acciones que la base controla directamente.</div>`;
  } else {
    h += desfase.map(d => `<div style="padding:10px 12px;background:#FDF8F2;border-left:3px solid var(--gold);
      border-radius:4px;margin-bottom:8px">
      <code style="font-size:12px;color:var(--dark)"><b>${esc(d.accion)}</b></code>
      <div style="font-size:12px;color:var(--ink);margin-top:4px">
        En esta pantalla: ${d.enPantalla.length ? d.enPantalla.map(esc).join(', ') : '<i>nadie</i>'}<br>
        En la base de datos: ${d.enLaBase.length ? d.enLaBase.map(esc).join(', ') : '<i>nadie</i>'}</div></div>`).join('');
  }
  h += `</div></div>`;
  return h;
}

/* ============================================================
   4 · Bitácora
   ============================================================ */
const SEG_ETIQUETAS = {
  'acceso.quitado':'Acceso retirado', 'acceso.devuelto':'Acceso devuelto',
  'persona.alta':'Alta de persona',   'persona.editada':'Persona editada',
  'venta.creada':'Venta ingresada',   'venta.desistida':'Desistimiento',
  'pago.confirmado':'Pago confirmado','pago.anulado':'Pago anulado',
  'banco.conciliado':'Depósito asignado',
  'comision.liquidada':'Comisión liquidada','comision.pagada':'Comisión pagada',
  'comision.cancelada':'Comisión cancelada',
};

function segBitacora() {
  const reg = DB.bitacora.slice(0, 60);
  let h = `<div class="card"><div class="card-h"><h2>Bitácora</h2>
    <span style="font-size:12px;color:#8A7F76">${DB.bitacora.length} movimiento${DB.bitacora.length===1?'':'s'}</span></div>`;

  if (!reg.length) {
    h += `<div class="card-b" style="font-size:13px;color:#8A7F76">
      Todavía no hay nada registrado. Desde ahora, cada vez que alguien confirme un pago,
      asigne un depósito, registre un desistimiento o cambie un acceso, queda anotado aquí
      con su nombre y la hora. No se puede borrar desde el sistema.</div></div>`;
    return h;
  }

  h += `<div class="card-b" style="padding:0"><table class="data"><thead><tr>
    <th>Cuándo</th><th>Quién</th><th>Qué</th><th>Detalle</th></tr></thead><tbody>`;
  h += reg.map(e => {
    const d = new Date(e.ts);
    return `<tr>
      <td style="font-size:12px;white-space:nowrap">${d.toLocaleDateString('es-GT')}
        <span style="color:#8A7F76">${d.toLocaleTimeString('es-GT',{hour:'2-digit',minute:'2-digit'})}</span></td>
      <td style="font-size:12px"><b>${esc(e.quien)}</b>
        <div style="color:#8A7F76">${esc(rolLabel(e.rol))}</div></td>
      <td style="font-size:12px">${esc(SEG_ETIQUETAS[e.accion] || e.accion)}</td>
      <td style="font-size:12px;color:#6B635B">${esc(e.detalle)}</td></tr>`;
  }).join('');
  h += `</tbody></table></div>`;
  if (DB.bitacora.length > 60)
    h += `<div class="card-b" style="font-size:12px;color:#8A7F76;text-align:center">
      Se muestran los 60 más recientes de ${DB.bitacora.length}.</div>`;
  h += `</div>`;
  return h;
}

/* ============================================================
   La pantalla
   ============================================================ */
function renderSeguridad() {
  const act = DB.equipo.filter(p => p.activo);
  const admins = act.filter(p => p.rol === 'admin').length;
  const pend = conflictos().length + contrastarRLS().length;
  const sinMfa = act.filter(p => p.mfa !== true && ['admin','gerencia','financiero'].includes(p.rol)).length;

  let h = `<div class="kpis">
    <div class="kpi"><div class="kpi-label">Con acceso</div><div class="kpi-value">${act.length}</div>
      <div class="kpi-sub">${DB.equipo.length - act.length} sin acceso</div></div>
    <div class="kpi ${admins>3?'warn':''}"><div class="kpi-label">Administradores</div>
      <div class="kpi-value">${admins}</div><div class="kpi-sub">pueden cambiarlo todo</div></div>
    <div class="kpi ${sinMfa?'warn':''}"><div class="kpi-label">Sin doble factor</div>
      <div class="kpi-value">${sinMfa}</div><div class="kpi-sub">en roles críticos</div></div>
    <div class="kpi ${pend?'warn':''}"><div class="kpi-label">Por revisar</div>
      <div class="kpi-value">${pend}</div><div class="kpi-sub">${pend?'ver revisión abajo':'configuración limpia'}</div></div>
  </div>`;

  /* Este aviso no se quita nunca. Es lo más importante de la pantalla. */
  h += `<div class="card" style="border-left:3px solid var(--gold)"><div class="card-b">
    <div style="font-size:13px;color:var(--dark);line-height:1.6">
      <b>Lo que esta pantalla sí hace y lo que no.</b><br>
      Sí: define qué ve y qué puede tocar cada quien dentro del sistema, y deja anotado todo lo que se hace.<br>
      No: no es la cerradura. Los permisos de verdad viven dentro de la base de datos, y siguen
      aplicando aunque alguien logre saltarse la pantalla. Por eso abajo se comparan las dos —
      si alguna vez dejan de decir lo mismo, hay que arreglarlo en la base, no aquí.</div>
  </div></div>`;

  h += segPersonas() + segMatriz() + segRevision() + segBitacora();

  /* Las pantallas de este suite PINTAN, no devuelven. setView() las
     llama y descarta lo que retornen — devolver el HTML dejaba la
     pantalla en blanco y no se veía hasta abrirla en el navegador. */
  C().innerHTML = h;
  return h;                 // el retorno se conserva solo para poder probarla
}
