/* ============================================================
   EXPEDIENTES · lo que finanzas y administración abren el día uno

   Hoy, para contestar «¿este señor firmó?» hay que abrir el
   Documento Madre, buscar el lote, y después ir a una carpeta de
   escaneos con nombres como «H2 y H3 Claudia Patricia Yos». Con
   suerte está. Esta pantalla es esa búsqueda, en un solo lugar.

   Dos decisiones que la ordenan:

   1. LO QUE FALTA VA PRIMERO, no lo que está.
      Un expediente completo no necesita que nadie lo mire. La
      pantalla arranca mostrando los que tienen huecos, porque
      eso es lo accionable.

   2. NO SE INVENTA NADA.
      Si un dato no está, dice que no está. No se rellena con un
      guion que parezca dato ni se esconde el campo vacío.
   ============================================================ */

let EXP_FILTRO = 'incompletos';
let EXP_BUSCA  = '';

/* ---------- Qué le falta a un contrato ----------
   Espeja la vista expediente_estado de la base, para que la
   pantalla y el SQL digan lo mismo. Cuando el suite esté contra
   Postgres, esto se reemplaza por la consulta. */
function faltantesDe(ct) {
  const c = contactoDe(ct.no) || {};
  const docs = documentosDe(ct.id) || [];

  /* Un documento cuenta cuando hay ARCHIVO, no cuando hay fila. El
     portal anotaba nombres (`pendiente:dpi_frente.pdf`) y el expediente
     se daba por completo con papeles que nadie había subido. */
  const conArchivo = t => docs.filter(d => d.tipo === t && d.bucket && d.ruta).length;

  /* Qué se exige lo dice el catálogo de la base. La lista de aquí abajo
     es el respaldo para cuando el portal corre sin conexión. */
  const reqs = (typeof DB !== 'undefined' && DB.documentosRequeridos && DB.documentosRequeridos.length)
    ? DB.documentosRequeridos.filter(r => r.obligatorio)
    : [{ codigo:'dpi', nombre:'DPI del titular', caras:2 },
       { codigo:'contrato', nombre:'Contrato firmado', caras:1 },
       { codigo:'plan_pagos', nombre:'Plan de pagos firmado', caras:1 }];

  const f = [];
  if (!c.tel)                         f.push({ que: 'teléfono',   grave: true });
  if (!c.ocupacion)                   f.push({ que: 'ocupación',  grave: false });
  if (!c.correo)                      f.push({ que: 'correo',     grave: false });

  for (const r of reqs) {
    const hay = conArchivo(r.codigo), caras = r.caras || 1;
    if (hay >= caras) continue;
    f.push({
      que: hay === 0 ? r.nombre.toLowerCase()
                     : `${r.nombre.toLowerCase()} · falta ${caras - hay} de ${caras} caras`,
      grave: true
    });
  }

  if (ct.enganche_cancelado === false)f.push({ que: 'enganche cancelado', grave: true });
  if (ct.contrato_firmado === false)  f.push({ que: 'contrato firmado',   grave: true });
  return f;
}

const expCompleto = ct => faltantesDe(ct).length === 0;

/* ---------- La lista ---------- */
function expLista() {
  const t = EXP_BUSCA.trim().toLowerCase();
  return DB.contratos
    .filter(c => c.estado !== 'anulado')
    .filter(c => {
      if (!t) return true;
      const nom = nombreCliente(c.clienteId) || '';
      const con = contactoDe(c.no) || {};
      return `${c.no} ${c.lote} ${nom} ${con.tel || ''}`.toLowerCase().includes(t);
    })
    .filter(c => EXP_FILTRO === 'todos' ? true
               : EXP_FILTRO === 'completos' ? expCompleto(c)
               : !expCompleto(c))
    .sort((a, b) => faltantesDe(b).length - faltantesDe(a).length || a.lote.localeCompare(b.lote));
}

