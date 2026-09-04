/* ============================================================
   GENERADOR DE CONTRATOS — Solicitud de Compra de Fracción de Bien Inmueble
   Texto legal real de LA ESPERANZA & ANEXOS, S.A.
   ============================================================ */

const EMPRESA = {
  razon: 'LA ESPERANZA & ANEXOS, SOCIEDAD ANÓNIMA',
  repLegal: 'RAFAEL BAC BOCH',
  repEdad: 'cincuenta y ocho',
  repDpi: '1579 65260 0407',
  repDpiLetras: 'un mil quinientos setenta y nueve espacio sesenta y cinco mil doscientos sesenta espacio cero cuatrocientos siete',
  repCargo: 'Gerente Administrativo y Representante Legal',
  notario: 'Juan Pablo Villatoro Aguilar',
  nombramiento: 'veinticinco de febrero de dos mil veintiséis',
  regMercantil: { numero: '827504', folio: '976', libro: '857' },
  asamblea: 'diecinueve de febrero de dos mil veintiséis',
  finca: { numero: '10,170', folio: '41', libro: '110', depto: 'Chimaltenango' },
  proyecto: 'LA ESPERANZA',
  municipio: 'San Miguel Pochuta',
  departamento: 'Chimaltenango',
  recaudador: 'ALJIBE, SOCIEDAD ANÓNIMA',
  arbitraje: 'Fundación CENAC'
};

/* ---------- Números a letras (español) ---------- */
const UNI = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiuno','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
const DEC = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
const CEN = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
function centenas(n){
  if(n===0) return '';
  if(n===100) return 'cien';
  const c=Math.floor(n/100), r=n%100;
  let s=CEN[c];
  if(r){ s+= (s?' ':'') + (r<30? UNI[r] : DEC[Math.floor(r/10)] + (r%10? ' y '+UNI[r%10] : '')); }
  return s;
}
function numeroALetras(n){
  n=Math.floor(Math.abs(n));
  if(n===0) return 'cero';
  const millones=Math.floor(n/1e6), miles=Math.floor((n%1e6)/1000), resto=n%1000;
  let s='';
  if(millones) s += (millones===1? 'un millón' : centenas(millones)+' millones');
  if(miles){ s += (s?' ':'') + (miles===1? 'mil' : centenas(miles)+' mil'); }
  if(resto){ s += (s?' ':'') + centenas(resto); }
  return s.trim();
}
function quetzalesEnLetras(monto){
  const ent=Math.floor(monto), cts=Math.round((monto-ent)*100);
  const cent = cts===0 ? 'CERO' : numeroALetras(cts).toUpperCase();
  return `${numeroALetras(ent).toUpperCase()} QUETZALES CON ${cent} CENTAVOS`;
}
const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fechaEnLetras(iso){
  const d=new Date(iso+'T00:00:00');
  return `${numeroALetras(d.getDate())} de ${MESES[d.getMonth()]} de dos mil ${numeroALetras(d.getFullYear()-2000)}`;
}

