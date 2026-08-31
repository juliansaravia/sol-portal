/* ============================================================
   COTIZACIÓN · dos documentos distintos

   ── PARA EL CLIENTE ──
   Quien compra un lote en Pochuta no necesariamente lee bien.
   Una tabla de amortización no le sirve — y peor: le da vergüenza
   preguntar, asiente, y firma algo que no entendió.

   Responde cuatro cosas, cada una con una imagen:
     1. ¿cuál es mi lote?      2. ¿cuánto doy hoy?
     3. ¿cuánto pago al mes?   4. ¿cuántas veces?

   Sin las palabras "capital", "interés", "amortización" ni
   "saldo deudor". Son palabras de banco, no de persona.

   ── PARA ADENTRO ──
   La misma operación en formato formal: lote, precio, enganche,
   saldo, plazo, cuota, totales. Sirve para el comité de crédito
   y para el expediente. Ahí sí con todos los términos técnicos.

   ── UNA SOLA PÁGINA ──
   Ambas caben en una hoja carta. Todo está medido en MILÍMETROS,
   no en píxeles: así el navegador no decide el tamaño por su
   cuenta y el PDF sale igual en cualquier máquina.

   Área útil de una carta con márgenes de 12 mm: 186 × 254 mm.
   El presupuesto de alto está anotado en cada bloque; si algo
   crece, hay que quitar de otro lado.
   ============================================================ */

const COT = {
  terracota: '#B0562F',
  crema: '#F7F0E6',
  tinta: '#3A2318',
  gris: '#8A7F76',
  linea: '#E8DFD4',
};

