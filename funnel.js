/* ============================================================
   EMBUDO PÚBLICO DE VENTAS — sin login
   Link para pautar en Facebook / Instagram / TikTok.
   Etapas: atracción → interés → consideración → lead → solicitud → cierre
   ============================================================ */
const Qk = n => 'Q ' + Math.round(n).toLocaleString('es-GT');
const Qf = n => 'Q ' + (Math.round(n*100)/100).toLocaleString('es-GT',{minimumFractionDigits:2,maximumFractionDigits:2});
const WA_NUM = '50235101598';   // WhatsApp Business de La Esperanza

let F = { lote:null, eng:2500, plz:60, lead:null, filtro:'todos', tope:12, etapa:'atraccion' };

/* ---------- Origen de la campaña (UTM) ---------- */
function origenCampana(){
  const p=new URLSearchParams(location.search);
  const s=(p.get('utm_source')||p.get('src')||'').toLowerCase();
  const map={facebook:'Facebook',fb:'Facebook',instagram:'Instagram',ig:'Instagram',
             tiktok:'TikTok',tt:'TikTok',google:'Google',whatsapp:'WhatsApp'};
  return { fuente: map[s]||(s?s:'Directo'), campana:p.get('utm_campaign')||'', anuncio:p.get('utm_content')||'' };
}
const ORIGEN = origenCampana();

/* ---------- Medición del embudo (aquí se conecta el pixel / KOMMO) ---------- */
const EVENTOS=[];
function track(evento, extra){
  const e={evento, ...ORIGEN, ...(extra||{}), ts:new Date().toISOString()};
  EVENTOS.push(e);
  try{ localStorage.setItem('funnel_eventos', JSON.stringify(EVENTOS.slice(-50))); }catch(_){}
  // Aquí irían: fbq('track',...), ttq.track(...), o el webhook al Hub/KOMMO
  console.log('[funnel]', evento, e);
}


/* ---------- La lista de precios que se anuncia ----------

   initDB() siembra DB.lotes desde data.js (la foto de julio) o,
   peor, desde el localStorage del visitante — que puede tener
   precios de hace semanas. Ninguna de las dos es la lista buena.

   inventario-publico.js se genera desde la base con
   `node hub/tools/precios.js --escribir`. Manda ese archivo,
   siempre, sobre cualquier cosa que ya estuviera en memoria.

   Si por lo que sea no cargó, se sigue con lo que había: es
   preferible una página con precios viejos a una página vacía —
   pero queda dicho en la consola.                              */
function usarInventarioPublico(){
  const inv = window.INVENTARIO_PUBLICO;
  if(!inv || !inv.lotes || !inv.lotes.length){
    console.warn('[funnel] inventario-publico.js no cargó · se anuncian precios de respaldo');
    return;
  }
  const geo = {}; (window.LOT_GEO||[]).forEach(g=>{ geo[g.id]=g; });
  DB.lotes = inv.lotes.map(l=>({
    ...l,
    x: geo[l.codigo] ? geo[l.codigo].x : null,
    y: geo[l.codigo] ? geo[l.codigo].y : null
  }));
  console.info(`[funnel] ${DB.lotes.length} lotes disponibles · lista del ${inv.generado}`);
}

/* ---------- Inicio ---------- */
function initFunnel(){
  initDB();
  usarInventarioPublico();
  const disp=DB.lotes.filter(l=>l.estado==='disponible'&&l.precio>0);
  document.getElementById('fDisp').textContent=disp.length;
  if(ORIGEN.fuente!=='Directo')
    document.getElementById('fSrc').textContent='Bienvenido desde '+ORIGEN.fuente;
  pintarFiltros(); pintarLotes(); dibujarPlano();
  track('vista_landing',{lotes_disponibles:disp.length});
}