/* ---------- Generación del contrato ---------- */
async function generarContrato(id){
  const ct=getContrato(id); if(!ct){toast('Contrato no encontrado');return;}
  const cli=getCliente(ct.clienteId)||{};
  const l=getLote(ct.clave || ct.lote)||{};
  const plan=ct.plan||planFinanciamiento(ct.precio,ENGANCHE_MIN,60);
  const E=EMPRESA;
  const nombre=`${cli.nombre||''} ${cli.apellido||''}`.trim().toUpperCase();
  const bl=v=>v?esc(v):'<span class="bl"></span>';

  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Solicitud de Compra · ${ct.no}</title>
<style>
  @page{size:letter;margin:2.2cm 2cm}
  body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.5;color:#000;max-width:19cm;margin:0 auto;padding:20px;text-align:justify}
  h1{font-size:13pt;text-align:center;margin-bottom:18px;text-transform:uppercase;letter-spacing:.5px}
  .bl{display:inline-block;min-width:150px;border-bottom:1px solid #000}
  b.d{background:#fffbe6}
  .cl{margin-bottom:11px}
  table.lotes{width:100%;border-collapse:collapse;margin:10px 0}
  table.lotes td,table.lotes th{border:1px solid #666;padding:6px 8px;font-size:10.5pt}
  table.lotes th{background:#eee}
  .firmas{margin-top:44px;display:flex;justify-content:space-between;gap:30px}
  .firma{flex:1;text-align:center}
  .firma .ln{border-top:1px solid #000;margin-top:46px;padding-top:5px;font-size:10pt}
  .noprint{text-align:center;margin:26px 0}
  .noprint button{background:#2C5F4A;color:#fff;border:0;padding:11px 22px;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit;margin:0 4px}
  @media print{.noprint{display:none}body{padding:0}}
</style></head><body>

<h1>Solicitud de Compra de Fracción de Bien Inmueble</h1>

<p class="cl">En la ciudad de ${E.municipio}, departamento de ${E.departamento}, el <b class="d">${fechaEnLetras(ct.fecha)}</b>, Nosotros: <span class="bl"></span>, en mi calidad de gestor de negocios para el presente acto debidamente autorizado por el señor <b>${E.repLegal}</b>, de ${E.repEdad} años, casado, guatemalteco, Contador Público y Auditor, me identifico con el Documento Personal de Identificación número ${E.repDpiLetras} (${E.repDpi}), extendido por el Registro Nacional de las Personas de Guatemala, con domicilio en el departamento de Guatemala, quien comparece en su calidad de ${E.repCargo} de la Sociedad Mercantil denominada <b>${E.razon}</b>, calidad que acredita con el acta notarial de mi nombramiento, autorizada en esta ciudad el ${E.nombramiento}, por el Notario ${E.notario}, documento debidamente inscrito en el Registro Mercantil General de la República bajo el número ${E.regMercantil.numero}, folio ${E.regMercantil.folio}, del libro ${E.regMercantil.libro} de Auxiliares de Comercio. El señor ${E.repLegal} y sus gestores de negocios, se encuentran debidamente facultados para la celebración del presente acto, de conformidad con la Asamblea General Totalitaria Ordinaria de Accionistas celebrada en la ciudad de Guatemala el ${E.asamblea}. A la entidad ${E.razon}, en el transcurso del presente contrato se le denominará <b>"LA VENDEDORA"</b>; y por la otra parte <b class="d">${bl(nombre)}</b>, de <span class="bl" style="min-width:60px"></span> años de edad, <span class="bl" style="min-width:90px"></span>, guatemalteco(a), <span class="bl" style="min-width:110px"></span>, de este domicilio, me identifico con el Documento Personal de Identificación (DPI) con Código Único de Identificación (CUI) número <b class="d">${bl(cli.dpi)}</b>, extendido por el Registro Nacional de las Personas (RENAP) de la República de Guatemala. Aseguramos ser de los datos de identificación y calidad antes indicados, así como que nos encontramos en el libre ejercicio de nuestros derechos civiles y por este acto celebramos <b>SOLICITUD DE COMPRA DE FRACCIÓN DE BIEN INMUEBLE</b>, de conformidad con las siguientes cláusulas:</p>

<p class="cl"><b>PRIMERA: ANTECEDENTES.</b> Declara el señor ${E.repLegal}, que su representada, la entidad denominada ${E.razon}, es única y legítima propietaria de la finca rústica inscrita en el Registro General de la Propiedad al número <b>${E.finca.numero}</b>, FOLIO ${E.finca.folio}, DEL LIBRO ${E.finca.libro} DE ${E.finca.depto.toUpperCase()}, ubicada en el Municipio de ${E.municipio}, Departamento de ${E.departamento}, con las medidas y colindancias que constan en su respectiva inscripción de dominio.</p>

<p class="cl"><b>SEGUNDA: DE LA SOLICITUD DE COMPRA.</b> Continúa manifestando el señor ${E.repLegal}, que su representada se compromete a vender a EL (LA) COMPRADOR (A), quien a su vez se compromete a comprar, <b>UNA</b> fracción a desmembrarse del bien inmueble identificado en la cláusula primera, ubicada dentro del proyecto de lotificación <b>${E.proyecto}</b>, consistente en:</p>

<table class="lotes"><tr><th>No.</th><th>Lote</th><th>Área aproximada</th></tr>
<tr><td>1</td><td><b class="d">${esc(ct.lote)}</b></td><td><b class="d">${l.area||'—'} metros cuadrados (${l.area||'—'} mts²)</b></td></tr></table>

<p class="cl">En la futura compraventa se incluye todo cuanto de hecho y por derecho le corresponderá a dicho inmueble. Sobre la fracción prometida en venta no pesan gravámenes, anotaciones ni limitaciones que puedan afectar los derechos del promitente comprador, salvo las servidumbres y las limitaciones relacionadas con el Régimen Jurídico de Condominio y al Reglamento de Copropiedad y Administración del Condominio La Esperanza que será constituido, sobre todo en cuanto a la obligación de pago administrativo por mantenimiento de las áreas y servicios comunes.</p>

<p class="cl"><b>TERCERA: CONDICIONES Y ESTIPULACIONES.</b></p>
<p class="cl"><b>A) PLAZO:</b> El plazo del presente contrato será de <b class="d">${numeroALetras(plan.plazo)} (${plan.plazo}) meses</b> contados a partir de la celebración del presente contrato. Dicho plazo podrá prorrogarse de común acuerdo por las partes por razón de las diligencias de autorización municipal y de autoridades para la desmembración final y registro de los lotes. Al recibir el aviso de la vendedora, el comprador tendrá un plazo máximo de quince días para firmar la escritura traslativa de dominio, ante el notario que la vendedora indique.</p>

<p class="cl"><b>B) PRECIO DE LA FUTURA COMPRAVENTA.</b> El precio de la futura compraventa será de <b class="d">${quetzalesEnLetras(ct.precio)} (Q. ${Q(ct.precio).replace('Q ','')})</b>, valor que no incluye los impuestos de traslado de dominio ni gastos de escrituración, ni registro.</p>

<p class="cl"><b>C) FORMA DE PAGO DEL PRECIO.</b> El precio lo deberá pagar el Comprador de la siguiente manera:</p>
<p class="cl"><b>I)</b> La cantidad de <b class="d">${quetzalesEnLetras(plan.enganche)} (Q. ${Q(plan.enganche).replace('Q ','')})</b> que el comprador paga en concepto de primer pago del precio total y a su vez esa cantidad se constituye en <b>arras y derecho de reserva</b> hasta que se formalice el contrato de compraventa, cantidad que la vendedora declara haber recibido a satisfacción el día de hoy mediante depósito bancario.</p>
<p class="cl"><b>II)</b> <b class="d">${numeroALetras(plan.plazo)} (${plan.plazo})</b> pagos mensuales y consecutivos de <b class="d">${quetzalesEnLetras(plan.cuota)} (Q. ${Q(plan.cuota).replace('Q ','')})</b>, que el comprador pagará en forma mensual y consecutiva hasta finalizar el plazo, en concepto de abono al precio total. Cada cuota deberá ser pagada dentro de un plazo de treinta (30) días calendario, aplicando dicho plazo de forma sucesiva para cada cuota. Dicho pago será realizado a través de depósitos a la cuenta bancaria que la parte vendedora le indique. La vendedora desde ya autoriza a la entidad <b>${E.recaudador}</b> para recibir y recaudar todos los pagos que corresponden al presente contrato por cuenta de la vendedora.</p>

<p class="cl"><b>CUARTA: DEL FUTURO CONTRATO DE COMPRAVENTA.</b> El otorgamiento del futuro contrato de compraventa está sujeto a que el Comprador haya efectuado los pagos en la forma indicada en la cláusula que antecede y otorgado los documentos a que se obliga.</p>

<p class="cl"><b>QUINTA: INCUMPLIMIENTO.</b> <b>A)</b> Si el Comprador no efectúa los pagos en la forma convenida, o se niega en su oportunidad a firmar el contrato de compraventa respectivo sin causa justificada, o incumple cualquiera de sus obligaciones, se tendrá por incumplido de su parte este contrato y la Vendedora podrá disponer del inmueble libremente, sin responsabilidad alguna y sin necesidad de declaración judicial o extrajudicial, pudiendo conservar para sí la cantidad entregada en calidad de arras. <b>El atraso del Comprador en cualquiera de los pagos generará intereses moratorios a razón de dos por ciento (2%) mensual sobre el saldo pendiente de pago</b>, si la Vendedora decide unilateralmente no dar por terminado el contrato y aceptar voluntariamente los pagos atrasados más los intereses causados. <b>B)</b> Las partes aceptan expresamente que el primer pago por la cantidad de <b class="d">${quetzalesEnLetras(plan.enganche)} (Q. ${Q(plan.enganche).replace('Q ','')})</b> se constituirá en arras en garantía del cumplimiento de todas sus obligaciones; en caso de incumplimiento de la compradora sin causa justificada, ésta perderá las arras a favor de la vendedora, y en caso de incumplimiento de la promitente vendedora, ésta devolverá dicha cantidad íntegra más un dos por ciento (2%) mensual dentro de los cinco (5) días siguientes al vencimiento del plazo. <b>C)</b> Si la Vendedora, una vez recibidos los pagos completos, se negare a otorgar injustificadamente la escritura pública traslativa de dominio, deberá devolver al comprador dentro del plazo de cinco días cualesquiera cantidades recibidas y el pago de las arras convenidas. <b>D)</b> La Vendedora no será responsable del incumplimiento por caso fortuito o fuerza mayor: desastres naturales, terremotos, huracanes, incendios, tormentas, tornados, inundaciones, deslaves, pandemias, guerras, revoluciones, levantamientos armados, huelgas, insurrecciones o disturbios de cualquier naturaleza.</p>

