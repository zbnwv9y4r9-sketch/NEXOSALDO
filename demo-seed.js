// Genera datos de demostración (marcados demo:true) coherentes con la capa financiera.
const fs = require("fs"); const path = require("path"); const F = require("../src/finance.js");
const OUT = process.argv[2]; const docs = [];
const put = (col, id, data) => docs.push({ col, id, data: { ...data, demo: true } });
const L = (desc, qty, cost, method, rate, manual, unit = "") => ({ id: desc.slice(0, 8) + Math.random().toString(36).slice(2, 6), desc, qtyM: qty * 1000, unit, costC: cost * 100, method, rateBp: rate === null ? null : rate * 100, manualC: manual === null ? null : manual * 100, taxable: true });
const at = (d) => d + "T15:00:00.000Z";
put("config", "company", { tradeName: "Eventos Brisa (demo)", legalName: "Eventos Brisa S.A. (demo)", taxId: "000-DEMO-00", email: "hola@eventosbrisa.demo", phone: "+507 6000-0000", address: "Ciudad de Panamá",
  currency: "USD", warnBp: 8500, overBp: 10000, savingsRuleBp: 1000, validityDays: 15, terms: "50 % de anticipo para confirmar la fecha; saldo 3 días antes del evento.",
  taxes: [{ name: "ITBMS", bp: 700 }], categories: ["Personal", "Transporte", "Alimentación", "Alquileres", "Producción", "Marketing", "Materiales", "Servicios profesionales", "Equipos", "Otros"],
  methods: ["Efectivo", "Transferencia", "Tarjeta", "Cheque", "Yappy / billetera"], logo: "" });
