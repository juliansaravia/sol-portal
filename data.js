/* ============================================================
   SUITE SOL INMOBILIARIA · Datos sembrados (reales, extraídos del CRM)
   Proyecto: La Esperanza Residencial — SOL Desarrollos
   Fuente: sistemasenlaza2 (inventario y tablero al 2026-07-27)
   ============================================================ */

/* Los proyectos del suite. Hoy solo La Esperanza tiene datos cargados;
   cada uno lleva sus propias reglas comerciales, así que agregar otro
   no toca el motor — solo esta lista y su inventario. */
const PROYECTOS = {
  RLE: {
    codigo: "RLE",
    nombre: "La Esperanza Residencial",
    corto: "La Esperanza",
    desarrollador: "SOL Desarrollos",
    razonSocial: "La Esperanza & Anexos, S.A.",
    ubicacion: "San Miguel Pochuta, Chimaltenango",
    fase: "Fase I",
    moneda: "GTQ",
    salaVenta: { descripcion: "SOL DESARROLLOS", prefijo: "SD", correlativo: 131 },
    // Reglas comerciales — las mismas que ya usa el motor financiero
    tasaMensual: 0.015,      // interés plano sobre el saldo original
    tasaMora: 0.02,
    engancheMinimo: 2500,
    plazos: [12, 24, 36, 48, 60, 72, 84],
    comisionPct: 0.02,
    activo: true,
  },
};

/* El proyecto en el que se está trabajando. */
let PROYECTO = PROYECTOS.RLE;

/* Equipo comercial */
const VENDEDORES = ["Víctor del Valle", "Gabriel Reyes", "Rina Rivas"];

/* Catálogos reales del CRM */
const CATALOGOS = {
  formasPago: ["Efectivo", "Tarjeta de Crédito", "Tarjeta de Débito", "Depósito Bancario", "Contrato CBH", "Descuento"],
  obligaciones: [
    { desc: "Reserva", tipo: "reserva" },
    { desc: "Cuota Inicial", tipo: "inicial" },
    { desc: "Saldo Deudor", tipo: "saldo" },
  ],
  bancos: ["BAC", "Banco Industrial", "Promerica", "Banrural", "BANTRAB", "Banco Azteca", "Banco GYT", "Banco CHN"],
  cuentas: ["SOL DESARROLLOS BANRURAL", "ALJIBE"],
  tiposGestion: ["Cobranza", "Recordatorio de Pago", "Bitácora Socios"],
  resultadosGestion: ["Contactado", "No contactado", "Cobranza Satisfactoria", "Cobranza NO Satisfactoria", "Solucionado", "Pendiente"],
  plantillas: ["Pagaré", "Solicitud de Reserva", "Carnet", "Verificación", "Reglamento"],
  perfiles: ["Administrador", "Gerencias", "Mercadeo y Ventas", "Cobranzas", "Confirmación de Pagos"],
};