<p class="cl"><b>SEXTA: OTRAS CONDICIONES.</b> La presente solicitud de compra no surte ningún efecto traslativo y no limita las facultades de disposición de la Vendedora sobre la finca identificada. La Vendedora podrá ceder los derechos derivados de este contrato, previo aviso al Comprador. Los derechos del Comprador no podrán cederse ni negociarse sin el previo consentimiento expreso y por escrito de la Vendedora.</p>

<p class="cl"><b>SÉPTIMA: CONDICIÓN RESOLUTORIA EXPRESA.</b> Constituye condición resolutoria expresa la falta de pago del saldo del precio, lo que dará derecho a la Vendedora a dejar sin efecto el presente contrato sin necesidad de declaración judicial, haciendo suya la cantidad recibida en concepto de arras y quedando en libertad absoluta para disponer del inmueble.</p>

<p class="cl"><b>OCTAVA: GASTOS Y HONORARIOS.</b> Los gastos y honorarios que se originen con motivo de la presente solicitud, el otorgamiento de la escritura traslativa de dominio, su registro y honorarios del profesional serán por cuenta exclusiva del Comprador, quien además deberá pagar el Impuesto que grave el traspaso del inmueble.</p>

<p class="cl"><b>NOVENA: PACTOS ACCESORIOS.</b> <b>A)</b> El presente contrato podrá ser protocolizado por cualquiera de las partes, reconociéndole calidad de título ejecutivo perfecto. <b>B) Cláusula Compromisoria:</b> Cualquier diferendo se resolverá conciliatoriamente y, en su defecto, mediante arbitraje ad-hoc de equidad en la ciudad de Guatemala, con tres árbitros, actuando la ${E.arbitraje} como entidad nominadora. El Comprador señala como lugar para recibir notificaciones <b class="d">${bl(cli.direccion)}</b>, y como correo electrónico <b class="d">${bl(cli.email)}</b>; la Vendedora señala: Finca La Esperanza, Municipio de ${E.municipio}, departamento de ${E.departamento}.</p>

