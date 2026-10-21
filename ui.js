/* ===================================================== interfaz común */
const ICONS = {
  dashboard: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  events: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>',
  quotes: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  budgets: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  expenses: '<path d="M3 7h18v12H3z"/><path d="M16 13h2M3 10h18"/>',
  income: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  savings: '<path d="M19 9c0-3-3-5-7-5S5 6 5 9c-1.5.5-2 2-2 3h2c.5 2 2 3.5 4 4v3h2v-2h2v2h2v-3c1.5-.8 2.7-2 3-4h1V9z"/>',
  shareholders: '<circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4a3.5 3.5 0 0 1 0 7M22 21c0-3-1.5-5-4-5.7"/>',
  compare: '<path d="M7 4v16M17 4v16M3 8h8M13 16h8"/>',
  reports: '<path d="M6 2h9l5 5v15H6z"/><path d="M9 13h6M9 17h6M9 9h2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
const LOGO = (s = 30) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#103C32" stroke="#2C5A4E"/><polyline points="14,44 28,32 36,38 50,20" fill="none" stroke="#91C83E" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14" cy="44" r="5" fill="#F7F9F7"/><circle cx="50" cy="20" r="5" fill="#91C83E"/></svg>`;
const NAV = [["dashboard", "Dashboard"], ["events", "Eventos"], ["quotes", "Cotizaciones"], ["budgets", "Presupuestos"],
  ["expenses", "Gastos"], ["income", "Ingresos y cobros"], ["savings", "Ahorro"], ["shareholders", "Accionistas"],
  ["compare", "Comparativos"], ["reports", "Reportes"], ["settings", "Configuración"]];
const MOB = [["dashboard", "Inicio"], ["events", "Eventos"], ["quotes", "Cotizar"], ["expenses", "Gastos"], ["more", "Más"]];

function go(view, extra = {}) {
  Object.assign(ui, { view }, extra); closeModal(); render(); window.scrollTo(0, 0);
  if (view !== "quoteEdit") { ui.quoteDraft = null; }
}

let toastT;
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200);
}
function openModal(html, wide) {
  const m = document.getElementById("modal");
  m.innerHTML = `<div class="modal-back" data-act="modal-back"><div class="modal${wide ? " wide" : ""}" role="dialog" aria-modal="true">${html}</div></div>`;
  m.hidden = false; const f = m.querySelector("input,select,textarea,button.pri"); if (f) setTimeout(() => f.focus(), 30);
}
function closeModal() { const m = document.getElementById("modal"); if (m) { m.innerHTML = ""; m.hidden = true; } }
let confirmCb = null;
function confirmBox(title, body, okLabel, cb, danger) {
  confirmCb = cb;
  openModal(`<h2>${esc(title)}</h2><div>${body}</div><div class="row" style="justify-content:flex-end">
    <button class="btn" data-act="close">Volver</button>
    <button class="btn ${danger ? "danger" : "pri"}" data-act="confirm-ok">${esc(okLabel)}</button></div>`);
}
const field = (id, label, input, hint, full) => `<div class="fld${full ? " full" : ""}"><label for="${id}">${label}</label>${input}${hint ? `<small>${hint}</small>` : ""}</div>`;
const inp = (id, val = "", attrs = "") => `<input id="${id}" name="${id}" value="${esc(val)}" ${attrs}>`;
const moneyInp = (id, cents, attrs = "") => `<input id="${id}" name="${id}" inputmode="decimal" placeholder="0.00" value="${cents === null || cents === undefined ? "" : F.centsToInput(cents)}" ${attrs}>`;
const sel = (id, opts, val, attrs = "") => `<select id="${id}" name="${id}" ${attrs}>${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(val ?? "") ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const pill = (cls, txt) => `<span class="pill ${cls}">${esc(txt)}</span>`;
const STATUS_EV = { planificado: ["", "Planificado"], en_ejecucion: ["warn", "En ejecución"], finalizado: ["good", "Finalizado"], cancelado: ["bad", "Cancelado"] };
const STATUS_Q = { borrador: "", emitida: "warn", enviada: "warn", aceptada: "good", rechazada: "bad", vencida: "bad", cancelada: "bad" };
const STATUS_EXP = { pendiente: ["bad", "Pendiente"], parcial: ["warn", "Parcialmente pagado"], pagado: ["good", "Pagado"] };
const STATUS_SALE = { pendiente: ["bad", "Pendiente"], parcial: ["warn", "Cobro parcial"], cobrado: ["good", "Cobrado"] };
const LIGHT = { verde: "Dentro", amarillo: "Cerca del límite", rojo: "Excedido", sin: "Sin presupuesto" };
const evStatusPill = (s) => pill(STATUS_EV[s][0], STATUS_EV[s][1]);
const qPill = (s) => pill(STATUS_Q[s], s[0].toUpperCase() + s.slice(1));
const money = (c, cls) => `<span class="num ${cls || (c < 0 ? "neg" : "")}">${M(c)}</span>`;
const pct = (bp, empty) => `<span class="num">${F.fmtPct(bp, empty)}</span>`;
const kpi = (label, value, sub, cls = "") => `<div class="kpi ${cls}"><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}</div>`;
const evOpts = (blank = "Todos los eventos") => [["", blank], ...all("events").sort((a, b) => b.start.localeCompare(a.start)).map((e) => [e.id, `${e.code} · ${e.name}`])];
const evName = (id) => (S.events[id] ? S.events[id].name : "Gasto general");
function readForm(root) {
  const o = {}; root.querySelectorAll("input,select,textarea").forEach((el) => {
    if (!el.name) return; o[el.name] = el.type === "checkbox" ? el.checked : el.value.trim(); });
  return o;
}
function formErr(root, msg) { let e = root.querySelector(".form-err"); if (e) { e.textContent = msg; e.hidden = !msg; } if (msg) toast(msg); }

/* ===================================================== gráficos (SVG) */
let tipEl;
document.addEventListener("pointermove", (ev) => {
  const t = ev.target.closest && ev.target.closest("[data-tip]");
  if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip"; tipEl.hidden = true; document.body.appendChild(tipEl); }
  if (!t) { tipEl.hidden = true; return; }
  tipEl.innerHTML = t.getAttribute("data-tip"); tipEl.hidden = false;
  const x = Math.min(ev.clientX + 12, window.innerWidth - tipEl.offsetWidth - 8);
  tipEl.style.left = x + "px"; tipEl.style.top = ev.clientY - tipEl.offsetHeight - 12 + "px";
});
function niceMax(v) { if (v <= 0) return 100; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
const short = (c) => { const v = Math.abs(c) / 100; const s = v >= 1e6 ? (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? (v / 1e3).toFixed(Math.round(v) % 1000 === 0 ? 0 : 1) + "k" : v.toFixed(0); return (c < 0 ? "-$" : "$") + s; };
function legend(series) { return series.length < 2 ? "" : `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`; }
// barras verticales agrupadas; admite negativos (eje en cero)
function barChart(labels, series, opts = {}) {
  const W = 420, H = opts.h || 230, pl = 50, pr = 8, pt = 10, pb = 26;
  const vals = series.flatMap((s) => s.values); const mx = niceMax(Math.max(0, ...vals)); const mnRaw = Math.min(0, ...vals);
  const mn = mnRaw < 0 ? -niceMax(-mnRaw) : 0; const span = mx - mn || 1;
  const y = (v) => pt + (H - pt - pb) * (mx - v) / span; const gw = (W - pl - pr) / labels.length;
  const bw = Math.max(4, Math.min(26, (gw - 10) / series.length - 2));
  let g = '<g class="grid">'; for (let i = 0; i <= 4; i++) { const v = mn + span * i / 4; g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${short(Math.round(v))}</text>`; } g += "</g>";
  let b = ""; labels.forEach((lb, i) => {
    const x0 = pl + gw * i + (gw - (bw + 2) * series.length + 2) / 2;
    series.forEach((s, j) => { const v = s.values[i]; const yy = Math.min(y(v), y(0)); const hh = Math.max(Math.abs(y(v) - y(0)), v ? 1.5 : 0);
      const col = opts.negColor && v < 0 ? opts.negColor : s.color; const x = x0 + j * (bw + 2);
      b += `<path d="${roundedBar(x, yy, bw, hh, v >= 0)}" fill="${col}"/><rect x="${x - 2}" y="${pt}" width="${bw + 4}" height="${H - pt - pb}" fill="transparent" data-tip="<b>${esc(lb)}</b><br>${esc(s.name)}: ${M(v)}"/>`; });
    b += `<text x="${pl + gw * i + gw / 2}" y="${H - 8}" text-anchor="middle">${esc(lb)}</text>`; });
  return `${legend(series)}<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "Gráfico")}">${g}<line class="axis" x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}"/>${b}</svg>`;
}
function roundedBar(x, y, w, h, up) { const r = Math.min(4, h, w / 2); if (h <= 0) return "";
  return up ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
    : `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`; }