const _q  = n => 'Q' + Math.round(n).toLocaleString('es-GT');
const _q2 = n => 'Q' + (Math.round(n * 100) / 100).toLocaleString('es-GT',
                  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ============================================================
   Lo que ayuda a vender

   Estos son los argumentos de venta que van en la hoja. Viven
   aquí y no dentro del diseño para que se puedan cambiar sin
   tocar el resto.

   ⚠ PENDIENTE: confirmar con el equipo cuáles son los reales.
   Los de abajo son los que se deducen del contrato y del plano.
   ============================================================ */
const BENEFICIOS = [
  { icono: 'escritura', titulo: 'Escritura a su nombre',
    detalle: 'Al terminar de pagar' },
  { icono: 'ubicacion', titulo: 'San Miguel Pochuta',
    detalle: 'Chimaltenango' },
  { icono: 'sin-banco', titulo: 'Sin banco de por medio',
    detalle: 'Le financiamos nosotros' },
  { icono: 'cuota',     titulo: 'La cuota nunca sube',
    detalle: 'El mismo monto hasta el final' },
];

/* Íconos simples, dibujados a línea. Se entienden sin leer. */
function iconoBeneficio(tipo, color) {
  const c = color || COT.terracota;
  const base = `fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`;
  const d = {
    escritura: `<path d="M5 3h9l5 5v13H5z" ${base}/><path d="M14 3v5h5" ${base}/><path d="M8 13h8M8 17h5" ${base}/>`,
    ubicacion: `<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" ${base}/><circle cx="12" cy="10" r="2.5" ${base}/>`,
    'sin-banco': `<path d="M3 10 12 4l9 6" ${base}/><path d="M5 10v9M19 10v9M3 20h18" ${base}/><path d="M4 4 20 20" ${base}/>`,
    cuota: `<path d="M4 18V9M10 18V6M16 18v-8M22 18h-2" ${base}/><path d="M2 21h20" ${base}/>`,
  }[tipo] || '';
  return `<svg viewBox="0 0 24 24" width="17" height="17" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${d}</svg>`;
}

/* ---------- Monedas ---------- */
function iconoMonedas() {
  return `<svg viewBox="0 0 62 34" width="46" height="25" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="12" cy="17" r="10" fill="${COT.terracota}" opacity=".45"/>
    <circle cx="26" cy="17" r="10" fill="${COT.terracota}" opacity=".7"/>
    <circle cx="40" cy="17" r="10" fill="${COT.terracota}"/></svg>`;
}

/* ---------- Los meses, uno por cuadrito ----------
   Ver los meses comunica el plazo mejor que leer el número.
   Con plazos largos se achica el cuadro para no comerse la página. */
function rejillaMeses(plazo) {
  const porFila = plazo > 48 ? 24 : 12;
  const filas = Math.ceil(plazo / porFila);
  const paso = 9, lado = 7;
  let celdas = '';
  for (let i = 0; i < plazo; i++) {
    const f = Math.floor(i / porFila), c = i % porFila;
    celdas += `<rect x="${c * paso}" y="${f * paso}" width="${lado}" height="${lado}" rx="1.4"
                 fill="${COT.terracota}" opacity="${(0.32 + (i / plazo) * 0.58).toFixed(2)}"/>`;
  }
  const ancho = porFila * paso, alto = filas * paso;
  return `<svg viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}"
     style="max-width:100%" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${celdas}</svg>`;
}

/* ---------- Comparar plazos ---------- */
function barrasPlazos(precio, enganche, plazos, elegido) {
  const planes = plazos.map(p => ({ p, ...planFinanciamiento(precio, enganche, p) }));
  const max = Math.max(...planes.map(x => x.cuota));
  const base = planes.find(x => x.p === elegido);
  return planes.map(x => {
    // Cuánto se ahorra contra el plazo que se está cotizando.
    // Es el argumento honesto y el que conviene al negocio: menos
    // plazo es menos interés para él y menos exposición para nosotros.
    const ahorro = base ? base.total - x.total : 0;
    return `<div class="hoja-barra${x.p === elegido ? ' sel' : ''}">
      <span class="hoja-barra-m">${textoAnios(x.p)}</span>
      <span class="hoja-barra-p"><span class="hoja-barra-f" style="width:${Math.round(x.cuota / max * 100)}%"></span></span>
      <span class="hoja-barra-q">${_q(x.cuota)}</span>
      <span class="hoja-barra-a">${ahorro > 1 ? 'ahorra ' + _q(ahorro) : ''}</span>
    </div>`;
  }).join('');
}

/* ============================================================
   DOCUMENTO 1 · para el cliente
   Presupuesto de alto, en mm:
     encabezado 20 · lote 15 · hoy+mes 32 · meses 20
     total 11 · beneficios 26 · comparación 38 · pie 16
     ────────────────────────────────────────────── 178 de 254
   ============================================================ */
/* El plazo en años, que es como la gente piensa el tiempo.
   "5 años" se entiende de una; "60 meses" hay que dividirlo mentalmente. */
function textoAnios(meses) {
  const a = meses / 12;
  if (Number.isInteger(a)) return a === 1 ? '1 año' : `${a} años`;
  const enteros = Math.floor(a), sobran = meses % 12;
  if (!enteros) return `${meses} meses`;
  return `${enteros} año${enteros > 1 ? 's' : ''} y ${sobran} mes${sobran > 1 ? 'es' : ''}`;
}

function hojaCliente(o) {
  const { lote, precio, enganche, plazo } = o;
  const plan = planFinanciamiento(precio, enganche, plazo);
  const l = typeof getLote === 'function' ? getLote(lote) : null;
  const plazos = (typeof PROYECTO !== 'undefined' && PROYECTO.plazos)
    ? PROYECTO.plazos.filter(p => p >= 12) : [12, 24, 36, 48, 60, 72, 84];

  return `<div class="hoja">

  <div class="hoja-head">
    ${typeof logoProyecto === 'function' ? logoProyecto(46, 'terracota') : ''}
    <div class="hoja-head-txt">
      <div class="hoja-marca">La Esperanza</div>
      <div class="hoja-marca-sub">Residencial · San Miguel Pochuta</div>
    </div>
    <div class="hoja-head-fecha">${fmtD(HOY_ISO)}</div>
  </div>

  <div class="hoja-lote">
    <div class="hoja-lote-cod">${esc(lote)}</div>
    <div class="hoja-lote-det">
      ${l && l.area ? `<span class="hoja-lote-area">${l.area} m²</span>` : ''}
      <span class="hoja-lote-precio">${_q(precio)}</span>
    </div>
  </div>

  <div class="hoja-dos">
    <div class="hoja-caja">
      <div class="hoja-paso">1</div>
      <div class="hoja-label">Hoy usted da</div>
      <div class="hoja-monto-med">${_q(enganche)}</div>
      <div class="hoja-mon">${iconoMonedas()}</div>
    </div>
    <div class="hoja-caja destaca">
      <div class="hoja-paso">2</div>
      <div class="hoja-label">Después, cada mes</div>
      <div class="hoja-monto-grande">${_q(plan.cuota)}</div>
      <div class="hoja-sub">siempre el mismo monto</div>
    </div>
  </div>

  <div class="hoja-meses">
    <div class="hoja-meses-txt">
      <div class="hoja-paso">3</div>
      <div>
        <div class="hoja-label">Durante ${textoAnios(plazo)}</div>
        <div class="hoja-sub">${plazo} cuotas · cada cuadro es un mes</div>
      </div>
    </div>
    <div class="hoja-rejilla">${rejillaMeses(plazo)}</div>
  </div>

  <div class="hoja-total">
    <div class="hoja-total-col">
      <span class="hoja-total-lbl">Si lo paga de una vez</span>
      <span class="hoja-total-contado">${_q(precio)}</span>
    </div>
    <div class="hoja-total-col">
      <span class="hoja-total-lbl">Monto hasta el final · ${textoAnios(plazo)}</span>
      <span class="hoja-total-contado">${_q(plan.total)}</span>
    </div>
    <div class="hoja-total-por">
      La diferencia es lo que cuesta que nosotros le prestemos: sin banco,
      sin fiador y sin que le pidamos papeles. Entre menos tiempo, menos cuesta.
    </div>
  </div>

  <div class="hoja-benef">
    ${BENEFICIOS.map(b => `<div class="hoja-ben">
      <div class="hoja-ben-ico">${iconoBeneficio(b.icono)}</div>
      <div><div class="hoja-ben-t">${esc(b.titulo)}</div>
           <div class="hoja-ben-d">${esc(b.detalle)}</div></div>
    </div>`).join('')}
  </div>

  <div class="hoja-comparar">
    <div class="hoja-label">Entre menos años, menos paga en total</div>
    ${barrasPlazos(precio, enganche, plazos, plazo)}
  </div>

  <div class="hoja-pie">
    <div class="hoja-pie-fila">
      <span>${o.cliente ? esc(o.cliente) : 'Cotización'}</span>
      <span>${o.vendedor ? 'Le atendió: ' + esc(o.vendedor) : ''}${o.telVendedor ? ' · ' + esc(o.telVendedor) : ''}</span>
    </div>
    <div class="hoja-legal">Cotización informativa, válida 15 días. Los montos se confirman al firmar el contrato.</div>
  </div>
</div>`;
}

/* ============================================================
   DOCUMENTO 2 · para adentro
   Formal, con todos los términos. Para el comité y el expediente.
   ============================================================ */
function hojaInterna(o) {
  const { lote, precio, enganche, plazo } = o;
  const plan = planFinanciamiento(precio, enganche, plazo);
  const l = typeof getLote === 'function' ? getLote(lote) : null;
  const plazos = (typeof PROYECTO !== 'undefined' && PROYECTO.plazos)
    ? PROYECTO.plazos : [12, 24, 36, 48, 60, 72, 84];
  const tasa = (typeof PROYECTO !== 'undefined' ? PROYECTO.tasaMensual : 0.015);
  const carga = (typeof cargaSobreIngreso === 'function' && o.ingreso)
    ? cargaSobreIngreso(plan.cuota, o.ingreso) : null;

  const fila = (k, v, cls) => `<tr class="${cls || ''}"><th>${k}</th><td>${v}</td></tr>`;

  return `<div class="hoja hoja-int">
  <div class="membrete">
    <div class="membrete-logo">${typeof logoProyecto === 'function' ? logoProyecto(40, 'claro') : ''}</div>
    <div class="membrete-txt">
      <div class="membrete-nombre">La Esperanza</div>
      <div class="membrete-bajada">Residencial · San Miguel Pochuta, Chimaltenango</div>
    </div>
    <div class="membrete-sub">Uso interno</div>
  </div>

  <h1 class="hoja-int-t">Cotización de financiamiento</h1>
  <div class="hoja-int-meta">${fmtD(HOY_ISO)}${o.cliente ? ' · ' + esc(o.cliente) : ''}${o.vendedor ? ' · vendedor: ' + esc(o.vendedor) : ''}</div>

  <table class="hoja-int-tb">
    <tbody>
      ${fila('Lote', `<b>${esc(lote)}</b>${l && l.area ? ` · ${l.area} m²` : ''}${l && l.manzana ? ` · manzana ${l.manzana}` : ''}`)}
      ${fila('Precio de venta', _q2(precio))}
      ${fila('Enganche', _q2(enganche) + ` <span class="mut">(${(enganche / precio * 100).toFixed(1)}%)</span>`)}
      ${fila('Saldo a financiar', _q2(plan.saldo))}
      ${fila('Plazo', `${textoAnios(plazo)} · ${plazo} cuotas`)}
      ${fila('Tasa mensual', `${(tasa * 100).toFixed(2)}% <span class="mut">plana sobre el saldo original</span>`)}
      ${fila('Abono a capital', _q2(plan.capital) + ' <span class="mut">mensual</span>')}
      ${fila('Interés', _q2(plan.interes) + ' <span class="mut">mensual</span>')}
      ${fila('Cuota mensual', `<b>${_q2(plan.cuota)}</b>`, 'destaca')}
      ${fila('Total de intereses', _q2(plan.totalInteres))}
      ${fila('Total del plan', `<b>${_q2(plan.total)}</b>`, 'destaca')}
      ${carga ? fila('Cuota / ingreso declarado',
          `${Math.round(carga.pct * 100)}% <span class="mut">(${carga.nivel})</span>`,
          carga.nivel === 'riesgoso' ? 'alerta' : '') : ''}
      ${fila('Comisión del vendedor', _q2(precio * (typeof COMISION_PCT !== 'undefined' ? COMISION_PCT : 0.02)))}
      ${fila('Mora', `${((typeof PROYECTO !== 'undefined' ? PROYECTO.tasaMora : 0.02) * 100).toFixed(0)}% mensual sobre saldo vencido`)}
    </tbody>
  </table>

  <h2 class="hoja-int-t2">Alternativas de plazo</h2>
  <table class="hoja-int-tb comp">
    <thead><tr><th>Plazo</th><th class="num">Capital</th><th class="num">Interés</th>
      <th class="num">Cuota</th><th class="num">Total intereses</th><th class="num">Total del plan</th></tr></thead>
    <tbody>${plazos.map(p => {
      const x = planFinanciamiento(precio, enganche, p);
      return `<tr class="${p === plazo ? 'sel' : ''}"><td>${textoAnios(p)}</td>
        <td class="num">${_q2(x.capital)}</td><td class="num">${_q2(x.interes)}</td>
        <td class="num"><b>${_q2(x.cuota)}</b></td><td class="num">${_q2(x.totalInteres)}</td>
        <td class="num">${_q2(x.total)}</td></tr>`;}).join('')}
    </tbody>
  </table>

  <div class="hoja-int-pie">
    Documento de uso interno · no se entrega al cliente.
    La cotización del cliente omite el desglose de capital e interés a propósito.
  </div>
</div>`;
}

/* ============================================================
   Abrir para imprimir o guardar como PDF
   ============================================================ */
function abrirHoja(tipo, o) {
  const w = window.open('', '_blank');
  if (!w) { toast('Permite las ventanas emergentes'); return; }
  const css = [...document.querySelectorAll('link[rel=stylesheet]')]
    .map(x => `<link rel="stylesheet" href="${x.href}">`).join('');
  const cuerpo = tipo === 'interna' ? hojaInterna(o) : hojaCliente(o);
  const titulo = tipo === 'interna'
    ? `Cotización interna · Lote ${o.lote}`
    : `Cotización · Lote ${o.lote} · La Esperanza`;
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>${esc(titulo)}</title>${css}
    <style>
      html,body{background:#e9e6e1;margin:0;padding:0}
      .barra{text-align:center;padding:14px;background:#fff;border-bottom:1px solid #ddd}
      .barra button{padding:10px 20px;border-radius:8px;border:0;background:${COT.terracota};
        color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;margin:0 4px}
      .barra .sec{background:#fff;color:${COT.tinta};border:1px solid #ccc}
      @media print{.barra{display:none}html,body{background:#fff}}
    </style></head><body>
    <div class="barra">
      <button onclick="window.print()">Imprimir o guardar como PDF</button>
      <span style="margin-left:12px;font-size:12px;color:#666">Elige <b>Guardar como PDF</b> · tamaño Carta · márgenes por defecto</span>
    </div>
    ${cuerpo}</body></html>`);
  w.document.close();
}

const abrirCotizacion = o => abrirHoja('cliente', o);
const abrirCotizacionInterna = o => abrirHoja('interna', o);

/* ============================================================
   Enviar por WhatsApp

   El cliente debe recibir UN archivo, no una ristra de mensajes.
   Un PDF se guarda, se reenvía al esposo, se lleva al banco.
   Un mensaje de texto se pierde en la conversación.

   El PDF se arma en el backend (hay tipografías y control de
   página que el navegador no da) y se manda como documento por
   la API de WhatsApp. Aquí solo se pide.
   ============================================================ */
async function enviarCotizacionWhatsApp(o) {
  if (!o.telefono) { toast('Falta el teléfono del cliente'); return; }
  const url = (window.API_URL || '') + '/cotizacion/whatsapp';
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proyecto: typeof PROYECTO_ACTIVO !== 'undefined' ? PROYECTO_ACTIVO : 'RLE',
        lote: o.lote, precio: o.precio, enganche: o.enganche, plazo: o.plazo,
        cliente: o.cliente, telefono: o.telefono, vendedor: o.vendedor
      })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudo enviar');
    toast(d.simulado ? 'Listo (modo simulación: no se envió)' : 'Cotización enviada por WhatsApp ✓');
  } catch (e) {
    toast('No se pudo enviar: ' + e.message);
  }
}