<p class="cl"><b>DÉCIMA: ACEPTACIÓN.</b> El Comprador acepta expresamente la solicitud de compra que por este acto realiza, así como todas y cada una de las condiciones, requisitos y limitaciones expresadas.</p>

<p class="cl"><b>DÉCIMA PRIMERA: ACEPTACIÓN GENERAL.</b> Los comparecientes, bien impuestos de su contenido, validez y efectos legales, aceptan, ratifican y firman el presente contrato.</p>

<div class="firmas">
  <div class="firma"><div class="ln">Por: ${E.repLegal}<br>${E.repCargo}<br>${E.razon}</div></div>
  <div class="firma"><div class="ln">NOMBRE: ${nombre||'_______________'}<br>DPI: ${esc(cli.dpi)||'_______________'}<br>TELÉFONO: ${esc(cli.telefono)||'_______________'}</div></div>
</div>

<p style="margin-top:26px;font-size:9pt;color:#666">Contrato ${ct.no} · Lote ${ct.lote} · Generado por el Suite Sol Inmobiliaria el ${fmtD(HOY_ISO)}</p>

<div class="noprint">
  <button onclick="window.print()">Imprimir / Guardar PDF</button>
</div>
</body></html>`;

  const w=window.open('','_blank');
  if(!w){toast('Permite las ventanas emergentes para ver el contrato');return;}
  w.document.write(html); w.document.close();
  await registrarGestion(id,'Bitácora Socios','Contactado','Contrato generado desde el suite');
  await agregarDocumento(id,'Contrato firmado',`contrato_${ct.no}.pdf`);
  toast('Contrato '+ct.no+' generado');
}

/* ============================================================
   FORMULARIO DE SOLICITUD — el papel que llena el cliente, prellenado
   con todo lo que el suite ya sabe (lote, precio, plan, vendedor, datos
   del comprador y referencias). Se imprime o se manda como PDF, el
   cliente completa lo que falta a mano y firma; el escaneo se sube como
   «Formulario de solicitud». Modelo: el del lote I-08 agrícola.
   ============================================================ */
async function generarFormulario(id){
  const ct=getContrato(id); if(!ct){toast('Contrato no encontrado');return;}
  const cli=getCliente(ct.clienteId)||{};
  const l=getLote(ct.clave||ct.lote)||{};
  const plan=planFinanciamiento(ct.precio, ct.enganche!=null?ct.enganche:ENGANCHE_MIN, ct.plazo||60, ct.tasa);
  const yo=(typeof SESION!=='undefined'&&SESION.persona)||{};
  const admin=/admin|gerencia/.test(String(yo.rol||''))?yo.nombre:'';
  /* Referencias: las de la base y, si no hay, el pariente que se anotó al vender. */
  let refs=[];
  if(typeof hayBase==='function'&&hayBase()&&cli.id){
    try{ const r=await SB.from('referencia_personal').select('orden,nombre,telefono,parentesco').eq('cliente_id',cli.id).order('orden'); if(!r.error) refs=r.data||[]; }catch(e){}
  }
  if(!refs.length&&cli.pariente&&cli.pariente.nombre) refs=[{nombre:cli.pariente.nombre,telefono:cli.pariente.telefono}];
  const pagoEng=(DB.pagos||[]).filter(p=>mismoId(p.contratoId,ct.id)&&p.estado!=='rechazado').sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)))[0];
  const boleta=ct.boleta||(pagoEng&&pagoEng.referencia)||'';
  const banco=ct.banco||(boleta?'Banrural':'');
  const nombre=`${cli.nombre||''} ${cli.apellido||''}`.trim();
  const tel=cli.tel||cli.telefono||'', correo=cli.correo||cli.email||'';
  const fila=(k,val,cls)=>`<tr><th>${k}</th><td class="${cls||''}">${val?esc(String(val)):''}</td></tr>`;
  const Qn=n=>'Q. '+(Math.round(n*100)/100).toLocaleString('es-GT',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fecha=ct.fecha?fmtD(ct.fecha):fmtD(HOY_ISO);
  const tipoLote=[l.area?`${l.area} mts²`:'', l.tipo?(/^tipo/i.test(String(l.tipo))?String(l.tipo):`tipo ${l.tipo}`):'', _esAgroTxt(l.fase||ct.fase)?'Agrícola':(l.fase||ct.fase||'')].filter(Boolean).join(' · ');

  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Formulario de solicitud · ${esc(ct.no)} · ${esc(ct.lote)}</title>
<style>
  @page{size:letter;margin:1.4cm 1.6cm}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;color:#000;max-width:19cm;margin:0 auto;padding:14px}
  .cab{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:10px}
  table{border-collapse:collapse;width:100%}
  th{text-align:left;font-weight:700;font-size:8.5pt;text-transform:uppercase;padding:4px 6px;border:1px dotted #555;width:52%;vertical-align:top}
  td{padding:4px 8px;border:1px dotted #555;min-height:18px;height:20px;font-size:11pt}
  td.d{background:#fffbe6;font-weight:700}
  .sec{font-weight:700;font-size:9pt;text-align:right;margin:10px 0 2px;letter-spacing:.3px}
  .marca{text-align:center;font-size:9pt;line-height:1.3;border:1px solid #999;border-radius:8px;padding:8px 12px;min-width:150px}
  .marca b{display:block;font-size:12pt;letter-spacing:1px}
  .firmas{margin-top:26px;display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;align-items:end}
  .firmas .ln{border-bottom:1px solid #000;height:34px}
  .firmas .lb{font-size:9.5pt;padding-top:3px}
  .pie{margin-top:14px;font-size:8.5pt;color:#666}
  .noprint{text-align:center;margin:18px 0}
  .noprint button{background:#2E6B4F;color:#fff;border:0;padding:11px 22px;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit;margin:0 4px}
  @media print{.noprint{display:none}body{padding:0}}
</style></head><body>
<div class="cab">
  <table style="width:62%">
    ${fila('Número de lote', ct.lote, 'd')}
    ${fila('Área de lote', tipoLote, 'd')}
    ${fila('Fecha', fecha, 'd')}
    ${fila('Vendedor', ct.vendedor||'', 'd')}
    ${fila('Administrador de venta', admin, admin?'d':'')}
  </table>
  <div class="marca"><b>LA ESPERANZA</b>Lotificación<br>San Miguel Pochuta, Chimaltenango<br><span style="font-size:8pt;color:#666">${esc(ct.no)}</span></div>
</div>
<div class="sec">ESTA ÁREA LA LLENA EL VENDEDOR</div>
<table>
  ${fila('Precio de lote de comprador', Qn(ct.precio), 'd')}
  ${fila('Monto de pago inicial (enganche)', Qn(plan.enganche), 'd')}
  ${fila('Banco de depósito de pago de enganche', banco, banco?'d':'')}
  ${fila('Número de boleta o referencia', boleta, boleta?'d':'')}
  ${fila('Saldo deudor (monto a financiar)', Qn(Math.max(0,ct.precio-plan.enganche)), 'd')}
  ${fila('Plazo a financiar', `${plan.plazo} pagos`, 'd')}
  ${fila('Cuota mensual de lote', Qn(plan.cuota), 'd')}
</table>
<div class="sec">ESTA ÁREA LA LLENA EL CLIENTE</div>
<table>
  ${fila('Nombre completo del comprador', nombre, nombre?'d':'')}
  ${fila('Número de DPI del comprador', cli.dpi, cli.dpi?'d':'')}
  ${fila('Número de NIT (si tiene)', cli.nit, cli.nit?'d':'')}
  ${fila('Nacionalidad', '')}
  ${fila('Fecha de nacimiento', cli.nacimiento?fmtD(cli.nacimiento):'', cli.nacimiento?'d':'')}
  ${fila('Estado civil', '')}
  ${fila('Género (masculino o femenino)', '')}
  ${fila('Profesión', cli.ocupacion, cli.ocupacion?'d':'')}
  ${fila('Dirección de casa', cli.direccion, cli.direccion?'d':'')}
  ${fila('Número de teléfono de casa', '')}
  ${fila('Número de teléfono celular', tel, tel?'d':'')}
  ${fila('Dirección de correo electrónico', correo, correo?'d':'')}
  ${fila('Tipo de ocupación (propio o empresa)', '')}
  ${fila('Nombre de la empresa', '')}
  ${fila('Dirección de la empresa', '')}
  ${fila('Número de teléfono de la empresa', '')}
  <tr><th colspan="2" style="width:auto">Referencias familiares / personales</th></tr>
  ${[0,1,2].map(i=>fila(`Nombre de referencia ${i+1}`, refs[i]&&refs[i].nombre, refs[i]&&refs[i].nombre?'d':'')+fila(`Número de teléfono referencia ${i+1}`, refs[i]&&refs[i].telefono, refs[i]&&refs[i].telefono?'d':'')).join('')}
</table>
<div class="firmas">
  <div><div class="ln"></div><div class="lb">Firma comprador</div></div>
  <div><div class="ln" style="height:auto;padding-bottom:4px;font-size:11pt">${esc(nombre)}</div><div class="lb">Nombre de comprador</div></div>
  <div></div>
  <div><div class="ln" style="height:auto;padding-bottom:4px;font-size:11pt">${esc(cli.dpi||'')}</div><div class="lb">Número de DPI o pasaporte</div></div>
</div>
<p class="pie">Formulario de solicitud · Contrato ${esc(ct.no)} · Lote ${esc(ct.lote)} · Prellenado por el Suite Sol Inmobiliaria el ${fmtD(HOY_ISO)}. Lo sombreado viene del sistema; el cliente completa lo demás a mano y firma. El escaneo se sube al expediente como «Formulario de solicitud».</p>
<div class="noprint"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
</body></html>`;
  const w=window.open('','_blank');
  if(!w){toast('Permite las ventanas emergentes para ver el formulario');return;}
  w.document.write(html); w.document.close();
  await registrarGestion(id,'Bitácora Socios','Contactado','Formulario de solicitud generado prellenado desde el suite');
  toast('Formulario de '+ct.no+' listo: imprimilo o guardalo en PDF, el cliente lo completa y firma');
}
function _esAgroTxt(f){ return /agro|agric/i.test(String(f||'')); }

