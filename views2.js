/* ===================================================== cotizaciones */
function quotesTable(list, evId) {
  list = list.sort((a, b) => (b.number || "").localeCompare(a.number || ""));
  const btn = `<button class="btn pri sm" data-act="new-quote" data-ev="${evId || ""}">Nueva cotización</button>`;
  if (!list.length) return `<div class="card empty"><b>Sin cotizaciones</b><p>Calcula cuánto cobrar con recargo, margen o precio manual; los costos internos nunca aparecen en el PDF del cliente.</p>${btn}</div>`;
  return `<div class="spread"><span class="muted small">${list.length} cotizaciones</span>${btn}</div><div class="tablewrap"><table><thead><tr><th>Número</th><th>Cliente / evento</th><th>Versión</th><th>Estado</th><th class="n">Total cliente</th><th class="n hide-m">Ganancia est.</th></tr></thead><tbody>
  ${list.map((q) => { const v = curVer(q); const s = F.computeQuote(v); const acc = acceptedVer(q);
    return `<tr class="click" data-act="open-quote" data-id="${q.id}"><td><b>${esc(q.number)}</b><br><span class="small muted">${fmtDate(v.issuedOn)}</span></td><td>${esc(v.client.name || "—")}<br><span class="small muted">${esc(q.eventId ? evName(q.eventId) : "Sin evento")}</span></td>
    <td>v${v.v}${acc && acc !== v ? `<br><span class="small muted">aceptada v${acc.v}</span>` : ""}</td><td>${qPill(v.status)}</td><td class="n">${M(s.totalC)}</td><td class="n hide-m">${M(s.profitC)}</td></tr>`; }).join("")}</tbody></table></div>`;
}
VIEWS.quotes = () => `<div class="topline"><div><h1>Cotizaciones</h1><p>Ofertas comerciales: una cotización aceptada no es dinero cobrado.</p></div></div>${quotesTable(all("quotes"))}`;
function blankVersion(ev, n) {
  const c = cfg(); const iss = todayISO();
  return { v: n, status: "borrador", issuedOn: iss, validUntil: addDays(iss, c.validityDays || 15), lines: [],
    globalMethod: "recargo", globalRateBp: 3000, manualSubtotalC: null, discountType: "ninguno", discountValue: 0, taxes: clone(c.taxes || []),
    client: { name: ev ? ev.client : "", company: ev ? ev.clientCompany : "", email: ev ? ev.clientEmail : "", phone: ev ? ev.clientPhone : "" },
    description: ev ? ev.description || "" : "", terms: c.terms, advance: "", execTerm: ev ? `Evento del ${fmtDate(ev.start)}` : "", notes: "", shares: [], statusDates: { borrador: new Date().toISOString() } };
}
ACT["new-quote"] = async (el) => {
  const ev = el.dataset.ev ? S.events[el.dataset.ev] : null;
  const q = { id: uid(), number: nextCode("COT", "quotes", "number"), eventId: ev ? ev.id : null, createdAt: new Date().toISOString(), versions: [blankVersion(ev, 1)] };
  q.versions[0].lines.push({ id: uid(), desc: "", qtyM: 1000, unit: "", costC: 0, method: "global", rateBp: null, manualC: null, taxable: true });
  addLog(q, "Cotización creada (borrador v1)"); await save("quotes", q); go("quoteEdit", { quoteId: q.id, quoteVer: null });
};
ACT["open-quote"] = (el) => go("quoteEdit", { quoteId: el.dataset.id, quoteVer: null });