/* ---------- La pantalla ---------- */
function renderExpedientes() {
  const vivos = DB.contratos.filter(c => c.estado !== 'anulado');
  const inc = vivos.filter(c => !expCompleto(c));
  const sinDoc = vivos.filter(c => (documentosDe(c.id) || []).length === 0);
  const dpiMalo = vivos.filter(c => {
    const con = contactoDe(c.no);
    return con && con.dpiValido === false;
  });

  let h = `<div class="kpis">
    <div class="kpi"><div class="kpi-label">Expedientes</div><div class="kpi-value">${vivos.length}</div>
      <div class="kpi-sub">${vivos.length - inc.length} completos</div></div>
    <div class="kpi ${inc.length ? 'warn' : ''}"><div class="kpi-label">Con algo pendiente</div>
      <div class="kpi-value">${inc.length}</div><div class="kpi-sub">les falta un dato o un papel</div></div>
    <div class="kpi ${sinDoc.length ? 'warn' : ''}"><div class="kpi-label">Sin un solo papel</div>
      <div class="kpi-value">${sinDoc.length}</div><div class="kpi-sub">nada escaneado</div></div>
    <div class="kpi ${dpiMalo.length ? 'warn' : ''}"><div class="kpi-label">DPI por corregir</div>
      <div class="kpi-value">${dpiMalo.length}</div><div class="kpi-sub">no pasan la validación</div></div>
  </div>`;

  /* Este aviso desaparece solo cuando se apaga el modo consulta. */
  if (typeof MODO_CONSULTA !== 'undefined' && MODO_CONSULTA)
    h += `<div class="card" style="border-left:3px solid var(--gold)"><div class="card-b">
      <div style="font-size:13px;color:var(--dark);line-height:1.6">
        <b>El sistema está en modo consulta.</b> Se puede ver y buscar todo, pero todavía no
        se registran pagos aquí — eso sigue en el Excel de siempre hasta que el cuadre de
        julio y agosto esté cerrado. No es una limitación de la pantalla: la base tiene la
        escritura cerrada, así que no hay forma de registrar algo por accidente.</div>
    </div></div>`;

  h += `<div class="card"><div class="card-h">
    <h2>Buscar un expediente</h2>
    <div style="display:flex;gap:8px;align-items:center">
      <input class="input" style="width:280px" placeholder="Lote, contrato, nombre o teléfono"
             value="${esc(EXP_BUSCA)}" oninput="EXP_BUSCA=this.value;expPintar()">
    </div></div>
    <div class="card-b" style="border-bottom:1px solid var(--line);display:flex;gap:8px">`;
  [['incompletos', 'Con algo pendiente', inc.length],
   ['completos', 'Completos', vivos.length - inc.length],
   ['todos', 'Todos', vivos.length]].forEach(([k, txt, n]) => {
    h += `<button class="btn btn-sm ${EXP_FILTRO === k ? 'btn-primary' : 'btn-ghost'}"
            onclick="EXP_FILTRO='${k}';expPintar()">${txt} <span style="opacity:.7">· ${n}</span></button>`;
  });
  h += `</div><div id="expTabla"></div></div>`;

  C().innerHTML = h;        // pintar, no devolver: así funcionan las demás
  expPintar();
  return h;                 // el retorno se conserva solo para poder probarla
}