/* ============================================================
   PLAN DE PAGOS PARA FIRMA
   Segundo papel del flujo de venta: el vendedor lo imprime, lo firma
   con el cliente y sube el escaneo como «Plan de pagos firmado». Las
   fechas siguen la regla de los giros (la primera cuota un mes después
   de la fecha del contrato, mismo día). Sin base, o antes de generar
   giros, se calcula igual con el plan del contrato.
   ============================================================ */
async function generarPlanPagos(id){
  const ct=getContrato(id); if(!ct){toast('Contrato no encontrado');return;}
  const cli=getCliente(ct.clienteId)||{};
  const l=getLote(ct.clave||ct.lote)||{};
  const plan=planFinanciamiento(ct.precio, ct.enganche!=null?ct.enganche:ENGANCHE_MIN, ct.plazo||60, ct.tasa);
  const nombre=`${cli.nombre||''} ${cli.apellido||''}`.trim();
  const Qn=n=>'Q '+(Math.round(n*100)/100).toLocaleString('es-GT',{minimumFractionDigits:2,maximumFractionDigits:2});
  const base=new Date((ct.fecha||HOY_ISO)+'T12:00:00');
  const sumaMeses=(d,n)=>{ const x=new Date(d); const dia=x.getDate(); x.setDate(1); x.setMonth(x.getMonth()+n); const ult=new Date(x.getFullYear(),x.getMonth()+1,0).getDate(); x.setDate(Math.min(dia,ult)); return x; };
  const iso=d=>d.toISOString().slice(0,10);
  /* Si ya hay giros en la base, mandan ellos (fechas y montos reales). */
  const giros=(DB.giros||[]).filter(g=>mismoId(g.contratoId,ct.id)&&!g.condicion).sort((a,b)=>String(a.vence||a.venc).localeCompare(String(b.vence||b.venc)));
  const cuotas=giros.length?giros.map((g,i)=>({n:g.numero||i+1,f:g.vence||g.venc,m:g.monto}))
    :Array.from({length:plan.plazo},(_,i)=>({n:i+1,f:iso(sumaMeses(base,i+1)),m:plan.cuota}));
  const total=cuotas.reduce((s,c)=>s+c.m,0);
  const filas=cuotas.map(c=>`<tr><td class="c">${c.n}</td><td>${fmtD(c.f)}</td><td class="r">${Qn(c.m)}</td><td></td><td></td></tr>`).join('');
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Plan de pagos · ${esc(ct.no)} · ${esc(ct.lote)}</title>
<style>
  @page{size:letter;margin:1.4cm 1.6cm}
  body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#000;max-width:19cm;margin:0 auto;padding:14px}
  h1{font-size:13pt;text-align:center;margin:0 0 4px;letter-spacing:.5px}
  .sub{text-align:center;font-size:9pt;color:#444;margin-bottom:12px}
  .res{display:grid;grid-template-columns:repeat(4,1fr);gap:6px 14px;margin:10px 0 14px;font-size:9.5pt}
  .res b{display:block;font-size:11pt}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #777;padding:3px 6px;font-size:9.5pt}
  th{background:#eee;text-transform:uppercase;font-size:8pt}
  td.c{text-align:center;width:36px} td.r{text-align:right;width:110px}
  tfoot td{font-weight:700}
  .firmas{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:16px 40px;align-items:end;page-break-inside:avoid}
  .firmas .ln{border-bottom:1px solid #000;height:34px}
  .firmas .lb{font-size:9.5pt;padding-top:3px}
  .pie{margin-top:12px;font-size:8.5pt;color:#666}
  .noprint{text-align:center;margin:18px 0}
  .noprint button{background:#2E6B4F;color:#fff;border:0;padding:11px 22px;border-radius:8px;font-size:14px;cursor:pointer;font-family:inherit}
  @media print{.noprint{display:none}body{padding:0} thead{display:table-header-group}}
</style></head><body>
<h1>PLAN DE PAGOS · LOTIFICACIÓN LA ESPERANZA</h1>
<div class="sub">San Miguel Pochuta, Chimaltenango · Contrato ${esc(ct.no)} · Lote ${esc(ct.lote)}${l.area?` · ${esc(String(l.area))} m²`:''}</div>
<div class="res">
  <div>Comprador<b>${esc(nombre)||'—'}</b></div>
  <div>DPI<b>${esc(cli.dpi||'')||'—'}</b></div>
  <div>Fecha del contrato<b>${fmtD(ct.fecha||HOY_ISO)}</b></div>
  <div>Vendedor<b>${esc(ct.vendedor||'')||'—'}</b></div>
  <div>Precio del lote<b>${Qn(ct.precio)}</b></div>
  <div>Enganche<b>${Qn(plan.enganche)}</b></div>
  <div>Saldo a financiar<b>${Qn(plan.saldo)}</b></div>
  <div>Plazo · cuota<b>${cuotas.length} pagos · ${Qn(plan.cuota)}</b></div>
</div>
<table><thead><tr><th>No.</th><th>Vence</th><th>Cuota</th><th>Fecha de pago</th><th>Boleta / recibo</th></tr></thead>
<tbody>${filas}</tbody>
<tfoot><tr><td colspan="2">Total en cuotas</td><td class="r">${Qn(total)}</td><td colspan="2"></td></tr></tfoot></table>
<p style="font-size:9pt;margin-top:10px">Las cuotas vencen en la fecha indicada. Los pagos se hacen por depósito o transferencia a la cuenta de la empresa y se envía la boleta al vendedor o a cobranza; cada pago recibe su recibo numerado. El atraso genera mora conforme al contrato.</p>
<div class="firmas">
  <div><div class="ln"></div><div class="lb">Firma del comprador · ${esc(nombre)}</div></div>
  <div><div class="ln"></div><div class="lb">Por Lotificación La Esperanza · ${esc(ct.vendedor||'')}</div></div>
</div>
<p class="pie">Plan de pagos · Contrato ${esc(ct.no)} · Generado por el Suite Sol Inmobiliaria el ${fmtD(HOY_ISO)}. Se imprime, se firma con el cliente y el escaneo se sube al expediente como «Plan de pagos firmado».</p>
<div class="noprint"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
</body></html>`;
  const w=window.open('','_blank');
  if(!w){toast('Permite las ventanas emergentes para ver el plan de pagos');return;}
  w.document.write(html); w.document.close();
  toast('Plan de pagos de '+ct.no+' listo: imprimilo, firmalo con el cliente y subí el escaneo');
}