/* ---------- Mapa del plano en el embudo ---------- */
let fVB=null, fDrag=false;
function setVista(v){
  const mapa=v==='mapa';
  document.getElementById('fMapaBox').hidden=!mapa;
  document.getElementById('fFiltros').hidden=mapa;
  document.getElementById('fLotes').hidden=mapa;
  document.getElementById('fMas').hidden=mapa||lotesDisponibles().length<=F.tope;
  document.getElementById('vbMapa').classList.toggle('on',mapa);
  document.getElementById('vbLista').classList.toggle('on',!mapa);
  if(mapa) dibujarPlano();
  track('cambio_vista',{vista:v});
}
function dibujarPlano(){
  const svg=document.getElementById('fSvg'); if(!svg||!window.PLAN_CLIP)return;
  if(svg.dataset.listo==='1'){pintarPlano();return;}
  const clip=window.PLAN_CLIP, NS='http://www.w3.org/2000/svg';
  svg.innerHTML='';
  const img=document.createElementNS(NS,'image');
  img.setAttribute('x',clip.x);img.setAttribute('y',clip.y);
  img.setAttribute('width',clip.w);img.setAttribute('height',clip.h);
  img.setAttribute('preserveAspectRatio','none');
  img.setAttribute('href','assets/plano.png');
  img.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href','assets/plano.png');
  svg.appendChild(img);
  const S=window.LOT_SHAPE||{};
  DB.lotes.forEach(l=>{
    const s=S[l.codigo]; if(!s)return;
    const el=document.createElementNS(NS,'polygon');
    el.setAttribute('points', s.p.map(p=>p.join(',')).join(' '));
    el.setAttribute('class','f-lotm');
    el.dataset.id=l.codigo;
    const libre = l.estado==='disponible' && l.precio>0;
    el.setAttribute('fill', libre?'#8FB09B':'#C7CFC9');
    el.setAttribute('fill-opacity', libre?0.62:0.42);
    el.setAttribute('stroke', libre?'#4d7a5e':'#a8b2ac');
    el.setAttribute('stroke-width',0.6);
    el.style.cursor = libre?'pointer':'not-allowed';
    el.addEventListener('mousemove',e=>tipPlano(e,l,libre));
    el.addEventListener('mouseleave',()=>{document.getElementById('fTip').hidden=true;});
    if(libre){
      el.addEventListener('click',()=>{if(!fDrag)elegirLote(l.codigo);});
    } else {
      el.addEventListener('click',()=>{ if(fDrag)return;
        toastF(`El lote ${l.codigo} ya está vendido. Toca uno en verde.`);
        track('clic_lote_vendido',{lote:l.codigo}); });
    }
    svg.appendChild(el);
  });
  fSetVB(clip.x,clip.y,clip.w,clip.h);
  fPanZoom(svg);
  svg.dataset.listo='1';
  pintarPlano();
}
function pintarPlano(){
  document.querySelectorAll('.f-lotm').forEach(el=>{
    el.classList.toggle('sel', !!(F.lote&&F.lote.codigo===el.dataset.id));
  });
}
function toastF(msg){
  document.querySelector('.f-toast')?.remove();
  const t=document.createElement('div'); t.className='f-toast'; t.textContent=msg;
  document.body.appendChild(t); setTimeout(()=>t.remove(),2600);
}
function tipPlano(e,l,libre){
  const tip=document.getElementById('fTip'), wrap=document.querySelector('.f-mapa-wrap');
  tip.innerHTML = libre
    ? `<b>Lote ${l.codigo}</b> · ${l.area} m²<br>${Qk(l.precio)}<br><span style="color:#8FB09B">Toca para elegirlo</span>`
    : `<b>Lote ${l.codigo}</b> · ${l.area} m²<br><span style="color:#E0A72E">Ya vendido</span>`;
  tip.hidden=false;
  const r=wrap.getBoundingClientRect();
  tip.style.left=Math.min(r.width-140,e.clientX-r.left+12)+'px';
  tip.style.top=(e.clientY-r.top-8)+'px';
}
function fSetVB(x,y,w,h){fVB={x,y,w,h};document.getElementById('fSvg').setAttribute('viewBox',`${x} ${y} ${w} ${h}`);}
function fZoomAt(cx,cy,s){
  const svg=document.getElementById('fSvg'),clip=window.PLAN_CLIP,r=svg.getBoundingClientRect();
  const mx=fVB.x+(cx-r.left)/r.width*fVB.w, my=fVB.y+(cy-r.top)/r.height*fVB.h;
  const nw=Math.max(clip.w*0.06,Math.min(clip.w,fVB.w*s)), nh=nw*(clip.h/clip.w);
  fSetVB(mx-(mx-fVB.x)*(nw/fVB.w), my-(my-fVB.y)*(nh/fVB.h), nw, nh);
}
function fZoom(s){const r=document.getElementById('fSvg').getBoundingClientRect();fZoomAt(r.left+r.width/2,r.top+r.height/2,s);}
function fZoomReset(){const c=window.PLAN_CLIP;fSetVB(c.x,c.y,c.w,c.h);}
function fPanZoom(svg){
  let down=false,sx=0,sy=0,pid=null,cap=false;
  svg.onwheel=e=>{e.preventDefault();fZoomAt(e.clientX,e.clientY,e.deltaY<0?0.85:1.18);};
  svg.onpointerdown=e=>{down=true;fDrag=false;cap=false;pid=e.pointerId;sx=e.clientX;sy=e.clientY;};
  svg.onpointermove=e=>{
    if(!down)return;
    if(!fDrag&&Math.abs(e.clientX-sx)+Math.abs(e.clientY-sy)>4){fDrag=true;cap=true;try{svg.setPointerCapture(pid);}catch(_){}}
    if(!fDrag)return;
    const r=svg.getBoundingClientRect();
    fSetVB(fVB.x-(e.clientX-sx)*fVB.w/r.width, fVB.y-(e.clientY-sy)*fVB.h/r.height, fVB.w, fVB.h);
    sx=e.clientX;sy=e.clientY;
  };
  const end=()=>{down=false;if(cap){try{svg.releasePointerCapture(pid);}catch(_){}cap=false;}
    setTimeout(()=>{fDrag=false;},50);};
  svg.onpointerup=end;svg.onpointercancel=end;
}