/* Inventario real: codigo|precio|area|estado(D=disponible,V=vendido) */
const LOTES_RAW = `
A-01|72481.50|90|D;A-02|72481.50|90|D;A-03|72481.50|90|D;A-04|72481.50|90|D;A-05|72481.50|90|D;A-06|72481.50|90|D;A-07|72481.50|90|D;A-08|72481.50|90|D;A-09|72481.50|90|D;A-10|72481.50|90|D;A-11|72481.50|90|D;A-12|72481.50|90|D;A-13|62127.00|90|V;A-14|48321.00|90|V;A-15|48321.00|90|V;A-16|50737.50|90|V;A-17|50737.05|90|V;A-18|50737.05|90|V;A-19|50737.05|90|V;A-20|50737.05|90|V;A-21|50737.05|90|V;A-22|72481.50|90|D;A-23|72481.50|90|D;A-24|72481.50|90|D;A-25|72481.50|90|D;A-26|72481.50|90|D;A-27|72481.50|90|D;A-28|72481.50|90|D;A-29|72481.50|90|D;A-30|72481.50|90|D;A-31|72481.50|90|D;A-32|72481.50|90|D;
B-01|72481.50|90|D;B-02|72481.50|90|D;B-03|72481.50|90|D;B-04|72481.50|90|D;B-05|72481.50|90|D;B-06|72481.50|90|D;B-07|72481.50|90|D;B-08|72481.50|90|D;B-09|72481.50|90|D;B-10|72481.50|90|D;B-11|72481.50|90|D;B-12|48321.00|90|V;B-13|48321.00|90|V;B-14|48321.00|90|V;B-15|48321.00|90|V;B-16|50737.50|90|V;B-17|50737.50|90|V;B-18|62127.00|90|V;B-19|50737.50|90|V;B-20|48321.00|90|V;B-21|48321.00|90|V;B-22|62127.00|90|V;B-23|62127.00|90|V;B-24|72481.50|90|D;B-25|72481.50|90|D;B-26|72481.50|90|D;B-27|72481.50|90|D;B-28|72481.50|90|D;B-29|72481.50|90|D;B-30|72481.50|90|D;B-31|72481.50|90|D;B-32|72481.50|90|D;
C-01|72481.50|90|D;C-02|72481.50|90|D;C-03|72481.50|90|D;C-04|72481.50|90|D;C-05|72481.50|90|D;C-06|72481.50|90|D;C-07|72481.50|90|D;C-08|50737.05|90|V;C-09|72481.50|90|D;C-10|72481.50|90|D;C-11|50737.05|90|V;C-12|53273.90|90|V;C-13|72481.50|90|D;C-14|62127.00|90|V;C-15|62127.00|90|V;C-16|50737.05|90|V;C-17|50737.05|90|V;C-18|48321.00|90|V;C-19|50737.05|90|V;C-20|48321.00|90|V;C-21|60000.00|90|V;C-22|50737.05|90|V;C-23|62127.00|90|D;C-24|72481.50|90|D;C-25|50737.05|90|V;C-26|72481.50|90|D;C-27|72481.50|90|D;C-28|50737.05|90|V;C-29|72481.50|90|D;C-30|72481.50|90|D;C-31|72481.50|90|D;C-32|72481.50|90|D;
D-01|72481.50|90|D;D-02|72481.50|90|D;D-03|72481.50|90|D;D-04|72481.50|90|D;D-05|72481.50|90|D;D-06|72481.50|90|D;D-07|72481.50|90|D;D-08|72481.50|90|D;D-09|72481.50|90|D;D-10|50737.05|90|V;D-11|50737.05|90|V;D-12|50737.05|90|V;D-13|72481.50|90|D;D-14|48321.00|90|V;D-15|50737.05|90|V;D-16|50737.05|90|V;D-17|50737.05|90|V;D-18|72481.50|90|D;D-19|72481.50|90|D;D-20|72481.50|90|D;D-21|72481.50|90|D;D-22|72481.50|90|D;D-23|72481.50|90|D;D-24|72481.50|90|D;D-25|72481.50|90|D;D-26|72481.50|90|D;D-27|72481.50|90|D;D-28|72481.50|90|D;D-29|72481.50|90|D;D-30|72481.50|90|D;D-31|72481.50|90|D;D-32|72481.50|90|D;
E-01|72481.50|90|D;E-02|72481.50|90|D;E-03|72481.50|90|D;E-04|72481.50|90|D;E-05|72481.50|90|D;E-06|72481.50|90|D;E-07|72481.50|90|D;E-08|72481.50|90|D;E-09|72481.50|90|D;E-10|72481.50|90|D;E-11|72481.50|90|D;E-12|72481.50|90|D;E-13|72481.50|90|D;E-14|72481.50|90|D;E-15|72481.50|90|D;E-16|53273.90|90|V;E-17|53273.90|90|V;E-18|72481.50|90|D;E-19|72481.50|90|D;E-20|72481.50|90|D;E-21|72481.50|90|D;E-22|72481.50|90|D;E-23|72481.50|90|D;E-24|72481.50|90|D;E-25|72481.50|90|D;E-26|72481.50|90|D;E-27|72481.50|90|D;E-28|72481.50|90|D;E-29|72481.50|90|D;E-30|72481.50|90|D;E-31|72481.50|90|D;E-32|72481.50|90|D;
F-01|82480.78|142.50|V;F-02|114762.38|142.50|D;F-03|114762.38|142.50|D;F-04|98367.75|142.50|V;F-05|114762.38|142.50|D;F-06|74812.50|142.50|V;F-07|74812.50|142.50|V;F-08|74812.50|142.50|V;F-09|74812.50|142.50|V;F-10|74812.50|142.50|V;F-11|50737.05|142.50|V;F-12|50737.05|142.50|V;F-13|74812.50|142.50|V;F-14|74812.50|142.50|V;F-15|74812.50|142.50|V;F-16|74812.50|142.50|V;F-17|78553.13|142.50|V;F-18|114762.38|142.50|D;F-19|98367.75|142.50|V;F-20|98367.75|142.50|V;F-21|98367.75|142.50|V;F-22|82480.78|142.50|V;
G-01|78553.70|142.50|V;G-02|98367.75|142.50|V;G-03|98367.75|142.50|V;G-04|114762.38|142.50|D;G-05|74812.50|142.50|V;G-06|114762.38|142.50|D;G-07|86071.79|142.50|V;G-08|74812.50|142.50|V;G-09|74812.50|142.50|V;G-10|74812.50|142.50|V;G-11|50737.50|142.50|V;G-12|50737.50|142.50|V;G-13|74812.50|142.50|V;G-14|74812.50|142.50|V;G-15|74812.50|142.50|V;G-16|114762.38|142.50|D;G-17|114762.38|142.50|D;G-18|98367.75|142.50|V;G-19|98367.75|142.50|V;G-20|78553.13|142.50|V;G-21|114762.38|142.50|D;G-22|120500.00|142.50|D;
H-01|114762.38|142.50|D;H-02|98367.75|142.50|V;H-03|98367.75|142.50|V;H-04|114762.38|142.50|D;H-05|114762.38|142.50|D;H-06|98367.75|142.50|V;H-07|114762.38|142.50|D;H-08|95000.00|142.50|V;H-09|74812.50|142.50|V;H-10|74812.50|142.50|V;H-11|50737.05|142.50|V;H-12|50737.50|142.50|V;H-13|74812.50|142.50|V;H-14|109024.26|142.50|V;H-15|74812.50|142.50|V;H-16|74812.50|142.50|V;H-17|87085.00|142.50|V;H-18|74812.50|142.50|V;H-19|74812.50|142.50|V;H-20|98367.75|142.50|V;H-21|98367.75|142.50|V;H-22|114762.38|142.50|D;
I-01|78553.13|142.50|V;I-02|98367.75|142.50|V;I-03|98367.75|142.50|V;I-04|114762.38|142.50|D;I-05|90000.00|142.50|V;I-06|82480.78|142.50|V;I-07|114762.38|142.50|D;I-08|114762.38|142.50|D;I-09|98367.75|142.50|V;I-10|82480.78|142.50|V;
J-01|120500.00|142.50|D;J-02|109297.50|142.50|D;J-03|109297.50|142.50|D;J-04|109297.50|142.50|D;J-05|86604.82|142.50|V;J-06|86604.82|142.50|V;J-07|114762.38|142.50|D;J-08|114762.38|142.50|D;J-09|114762.38|142.50|D;J-10|103286.14|142.50|V;
K-01|0|142.50|D;K-02|0|142.50|D;K-03|0|142.50|D;K-04|0|203|D;K-05|0|203|D;K-06|0|203|D;K-07|0|203|D;K-08|0|203|D;K-09|0|203|D;K-10|0|203|D;K-11|0|142.50|D;K-12|0|142.50|D;
L-01|82480.78|142.50|V;L-02|74812.50|142.50|V;L-03|78553.13|142.50|V;L-04|98367.75|142.50|V;L-05|103286.14|142.50|V;L-06|103286.14|142.50|V;L-07|117000.00|225|V;L-08|0|0|P;L-09|0|0|P;
`;