const EV = [
  { id: "demo-ev1", code: "EV-2026-001", name: "Boda Martínez", kind: "Boda", client: "Lucía Martínez", start: "2026-09-12", status: "finalizado",
    budget: [["Personal", 1800], ["Alimentación", 3200], ["Alquileres", 1200], ["Producción", 900]],
    lines: [L("Banquete para 120 invitados", 120, 25, "margen", 35, null, "persona"), L("Montaje y decoración", 1, 1100, "recargo", 40, null), L("Personal de servicio", 8, 120, "global", null, null, "persona"), L("Coordinación del día", 1, 300, "manual", null, 750)],
    exp: [["Personal", "Meseros y bartenders", 1850, "2026-09-12"], ["Alimentación", "Catering banquete", 3150, "2026-09-10"], ["Alquileres", "Mobiliario y mantelería", 1180, "2026-09-11"], ["Producción", "Flores y centros de mesa", 1050, "2026-09-11"]], collect: "all" },
  { id: "demo-ev2", code: "EV-2026-002", name: "Expo Café Panamá", kind: "Feria", client: "Asociación de Caficultores", start: "2026-09-25", status: "finalizado",
    budget: [["Alquileres", 2500], ["Producción", 1800], ["Marketing", 900], ["Transporte", 400]],
    lines: [L("Stand modular 6x3 m", 4, 520, "recargo", 45, null, "stand"), L("Producción gráfica", 1, 1400, "margen", 30, null), L("Campaña en redes", 1, 700, "recargo", 50, null), L("Logística y transporte", 1, 380, "recargo", 25, null)],
    exp: [["Alquileres", "Stands modulares", 2080, "2026-09-20"], ["Producción", "Impresión gráfica", 1520, "2026-09-22"], ["Marketing", "Pauta en redes", 760, "2026-09-18"], ["Transporte", "Camión y montaje", 450, "2026-09-24"]], collect: "all" },
  { id: "demo-ev3", code: "EV-2026-003", name: "Boda Rodríguez", kind: "Boda", client: "Andrés Rodríguez", start: "2026-10-03", status: "finalizado",
    budget: [["Personal", 2000], ["Alimentación", 3800], ["Alquileres", 1400], ["Producción", 1000]],
    lines: [L("Banquete para 140 invitados", 140, 25, "margen", 30, null, "persona"), L("Montaje y decoración", 1, 1300, "recargo", 35, null), L("Personal de servicio", 9, 120, "global", null, null, "persona"), L("Coordinación del día", 1, 300, "manual", null, 750)],
    exp: [["Personal", "Meseros y bartenders", 2150, "2026-10-03"], ["Alimentación", "Catering banquete", 4120, "2026-10-01"], ["Alquileres", "Mobiliario", 1390, "2026-10-02"], ["Producción", "Flores y decoración", 1240, "2026-10-02"]], collect: "half" },
  { id: "demo-ev4", code: "EV-2026-004", name: "Gala Fundación Mar", kind: "Corporativo", client: "Fundación Mar Azul", start: "2026-10-10", status: "finalizado",
    budget: [["Alquileres", 3000], ["Alimentación", 4200], ["Producción", 2500], ["Servicios profesionales", 1200]],
    lines: [L("Salón y mobiliario", 1, 2900, "recargo", 30, null), L("Cena de gala 200 personas", 200, 20, "margen", 28, null, "persona"), L("Producción audiovisual", 1, 2300, "recargo", 40, null), L("Maestro de ceremonias", 1, 900, "recargo", 35, null)],
    exp: [["Alquileres", "Salón principal", 2950, "2026-10-10"], ["Alimentación", "Cena de gala", 4380, "2026-10-09"], ["Producción", "Pantallas y sonido", 2650, "2026-10-10"], ["Servicios profesionales", "Maestro de ceremonias", 900, "2026-10-10"]], collect: "full_no_inv" },
  { id: "demo-ev5", code: "EV-2026-005", name: "Lanzamiento TechPa", kind: "Corporativo", client: "TechPa Inc.", start: "2026-10-24", status: "en_ejecucion",
    budget: [["Producción", 2200], ["Marketing", 1500], ["Alimentación", 1300], ["Equipos", 800]],
    lines: [L("Producción del evento", 1, 2100, "recargo", 40, null), L("Activación de marca", 1, 1400, "margen", 35, null), L("Coffee break 80 personas", 80, 15, "recargo", 50, null, "persona"), L("Pantalla LED", 2, 400, "recargo", 40, null, "día")],
    exp: [["Producción", "Escenario y luces (anticipo)", 1200, "2026-10-15"], ["Marketing", "Material promocional", 640, "2026-10-16"]], collect: "advance" },
  { id: "demo-ev6", code: "EV-2026-006", name: "Expo Café Panamá", kind: "Feria", client: "Asociación de Caficultores", start: "2026-11-20", status: "planificado",
    budget: [["Alquileres", 2600], ["Producción", 1900]], lines: [L("Stand modular 6x3 m", 5, 540, "recargo", 45, null, "stand"), L("Producción gráfica", 1, 1500, "margen", 30, null)], exp: [], collect: "none", quoteStatus: "enviada" },
];
let qn = 1;
EV.forEach((e) => {
  put("events", e.id, { code: e.code, name: e.name, kind: e.kind, client: e.client, clientCompany: "", clientEmail: "", clientPhone: "+507 6123-4567", start: e.start, end: e.start, status: e.status,
    description: `${e.kind} de demostración`, notes: "", budget: e.budget.map(([cat, v]) => ({ cat, desc: "", initialC: v * 100, revisedC: v * 100, revisions: [] })), createdAt: at(e.start), log: [{ at: at(e.start), msg: "Evento creado (demo)" }] });
  const issued = new Date(new Date(e.start + "T12:00:00") - 20 * 864e5).toISOString().slice(0, 10);
  const ver = { v: 1, status: e.quoteStatus || "aceptada", issuedOn: issued, validUntil: new Date(new Date(issued + "T12:00:00").getTime() + 15 * 864e5).toISOString().slice(0, 10), lines: e.lines,
    globalMethod: "recargo", globalRateBp: 3000, manualSubtotalC: null, discountType: "ninguno", discountValue: 0, taxes: [{ name: "ITBMS", bp: 700 }],
    client: { name: e.client, company: "", email: "", phone: "+507 6123-4567" }, description: `${e.kind}: servicio integral`, terms: "50 % de anticipo; saldo 3 días antes.", advance: "50 %", execTerm: `Evento del ${e.start.split("-").reverse().join("/")}`, notes: "",
    shares: [{ at: at(issued), channel: "whatsapp", state: "enviado_confirmado" }], statusDates: {} };
  const s = F.computeQuote(ver); if (s.errors.length) throw new Error(e.name + s.errors);
  ver.frozen = { costTotalC: s.costTotalC, netC: s.netC, taxC: s.taxC, totalC: s.totalC, profitC: s.profitC };
  const qid = "demo-q" + qn; put("quotes", qid, { number: `COT-2026-${String(qn).padStart(4, "0")}`, eventId: e.id, createdAt: at(issued), versions: [ver], log: [{ at: at(issued), msg: "Cotización emitida (demo)" }] }); qn++;
  e.exp.forEach(([cat, desc, amt, date], i) => { const paid = e.collect === "advance" ? Math.round(amt * 50) : amt * 100;
    put("expenses", `${e.id}-x${i}`, { date, eventId: e.id, category: cat, desc, supplier: "Proveedor demo", qtyM: 1000, amountC: amt * 100, method: "Transferencia", ref: `F-${100 + i}`, due: "", notes: "", key: `${e.id}-x${i}`,
      payments: [{ id: `${e.id}-p${i}`, date, amountC: paid }], createdAt: at(date), log: [{ at: at(date), msg: "Gasto registrado (demo)" }] }); });
  if (ver.status === "aceptada") { const g = s.netC + s.taxC; const sd = new Date(new Date(e.start + "T12:00:00") - 10 * 864e5).toISOString().slice(0, 10);
    const rec = e.collect === "all" || e.collect === "full_no_inv" ? [{ id: e.id + "-r1", date: sd, amountC: Math.round(g / 2), method: "Transferencia" }, { id: e.id + "-r2", date: e.start, amountC: g - Math.round(g / 2), method: "Transferencia" }]
      : e.collect === "half" || e.collect === "advance" ? [{ id: e.id + "-r1", date: sd, amountC: Math.round(g / 2), method: "Transferencia" }] : [];
    put("sales", e.id + "-s", { key: `${qid}:v1`, quoteId: qid, quoteVersion: 1, eventId: e.id, date: e.start, desc: `Cotización COT-2026-${String(qn - 1).padStart(4, "0")} v1`, client: e.client, netC: s.netC, taxC: s.taxC, due: e.start, ref: "",
      invoices: e.collect === "full_no_inv" ? [] : [{ id: e.id + "-i", number: `FAC-${e.code.slice(-3)}`, date: sd, amountC: g }], receipts: rec, log: [{ at: at(sd), msg: "Venta desde cotización (demo)" }] }); }
});
// gasto general asignado a los eventos de octubre
put("expenses", "demo-gen1", { date: "2026-10-01", eventId: null, category: "Servicios profesionales", desc: "Contabilidad de octubre", supplier: "Contadores demo", qtyM: 1000, amountC: 60000, method: "Transferencia", ref: "C-10", due: "2026-10-31", notes: "",
  key: "demo-gen1", payments: [], allocations: F.allocate(60000, { "demo-ev3": 1, "demo-ev4": 1, "demo-ev5": 1 }), allocRule: "partes iguales", createdAt: at("2026-10-01"), log: [] });
