/* ===================================================== núcleo: estado y datos */
const COLS = ["events", "expenses", "quotes", "sales", "savings", "goals", "shareholders", "distributions", "config"];
const S = {}; COLS.forEach((c) => (S[c] = {}));
const loaded = new Set();
let db = null, assets = null, downloads = null, userCap = null;
let mode = "loading";            // loading | db | memory
let canWrite = true, storeError = null;
const DEFAULT_CATS = ["Personal", "Transporte", "Alimentación", "Alquileres", "Producción", "Marketing",
  "Materiales", "Servicios profesionales", "Equipos", "Otros"];
const DEFAULT_METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Cheque", "Yappy / billetera"];

const ui = {
  view: "dashboard", eventId: null, eventTab: "resumen", quoteId: null, quoteDraft: null, quoteVer: null,
  filter: { mode: "mes", month: monthOf(todayISO()), year: todayISO().slice(0, 4), from: "", to: "", eventId: "" },
  expQ: "", expEvent: "", expStatus: "", cmpA: prevMonth(monthOf(todayISO())), cmpB: monthOf(todayISO()),
  cmpEvA: "", cmpEvB: "", repMonth: monthOf(todayISO()), repEvent: "", distFrom: "", distTo: "",
};

function todayISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
function monthOf(iso) { return (iso || "").slice(0, 7); }
function prevMonth(ym) { let [y, m] = ym.split("-").map(Number); m -= 1; if (!m) { m = 12; y -= 1; } return `${y}-${String(m).padStart(2, "0")}`; }
function monthEnd(ym) { const [y, m] = ym.split("-").map(Number); return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`; }
function addDays(iso, n) { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ymLabel = (ym, long) => { const [y, m] = ym.split("-"); return `${(long ? MONTHS_L : MONTHS)[Number(m) - 1]} ${y}`; };
const fmtDate = (iso) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const M = F.fmtMoney;
const clone = (o) => JSON.parse(JSON.stringify(o));
const all = (c) => Object.values(S[c]);
const get = (c, id) => (S[c][id] ? clone(S[c][id]) : null);
const cfg = () => {
  const c = S.config.company ? clone(S.config.company) : {};
  return { tradeName: "", legalName: "", taxId: "", email: "", phone: "", address: "", logo: "",
    currency: "USD", warnBp: 8500, overBp: 10000, savingsRuleBp: 1000, validityDays: 15,
    terms: "50 % de anticipo para confirmar la fecha; saldo 3 días antes del evento.",
    taxes: [{ name: "ITBMS", bp: 700 }], categories: DEFAULT_CATS.slice(), methods: DEFAULT_METHODS.slice(), ...c };
};
function addLog(obj, msg) { obj.log = [...(obj.log || []).slice(-59), { at: new Date().toISOString(), msg }]; return obj; }

let renderQueued = false, renderDeferred = false;
function scheduleRender() {
  if (renderQueued) return; renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false;
    const a = document.activeElement;
    if (a && a.closest && a.closest("#main, #modal") && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { renderDeferred = true; return; }
    render(); });
}
document.addEventListener("focusout", () => { if (renderDeferred) { renderDeferred = false; setTimeout(scheduleRender, 0); } });

function errText(e) {
  const c = e && e.code;
  if (c === "invalid_argument") return "No tienes permiso para modificar estos datos o el registro no es válido.";
  if (c === "quota_exceeded") return "Se alcanzó el límite de almacenamiento del prototipo. Elimina registros de demostración.";
  if (c === "resource_exhausted") return "Demasiadas operaciones seguidas. Espera unos segundos e inténtalo de nuevo.";
  if (c === "unavailable") return "El almacenamiento no respondió. Inténtalo de nuevo.";
  return (e && e.message) || "No se pudo guardar.";
}
async function save(col, obj) {
  const { id, ...body } = obj; const clean = clone(body);
  if (!canWrite) { toast("Tu acceso es de solo lectura."); throw new Error("read-only"); }
  if (mode === "db") {
    try { await db.collection(col).doc(id).set(clean); }
    catch (e) {
      if (e && e.code === "unavailable") { await new Promise((r) => setTimeout(r, 400 + Math.random() * 500));
        await db.collection(col).doc(id).set(clean); }
      else { toast(errText(e)); if (e && e.code === "invalid_argument") canWrite = false; throw e; }
    }
  }
  S[col][id] = { id, ...clean }; scheduleRender();
}
async function remove(col, id) {
  if (mode === "db") { try { await db.collection(col).doc(id).delete(); } catch (e) { toast(errText(e)); throw e; } }
  delete S[col][id]; scheduleRender();
}

async function initStore() {
  try { [db, downloads, assets, userCap] = await Promise.all(["db", "downloads", "assets", "user"].map((n) =>
    window.claude && window.claude.use ? window.claude.use(n).catch(() => null) : Promise.resolve(null))); }
  catch { db = null; }
  if (userCap) { try { const w = await userCap.can("data.write"); if (w === false) canWrite = false; } catch {} }
  if (!db) { mode = "memory"; render(); return; }
  mode = "db";
  COLS.forEach((c) => db.collection(c).onSnapshot((snap) => {
    const o = {}; snap.docs.forEach((d) => (o[d.id] = { id: d.id, ...d.data() }));
    S[c] = o; loaded.add(c); scheduleRender();
  }, (e) => { storeError = e; scheduleRender(); }));
}
const ready = () => mode === "memory" || COLS.every((c) => loaded.has(c));
const hasDemo = () => COLS.some((c) => all(c).some((d) => d.demo));

/* ===================================================== agregados financieros */
const inR = (iso, R) => !!iso && iso >= R.from && iso <= R.to;
const liveExp = () => all("expenses").filter((e) => !e.voided);
const liveSales = () => all("sales").filter((s) => !s.voided);
const expPaid = (e) => F.sum((e.payments || []).filter((p) => !p.voided), (p) => p.amountC);
const expStatus = (e) => F.expenseStatus({ amountC: e.amountC, paidC: expPaid(e) });
const evBudget = (ev) => F.sum(ev.budget || [], (b) => b.revisedC);
const evBudgetInitial = (ev) => F.sum(ev.budget || [], (b) => b.initialC);
// gasto reconocido del evento = gastos directos + porciones asignadas de gastos generales
function evExpenses(eid, R) {
  let t = 0;
  liveExp().forEach((e) => {
    if (R && !inR(e.date, R)) return;
    if (e.eventId === eid) t += e.amountC;
    else if (!e.eventId && e.allocations && e.allocations[eid]) t += e.allocations[eid];
  });
  return t;
}
function evExpByCat(eid) {
  const m = {};
  liveExp().forEach((e) => {
    const a = e.eventId === eid ? e.amountC : (!e.eventId && e.allocations && e.allocations[eid]) || 0;
    if (a) m[e.category] = (m[e.category] || 0) + a;
  });
  return m;
}
const evSales = (eid) => liveSales().filter((s) => s.eventId === eid);
const evRevenue = (eid) => F.sum(evSales(eid), (s) => s.netC);
const evInvoiced = (eid) => F.sum(evSales(eid), F.saleInvoiced);
const evCollected = (eid) => F.sum(evSales(eid), F.saleCollected);
const evQuotes = (eid) => all("quotes").filter((q) => q.eventId === eid);
const curVer = (q) => q.versions[q.versions.length - 1];
const acceptedVer = (q) => q.versions.find((v) => v.status === "aceptada");
function evQuoteEstimate(eid) {
  // la referencia es la versión aceptada; si no existe, la última emitida
  let best = null;
  evQuotes(eid).forEach((q) => {
    const v = acceptedVer(q) || [...q.versions].reverse().find((x) => x.status !== "borrador" && x.status !== "cancelada");
    if (v) { const s = F.computeQuote(v); if (!best || v.status === "aceptada") best = { q, v, s }; }
  });
  return best;
}
function evFacts(ev) {
  const revenue = evRevenue(ev.id), expenses = evExpenses(ev.id);
  return { ev, revenue, expenses, profit: revenue - expenses, marginBp: F.ratioBp(revenue - expenses, revenue),
    budget: evBudget(ev), invoiced: evInvoiced(ev.id), collected: evCollected(ev.id), est: evQuoteEstimate(ev.id),
    savings: F.sum(all("savings").filter((m) => m.eventId === ev.id), (m) => (m.kind === "aporte" ? m.amountC : -m.amountC)) };
}
function savingsBalance(goalId, uptoISO) {
  return F.sum(all("savings").filter((m) => (!goalId || m.goalId === goalId) && (!uptoISO || m.date <= uptoISO)),
    (m) => (m.kind === "aporte" ? m.amountC : -m.amountC));
}
// Caja estimada: cobros − pagos de gastos − pagos a accionistas − ahorro reservado.
function cashAvailable(excludeSavings) {
  const inC = F.sum(liveSales(), F.saleCollected);
  const outExp = F.sum(liveExp(), expPaid);
  const outSh = F.sum(all("distributions").filter((d) => d.status === "aprobada"),
    (d) => F.sum(d.lines, (l) => F.sum(l.payments || [], (p) => p.amountC)));
  return inC - outExp - outSh - (excludeSavings ? 0 : savingsBalance());
}
function periodFacts(R, eid) {
  const sales = liveSales().filter((s) => (!eid || s.eventId === eid));
  const exps = liveExp();
  const revenue = F.sum(sales.filter((s) => inR(s.date, R)), (s) => s.netC);
  const expenses = eid ? evExpenses(eid, R) : F.sum(exps.filter((e) => inR(e.date, R)), (e) => e.amountC);
  const collected = F.sum(sales, (s) => F.sum((s.receipts || []).filter((r) => !r.voided && inR(r.date, R)), (r) => r.amountC));
  const invoiced = F.sum(sales, (s) => F.sum((s.invoices || []).filter((i) => !i.voided && inR(i.date, R)), (i) => i.amountC));
  const receivable = F.sum(sales.filter((s) => s.date <= R.to), (s) => F.saleGross(s) - F.saleCollected(s));
  const evs = all("events").filter((e) => eid ? e.id === eid : inR(e.start, R));
  const budget = F.sum(evs, evBudget);
  const evExp = F.sum(evs, (e) => evExpenses(e.id));
  const payables = F.sum(exps.filter((e) => e.date <= R.to && (!eid || e.eventId === eid)), (e) => e.amountC - expPaid(e));
  const shOwed = eid ? 0 : F.sum(all("distributions").filter((d) => d.status === "aprobada"),
    (d) => F.sum(d.lines, (l) => l.amountC - F.sum(l.payments || [], (p) => p.amountC)));
  let quoted = 0, qAccepted = 0, qAcceptedC = 0, qPending = 0, qPendingC = 0, qIssued = 0, estProfit = 0;
  all("quotes").filter((q) => !eid || q.eventId === eid).forEach((q) => {
    const v = acceptedVer(q) || curVer(q);
    if (!v || v.status === "borrador" || v.status === "cancelada" || !inR(v.issuedOn, R)) return;
    const s = F.computeQuote(v); qIssued++; quoted += s.netC;
    if (v.status === "aceptada") { qAccepted++; qAcceptedC += s.netC; estProfit += s.profitC; }
    if (v.status === "emitida" || v.status === "enviada") { qPending++; qPendingC += s.netC; }
  });
  const savedIn = F.sum(all("savings").filter((m) => inR(m.date, R) && (!eid || m.eventId === eid)),
    (m) => (m.kind === "aporte" ? m.amountC : -m.amountC));
  const profit = revenue - expenses;
  const dist = F.distributable(profit, Math.max(savedIn, 0));
  return { revenue, expenses, profit, marginBp: F.ratioBp(profit, revenue), collected, invoiced, receivable,
    budget, evExp, budgetBalance: budget - evExp, payables, shOwed, quoted, qIssued, qAccepted, qAcceptedC, qPending, qPendingC,
    estProfit, savedIn, savingsTotal: savingsBalance(null, R.to), available: dist.availableC,
    events: evs.length, active: evs.filter((e) => e.status === "planificado" || e.status === "en_ejecucion").length,
    finished: evs.filter((e) => e.status === "finalizado").length, cancelled: evs.filter((e) => e.status === "cancelado").length,
    evNames: new Set(evs.filter((e) => e.status !== "cancelado").map((e) => e.name.trim().toLowerCase())) };
}
function rangeFromFilter(f) {
  if (f.mode === "mes") return { from: f.month + "-01", to: monthEnd(f.month), label: ymLabel(f.month, true) };
  if (f.mode === "anio") return { from: f.year + "-01-01", to: f.year + "-12-31", label: "año " + f.year };
  if (f.mode === "rango" && f.from && f.to) return { from: f.from, to: f.to, label: `${fmtDate(f.from)} – ${fmtDate(f.to)}` };
  return { from: "0000-01-01", to: "9999-12-31", label: "todo el historial" };
}
const monthR = (ym) => ({ from: ym + "-01", to: monthEnd(ym) });
function nextCode(prefix, col, field) {
  const y = todayISO().slice(0, 4);
  const used = new Set(all(col).map((x) => x[field]));
  let n = all(col).filter((x) => (x[field] || "").startsWith(`${prefix}-${y}-`)).length + 1, code;
  do { code = `${prefix}-${y}-${String(n).padStart(prefix === "COT" ? 4 : 3, "0")}`; n++; } while (used.has(code));
  return code;
}