/* Contratos reales (últimos 10, del Tablero Estadístico) */
const CONTRATOS_RAW = [
  { no: "SD-131", lote: "H-17", cliente: "Keyla Lorena Cujcuj Yos",       fecha: "2026-07-20", precio: 87085.00,  recaudado: 2500.00 },
  { no: "SD-130", lote: "I-05", cliente: "Angela Elizabeth Roblero López", fecha: "2026-07-19", precio: 90000.00,  recaudado: 2500.00 },
  { no: "SD-129", lote: "C-21", cliente: "Edin Ronaldo Ríos",             fecha: "2026-07-15", precio: 60000.00,  recaudado: 2500.00 },
  { no: "SD-128", lote: "L-07", cliente: "Jorge Mario Molina Vásquez",     fecha: "2026-07-08", precio: 117000.00, recaudado: 0.00 },
  { no: "SD-127", lote: "G-07", cliente: "Rina Aracely Rivas Lopez",       fecha: "2026-07-07", precio: 86071.79,  recaudado: 2500.00 },
  { no: "SD-126", lote: "H-08", cliente: "Ana Patricia Morales Guitzol",   fecha: "2026-07-06", precio: 95000.00,  recaudado: 2500.00 },
  { no: "SD-123", lote: "C-14", cliente: "Elvis David Xicay Perez",        fecha: "2026-06-28", precio: 62127.00,  recaudado: 45000.00 },
  { no: "SD-122", lote: "C-15", cliente: "Ronal Alexander Ixen García",    fecha: "2026-06-01", precio: 62127.00,  recaudado: 5878.86 },
  { no: "SD-121", lote: "H-14", cliente: "Ana Gabriela Hernandez Cúmes",   fecha: "2026-06-15", precio: 109024.26, recaudado: 54512.13 },
  { no: "SD-120", lote: "L-06", cliente: "Kimberly Griselda Ranc García",  fecha: "2026-05-31", precio: 103286.14, recaudado: 2500.00 },
];

/* KPIs reales del Tablero (para conciliar) */
const KPIS_REALES = {
  contratosActivos: 112, lotesVendidos: 112, lotesTotal: 265,
  portafolioVendido: 7940000, carteraTotal: 11966701,
  recaudado: 2284608, porCobrar: 9682093, ticketPromedio: 70900,
};