put("goals", "demo-g1", { name: "Fondo de emergencia", purpose: "Tres meses de gastos fijos", targetC: 1000000 });
put("goals", "demo-g2", { name: "Compra de equipos", purpose: "Sonido y pantallas propias", targetC: 800000 });
put("savings", "demo-s1", { kind: "aporte", goalId: "demo-g1", amountC: 120000, date: "2026-09-30", eventId: null, note: "10 % de la utilidad de septiembre", confirmedAt: at("2026-09-30") });
put("savings", "demo-s2", { kind: "aporte", goalId: "demo-g2", amountC: 50000, date: "2026-10-12", eventId: "demo-ev4", note: "Reserva de la gala", confirmedAt: at("2026-10-12") });
[["demo-sh1", "ACC-01", "Carla Ríos (demo)", 5000], ["demo-sh2", "ACC-02", "Diego Vega (demo)", 3000], ["demo-sh3", "ACC-03", "Elena Soto (demo)", 2000]].forEach(([id, code, name, bp]) => put("shareholders", id, { code, name, bp, start: "2025-01-01", end: "", active: true }));
fs.mkdirSync(OUT, { recursive: true }); const writes = [];
docs.forEach((d) => { const f = path.join(OUT, `${d.col}__${d.id}.json`); fs.writeFileSync(f, JSON.stringify(d.data)); writes.push({ op: "set", collection: d.col, doc_id: d.id, file_path: f }); });
fs.writeFileSync(path.join(OUT, "writes.json"), JSON.stringify(writes)); console.log(writes.length, "docs");