function lineChart(labels, values, color, label) {
  const W = 420, H = 210, pl = 50, pr = 28, pt = 12, pb = 26; const mx = niceMax(Math.max(0, ...values));
  const x = (i) => pl + (W - pl - pr) * (labels.length === 1 ? 0.5 : i / (labels.length - 1)); const y = (v) => pt + (H - pt - pb) * (1 - v / mx);
  let g = '<g class="grid">'; for (let i = 0; i <= 4; i++) { const v = mx * i / 4; g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`; } g += "</g>";
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const area = `M${x(0)},${y(0)} L${pts.replace(/ /g, " L")} L${x(values.length - 1)},${y(0)}Z`;
  const dots = values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${i === values.length - 1 ? 4.5 : 3}" fill="${color}" stroke="var(--surface)" stroke-width="2"/><rect x="${x(i) - 16}" y="${pt}" width="32" height="${H - pt - pb}" fill="transparent" data-tip="<b>${esc(labels[i])}</b><br>${esc(label)}: ${M(v)}"/><text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(labels[i])}</text>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}<path d="${area}" fill="${color}" opacity=".12"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>${dots}</svg>`;
}
// barras horizontales con etiqueta directa (HTML)
function hbars(rows, opts = {}) {
  if (!rows.length) return `<p class="muted small">${opts.empty || "Sin datos en el período."}</p>`;
  const mx = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return `<div style="display:flex;flex-direction:column;gap:9px">${rows.map((r) => `<div data-tip="<b>${esc(r.label)}</b><br>${esc(r.tip || r.text)}">
    <div class="spread small"><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.label)}</span><b class="num ${r.value < 0 ? "neg" : ""}">${esc(r.text)}</b></div>
    <div class="progress"><i style="width:${Math.max(1, Math.abs(r.value) / mx * 100)}%;background:${r.value < 0 ? "var(--bad)" : r.color || "var(--s1)"}"></i></div></div>`).join("")}</div>`;
}
function csv(rows) { return rows.map((r) => r.map((c) => { const s = String(c ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n"); }
async function offerDownload(filename, data) {
  if (!downloads) { toast("La descarga no está disponible en esta vista."); return false; }
  try { await downloads.save({ filename, data }); toast("Archivo entregado para guardar."); return true; }
  catch (e) { if (e && e.code === "declined") toast("Descarga cancelada."); else if (e && e.code === "rate_limited") toast("Ya hay una descarga pendiente de confirmar.");
    else toast("No se pudo ofrecer la descarga."); return false; }
}
const centsCsv = (c) => F.centsToInput(c);