function expPintar() {
  const cont = document.getElementById('expTabla');
  if (!cont) return;
  const lista = expLista();

  if (!lista.length) {
    cont.innerHTML = `<div class="card-b" style="font-size:13px;color:#8A7F76">
      ${EXP_BUSCA ? 'Nada coincide con «' + esc(EXP_BUSCA) + '».'
                  : 'No hay expedientes en esta categoría.'}</div>`;
    return;
  }

  let h = `<div class="card-b" style="padding:0"><table class="data"><thead><tr>
    <th>Lote</th><th>Contrato</th><th>Cliente</th><th>Contacto</th>
    <th class="num">Papeles</th><th>Qué falta</th><th></th></tr></thead><tbody>`;

  h += lista.map(ct => {
    const c = contactoDe(ct.no) || {};
    const docs = documentosDe(ct.id) || [];
    const f = faltantesDe(ct);
    const graves = f.filter(x => x.grave).length;
    return `<tr>
      <td><b>${esc(ct.lote)}</b></td>
      <td><span class="pill">${esc(ct.no)}</span></td>
      <td>${esc(nombreCliente(ct.clienteId))}
        ${c.dpiValido === false
          ? `<div style="font-size:11px;color:#B0562F">DPI: ${esc(c.dpiProblema || 'no válido')}</div>` : ''}</td>
      <td style="font-size:12px">${c.tel
          ? esc(c.tel) + (c.movil ? '' : ' <span style="color:#8A7F76">(fijo)</span>')
          : '<span style="color:#B0562F">sin teléfono</span>'}
        ${c.correo ? `<div style="color:#8A7F76">${esc(c.correo)}</div>` : ''}</td>
      <td class="num">${docs.length || '<span style="color:#B0562F">0</span>'}</td>
      <td style="font-size:12px">${f.length
          ? f.map(x => `<span class="badge" style="background:${x.grave ? '#B0562F' : '#8A7F76'}18;
              color:${x.grave ? '#B0562F' : '#8A7F76'};margin:1px">${esc(x.que)}</span>`).join(' ')
          : '<span style="color:var(--green)">completo</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="verExpediente('${ct.id}')">Abrir</button></td>
    </tr>`;
  }).join('');

  h += `</tbody></table></div>`;
  cont.innerHTML = h;
}

/* ---------- El expediente de una persona ---------- */
function verExpediente(id) {
  const ct = getContrato(id);
  if (!ct) return;
  const c = contactoDe(ct.no) || {};
  const docs = documentosDe(ct.id) || [];
  const e = estadoCuenta(ct);
  const f = faltantesDe(ct);

  /* Un dato que no está se dice, no se disimula con un guion. */
  const dato = (etq, val, falta) => `<div>
    <div class="f-lbl">${esc(etq)}</div>
    <div class="f-val"${val ? '' : ' style="color:#B0562F;font-weight:500"'}>${
      val ? esc(val) : (falta || 'no está')}</div></div>`;

  let h = drawerHead(ct.no, `Lote ${ct.lote} · ${esc(nombreCliente(ct.clienteId))}`,
    f.length ? 'b-pend' : 'b-ok',
    f.length ? f.length + ' cosa' + (f.length === 1 ? '' : 's') + ' por completar' : 'Expediente completo');

  h += `<div class="drawer-b">`;
  if (f.length)
    h += `<div class="card" style="border-left:3px solid #B0562F;margin:0 0 14px">
      <div class="card-b"><b style="color:#B0562F;font-size:13px">Le falta:</b>
      <div style="font-size:13px;color:var(--ink);margin-top:6px">
        ${f.map(x => '· ' + esc(x.que)).join('<br>')}</div></div></div>`;

  h += `<div class="card"><div class="card-h"><h2>La persona</h2></div><div class="card-b">
    <div class="fgrid">
      ${dato('Nombre', nombreCliente(ct.clienteId))}
      ${dato('Teléfono', c.tel)}
      ${dato('Correo', c.correo)}
      ${dato('Ocupación', c.ocupacion)}
      ${dato('Departamento', c.depto)}
    </div>
    <div style="font-size:11px;color:#8A7F76;margin-top:10px">
      El DPI, la dirección y las referencias familiares no se muestran aquí: viven en la base
      con permiso aparte y se abren desde el botón de abajo, para quien lo tenga.</div>
  </div></div>`;

  h += `<div class="card"><div class="card-h"><h2>El contrato</h2></div><div class="card-b">
    <div class="fgrid">
      ${dato('Precio', _Q(ct.precio))}
      ${dato('Enganche', _Q((ct.plan || {}).enganche || 0))}
      ${dato('Plazo', ((ct.plan || {}).plazo || '') + ' meses')}
      ${dato('Cuota', _Q((ct.plan || {}).cuota || 0))}
      ${dato('Vendedor', ct.vendedor)}
      ${dato('Firmado', ct.contrato_firmado === false ? '' : 'sí', 'todavía no')}
    </div></div></div>`;

  h += `<div class="card"><div class="card-h"><h2>Cómo va pagando</h2></div><div class="card-b">
    <div class="fgrid">
      ${dato('Cuotas pagadas', String(cuotasPagadas(ct)))}
      ${dato('Recaudado', _Q(e.recaudado))}
      ${dato('Saldo', _Q(e.saldo))}
      ${dato('Estado', e.enMora ? `en mora · ${e.vencidas} cuotas` : 'al día')}
    </div></div></div>`;

  /* El botón de subir va ACÁ, que es donde la gente busca el
     expediente. Antes solo existía en la ficha del contrato, en una
     pestaña, y desde esta pantalla no había manera. */
  const conArchivo = docs.filter(d => d.bucket && d.ruta);
  h += `<div class="card"><div class="card-h"><h2>Los papeles</h2>
    <span style="font-size:12px;color:#8A7F76">${conArchivo.length} archivo${conArchivo.length === 1 ? '' : 's'}</span>
    <button class="btn btn-primary btn-sm" style="margin-left:auto"
            onclick="modalDocumento('${ct.id}')">+ Subir respaldo</button></div>`;

  /* Lo obligatorio, y si está o no. Un expediente se lee por lo que le
     falta, no por lo que tiene. */
  const reqs = (typeof DB !== 'undefined' && DB.documentosRequeridos && DB.documentosRequeridos.length)
    ? DB.documentosRequeridos
    : [{codigo:'dpi',nombre:'DPI del titular',caras:2,obligatorio:true},
       {codigo:'contrato',nombre:'Contrato firmado',caras:1,obligatorio:true},
       {codigo:'plan_pagos',nombre:'Plan de pagos firmado',caras:1,obligatorio:true}];

  h += `<div class="card-b" style="padding:0"><table class="data"><tbody>`;
  for (const r of reqs) {
    const hay = conArchivo.filter(d => d.tipo === r.codigo).length;
    const caras = r.caras || 1;
    const listo = hay >= caras;
    h += `<tr>
      <td style="width:26px">${listo ? '✓' : '○'}</td>
      <td><b>${esc(r.nombre)}</b>${r.obligatorio ? '' : ' <span style="color:#8A7F76">· opcional</span>'}
        ${caras > 1 ? `<div class="ec-obl">${hay} de ${caras} caras</div>` : ''}</td>
      <td style="text-align:right">${listo
        ? '<span class="badge b-ok">Está</span>'
        : (r.obligatorio ? '<span class="badge b-mora">Falta</span>' : '<span class="badge b-nod">Sin subir</span>')}</td>
      <td style="width:90px;text-align:right">${listo ? '' :
        `<button class="btn btn-ghost btn-sm" onclick="modalDocumento('${ct.id}')">Subir</button>`}</td>
    </tr>`;
  }
  h += `</tbody></table></div>`;

  if (!docs.length) {
    h += `<div class="card-b" style="font-size:13px;color:#B0562F">
      No hay ningún documento escaneado de este contrato.</div>`;
  } else {
    h += `<div class="card-b" style="padding:0"><table class="data"><thead><tr>
      <th>Tipo</th><th>Archivo</th><th>Subido</th><th></th></tr></thead><tbody>`;
    h += docs.map(d => `<tr>
      <td>${esc(d.etiqueta || d.tipo)}</td>
      <td style="font-size:12px">${esc(d.nombre)}</td>
      <td style="font-size:12px">${esc(d.fecha || '—')}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="abrirDocumento('${d.id}')">Ver</button></td>
    </tr>`).join('');
    h += `</tbody></table></div>`;
  }
  h += `</div>`;

  h += `</div>`;
  openDrawer(h);
}

/* Un documento no se sirve con un enlace fijo: se pide una URL firmada
   que vive 60 segundos. Un enlace permanente a un DPI escaneado es un
   DPI publicado, aunque nadie haya escrito la dirección en ningún lado. */
async function abrirDocumento(docId) {
  /* Esto esperaba un objeto `API` —el hub— que nunca llegó a existir en
     el navegador, así que el botón «Ver» siempre contestaba «se abren
     cuando el suite esté conectado a la base». Ya lo está: los archivos
     viven en Supabase Storage y la URL firmada la pide el propio
     portal, sin pasar por el hub. */
  if (typeof verDocumento === 'function') return verDocumento(docId);

  const d = (DB.documentos || []).find(x => String(x.id) === String(docId));
  if (!d) return toast('No se encontró el documento');
  if (!d.bucket || !d.ruta)
    return toast('Ese documento se anotó pero nunca se subió el archivo', 6000, true);
  const r = await sbVerDocumento(d.bucket, d.ruta);
  if (!r.ok) return toast(r.error, 6000, true);
  window.open(r.dato, '_blank', 'noopener');
}