/* ---------- Interés: explorador de lotes ---------- */
function lotesDisponibles(){
  let L=DB.lotes.filter(l=>l.estado==='disponible'&&l.precio>0);
  if(F.filtro==='90')   L=L.filter(l=>l.area<100);
  if(F.filtro==='142')  L=L.filter(l=>l.area>=100&&l.area<200);
  if(F.filtro==='200')  L=L.filter(l=>l.area>=200);
  if(F.filtro==='econ') L=L.slice().sort((a,b)=>a.precio-b.precio);
  return L;
}
function pintarFiltros(){
  const f=[['todos','Todos'],['90','90 m²'],['142','142 m²'],['200','Grandes'],['econ','Más económicos']];
  document.getElementById('fFiltros').innerHTML=f.map(([k,l])=>
    `<button class="f-chip ${F.filtro===k?'on':''}" onclick="setFiltroF('${k}')">${l}</button>`).join('');
}
function setFiltroF(k){F.filtro=k;F.tope=12;pintarFiltros();pintarLotes();track('filtro_lotes',{filtro:k});}
function pintarLotes(){
  const L=lotesDisponibles(), vis=L.slice(0,F.tope);
  document.getElementById('fLotes').innerHTML = vis.length? vis.map(l=>`
    <div class="f-lote ${F.lote&&F.lote.codigo===l.codigo?'sel':''}" onclick="elegirLote('${l.codigo}')">
      <div class="f-lote-c">${l.codigo}</div>
      <div class="f-lote-m">${l.area} m² · Manzana ${l.manzana}</div>
      <div class="f-lote-p">${Qk(l.precio)}</div>
      <div class="f-lote-q">${Qk(l.precio/l.area)} por m²</div>
    </div>`).join('') : '<p class="f-sub">No hay lotes con ese filtro.</p>';
  document.getElementById('fMas').hidden = L.length<=F.tope;
}
function verMas(){F.tope+=12;pintarLotes();track('ver_mas_lotes');}

/* ---------- Consideración: simulador ---------- */
function elegirLote(codigo){
  F.lote=getLote(codigo);
  pintarLotes(); pintarPlano();
  document.getElementById('simulador').hidden=false;
  document.getElementById('simLote').textContent=`Lote ${F.lote.codigo} · ${F.lote.area} m² · ${Qk(F.lote.precio)}`;
  const rE=document.getElementById('rEng');
  rE.max=Math.max(5000,Math.round(F.lote.precio*0.4/500)*500);
  calcSim();
  document.getElementById('stkLote').textContent='Lote '+F.lote.codigo;
  document.getElementById('stkPrecio').textContent=Qk(F.lote.precio);
  document.getElementById('fSticky').hidden=false;
  irA('simulador');
  track('lote_seleccionado',{lote:codigo,precio:F.lote.precio});
}
function calcSim(){
  F.eng=+document.getElementById('rEng').value;
  F.plz=+document.getElementById('rPlz').value;
  document.getElementById('vEng').textContent=Qk(F.eng);
  document.getElementById('vPlz').textContent=F.plz+' meses';
  const p=planFinanciamiento(F.lote.precio,F.eng,F.plz);
  document.getElementById('vCuota').textContent=Qk(p.cuota);
  document.getElementById('vDet').innerHTML=`
    <div><span>Precio del lote</span><b>${Qk(p.precio)}</b></div>
    <div><span>Enganche</span><b>${Qk(p.enganche)}</b></div>
    <div><span>Saldo a financiar</span><b>${Qk(p.saldo)}</b></div>
    <div><span>Plazo</span><b>${p.plazo} meses</b></div>
    <div><span>Total del plan</span><b>${Qk(p.total)}</b></div>`;
}