VIEWS.quoteEdit = () => {
  const q = S.quotes[ui.quoteId]; if (!q) return `<div class="card empty"><b>Cotización no encontrada</b><button class="btn" data-act="nav" data-v="quotes">Volver</button></div>`;
  const vi = ui.quoteVer === null ? q.versions.length - 1 : ui.quoteVer; const stored = q.versions[vi];
  const isDraft = stored.status === "borrador" && vi === q.versions.length - 1;
  if (isDraft && (!ui.quoteDraft || ui.quoteDraft._qid !== q.id || ui.quoteDraft.v !== stored.v)) ui.quoteDraft = { ...clone(stored), _qid: q.id };
  const v = isDraft ? ui.quoteDraft : stored; const s = F.computeQuote(v);
  const sale = all("sales").find((x) => x.quoteId === q.id && !x.voided);
  const flow = vi === q.versions.length - 1 ? F.QUOTE_FLOW[v.status] : [];
  const actions = [];
  if (isDraft) actions.push(`<button class="btn" data-act="q-save">Guardar borrador</button><button class="btn pri" data-act="q-issue">Emitir cotización</button>`);
  else {
    if (flow.includes("aceptada")) actions.push(`<button class="btn pri" data-act="q-status" data-s="aceptada">Marcar aceptada</button>`);
    if (flow.includes("rechazada")) actions.push(`<button class="btn" data-act="q-status" data-s="rechazada">Rechazada</button>`);
    if (flow.includes("vencida")) actions.push(`<button class="btn" data-act="q-status" data-s="vencida">Vencida</button>`);
    if (flow.includes("cancelada")) actions.push(`<button class="btn danger" data-act="q-status" data-s="cancelada">Cancelar</button>`);
    if (v.status === "aceptada" && !sale) actions.push(`<button class="btn pri" data-act="q-to-sale" data-v="${vi}">Convertir en venta</button>`);
    if (vi === q.versions.length - 1 && !["cancelada"].includes(v.status)) actions.push(`<button class="btn" data-act="q-newver">Nueva versión</button>`);
  }
  actions.push(`<button class="btn" data-act="q-preview" data-v="${vi}">Vista previa y PDF</button>`);
  return `<div><button class="btn ghost sm" data-act="nav" data-v="quotes">← Cotizaciones</button></div>
  <div class="topline"><div><p>${q.eventId ? esc(evName(q.eventId)) : "Sin evento"} · versión ${v.v} de ${q.versions.length}</p><h1>${esc(q.number)}</h1></div><div class="bar">${qPill(v.status)}</div></div>
  ${sale ? `<div class="banner info">Convertida en venta (${M(sale.netC)} sin impuestos). Los cobros se registran en Ingresos y cobros.</div>` : ""}
  ${!isDraft && v.status !== "borrador" ? `<div class="banner info">Versión emitida: su contenido está congelado. Para cambiar precios o partidas crea una nueva versión.</div>` : ""}
  <div class="bar">${actions.join("")}</div>
  ${isDraft ? quoteEditor(q, v, s) : quoteReadOnly(q, v, s)}
  <div class="card"><h2>Versiones</h2><div class="tablewrap"><table><thead><tr><th>Versión</th><th>Estado</th><th>Emisión</th><th class="n">Total</th><th>Envíos</th><th></th></tr></thead><tbody>
  ${q.versions.map((x, i) => `<tr><td>v${x.v}</td><td>${qPill(x.status)}</td><td>${fmtDate(x.issuedOn)}</td><td class="n">${M(F.computeQuote(x).totalC)}</td>
    <td class="small">${(x.shares || []).map((sh) => `${esc(sh.channel)}: ${esc(sh.state.replace("_", " "))} (${fmtDate(sh.at.slice(0, 10))})`).join("<br>") || "—"}</td>
    <td><button class="btn sm" data-act="q-view" data-v="${i}">Ver</button></td></tr>`).join("")}</tbody></table></div></div>`;
};
function quoteEditor(q, v, s) {
  const c = cfg(); const evs = evOpts("Sin evento");
  const d = (k) => `data-q="${k}"`;
  return `<div class="grid g2"><div class="card"><h2>Cliente y condiciones</h2><div class="f" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
    ${field("q-ev", "Evento", sel("q-ev", evs, q.eventId || "", 'data-qev="1"'))}
    ${field("q-cn", "Nombre del cliente", inp("q-cn", v.client.name, d("client.name")))}
    ${field("q-cc", "Empresa del cliente", inp("q-cc", v.client.company, d("client.company")))}
    ${field("q-ce", "Correo", inp("q-ce", v.client.email, d("client.email") + ' type="email"'))}
    ${field("q-cp", "Teléfono con código de país", inp("q-cp", v.client.phone, d("client.phone") + ' type="tel" placeholder="+507 6000-0000"'))}
    ${field("q-iss", "Fecha de emisión", inp("q-iss", v.issuedOn, d("issuedOn") + ' type="date"'))}
    ${field("q-val", "Válida hasta", inp("q-val", v.validUntil, d("validUntil") + ' type="date"'))}
    ${field("q-desc", "Descripción de los servicios", `<textarea id="q-desc" ${d("description")}>${esc(v.description)}</textarea>`, "", true)}
    ${field("q-terms", "Condiciones de pago", `<textarea id="q-terms" ${d("terms")}>${esc(v.terms)}</textarea>`, "", true)}
    ${field("q-adv", "Anticipo solicitado", inp("q-adv", v.advance, d("advance") + ' placeholder="50 % ($1,000.00)"'))}
    ${field("q-exec", "Plazo de ejecución", inp("q-exec", v.execTerm, d("execTerm")))}
    ${field("q-notes", "Observaciones para el cliente", `<textarea id="q-notes" ${d("notes")}>${esc(v.notes)}</textarea>`, "", true)}</div></div>
  <div class="card"><h2>Cálculo del precio</h2><div class="f" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
    ${field("q-gm", "Método global", sel("q-gm", [["recargo", "Recargo sobre costo"], ["margen", "Margen sobre venta"]], v.globalMethod, d("globalMethod")), "Lo usan las partidas en «Global»")}
    ${field("q-gr", "Porcentaje global", inp("q-gr", F.bpToInput(v.globalRateBp), d("globalRateBp") + ' inputmode="decimal"'))}
    ${field("q-ms", "Precio global manual", moneyInp("q-ms", v.manualSubtotalC, d("manualSubtotalC")), "Opcional. Fija el subtotal sin tocar las partidas")}
    ${field("q-dt", "Descuento", sel("q-dt", [["ninguno", "Sin descuento"], ["porcentaje", "Porcentaje"], ["importe", "Importe fijo"]], v.discountType, d("discountType")))}
    ${field("q-dv", v.discountType === "importe" ? "Importe del descuento" : "Porcentaje de descuento", inp("q-dv", v.discountType === "importe" ? F.centsToInput(v.discountValue) : F.bpToInput(v.discountValue), d("discountValue") + ' inputmode="decimal"' + (v.discountType === "ninguno" ? " disabled" : "")))}
    <div class="fld full"><label>Impuestos aplicables</label><div class="row">${(c.taxes || []).map((t, i) => `<label class="row small" style="gap:6px"><input type="checkbox" style="width:auto;min-height:0" data-qtax="${i}" ${v.taxes.some((x) => x.name === t.name) ? "checked" : ""}>${esc(t.name)} ${F.bpToInput(t.bp)} %</label>`).join("") || '<span class="small muted">Configura impuestos en Configuración.</span>'}</div>
      <small>Los impuestos se cobran por cuenta de la autoridad fiscal y no cuentan como ingreso propio.</small></div></div>
    <div id="q-summary">${quoteSummary(s)}</div></div></div>
  <div class="card"><div class="spread"><h2>Partidas</h2><button class="btn sm" data-act="q-addline">Agregar partida</button></div>
    <div class="line-head"><span>Concepto</span><span>Cant.</span><span>Unidad</span><span>Costo unit.</span><span>Método</span><span>%</span><span>Precio manual</span><span style="text-align:right">Total venta</span><span></span></div>
    <div class="lines">${v.lines.map((l, i) => lineRow(l, i, s.lines[i], v.lines.length)).join("")}</div>
    ${!v.lines.length ? '<p class="muted small">Agrega al menos una partida.</p>' : ""}</div>
  <div class="private"><div class="spread"><span class="private-tag">Uso interno · nunca va al PDF del cliente</span></div><div id="q-private">${quotePrivate(s)}</div></div>`;
}
function lineRow(l, i, r, n) {
  const m = l.method; const dl = (k) => `data-l="${i}" data-k="${k}"`;
  return `<div class="line" data-row="${i}">
    <div class="d"><span class="lbl">Concepto</span><input value="${esc(l.desc)}" ${dl("desc")} placeholder="Alquiler de equipo de sonido" aria-label="Concepto"></div>
    <div><span class="lbl">Cantidad</span><input value="${F.milliToStr(l.qtyM)}" ${dl("qtyM")} inputmode="decimal" aria-label="Cantidad"></div>
    <div><span class="lbl">Unidad</span><input value="${esc(l.unit || "")}" ${dl("unit")} placeholder="día" aria-label="Unidad"></div>
    <div><span class="lbl">Costo unitario</span><input value="${F.centsToInput(l.costC)}" ${dl("costC")} inputmode="decimal" aria-label="Costo unitario interno"></div>
    <div><span class="lbl">Método</span><select ${dl("method")} aria-label="Método de precio">${[["global", "Global"], ["recargo", "Recargo"], ["margen", "Margen"], ["manual", "Manual"]].map(([k, t]) => `<option value="${k}"${k === m ? " selected" : ""}>${t}</option>`).join("")}</select></div>
    <div><span class="lbl">%</span><input value="${m === "recargo" || m === "margen" ? F.bpToInput(l.rateBp) : ""}" ${dl("rateBp")} inputmode="decimal" ${m === "recargo" || m === "margen" ? "" : "disabled"} aria-label="Porcentaje"></div>
    <div><span class="lbl">Precio manual</span><input value="${m === "manual" ? F.centsToInput(l.manualC) : ""}" ${dl("manualC")} inputmode="decimal" ${m === "manual" ? "" : "disabled"} aria-label="Precio unitario manual"></div>
    <div class="out" id="lo-${i}">${lineOut(r)}</div>
    <div class="row" style="gap:2px;flex-wrap:nowrap"><button class="btn ghost sm" data-act="q-delline" data-i="${i}" aria-label="Eliminar partida">✕</button></div>
    <div class="d row small" style="gap:6px">${i > 0 ? `<button class="btn ghost sm" data-act="q-move" data-i="${i}" data-d="-1">↑ Subir</button>` : ""}${i < n - 1 ? `<button class="btn ghost sm" data-act="q-move" data-i="${i}" data-d="1">↓ Bajar</button>` : ""}
      <label class="row small" style="gap:5px"><input type="checkbox" style="width:auto;min-height:0" ${l.taxable !== false ? "checked" : ""} ${dl("taxable")}>Gravada</label></div></div>`;
}
const lineOut = (r) => r.error ? `<span class="err small">${esc(r.error)}</span>` : `${M(r.saleTotalC)}<br><span class="${r.manual ? "tag-m" : "tag-a"}">${r.manual ? "Precio manual" : "Automático"} · ${M(r.unitPriceC)} c/u</span>`;
function quoteSummary(s) {
  return `<h3 style="margin-top:14px">Resumen para el cliente</h3><dl class="kv">
    ${s.adjustmentC ? `<dt>Suma de partidas</dt><dd>${M(s.linesSubtotalC)}</dd><dt>Ajuste de precio global</dt><dd>${M(s.adjustmentC)}</dd>` : ""}
    <dt>Subtotal</dt><dd>${M(s.subtotalC)}</dd><dt>Descuento</dt><dd>${s.discountC ? "−" + M(s.discountC) : M(0)}</dd>
    ${s.taxes.map((t) => `<dt>${esc(t.name)} (${F.bpToInput(t.bp)} %)</dt><dd>${M(t.amountC)}</dd>`).join("")}
    <dt class="tot">Total para el cliente</dt><dd class="tot">${M(s.totalC)}</dd></dl>
    ${s.errors.length ? `<div class="banner err" style="margin-top:8px">${s.errors.map(esc).join("<br>")}</div>` : ""}`;
}
function quotePrivate(s) {
  return `<div class="kpis" style="margin-top:8px">${kpi("Costo interno estimado", M(s.costTotalC))}${kpi("Venta sin impuestos", M(s.netC))}
    ${kpi("Ganancia bruta estimada", `<span class="${s.profitC < 0 ? "neg" : ""}">${M(s.profitC)}</span>`)}${kpi("Margen sobre la venta", F.fmtPct(s.marginBp, "—"))}</div>
    ${s.lines.length ? `<div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>Partida</th><th class="n">Costo</th><th class="n">Venta</th><th class="n">Ganancia</th><th class="n">Margen</th><th class="n">Recargo</th></tr></thead><tbody>
    ${s.lines.map((l) => `<tr><td>${esc(l.desc || "(sin concepto)")}</td><td class="n">${M(l.costTotalC)}</td><td class="n">${M(l.saleTotalC)}</td><td class="n ${l.profitC < 0 ? "neg" : ""}">${M(l.profitC)}</td><td class="n">${F.fmtPct(l.marginBp, "—")}</td><td class="n">${F.fmtPct(l.markupBp, "—")}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${s.discountC ? `<p class="small muted">El descuento de ${M(s.discountC)} ya está restado de la ganancia.</p>` : ""}`;
}
function quoteReadOnly(q, v, s) {
  return `<div class="grid g2"><div class="card"><h2>Cliente</h2><dl class="kv"><dt>Nombre</dt><dd>${esc(v.client.name || "—")}</dd><dt>Empresa</dt><dd>${esc(v.client.company || "—")}</dd>
    <dt>Correo</dt><dd>${esc(v.client.email || "—")}</dd><dt>Teléfono</dt><dd>${esc(v.client.phone || "—")}</dd><dt>Emisión</dt><dd>${fmtDate(v.issuedOn)}</dd><dt>Válida hasta</dt><dd>${fmtDate(v.validUntil)}</dd></dl>
    ${v.description ? `<p class="small">${esc(v.description)}</p>` : ""}<p class="small"><b>Condiciones:</b> ${esc(v.terms || "—")}</p></div>
    <div class="card">${quoteSummary(s)}</div></div>
  <div class="tablewrap"><table><thead><tr><th>Concepto</th><th class="n">Cant.</th><th class="n">Precio unit.</th><th class="n">Total</th><th>Precio</th></tr></thead><tbody>
    ${s.lines.map((l) => `<tr><td>${esc(l.desc)}</td><td class="n">${F.milliToStr(l.qtyM)} ${esc(l.unit || "")}</td><td class="n">${M(l.unitPriceC)}</td><td class="n">${M(l.saleTotalC)}</td><td>${l.manual ? '<span class="tag-m">Manual</span>' : '<span class="tag-a">Automático</span>'}</td></tr>`).join("")}</tbody></table></div>
  <div class="private"><span class="private-tag">Uso interno · nunca va al PDF del cliente</span>${quotePrivate(s)}</div>`;
}
// edición en vivo sin re-render completo (no se pierde el foco)
function setPath(o, path, val) { const ks = path.split("."); let t = o; ks.slice(0, -1).forEach((k) => (t = t[k])); t[ks[ks.length - 1]] = val; }
function onQuoteInput(el) {
  const v = ui.quoteDraft; if (!v) return;
  if (el.dataset.q) { const k = el.dataset.q; let val = el.value;
    if (k === "globalRateBp") val = F.toBp(val) ?? 0;
    else if (k === "manualSubtotalC") { val = F.toCents(val); if (Number.isNaN(val)) { el.classList.add("bad"); return; } }
    else if (k === "discountValue") val = (v.discountType === "importe" ? F.toCents(val) : F.toBp(val)) ?? 0;
    if (typeof val === "number" && Number.isNaN(val)) { el.classList.add("bad"); return; }
    el.classList.remove("bad"); setPath(v, k, val);
    if (k === "discountType") { v.discountValue = 0; render(); return; } }
  if (el.dataset.l !== undefined) { const l = v.lines[Number(el.dataset.l)]; const k = el.dataset.k; let val = el.value;
    if (k === "taxable") val = el.checked;
    else if (k === "qtyM") val = F.toMilli(val); else if (k === "costC" || k === "manualC") val = F.toCents(val); else if (k === "rateBp") val = F.toBp(val);
    if (typeof val === "number" && Number.isNaN(val)) { el.classList.add("bad"); return; } el.classList.remove("bad");
    if (k === "method") { const prevS = F.computeQuote(v).lines[Number(el.dataset.l)];
      if (val === "manual") l.manualC = prevS.unitPriceC || l.costC; else l.manualC = null;
      if ((val === "recargo" || val === "margen") && (l.rateBp === null || l.rateBp === undefined)) l.rateBp = v.globalRateBp;
      l.method = val; render(); return; }
    l[k] = val; }
  const s = F.computeQuote(v);
  s.lines.forEach((r, i) => { const o = document.getElementById("lo-" + i); if (o) o.innerHTML = lineOut(r); });
  const sm = document.getElementById("q-summary"); if (sm) sm.innerHTML = quoteSummary(s);
  const pv = document.getElementById("q-private"); if (pv) pv.innerHTML = quotePrivate(s);
}
CHG.qtax = (el) => { const v = ui.quoteDraft; const t = cfg().taxes[Number(el.dataset.qtax)];
  v.taxes = el.checked ? [...v.taxes.filter((x) => x.name !== t.name), clone(t)] : v.taxes.filter((x) => x.name !== t.name); onQuoteInput({ dataset: {} }); };
CHG.qev = async (el) => { const q = get("quotes", ui.quoteId); q.eventId = el.value || null; const ev = S.events[q.eventId];
  if (ev && !ui.quoteDraft.client.name) ui.quoteDraft.client = { name: ev.client || "", company: ev.clientCompany || "", email: ev.clientEmail || "", phone: ev.clientPhone || "" };
  q.versions[q.versions.length - 1] = stripDraft(ui.quoteDraft); await save("quotes", q); };
const stripDraft = (d) => { const o = clone(d); delete o._qid; return o; };
async function saveDraft(msg) { const q = get("quotes", ui.quoteId); q.versions[q.versions.length - 1] = stripDraft(ui.quoteDraft); await save("quotes", q); if (msg) toast(msg); return q; }
ACT["q-save"] = () => saveDraft("Borrador guardado.");
ACT["q-addline"] = () => { ui.quoteDraft.lines.push({ id: uid(), desc: "", qtyM: 1000, unit: "", costC: 0, method: "global", rateBp: null, manualC: null, taxable: true }); render(); };
ACT["q-delline"] = (el) => { ui.quoteDraft.lines.splice(Number(el.dataset.i), 1); render(); };
ACT["q-move"] = (el) => { const i = Number(el.dataset.i), j = i + Number(el.dataset.d); const L = ui.quoteDraft.lines; [L[i], L[j]] = [L[j], L[i]]; render(); };
ACT["q-view"] = (el) => { ui.quoteVer = Number(el.dataset.v); ui.quoteDraft = null; render(); };
ACT["q-issue"] = async () => {
  const v = ui.quoteDraft; const s = F.computeQuote(v);
  if (!v.lines.length) return toast("Agrega al menos una partida.");
  if (s.errors.length) return toast(s.errors[0]);
  if (v.lines.some((l) => !l.desc)) return toast("Cada partida necesita un concepto.");
  if (!v.client.name) return toast("Indica el nombre del cliente.");
  if (v.validUntil < v.issuedOn) return toast("La vigencia no puede terminar antes de la emisión.");
  confirmBox("Emitir cotización", `<p>Se congelará la versión ${v.v} con un total de <b>${M(s.totalC)}</b> para el cliente. Para cambiarla después tendrás que crear una nueva versión.</p>`, "Emitir", async () => {
    const q = get("quotes", ui.quoteId); const nv = stripDraft(v); nv.status = "emitida"; nv.statusDates = { ...nv.statusDates, emitida: new Date().toISOString() };
    nv.frozen = { costTotalC: s.costTotalC, netC: s.netC, taxC: s.taxC, totalC: s.totalC, profitC: s.profitC };
    q.versions[q.versions.length - 1] = nv; addLog(q, `v${nv.v} emitida por ${M(s.totalC)}`); ui.quoteDraft = null; await save("quotes", q); toast("Cotización emitida."); });
};
ACT["q-status"] = (el) => { const st = el.dataset.s; const q = get("quotes", ui.quoteId); const v = curVer(q);
  const txt = { aceptada: "El cliente aceptó la propuesta. Aceptar no registra dinero cobrado; después puedes convertirla en venta.", rechazada: "El cliente rechazó esta versión.", vencida: "La oferta venció sin respuesta.", cancelada: "La cotización se cancela; su historial se conserva." }[st];
  confirmBox(`Marcar como ${st}`, `<p>${txt}</p>`, "Confirmar", async () => {
    if (st === "aceptada" && q.versions.some((x) => x.status === "aceptada")) return toast("Ya hay una versión aceptada de esta cotización.");
    v.status = st; v.statusDates = { ...v.statusDates, [st]: new Date().toISOString() }; addLog(q, `v${v.v} ${st}`); await save("quotes", q); toast("Estado actualizado."); }, st === "cancelada"); };
ACT["q-newver"] = () => { const q = get("quotes", ui.quoteId); const last = curVer(q);
  confirmBox("Nueva versión", `<p>Se creará la versión ${last.v + 1} como borrador a partir de la v${last.v}. La versión anterior se conserva sin cambios.</p>`, "Crear versión", async () => {
    const nv = clone(last); nv.v = last.v + 1; nv.status = "borrador"; nv.shares = []; nv.statusDates = { borrador: new Date().toISOString() }; delete nv.frozen; nv.issuedOn = todayISO();
    nv.validUntil = addDays(nv.issuedOn, cfg().validityDays || 15); q.versions.push(nv); addLog(q, `Versión ${nv.v} creada`); await save("quotes", q); ui.quoteVer = null; ui.quoteDraft = null; render(); }); };
ACT["q-to-sale"] = (el) => { const q = get("quotes", ui.quoteId); const v = q.versions[Number(el.dataset.v)]; const s = F.computeQuote(v);
  if (all("sales").some((x) => x.quoteId === q.id && !x.voided)) return toast("Esta cotización ya se convirtió en venta.");
  confirmBox("Convertir en venta", `<p>Se registrará una venta (ingreso reconocido) por <b>${M(s.netC)}</b> más ${M(s.taxC)} de impuestos. Todavía no es dinero cobrado: registra los cobros cuando lleguen.</p>`, "Registrar venta", async () => {
    const sale = { id: uid(), key: `${q.id}:v${v.v}`, quoteId: q.id, quoteVersion: v.v, eventId: q.eventId, date: todayISO(), desc: `Cotización ${q.number} v${v.v}`, client: v.client.name,
      netC: s.netC, taxC: s.taxC, due: "", ref: q.number, invoices: [], receipts: [] };
    addLog(sale, `Venta creada desde ${q.number} v${v.v}`); await save("sales", sale); addLog(q, "Convertida en venta"); await save("quotes", q); toast("Venta registrada."); }); };

/* ---------- PDF de la cotización (pdf-lib, solo con la vista de cliente) */
function dataUrlBytes(u) { const [h, b64] = u.split(","); const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return { bytes: out, type: h.includes("png") ? "png" : "jpg" }; }
function quoteDocData(q, v) {
  const c = cfg(); const cv = F.clientView(F.computeQuote(v)); const logo = c.logo ? dataUrlBytes(c.logo) : null;
  return { issuer: { tradeName: c.tradeName, legalName: c.legalName, taxId: c.taxId, email: c.email, phone: c.phone, address: c.address },
    logoBytes: logo && logo.bytes, logoType: logo && logo.type, number: q.number, version: v.v, status: v.status, issuedOn: fmtDate(v.issuedOn), validUntil: fmtDate(v.validUntil),
    client: v.client, eventName: q.eventId && S.events[q.eventId] ? S.events[q.eventId].name : "", description: v.description, terms: v.terms, advance: v.advance,
    execTerm: v.execTerm, notes: v.notes, currency: c.currency || "USD",
    view: { lines: cv.lines.map((l) => ({ desc: l.desc, qty: F.milliToStr(l.qtyM), unit: l.unit, unitPrice: M(l.unitPriceC), total: M(l.totalC) })),
      linesSubtotal: M(cv.linesSubtotalC), adjustment: cv.adjustmentC ? M(cv.adjustmentC) : "", subtotal: M(cv.subtotalC), discount: cv.discountC ? M(cv.discountC) : "",
      taxes: cv.taxes.map((t) => ({ label: `${t.name} (${F.bpToInput(t.bp)} %)`, amount: M(t.amountC) })), total: M(cv.totalC) } };
}
function shareTexts(q, v) {
  const evn = q.eventId && S.events[q.eventId] ? S.events[q.eventId].name : "tu proyecto";
  const msg = `Hola, ${v.client.name || ""}. Te comparto la cotización correspondiente a ${evn}. En el documento encontrarás el detalle de los servicios, los importes y las condiciones de la propuesta. Quedo atento a tus comentarios. Saludos.`;
  const subject = `Cotización ${q.number} — ${evn}`; const phone = (v.client.phone || "").replace(/\D/g, "");
  return { msg, subject, phone, file: `Cotizacion_${q.number}_v${v.v}.pdf`,
    wa: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`,
    mail: `mailto:${encodeURIComponent(v.client.email || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}` };
}
ACT["q-preview"] = async (el) => {
  if (ui.quoteDraft) await saveDraft();
  const q = S.quotes[ui.quoteId]; const vi = Number(el.dataset.v); const v = q.versions[vi]; const s = F.computeQuote(v); const cv = F.clientView(s); const c = cfg(); const t = shareTexts(q, v);
  openModal(`<div class="spread"><h2>Vista previa para el cliente</h2><button class="btn ghost" data-act="close">Cerrar</button></div>
  <p class="small muted">Este es exactamente el contenido del PDF. No incluye costos, márgenes, utilidades, ahorro ni accionistas.</p>
  <div class="card" style="background:#fff;color:#202B27">
    <div class="spread" style="border-bottom:2px solid #91C83E;padding-bottom:10px;align-items:flex-start"><div>${c.logo ? `<img src="${esc(c.logo)}" alt="" style="height:44px">` : ""}<h2 style="color:#103C32">${esc(c.tradeName || "Tu empresa (configúrala)")}</h2>
      <p class="small" style="margin:2px 0;color:#6B7671">${[c.legalName, c.email, c.phone].filter(Boolean).map(esc).join(" · ")}</p></div>
      <div style="text-align:right"><b style="color:#103C32;font-family:var(--f-display)">${v.status === "borrador" ? "BORRADOR" : "COTIZACIÓN"}</b><br><span class="small">N.º ${esc(q.number)} · v${v.v}<br>Emisión ${fmtDate(v.issuedOn)} · Válida hasta ${fmtDate(v.validUntil)}</span></div></div>
    <p class="small"><b>Cliente:</b> ${esc([v.client.name, v.client.company].filter(Boolean).join(", ") || "—")}</p>
    <div style="overflow-x:auto"><table style="color:#202B27"><thead><tr><th style="background:#EEF3EF;color:#103C32">Concepto</th><th class="n" style="background:#EEF3EF;color:#103C32">Cant.</th><th class="n" style="background:#EEF3EF;color:#103C32">Precio unit.</th><th class="n" style="background:#EEF3EF;color:#103C32">Total</th></tr></thead>
    <tbody>${cv.lines.map((l) => `<tr><td>${esc(l.desc)}</td><td class="n">${F.milliToStr(l.qtyM)} ${esc(l.unit)}</td><td class="n">${M(l.unitPriceC)}</td><td class="n">${M(l.totalC)}</td></tr>`).join("")}</tbody></table></div>
    <dl class="kv" style="max-width:320px;margin:10px 0 0 auto">${cv.adjustmentC ? `<dt>Ajuste de precio</dt><dd>${M(cv.adjustmentC)}</dd>` : ""}<dt>Subtotal</dt><dd>${M(cv.subtotalC)}</dd>${cv.discountC ? `<dt>Descuento</dt><dd>-${M(cv.discountC)}</dd>` : ""}
      ${cv.taxes.map((x) => `<dt>${esc(x.name)} (${F.bpToInput(x.bp)} %)</dt><dd>${M(x.amountC)}</dd>`).join("")}<dt class="tot">Total a pagar</dt><dd class="tot">${M(cv.totalC)}</dd></dl></div>
  <h3>Compartir</h3>
  <div class="row"><button class="btn pri" data-act="q-pdf" data-v="${vi}">Descargar PDF</button>
    <a class="btn" href="${esc(t.wa)}" target="_blank" rel="noopener" data-act="q-share-prep" data-ch="whatsapp" data-v="${vi}">Abrir WhatsApp</a>
    <a class="btn" href="${esc(t.mail)}" data-act="q-share-prep" data-ch="email" data-v="${vi}">Borrador de correo</a></div>
  <p class="small muted">WhatsApp y el correo se abren con el mensaje preparado, pero el PDF no se adjunta solo: descárgalo y adjúntalo. En la app de Claude para iPhone, «Descargar PDF» abre la hoja de compartir del sistema, desde donde puedes enviarlo por WhatsApp o Mail.</p>
  <div class="card"><dl class="kv" style="grid-template-columns:auto 1fr"><dt>Para</dt><dd style="text-align:left">${esc(v.client.email || "sin correo")} · ${esc(v.client.phone || "sin teléfono")}</dd><dt>Asunto</dt><dd style="text-align:left">${esc(t.subject)}</dd></dl>
    <p class="small" id="share-msg">${esc(t.msg)}</p><div class="row"><button class="btn sm" data-act="copy" data-txt="${esc(t.msg)}">Copiar mensaje</button><button class="btn sm" data-act="copy" data-txt="${esc(t.subject)}">Copiar asunto</button></div></div>
  ${v.status === "borrador" ? '<p class="small muted">Emite la cotización antes de enviarla al cliente.</p>' : `<div class="row"><span class="small">¿Ya la enviaste?</span>
    <button class="btn sm" data-act="q-sent" data-ch="whatsapp" data-v="${vi}">Confirmar envío por WhatsApp</button><button class="btn sm" data-act="q-sent" data-ch="email" data-v="${vi}">Confirmar envío por correo</button></div>`}`, true);
};
async function recordShare(vi, channel, state) { const q = get("quotes", ui.quoteId); const v = q.versions[vi];
  v.shares = [...(v.shares || []), { at: new Date().toISOString(), channel, state }];
  if (state === "enviado_confirmado" && v.status === "emitida") { v.status = "enviada"; v.statusDates = { ...v.statusDates, enviada: new Date().toISOString() }; }
  addLog(q, `v${v.v}: ${state.replace("_", " ")} (${channel})`); await save("quotes", q); }
ACT["q-pdf"] = async (el) => { const q = S.quotes[ui.quoteId]; const vi = Number(el.dataset.v); const v = q.versions[vi];
  if (!window.PDFLib) return toast("No se pudo cargar el generador de PDF. Revisa tu conexión y recarga.");
  const buf = await PDF.quotePdfBytes(quoteDocData(q, v)); const ok = await offerDownload(shareTexts(q, v).file, buf); if (ok && v.status !== "borrador") await recordShare(vi, "descarga", "generado"); };
ACT["q-share-prep"] = (el) => { const vi = Number(el.dataset.v); const v = S.quotes[ui.quoteId].versions[vi]; if (v.status !== "borrador") recordShare(vi, el.dataset.ch, "preparado").catch(() => {}); return "default"; };
ACT["q-sent"] = async (el) => { await recordShare(Number(el.dataset.v), el.dataset.ch, "enviado_confirmado"); closeModal(); toast("Envío registrado."); };
ACT.copy = async (el) => { try { await navigator.clipboard.writeText(el.dataset.txt); toast("Copiado."); } catch { const m = document.getElementById("share-msg"); if (m) { const r = document.createRange(); r.selectNodeContents(m); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } toast("Selecciona el texto y cópialo."); } };

/* ===================================================== ingresos y cobros */
function salesTable(list) {
  list = list.sort((a, b) => b.date.localeCompare(a.date));
  if (!list.length) return `<div class="card empty"><b>Sin ingresos registrados</b><p>Convierte una cotización aceptada en venta o registra un ingreso directo.</p></div>`;
  return `<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Descripción</th><th class="n">Ingreso</th><th class="n">Total c/imp.</th><th class="n">Facturado</th><th class="n">Cobrado</th><th class="n">Saldo</th><th>Estado</th></tr></thead><tbody>
  ${list.map((s) => { const st = F.saleStatus(s); return `<tr class="click ${s.voided ? "void" : ""}" data-act="open-sale" data-id="${s.id}"><td class="num">${fmtDate(s.date)}</td><td>${esc(s.desc)}<br><span class="small muted">${esc(s.client || "")}${s.eventId ? " · " + esc(evName(s.eventId)) : ""}</span></td>
    <td class="n">${M(s.netC)}</td><td class="n">${M(F.saleGross(s))}</td><td class="n">${M(F.saleInvoiced(s))}</td><td class="n">${M(F.saleCollected(s))}</td><td class="n">${M(F.saleGross(s) - F.saleCollected(s))}</td>
    <td>${s.voided ? pill("plain", "Anulado") : pill(STATUS_SALE[st][0], STATUS_SALE[st][1])}</td></tr>`; }).join("")}</tbody></table></div>`;
}
VIEWS.income = () => { const L = liveSales();
  return `<div class="topline"><div><h1>Ingresos y cobros</h1><p>Ingreso reconocido ${M(F.sum(L, (s) => s.netC))} · facturado ${M(F.sum(L, F.saleInvoiced))} · cobrado ${M(F.sum(L, F.saleCollected))} · por cobrar ${M(F.sum(L, (s) => F.saleGross(s) - F.saleCollected(s)))}</p></div>
  <div class="bar"><button class="btn" data-act="export-sales">Exportar CSV</button><button class="btn pri" data-act="new-sale">Registrar ingreso</button></div></div>
  <div class="banner info">Cotizado → aceptado → facturado → cobrado son etapas distintas. Las facturas se vinculan a la venta y nunca duplican el ingreso.</div>${salesTable(all("sales"))}`; };
ACT["new-sale"] = (el) => openModal(`<h2>Registrar ingreso</h2><p class="small muted">Para ventas que no provienen de una cotización. Si existe una cotización aceptada, conviértela desde la cotización para no duplicar el ingreso.</p>
  <form class="f" id="sale-form">${field("date", "Fecha de reconocimiento", inp("date", todayISO(), 'type="date" required'))}${field("eventId", "Evento", sel("eventId", evOpts("Sin evento"), el.dataset.ev || ""))}
  ${field("desc", "Descripción", inp("desc", "", "required"), "", true)}${field("client", "Cliente", inp("client", el.dataset.ev && S.events[el.dataset.ev] ? S.events[el.dataset.ev].client : ""))}
  ${field("net", "Importe sin impuestos", moneyInp("net", null, "required"))}${field("tax", "Impuestos cobrados", moneyInp("tax", 0), "Por cuenta de la autoridad fiscal")}
  ${field("due", "Vencimiento", inp("due", "", 'type="date"'))}${field("ref", "Referencia", inp("ref", ""))}<input type="hidden" name="key" value="${uid()}">
  <p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Registrar</button></div></form>`);
SUBMIT["sale-form"] = async (form) => { const d = readForm(form); const net = F.toCents(d.net), tax = F.toCents(d.tax || "0");
  if (!d.desc) return formErr(form, "La descripción es obligatoria."); if (!(net >= 0) || !(tax >= 0)) return formErr(form, "Importes inválidos.");
  if (all("sales").some((s) => s.key === d.key)) { closeModal(); return; }
  const s = { id: uid(), key: d.key, date: d.date, eventId: d.eventId || null, desc: d.desc, client: d.client, netC: net, taxC: tax, due: d.due, ref: d.ref, invoices: [], receipts: [] };
  addLog(s, `Ingreso registrado ${M(net)}`); await save("sales", s); closeModal(); toast("Ingreso registrado."); };
ACT["open-sale"] = (el) => { const s = get("sales", el.dataset.id); const st = F.saleStatus(s); const rem = F.saleGross(s) - F.saleCollected(s);
  openModal(`<div class="spread"><h2>${esc(s.desc)}</h2>${s.voided ? pill("plain", "Anulado") : pill(STATUS_SALE[st][0], STATUS_SALE[st][1])}</div>
  <dl class="kv"><dt>Fecha</dt><dd>${fmtDate(s.date)}</dd><dt>Cliente</dt><dd>${esc(s.client || "—")}</dd><dt>Evento</dt><dd>${esc(s.eventId ? evName(s.eventId) : "—")}</dd>
  <dt>Ingreso reconocido</dt><dd>${M(s.netC)}</dd><dt>Impuestos</dt><dd>${M(s.taxC)}</dd><dt>Total</dt><dd>${M(F.saleGross(s))}</dd><dt>Facturado</dt><dd>${M(F.saleInvoiced(s))}</dd>
  <dt>Cobrado</dt><dd>${M(F.saleCollected(s))}</dd><dt class="tot">Saldo pendiente</dt><dd class="tot">${M(rem)}</dd></dl>
  ${s.voided ? `<div class="banner err">Anulado: ${esc(s.voidReason)}</div>` : ""}
  <h3>Facturas</h3>${(s.invoices || []).length ? `<dl class="kv">${s.invoices.map((i) => `<dt>${esc(i.number)} · ${fmtDate(i.date)}</dt><dd>${M(i.amountC)}</dd>`).join("")}</dl>` : '<p class="small muted">Sin facturas.</p>'}
  <h3>Cobros</h3>${(s.receipts || []).length ? `<dl class="kv">${s.receipts.map((r) => `<dt>${fmtDate(r.date)} · ${esc(r.method || "")}${r.invoice ? " · " + esc(r.invoice) : ""}</dt><dd>${M(r.amountC)}</dd>`).join("")}</dl>` : '<p class="small muted">Sin cobros.</p>'}
  ${s.voided ? "" : `<div class="row">${F.saleGross(s) - F.saleInvoiced(s) > 0 ? `<button class="btn" data-act="add-invoice" data-id="${s.id}">Vincular factura</button>` : ""}
    ${rem > 0 ? `<button class="btn pri" data-act="add-receipt" data-id="${s.id}">Registrar cobro</button>` : ""}${!F.saleCollected(s) ? `<button class="btn danger" data-act="void-sale" data-id="${s.id}">Anular</button>` : ""}</div>`}
  <div class="row" style="justify-content:flex-end"><button class="btn" data-act="close">Cerrar</button></div>`); };
ACT["add-invoice"] = (el) => { const s = get("sales", el.dataset.id);
  openModal(`<h2>Vincular factura</h2><p class="small muted">La factura documenta la venta existente; no crea un ingreso nuevo.</p><form class="f" id="inv-form" data-id="${s.id}">
  ${field("number", "Número de factura", inp("number", "", "required"))}${field("date", "Fecha", inp("date", todayISO(), 'type="date"'))}
  ${field("amount", "Importe facturado (con impuestos)", moneyInp("amount", F.saleGross(s) - F.saleInvoiced(s), "required"))}
  <p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Vincular</button></div></form>`); };
SUBMIT["inv-form"] = async (form) => { const d = readForm(form); const s = get("sales", form.dataset.id); const a = F.toCents(d.amount);
  if (!d.number) return formErr(form, "El número es obligatorio.");
  if (all("sales").some((x) => (x.invoices || []).some((i) => i.number === d.number && !i.voided))) return formErr(form, "Ese número de factura ya existe.");
  if (!(a > 0) || a > F.saleGross(s) - F.saleInvoiced(s)) return formErr(form, "El importe debe ser positivo y no superar lo pendiente de facturar.");
  s.invoices.push({ id: uid(), number: d.number, date: d.date, amountC: a }); addLog(s, `Factura ${d.number} vinculada ${M(a)}`); await save("sales", s); closeModal(); toast("Factura vinculada."); };
ACT["add-receipt"] = (el) => { const s = get("sales", el.dataset.id); const c = cfg();
  openModal(`<h2>Registrar cobro</h2><p class="small muted">Saldo pendiente ${M(F.saleGross(s) - F.saleCollected(s))}. Puedes registrar cobros parciales.</p><form class="f" id="rec-form" data-id="${s.id}">
  ${field("date", "Fecha del cobro", inp("date", todayISO(), 'type="date"'))}${field("amount", "Importe cobrado", moneyInp("amount", F.saleGross(s) - F.saleCollected(s), "required"))}
  ${field("method", "Método", sel("method", c.methods.map((m) => [m, m]), c.methods[1] || c.methods[0]))}${field("invoice", "Factura", sel("invoice", [["", "Sin factura"], ...(s.invoices || []).map((i) => [i.number, i.number])], ""))}
  <input type="hidden" name="key" value="${uid()}"><p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Registrar cobro</button></div></form>`); };
SUBMIT["rec-form"] = async (form) => { const d = readForm(form); const s = get("sales", form.dataset.id); const a = F.toCents(d.amount);
  if (s.receipts.some((r) => r.id === d.key)) { closeModal(); return; }
  if (!(a > 0) || a > F.saleGross(s) - F.saleCollected(s)) return formErr(form, "El cobro debe ser positivo y no superar el saldo pendiente.");
  s.receipts.push({ id: d.key, date: d.date, amountC: a, method: d.method, invoice: d.invoice }); addLog(s, `Cobro ${M(a)}`); await save("sales", s); closeModal(); toast("Cobro registrado."); };
ACT["void-sale"] = (el) => openModal(`<h2>Anular ingreso</h2><form class="f" id="voids-form" data-id="${el.dataset.id}">${field("reason", "Motivo", `<textarea id="reason" name="reason" required></textarea>`, "", true)}
  <p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Volver</button><button class="btn danger">Anular</button></div></form>`);
SUBMIT["voids-form"] = async (form) => { const d = readForm(form); if (!d.reason) return formErr(form, "El motivo es obligatorio."); const s = get("sales", form.dataset.id);
  s.voided = true; s.voidReason = d.reason; addLog(s, "Anulado: " + d.reason); await save("sales", s); closeModal(); toast("Ingreso anulado."); };
ACT["export-sales"] = () => offerDownload(`ingresos_cobros_${todayISO()}.csv`, csv([["Fecha", "Evento", "Cliente", "Descripción", "Ingreso sin impuestos", "Impuestos", "Total", "Facturado", "Cobrado", "Saldo", "Estado"],
  ...all("sales").map((s) => [s.date, s.eventId ? evName(s.eventId) : "", s.client, s.desc, centsCsv(s.netC), centsCsv(s.taxC), centsCsv(F.saleGross(s)), centsCsv(F.saleInvoiced(s)), centsCsv(F.saleCollected(s)), centsCsv(F.saleGross(s) - F.saleCollected(s)), s.voided ? "anulado" : F.saleStatus(s)])]));