/* ---------- Captura del lead (lo importante del embudo) ---------- */
function abrirCaptura(){
  document.getElementById('mCaptura').hidden=false;
  track('abrio_captura',{lote:F.lote.codigo});
}
function cerrarModal(){document.getElementById('mCaptura').hidden=true;}
function guardarLead(){
  const nom=val('cNom').trim(), tel=val('cTel').trim();
  if(nom.length<3){alert('Por favor escribe tu nombre completo');return;}
  if(tel.replace(/\D/g,'').length<8){alert('Por favor escribe un teléfono válido');return;}
  F.lead={nombre:nom,telefono:tel,email:val('cMail').trim()};
  // El lead se guarda AUNQUE no termine la solicitud → va al Hub / KOMMO
  DB.leadsFunnel=DB.leadsFunnel||[];
  DB.leadsFunnel.push({...F.lead,lote:F.lote.codigo,enganche:F.eng,plazo:F.plz,
                       origen:ORIGEN.fuente,campana:ORIGEN.campana,fecha:new Date().toISOString(),estado:'nuevo'});
  saveDB();
  track('lead_capturado',{lote:F.lote.codigo,nombre:nom});
  cerrarModal();
  document.getElementById('solicitud').hidden=false;
  const p=planFinanciamiento(F.lote.precio,F.eng,F.plz);
  document.getElementById('sResumen').innerHTML=`
    <div><span>Lote ${F.lote.codigo} · ${F.lote.area} m²</span><b>${Qk(p.precio)}</b></div>
    <div><span>Enganche</span><b>${Qk(p.enganche)}</b></div>
    <div><span>Plazo</span><b>${p.plazo} meses</b></div>
    <div class="tot"><span>Cuota mensual</span><b>${Qf(p.cuota)}</b></div>`;
  irA('solicitud');
}

/* ---------- Solicitud y cierre ---------- */
function enviarSolicitud(){
  if(!document.getElementById('sAcepta').checked){alert('Debes aceptar y firmar el contrato para continuar');return;}
  const dpi=val('sDpi').trim();
  if(dpi.replace(/\D/g,'').length<13){alert('Escribe tu DPI (13 dígitos)');return;}
  const ct=nuevoContrato({
    lote:F.lote.codigo, nombre:F.lead.nombre, dpi, telefono:F.lead.telefono, email:F.lead.email,
    vendedor:'Compra en línea', enganche:F.eng, plazo:F.plz, origen:'En línea'
  });
  registrarGestion(ct.id,'Bitácora Socios','Contactado',
    `Solicitud desde ${ORIGEN.fuente}${ORIGEN.campana?' · campaña '+ORIGEN.campana:''}`);
  const l=DB.leadsFunnel[DB.leadsFunnel.length-1]; if(l){l.estado='convertido';l.contrato=ct.no;}
  saveDB();
  track('solicitud_enviada',{contrato:ct.no,lote:F.lote.codigo,monto:F.lote.precio});
  document.getElementById('okNom').textContent=F.lead.nombre.split(' ')[0];
  document.getElementById('okNo').textContent=ct.no;
  ['lotes','simulador','solicitud'].forEach(id=>document.getElementById(id).hidden=true);
  document.getElementById('fSticky').hidden=true;
  document.getElementById('gracias').hidden=false;
  irA('gracias');
}

/* ---------- WhatsApp ---------- */
function waClick(donde){
  const txt=F.lote
    ? `Hola, me interesa el lote ${F.lote.codigo} (${F.lote.area} m²) de La Esperanza.`
    : 'Hola, quiero información sobre los lotes de La Esperanza.';
  track('click_whatsapp',{donde,lote:F.lote?F.lote.codigo:null});
  window.open(`https://wa.me/${WA_NUM}?text=${encodeURIComponent(txt)}`,'_blank');
}

/* ---------- Utilidades ---------- */
const val = id => document.getElementById(id).value||'';
function irA(id){
  const e=document.getElementById(id);
  if(e&&typeof e.scrollIntoView==='function') e.scrollIntoView({behavior:'smooth',block:'start'});
}

initFunnel();
