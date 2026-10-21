/* ===================================================== shell */
const ACT = {}, CHG = {};
function shell(content) {
  const v = ui.view === "eventDetail" ? "events" : ui.view === "quoteEdit" ? "quotes" : ui.view;
  const c = cfg();
  const banners = [];
  const HX = window.NEXOSALDO_HOST;
  if (mode === "memory") banners.push(`<div class="banner err">${HX && HX.error ? "No se pudo conectar con la base de datos: " + esc(HX.error) : "El almacenamiento no está disponible en esta vista (sesión no iniciada o vista previa)."} Puedes explorar, pero nada se guardará.</div>`);
  if (HX && HX.kind === "local" && mode === "db") banners.push(`<div class="banner info">Modo local: los datos se guardan solo en este navegador. Descarga un respaldo desde Configuración con frecuencia.</div>`);
  if (storeError) banners.push(`<div class="banner err">Se perdió la conexión con los datos (${esc(storeError.code)}). Recarga la página.</div>`);
  if (!canWrite && mode === "db") banners.push(`<div class="banner info">Tienes acceso de solo lectura a este prototipo.</div>`);
  if (hasDemo()) banners.push(`<div class="banner demo"><b>Datos de demostración.</b> Las cifras marcadas como demo son ficticias. Puedes eliminarlas en Configuración cuando cargues tus datos reales.</div>`);
  return `<div class="app"><aside class="side"><div class="brand">${LOGO(34)}<div><b>NexoSaldo</b><small>Cada proyecto, bajo control</small></div></div>
    <nav class="nav" aria-label="Secciones">${NAV.map(([k, l]) => `<button data-act="nav" data-v="${k}"${k === v ? ' aria-current="page"' : ""}>${icon(k)}${l}</button>`).join("")}</nav>
    ${c.tradeName ? `<p class="small" style="margin:22px 10px 0;opacity:.75">Empresa: ${esc(c.tradeName)}</p>` : ""}</aside>
    <main class="main" id="main"><div class="wrap"><div class="mhead">${LOGO(28)}<b>NexoSaldo</b></div>${banners.join("")}${content}</div></main>
    <nav class="mob" aria-label="Secciones">${MOB.map(([k, l]) => `<button data-act="${k === "more" ? "more" : "nav"}" data-v="${k}"${k === v || (k === "more" && !MOB.some((m) => m[0] === v)) ? ' aria-current="page"' : ""}>${icon(k)}${l}</button>`).join("")}</nav></div>`;
}
ACT.nav = (el) => go(el.dataset.v);
ACT.more = () => openModal(`<div class="spread"><h2>Secciones</h2><button class="btn ghost" data-act="close">Cerrar</button></div>
  <div class="grid g2" style="grid-template-columns:1fr 1fr">${NAV.map(([k, l]) => `<button class="btn" data-act="nav" data-v="${k}" style="justify-content:flex-start">${icon(k)}${l}</button>`).join("")}</div>`);
ACT.close = closeModal;
ACT["modal-back"] = (el, ev) => { if (ev.target === el) closeModal(); };
ACT["confirm-ok"] = async () => { const cb = confirmCb; confirmCb = null; closeModal(); if (cb) await cb(); };

function render() {
  const app = document.getElementById("app");
  if (!ready()) { app.innerHTML = shell(`<div class="card empty"><b>Cargando tus datos…</b></div>`); return; }
  const fn = VIEWS[ui.view] || VIEWS.dashboard;
  let html; try { html = fn(); } catch (e) { console.error(e); html = `<div class="banner err">Error al mostrar esta sección: ${esc(e.message)}</div>`; }
  const y = window.scrollY; app.innerHTML = shell(html); window.scrollTo(0, y);
}
const VIEWS = {};

function filterBar(withEvent = true) {
  const f = ui.filter;
  return `<div class="bar">${sel("f-mode", [["mes", "Mes"], ["anio", "Año"], ["rango", "Período"], ["todo", "Todo"]], f.mode, 'data-chg="filter" aria-label="Tipo de período"')}
    ${f.mode === "mes" ? `<input type="month" id="f-month" value="${f.month}" data-chg="filter" aria-label="Mes" style="width:auto">` : ""}
    ${f.mode === "anio" ? `<input type="number" id="f-year" value="${f.year}" min="2000" max="2100" data-chg="filter" aria-label="Año" style="width:100px">` : ""}
    ${f.mode === "rango" ? `<input type="date" id="f-from" value="${f.from}" data-chg="filter" aria-label="Desde" style="width:auto"><input type="date" id="f-to" value="${f.to}" data-chg="filter" aria-label="Hasta" style="width:auto">` : ""}
    ${withEvent ? sel("f-event", evOpts(), f.eventId, 'data-chg="filter" aria-label="Evento" style="width:auto;max-width:240px"') : ""}</div>`;
}
CHG.filter = () => {
  const g = (id) => document.getElementById(id); const f = ui.filter;
  f.mode = g("f-mode").value; if (g("f-month")) f.month = g("f-month").value || f.month;
  if (g("f-year")) f.year = g("f-year").value || f.year; if (g("f-from")) f.from = g("f-from").value; if (g("f-to")) f.to = g("f-to").value;
  if (g("f-event")) f.eventId = g("f-event").value; render();
};

/* ===================================================== dashboard */
VIEWS.dashboard = () => {
  const R = rangeFromFilter(ui.filter), eid = ui.filter.eventId; const p = periodFacts(R, eid);
  const head = `<div class="topline"><div><h1>Dashboard</h1><p>${esc(R.label)}${eid ? " · " + esc(evName(eid)) : ""} · importes en USD</p></div>${filterBar()}</div>`;
  if (!all("events").length && !all("sales").length && !all("expenses").length) {
    return head + `<div class="card empty"><b>Todavía no hay datos</b><p>Crea tu primer evento; después podrás cotizarlo, registrar gastos y cobros, y aquí verás su rentabilidad.</p>
      <button class="btn pri" data-act="new-event">Crear el primer evento</button></div>`;
  }
  const end = R.to === "9999-12-31" ? monthOf(todayISO()) : monthOf(R.to);
  const months = []; let m = end; for (let i = 0; i < 6; i++) { months.unshift(m); m = prevMonth(m); }
  const mf = months.map((ym) => periodFacts(monthR(ym), eid));
  const lbl = months.map((ym) => ymLabel(ym));
  const evs = all("events").filter((e) => (eid ? e.id === eid : inR(e.start, R)) && e.status !== "cancelado").map(evFacts);
  const lastDist = all("distributions").filter((d) => d.status === "aprobada").sort((a, b) => (b.approvedAt || "").localeCompare(a.approvedAt || ""))[0];
  const kp = [
    kpi("Utilidad real", money(p.profit), `Margen ${F.fmtPct(p.marginBp, "sin ingresos")}`, "hero"),
    kpi("Ingresos reconocidos", money(p.revenue), "Ventas confirmadas, sin impuestos"),
    kpi("Cobrado", money(p.collected), "Dinero que entró en el período"),
    kpi("Gastos reales", money(p.expenses), "Reconocidos, pagados o no"),
    kpi("Presupuesto aprobado", money(p.budget), `Eventos del período · ejec. ${F.fmtPct(F.ratioBp(p.evExp, p.budget))}`),
    kpi("Saldo presupuestario", money(p.budgetBalance), p.budgetBalance < 0 ? "Presupuesto excedido" : "Disponible del presupuesto"),
    kpi("Utilidad estimada", money(p.estProfit), "Según cotizaciones aceptadas"),
    kpi("Ahorro acumulado", money(p.savingsTotal), `Reservado en el período: ${M(p.savedIn)}`),
    kpi("Disponible para distribuir", money(p.available), "Utilidad − ahorro del período"),
    kpi("Total cotizado", money(p.quoted), `${p.qIssued} cotizaciones emitidas`),
    kpi("Cotizaciones aceptadas", money(p.qAcceptedC), `${p.qAccepted} aceptadas`),
    kpi("Cotizaciones pendientes", money(p.qPendingC), `${p.qPending} esperando respuesta`),
    kpi("Facturado", money(p.invoiced), "Facturas emitidas en el período"),
    kpi("Cuentas por cobrar", money(p.receivable), "Saldo pendiente de clientes"),
    kpi("Obligaciones pendientes", money(p.payables + p.shOwed), `Proveedores ${M(p.payables)} · accionistas ${M(p.shOwed)}`),
    kpi("Eventos", `<span class="num">${p.active} activos · ${p.finished} finalizados</span>`, p.cancelled ? `${p.cancelled} cancelados` : "En el período"),
  ].join("");
  const shRows = lastDist ? lastDist.lines.map((l) => ({ label: `${l.name} (${F.bpToInput(l.bp)} %)`, value: l.amountC, text: M(l.amountC), tip: `Aprobado ${fmtDate((lastDist.approvedAt || "").slice(0, 10))}` })) : [];
  return head + `<div class="kpis">${kp}</div>
  <div class="grid charts">
    <div class="card"><h2>Ingresos vs. gastos</h2>${barChart(lbl, [{ name: "Ingresos", color: "var(--s1)", values: mf.map((x) => x.revenue) }, { name: "Gastos", color: "var(--s2)", values: mf.map((x) => x.expenses) }], { label: "Ingresos y gastos por mes" })}</div>
    <div class="card"><h2>Utilidad por mes</h2>${barChart(lbl, [{ name: "Utilidad", color: "var(--s1)", values: mf.map((x) => x.profit) }], { label: "Utilidad por mes", negColor: "var(--bad)" })}</div>
    <div class="card"><h2>Presupuesto vs. gasto real por evento</h2>${evs.length ? barChart(evs.slice(0, 8).map((f) => f.ev.code.slice(-3)), [{ name: "Presupuesto", color: "var(--s3)", values: evs.slice(0, 8).map((f) => f.budget) }, { name: "Gasto real", color: "var(--s2)", values: evs.slice(0, 8).map((f) => f.expenses) }], { label: "Presupuesto frente a gasto" }) + `<p class="small muted">${evs.slice(0, 8).map((f) => `${esc(f.ev.code.slice(-3))} = ${esc(f.ev.name)}`).join(" · ")}</p>` : '<p class="muted small">Sin eventos en el período.</p>'}</div>
    <div class="card"><h2>Evolución del ahorro</h2>${lineChart(lbl, months.map((ym) => savingsBalance(null, monthEnd(ym))), "var(--s3)", "Saldo de ahorro")}</div>
    <div class="card"><h2>Rentabilidad por evento</h2>${hbars(evs.filter((f) => f.revenue || f.expenses).sort((a, b) => b.profit - a.profit).map((f) => ({ label: f.ev.name, value: f.profit, text: `${M(f.profit)} · ${F.fmtPct(f.marginBp, "s/ingresos")}`, tip: `Ingresos ${M(f.revenue)} · Gastos ${M(f.expenses)}` })), { empty: "Aún no hay ingresos ni gastos en eventos del período." })}</div>
    <div class="card"><h2>Distribución entre accionistas</h2>${lastDist ? `<p class="small muted">Última distribución aprobada: ${M(lastDist.distributedC)}</p>` : ""}${hbars(shRows, { empty: "Todavía no hay distribuciones aprobadas." })}</div>
  </div>`;
};

/* ===================================================== eventos */
VIEWS.events = () => {
  const evs = all("events").sort((a, b) => b.start.localeCompare(a.start));
  const head = `<div class="topline"><div><h1>Eventos</h1><p>${evs.length} eventos registrados</p></div><button class="btn pri" data-act="new-event">Nuevo evento</button></div>`;
  if (!evs.length) return head + `<div class="card empty"><b>Sin eventos</b><p>Cada evento tiene su propio expediente: cotización, presupuesto, gastos, cobros y resultado.</p><button class="btn pri" data-act="new-event">Crear evento</button></div>`;
  return head + `<div class="grid g3">${evs.map((e) => { const f = evFacts(e); const L = F.budgetLight(f.budget, f.expenses, cfg().warnBp, cfg().overBp);
    return `<button class="card" style="text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:8px" data-act="open-event" data-id="${e.id}">
      <div class="spread"><span class="small muted">${esc(e.code)} · ${fmtDate(e.start)}</span>${evStatusPill(e.status)}</div>
      <h2>${esc(e.name)}</h2><span class="small muted">${esc(e.client || "Sin cliente")}${e.demo ? " · demo" : ""}</span>
      <dl class="kv" style="margin:0"><dt>Ingresos</dt><dd>${M(f.revenue)}</dd><dt>Gastos</dt><dd>${M(f.expenses)}</dd>
      <dt>Utilidad</dt><dd class="${f.profit < 0 ? "neg" : ""}">${M(f.profit)}</dd></dl>
      <div class="row">${pill(L, "Presupuesto: " + LIGHT[L])}</div></button>`; }).join("")}</div>`;
};
function eventForm(e) {
  e = e || { name: "", code: nextCode("EV", "events", "code"), kind: "", client: "", clientCompany: "", clientEmail: "", clientPhone: "", start: todayISO(), end: todayISO(), status: "planificado", description: "", notes: "" };
  return `<h2>${e.id ? "Editar evento" : "Nuevo evento"}</h2><form class="f" id="ev-form" data-id="${e.id || ""}">
    ${field("name", "Nombre del evento", inp("name", e.name, "required"), "", true)}
    ${field("code", "Código único", inp("code", e.code, "required"))}
    ${field("kind", "Tipo", inp("kind", e.kind, 'placeholder="Boda, feria, corporativo…"'), "Sirve para comparar eventos similares")}
    ${field("start", "Inicio", inp("start", e.start, 'type="date" required'))}
    ${field("end", "Finalización", inp("end", e.end, 'type="date" required'))}
    ${field("status", "Estado", sel("status", Object.entries(STATUS_EV).filter(([k]) => k !== "cancelado" || e.status === "cancelado").map(([k, v]) => [k, v[1]]), e.status))}
    ${field("client", "Cliente", inp("client", e.client))}
    ${field("clientCompany", "Empresa del cliente", inp("clientCompany", e.clientCompany))}
    ${field("clientEmail", "Correo del cliente", inp("clientEmail", e.clientEmail, 'type="email"'))}
    ${field("clientPhone", "Teléfono con código de país", inp("clientPhone", e.clientPhone, 'type="tel" placeholder="+507 6000-0000"'))}
    ${field("description", "Descripción", `<textarea id="description" name="description">${esc(e.description)}</textarea>`, "", true)}
    ${field("notes", "Observaciones", `<textarea id="notes" name="notes">${esc(e.notes)}</textarea>`, "", true)}
    <p class="err form-err full" hidden></p>
    <div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri" type="submit">Guardar evento</button></div></form>`;
}
ACT["new-event"] = () => openModal(eventForm());
ACT["edit-event"] = (el) => openModal(eventForm(get("events", el.dataset.id)));
ACT["open-event"] = (el) => go("eventDetail", { eventId: el.dataset.id, eventTab: "resumen" });
const SUBMIT = {};
SUBMIT["ev-form"] = async (form) => {
  const d = readForm(form); const id = form.dataset.id;
  if (!d.name) return formErr(form, "Escribe el nombre del evento.");
  if (d.end < d.start) return formErr(form, "La fecha de finalización no puede ser anterior al inicio.");
  if (all("events").some((x) => x.code === d.code && x.id !== id)) return formErr(form, "Ese código ya existe. Usa otro.");
  const prev = id ? get("events", id) : null;
  const ev = { ...(prev || { id: uid(), budget: cfg().categories.slice(0, 0), createdAt: new Date().toISOString() }), ...d };
  if (prev && prev.status === "cancelado") ev.status = "cancelado";
  addLog(ev, prev ? "Datos del evento actualizados" : "Evento creado");
  await save("events", ev); closeModal(); toast("Evento guardado."); if (!prev) go("eventDetail", { eventId: ev.id, eventTab: "resumen" });
};
ACT["dup-event"] = (el) => {
  const o = get("events", el.dataset.id);
  confirmBox("Duplicar estructura", `<p>Se creará un evento nuevo con la misma estructura de <b>${esc(o.name)}</b> (tipo, descripción y categorías de presupuesto). No se copian gastos, cotizaciones, ingresos ni ahorros.</p>`, "Duplicar", async () => {
    const ev = { id: uid(), name: o.name + " (copia)", code: nextCode("EV", "events", "code"), kind: o.kind, client: "", clientCompany: "", clientEmail: "", clientPhone: "",
      start: todayISO(), end: todayISO(), status: "planificado", description: o.description, notes: "", duplicatedFrom: o.id,
      budget: (o.budget || []).map((b) => ({ cat: b.cat, desc: b.desc || "", initialC: b.revisedC, revisedC: b.revisedC, revisions: [] })), createdAt: new Date().toISOString() };
    addLog(ev, `Estructura duplicada de ${o.code}`); await save("events", ev); toast("Evento duplicado."); go("eventDetail", { eventId: ev.id, eventTab: "resumen" });
  });
};
ACT["cancel-event"] = (el) => {
  const o = get("events", el.dataset.id);
  openModal(`<h2>Cancelar evento</h2><p>Los gastos, ingresos y obligaciones registrados se conservan. Indica el motivo.</p>
    <form class="f" id="cancel-form" data-id="${o.id}">${field("reason", "Motivo de la cancelación", `<textarea id="reason" name="reason" required></textarea>`, "", true)}
    <p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Volver</button><button class="btn danger" type="submit">Cancelar evento</button></div></form>`);
};
SUBMIT["cancel-form"] = async (form) => {
  const d = readForm(form); if (!d.reason) return formErr(form, "El motivo es obligatorio.");
  const ev = get("events", form.dataset.id); ev.status = "cancelado"; ev.cancelReason = d.reason; ev.cancelledAt = new Date().toISOString();
  addLog(ev, "Evento cancelado: " + d.reason); await save("events", ev); closeModal(); toast("Evento cancelado; sus registros se conservan.");
};

const EV_TABS = [["resumen", "Resumen"], ["cotizacion", "Cotización"], ["presupuesto", "Presupuesto"], ["gastos", "Gastos reales"],
  ["ingresos", "Ingresos y cobros"], ["ahorro", "Ahorro"], ["resultado", "Resultado financiero"], ["distribucion", "Distribución"], ["historial", "Historial"]];
VIEWS.eventDetail = () => {
  const e = S.events[ui.eventId]; if (!e) return `<div class="card empty"><b>Evento no encontrado</b><button class="btn" data-act="nav" data-v="events">Volver a eventos</button></div>`;
  const f = evFacts(e);
  const head = `<div><button class="btn ghost sm" data-act="nav" data-v="events">← Eventos</button></div>
    <div class="topline"><div><p>${esc(e.code)} · ${fmtDate(e.start)}${e.end !== e.start ? " – " + fmtDate(e.end) : ""}${e.kind ? " · " + esc(e.kind) : ""}</p><h1>${esc(e.name)}</h1></div>
    <div class="bar">${evStatusPill(e.status)}<button class="btn sm" data-act="edit-event" data-id="${e.id}">Editar</button><button class="btn sm" data-act="dup-event" data-id="${e.id}">Duplicar estructura</button>
    ${e.status !== "cancelado" ? `<button class="btn sm danger" data-act="cancel-event" data-id="${e.id}">Cancelar evento</button>` : ""}</div></div>
    ${e.status === "cancelado" ? `<div class="banner err">Evento cancelado: ${esc(e.cancelReason || "")}. Sus registros financieros se conservan.</div>` : ""}
    <div class="tabs" role="tablist">${EV_TABS.map(([k, l]) => `<button role="tab" aria-selected="${ui.eventTab === k}" data-act="ev-tab" data-t="${k}">${l}</button>`).join("")}</div>`;
  return head + (EV_TAB_VIEW[ui.eventTab] || EV_TAB_VIEW.resumen)(e, f);
};
ACT["ev-tab"] = (el) => { ui.eventTab = el.dataset.t; render(); };
const EV_TAB_VIEW = {
  resumen: (e, f) => `<div class="kpis">
      ${kpi("Utilidad real", money(f.profit), `Margen ${F.fmtPct(f.marginBp, "sin ingresos")}`, "hero")}
      ${kpi("Ingresos reconocidos", money(f.revenue))}${kpi("Gastos reales", money(f.expenses))}
      ${kpi("Presupuesto aprobado", money(f.budget), `Ejecución ${F.fmtPct(F.ratioBp(f.expenses, f.budget))}`)}
      ${kpi("Utilidad estimada", f.est ? money(f.est.s.profitC) : "—", f.est ? `Cotización ${esc(f.est.q.number)} v${f.est.v.v}` : "Sin cotización emitida")}
      ${kpi("Cobrado", money(f.collected), `Por cobrar ${M(F.sum(evSales(e.id), (s) => F.saleGross(s) - F.saleCollected(s)))}`)}
      ${kpi("Ahorro asignado", money(f.savings))}</div>
    <div class="grid g2"><div class="card"><h2>Cliente</h2><dl class="kv"><dt>Nombre</dt><dd>${esc(e.client || "—")}</dd><dt>Empresa</dt><dd>${esc(e.clientCompany || "—")}</dd>
      <dt>Correo</dt><dd>${esc(e.clientEmail || "—")}</dd><dt>Teléfono</dt><dd>${esc(e.clientPhone || "—")}</dd></dl></div>
      <div class="card"><h2>Descripción</h2><p class="small">${esc(e.description || "Sin descripción.")}</p>${e.notes ? `<p class="small muted">${esc(e.notes)}</p>` : ""}</div></div>
    <div class="card"><div class="spread"><h2>Siguiente paso</h2></div><div class="row">
      <button class="btn" data-act="new-quote" data-ev="${e.id}">Crear cotización</button><button class="btn" data-act="ev-tab" data-t="presupuesto">Definir presupuesto</button>
      <button class="btn" data-act="new-expense" data-ev="${e.id}">Registrar gasto</button><button class="btn" data-act="new-sale" data-ev="${e.id}">Registrar ingreso</button></div></div>`,
  cotizacion: (e) => quotesTable(evQuotes(e.id), e.id),
  presupuesto: (e) => budgetEditor(e),
  gastos: (e) => `<div class="spread"><h2>Gastos reales</h2><button class="btn pri sm" data-act="new-expense" data-ev="${e.id}">Registrar gasto</button></div>${expensesTable(all("expenses").filter((x) => x.eventId === e.id || (!x.eventId && x.allocations && x.allocations[e.id])), e.id)}`,
  ingresos: (e) => `<div class="spread"><h2>Ingresos y cobros</h2><button class="btn pri sm" data-act="new-sale" data-ev="${e.id}">Registrar ingreso</button></div>${salesTable(all("sales").filter((s) => s.eventId === e.id))}`,
  ahorro: (e, f) => { const mv = all("savings").filter((m) => m.eventId === e.id);
    const rule = cfg().savingsRuleBp; const prop = F.proposeSavings(f.profit, rule);
    return `<div class="card"><h2>Ahorro del evento</h2><p class="small">Regla configurada: reservar ${F.bpToInput(rule)} % de la utilidad positiva. Propuesta para este evento: <b>${M(prop)}</b>.</p>
      <div class="row"><button class="btn pri sm" data-act="new-saving" data-ev="${e.id}" data-amt="${prop}" ${prop <= 0 ? "disabled" : ""}>Revisar y reservar</button></div></div>${savingsTable(mv)}`; },
  resultado: (e, f) => resultView(e, f),
  distribucion: (e, f) => { const d = F.distributable(f.profit, Math.max(f.savings, 0)); const h = all("shareholders");
    let body; try { const p = F.proposeDistribution(d.availableC, h, todayISO());
      body = `<div class="tablewrap"><table><thead><tr><th>Accionista</th><th class="n">Participación</th><th class="n">Importe</th></tr></thead><tbody>${p.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="n">${F.bpToInput(l.bp)} %</td><td class="n">${M(l.amountC)}</td></tr>`).join("")}</tbody></table></div>`; }
    catch (err) { body = `<div class="banner err">${esc(err.message)}</div>`; }
    return `<div class="card"><h2>Distribución estimada de este evento</h2><dl class="kv"><dt>Utilidad operativa</dt><dd>${M(d.opC)}</dd><dt>Ahorro asignado</dt><dd>−${M(d.savingsC)}</dd><dt class="tot">Disponible</dt><dd class="tot">${M(d.availableC)}</dd></dl>
      <p class="small muted">Es un cálculo de referencia. Las distribuciones se aprueban en Accionistas, por período o por evento.</p></div>${body}
      <button class="btn" data-act="nav" data-v="shareholders">Ir a Accionistas</button>`; },
  historial: (e) => { const items = [];
    (e.log || []).forEach((l) => items.push({ ...l, src: "Evento" }));
    (e.budget || []).forEach((b) => (b.revisions || []).forEach((r) => items.push({ at: r.at, msg: `Presupuesto ${b.cat}: ${M(r.oldC)} → ${M(r.newC)} · ${r.reason}`, src: "Presupuesto" })));
    all("expenses").filter((x) => x.eventId === e.id).forEach((x) => (x.log || []).forEach((l) => items.push({ ...l, src: "Gasto · " + x.desc })));
    evQuotes(e.id).forEach((q) => (q.log || []).forEach((l) => items.push({ ...l, src: "Cotización " + q.number })));
    evSales(e.id).forEach((s) => (s.log || []).forEach((l) => items.push({ ...l, src: "Ingreso · " + s.desc })));
    items.sort((a, b) => b.at.localeCompare(a.at));
    return items.length ? `<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Origen</th><th>Cambio</th></tr></thead><tbody>${items.map((i) => `<tr><td class="num">${fmtDate(i.at.slice(0, 10))} ${i.at.slice(11, 16)}</td><td>${esc(i.src)}</td><td>${esc(i.msg)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Sin cambios registrados.</p>'; },
};

function resultView(e, f) {
  const est = f.est; const s = est ? est.s : null;
  const rows = [
    ["Costo estimado al cotizar", s ? s.costTotalC : null], ["Presupuesto aprobado", f.budget], ["Gastos reales", f.expenses],
    ["Precio cotizado (sin impuestos)", s ? s.netC : null], ["Venta aceptada", est && est.v.status === "aceptada" ? s.netC : null],
    ["Ingreso reconocido", f.revenue], ["Facturado", f.invoiced], ["Cobrado", f.collected],
    ["Ganancia estimada al cotizar", s ? s.profitC : null], ["Resultado real", f.profit]];
  const costVar = s ? f.expenses - s.costTotalC : null, priceVar = s ? f.revenue - s.netC : null, profitVar = s ? f.profit - s.profitC : null;
  const alerts = [];
  if (s && f.expenses > s.costTotalC) alerts.push(`Los gastos reales superan el costo estimado en ${M(f.expenses - s.costTotalC)}.`);
  if (f.budget && f.expenses > f.budget) alerts.push(`El gasto supera el presupuesto aprobado en ${M(f.expenses - f.budget)}.`);
  if (s && s.marginBp !== null && f.marginBp !== null && f.marginBp < s.marginBp) alerts.push(`El margen real (${F.fmtPct(f.marginBp)}) es inferior al estimado (${F.fmtPct(s.marginBp)}).`);
  const v = (x, base) => x === null ? "—" : `${M(x)}${base ? ` (${F.fmtPct(F.ratioBp(x, base), "sin base")})` : ""}`;
  return `${alerts.map((a) => `<div class="banner err">${esc(a)}</div>`).join("")}
  <div class="grid g2"><div class="tablewrap"><table><thead><tr><th>Concepto</th><th class="n">Importe</th></tr></thead><tbody>
    ${rows.map(([k, x]) => `<tr><td>${k}</td><td class="n">${x === null ? '<span class="muted">—</span>' : money(x)}</td></tr>`).join("")}
    <tr><td>Margen estimado</td><td class="n">${s ? F.fmtPct(s.marginBp) : "—"}</td></tr><tr><td>Margen real</td><td class="n">${F.fmtPct(f.marginBp, "sin ingresos")}</td></tr></tbody></table></div>
  <div class="card"><h2>Variaciones</h2><dl class="kv"><dt>Variación de costos</dt><dd>${v(costVar, s && s.costTotalC)}</dd>
    <dt>Variación del precio de venta</dt><dd>${v(priceVar, s && s.netC)}</dd><dt>Pendiente de cobro</dt><dd>${M(F.sum(evSales(e.id), (x) => F.saleGross(x) - F.saleCollected(x)))}</dd>
    <dt>Variación de la utilidad</dt><dd>${v(profitVar, s && s.profitC)}</dd></dl>
    <p class="small muted">${est ? `Referencia: cotización ${esc(est.q.number)} versión ${est.v.v} (${esc(est.v.status)}). Los cambios en los gastos nunca modifican una cotización emitida.` : "Sin cotización emitida: no hay estimación de referencia."}</p></div></div>`;
}

/* ===================================================== presupuestos */
function budgetEditor(e) {
  const c = cfg(); const byCat = evExpByCat(e.id); const lines = e.budget || [];
  const cats = [...new Set([...lines.map((b) => b.cat), ...Object.keys(byCat)])];
  const tb = evBudget(e), ta = evExpenses(e.id), r = F.budgetRow(tb, ta, c);
  return `<div class="kpis">${kpi("Presupuesto inicial", money(evBudgetInitial(e)))}${kpi("Presupuesto revisado", money(tb))}${kpi("Gastos reales", money(ta))}
    ${kpi("Saldo", money(r.balance), `Ejecución ${F.fmtPct(r.execBp)}`)}${kpi("Variación", money(r.variance), F.fmtPct(r.varianceBp, "sin base"))}</div>
  <div class="tablewrap"><table><thead><tr><th>Categoría</th><th class="n">Inicial</th><th class="n">Revisado</th><th class="n">Real</th><th class="n">Saldo</th><th class="n">Ejecutado</th><th>Estado</th><th></th></tr></thead><tbody>
  ${cats.length ? cats.map((cat) => { const b = lines.find((x) => x.cat === cat) || { initialC: 0, revisedC: 0 }; const rr = F.budgetRow(b.revisedC, byCat[cat] || 0, c);
    return `<tr><td>${esc(cat)}${b.desc ? `<br><span class="small muted">${esc(b.desc)}</span>` : ""}</td><td class="n">${M(b.initialC)}</td><td class="n">${M(b.revisedC)}</td><td class="n">${M(rr.actual)}</td>
      <td class="n ${rr.balance < 0 ? "neg" : ""}">${M(rr.balance)}</td><td class="n">${F.fmtPct(rr.execBp)}</td><td>${pill(rr.light, LIGHT[rr.light])}</td>
      <td><button class="btn sm" data-act="edit-budget" data-ev="${e.id}" data-cat="${esc(cat)}">${lines.find((x) => x.cat === cat) ? "Revisar" : "Presupuestar"}</button></td></tr>`; }).join("")
    : `<tr><td colspan="8" class="muted">Sin categorías presupuestadas.</td></tr>`}</tbody></table></div>
  <div class="row"><button class="btn pri" data-act="edit-budget" data-ev="${e.id}" data-cat="">Agregar categoría</button></div>`;
}
ACT["edit-budget"] = (el) => {
  const e = get("events", el.dataset.ev); const cat = el.dataset.cat; const b = (e.budget || []).find((x) => x.cat === cat);
  const cats = cfg().categories.filter((c) => c === cat || !(e.budget || []).some((x) => x.cat === c));
  openModal(`<h2>${b ? "Revisar presupuesto" : "Presupuestar categoría"}</h2><form class="f" id="budget-form" data-ev="${e.id}" data-cat="${esc(cat)}">
    ${b ? `<input type="hidden" name="cat" value="${esc(cat)}"><p class="full"><b>${esc(cat)}</b> · inicial ${M(b.initialC)} · revisado ${M(b.revisedC)}</p>`
      : field("cat", "Categoría", sel("cat", [...cats.map((c) => [c, c]), ["__new", "Nueva categoría…"]], cat || cats[0]))}
    ${b ? "" : field("newcat", "Nombre de la categoría nueva", inp("newcat", ""), "Solo si elegiste «Nueva categoría»")}
    ${field("amount", b ? "Nuevo importe revisado" : "Importe presupuestado", moneyInp("amount", b ? b.revisedC : null, "required"))}
    ${field("desc", "Descripción", inp("desc", b ? b.desc : ""))}
    ${b ? field("reason", "Motivo del cambio", `<textarea id="reason" name="reason" required></textarea>`, "Queda en el historial", true) : ""}
    <p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Guardar</button></div></form>`);
};
SUBMIT["budget-form"] = async (form) => {
  const d = readForm(form); const e = get("events", form.dataset.ev); e.budget = e.budget || [];
  const amt = F.toCents(d.amount); if (amt === null || Number.isNaN(amt) || amt < 0) return formErr(form, "Escribe un importe válido (0 o más).");
  let cat = d.cat === "__new" ? d.newcat : d.cat; if (!cat) return formErr(form, "Elige o escribe una categoría.");
  const b = e.budget.find((x) => x.cat === cat);
  if (b && form.dataset.cat) { if (!d.reason) return formErr(form, "El motivo del cambio es obligatorio.");
    b.revisions = [...(b.revisions || []), { at: new Date().toISOString(), oldC: b.revisedC, newC: amt, reason: d.reason }]; b.revisedC = amt; b.desc = d.desc;
    addLog(e, `Presupuesto revisado (${cat})`);
  } else if (b) return formErr(form, "Esa categoría ya está presupuestada; usa Revisar.");
  else { e.budget.push({ cat, desc: d.desc, initialC: amt, revisedC: amt, revisions: [] }); addLog(e, `Presupuesto inicial ${cat}: ${M(amt)}`);
    if (d.cat === "__new") { const c = cfg(); if (!c.categories.includes(cat)) { c.categories.push(cat); await save("config", { id: "company", ...c }); } } }
  await save("events", e); closeModal(); toast("Presupuesto guardado.");
};
VIEWS.budgets = () => {
  const c = cfg(); const evs = all("events").sort((a, b) => b.start.localeCompare(a.start));
  const rows = evs.map((e) => ({ e, ...F.budgetRow(evBudget(e), evExpenses(e.id), c) }));
  return `<div class="topline"><div><h1>Presupuestos</h1><p>Presupuesto revisado frente a gasto real por evento · alerta amarilla desde ${F.bpToInput(c.warnBp)} %</p></div></div>
  ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Evento</th><th class="n">Presupuesto</th><th class="n">Gasto real</th><th class="n">Saldo</th><th class="n">Ejecución</th><th class="n">Variación</th><th>Estado</th></tr></thead><tbody>
    ${rows.map((r) => `<tr class="click" data-act="open-budget" data-id="${r.e.id}"><td><b>${esc(r.e.name)}</b><br><span class="small muted">${esc(r.e.code)} · ${fmtDate(r.e.start)}</span></td><td class="n">${M(r.budget)}</td><td class="n">${M(r.actual)}</td>
      <td class="n ${r.balance < 0 ? "neg" : ""}">${M(r.balance)}</td><td class="n">${F.fmtPct(r.execBp)}</td><td class="n">${F.fmtPct(r.varianceBp, "sin base")}</td><td>${pill(r.light, LIGHT[r.light])}</td></tr>`).join("")}
    </tbody><tfoot><tr><td>Total</td><td class="n">${M(F.sum(rows, (r) => r.budget))}</td><td class="n">${M(F.sum(rows, (r) => r.actual))}</td><td class="n">${M(F.sum(rows, (r) => r.balance))}</td><td colspan="3"></td></tr></tfoot></table></div>`
    : `<div class="card empty"><b>Sin presupuestos</b><p>Crea un evento y define su presupuesto por categorías.</p><button class="btn pri" data-act="new-event">Crear evento</button></div>`}`;
};
ACT["open-budget"] = (el) => go("eventDetail", { eventId: el.dataset.id, eventTab: "presupuesto" });

/* ===================================================== gastos */
function expensesTable(list, eid) {
  list = list.sort((a, b) => b.date.localeCompare(a.date));
  if (!list.length) return `<div class="card empty"><b>Sin gastos</b><p>Registra los gastos reales; los pendientes de pago también cuentan en la rentabilidad.</p></div>`;
  return `<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Descripción</th><th>Evento</th><th>Categoría</th><th class="n">Importe</th><th class="n">Pagado</th><th>Estado</th></tr></thead><tbody>
  ${list.map((x) => { const st = expStatus(x); const amt = eid && !x.eventId ? x.allocations[eid] : x.amountC;
    return `<tr class="click ${x.voided ? "void" : ""}" data-act="open-expense" data-id="${x.id}"><td class="num">${fmtDate(x.date)}</td><td>${esc(x.desc)}${x.supplier ? `<br><span class="small muted">${esc(x.supplier)}</span>` : ""}</td>
    <td>${x.eventId ? esc(evName(x.eventId)) : `Gasto general${x.allocations ? " (asignado)" : ""}`}</td><td>${esc(x.category)}</td><td class="n">${M(amt)}${eid && !x.eventId ? `<br><span class="small muted">de ${M(x.amountC)}</span>` : ""}</td>
    <td class="n">${M(expPaid(x))}</td><td>${x.voided ? pill("plain", "Anulado") : pill(STATUS_EXP[st][0], STATUS_EXP[st][1])}</td></tr>`; }).join("")}</tbody></table></div>`;
}
VIEWS.expenses = () => {
  const q = ui.expQ.toLowerCase();
  const list = all("expenses").filter((x) => (!ui.expEvent || (ui.expEvent === "_g" ? !x.eventId : x.eventId === ui.expEvent))
    && (!ui.expStatus || (ui.expStatus === "anulado" ? x.voided : !x.voided && expStatus(x) === ui.expStatus))
    && (!q || [x.desc, x.supplier, x.ref, x.category].join(" ").toLowerCase().includes(q)));
  const live = list.filter((x) => !x.voided);
  return `<div class="topline"><div><h1>Gastos</h1><p>${list.length} registros · ${M(F.sum(live, (x) => x.amountC))} reconocidos · ${M(F.sum(live, (x) => x.amountC - expPaid(x)))} pendientes de pago</p></div>
    <div class="bar"><button class="btn" data-act="export-expenses">Exportar CSV</button><button class="btn pri" data-act="new-expense">Registrar gasto</button></div></div>
  <div class="bar"><input id="exp-q" type="search" placeholder="Buscar descripción, proveedor, factura…" value="${esc(ui.expQ)}" data-chg="exp-filter" style="max-width:300px" aria-label="Buscar">
    ${sel("exp-ev", [["", "Todos"], ["_g", "Gastos generales"], ...evOpts().slice(1)], ui.expEvent, 'data-chg="exp-filter" aria-label="Evento" style="width:auto;max-width:240px"')}
    ${sel("exp-st", [["", "Todos los estados"], ["pendiente", "Pendiente"], ["parcial", "Parcial"], ["pagado", "Pagado"], ["anulado", "Anulado"]], ui.expStatus, 'data-chg="exp-filter" aria-label="Estado" style="width:auto"')}</div>
  ${expensesTable(list)}`;
};
CHG["exp-filter"] = (el) => { ui.expQ = document.getElementById("exp-q").value; ui.expEvent = document.getElementById("exp-ev").value; ui.expStatus = document.getElementById("exp-st").value;
  if (el.id === "exp-q") { clearTimeout(CHG._t); CHG._t = setTimeout(() => { render(); const i = document.getElementById("exp-q"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); } else render(); };
function expenseForm(x, evId) {
  const c = cfg(); x = x || { date: todayISO(), eventId: evId || "", category: c.categories[0], desc: "", supplier: "", qtyM: 1000, amountC: null, method: c.methods[0], ref: "", due: "", notes: "", payments: [] };
  return `<h2>${x.id ? "Editar gasto" : "Registrar gasto"}</h2><form class="f" id="exp-form" data-id="${x.id || ""}">
    ${field("date", "Fecha", inp("date", x.date, 'type="date" required'))}
    ${field("eventId", "Evento", sel("eventId", [["", "Gasto general de la empresa"], ...evOpts().slice(1)], x.eventId))}
    ${field("category", "Categoría", sel("category", c.categories.map((k) => [k, k]), x.category))}
    ${field("desc", "Descripción", inp("desc", x.desc, "required"), "", true)}
    ${field("supplier", "Proveedor", inp("supplier", x.supplier))}
    ${field("qty", "Cantidad", inp("qty", F.milliToStr(x.qtyM || 1000), 'inputmode="decimal"'))}
    ${field("amount", "Importe total", moneyInp("amount", x.amountC, "required"))}
    ${field("method", "Método de pago", sel("method", c.methods.map((k) => [k, k]), x.method))}
    ${field("ref", "N.º de factura o referencia", inp("ref", x.ref))}
    ${field("due", "Vencimiento", inp("due", x.due, 'type="date"'))}
    ${x.id ? "" : field("paid", "Pagado hoy", moneyInp("paid", null), "Déjalo vacío si está pendiente")}
    ${field("notes", "Observaciones", `<textarea id="notes" name="notes">${esc(x.notes)}</textarea>`, "", true)}
    <input type="hidden" name="key" value="${x.key || uid()}">
    <p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Guardar gasto</button></div></form>`;
}
ACT["new-expense"] = (el) => openModal(expenseForm(null, el.dataset.ev));
SUBMIT["exp-form"] = async (form) => {
  const d = readForm(form); const id = form.dataset.id;
  const amt = F.toCents(d.amount), qty = F.toMilli(d.qty || "1"), paid = d.paid ? F.toCents(d.paid) : 0;
  if (!d.desc) return formErr(form, "La descripción es obligatoria.");
  if (amt === null || Number.isNaN(amt) || amt < 0) return formErr(form, "Escribe un importe válido.");
  if (!(qty > 0)) return formErr(form, "La cantidad debe ser mayor que cero.");
  if (Number.isNaN(paid) || paid < 0 || paid > amt) return formErr(form, "El pago no puede ser negativo ni mayor que el importe.");
  // evita duplicar por doble envío: la clave del formulario identifica el registro
  if (!id && all("expenses").some((x) => x.key === d.key)) { closeModal(); return; }
  const prev = id ? get("expenses", id) : null;
  if (prev && amt < expPaid(prev)) return formErr(form, "El importe no puede ser menor que lo ya pagado.");
  const x = { ...(prev || { id: uid(), payments: [], createdAt: new Date().toISOString() }), date: d.date, eventId: d.eventId || null, category: d.category, desc: d.desc,
    supplier: d.supplier, qtyM: qty, amountC: amt, method: d.method, ref: d.ref, due: d.due, notes: d.notes, key: d.key };
  if (x.eventId) delete x.allocations;
  if (x.allocations && prev && prev.amountC !== amt) { delete x.allocations; addLog(x, "Asignación a eventos eliminada por cambio de importe"); }
  if (!prev && paid > 0) x.payments.push({ id: uid(), date: d.date, amountC: paid });
  addLog(x, prev ? `Gasto editado (importe ${M(prev.amountC)} → ${M(amt)})` : `Gasto registrado por ${M(amt)}`);
  await save("expenses", x); closeModal(); toast("Gasto guardado.");
};
ACT["open-expense"] = (el) => {
  const x = get("expenses", el.dataset.id); const st = expStatus(x);
  openModal(`<div class="spread"><h2>${esc(x.desc)}</h2>${x.voided ? pill("plain", "Anulado") : pill(STATUS_EXP[st][0], STATUS_EXP[st][1])}</div>
    <dl class="kv"><dt>Fecha</dt><dd>${fmtDate(x.date)}</dd><dt>Evento</dt><dd>${esc(x.eventId ? evName(x.eventId) : "Gasto general")}</dd><dt>Categoría</dt><dd>${esc(x.category)}</dd>
    <dt>Proveedor</dt><dd>${esc(x.supplier || "—")}</dd><dt>Cantidad</dt><dd>${F.milliToStr(x.qtyM || 1000)}</dd><dt>Referencia</dt><dd>${esc(x.ref || "—")}</dd><dt>Vencimiento</dt><dd>${fmtDate(x.due)}</dd>
    <dt>Importe</dt><dd>${M(x.amountC)}</dd><dt>Pagado</dt><dd>${M(expPaid(x))}</dd><dt class="tot">Pendiente</dt><dd class="tot">${M(x.amountC - expPaid(x))}</dd></dl>
    ${x.voided ? `<div class="banner err">Anulado: ${esc(x.voidReason)}</div>` : ""}
    ${x.allocations ? `<div class="card"><h3>Asignación a eventos (${esc(x.allocRule || "")})</h3><dl class="kv">${Object.entries(x.allocations).map(([k, v]) => `<dt>${esc(evName(k))}</dt><dd>${M(v)}</dd>`).join("")}</dl></div>` : ""}
    ${(x.payments || []).length ? `<h3>Pagos</h3><dl class="kv">${x.payments.map((p) => `<dt>${fmtDate(p.date)}</dt><dd>${M(p.amountC)}</dd>`).join("")}</dl>` : ""}
    ${x.attachment ? `<p>Comprobante: <a href="${esc(x.attachment.url)}" target="_blank" rel="noopener">${esc(x.attachment.name)}</a></p>` : ""}
    ${x.notes ? `<p class="small muted">${esc(x.notes)}</p>` : ""}
    ${x.voided ? "" : `<div class="row"><button class="btn" data-act="edit-expense" data-id="${x.id}">Editar</button>
      ${x.amountC - expPaid(x) > 0 ? `<button class="btn pri" data-act="pay-expense" data-id="${x.id}">Registrar pago</button>` : ""}
      ${!x.eventId ? `<button class="btn" data-act="alloc-expense" data-id="${x.id}">Asignar a eventos</button>` : ""}
      ${assets ? `<label class="btn" for="att-${x.id}">Adjuntar comprobante</label><input type="file" id="att-${x.id}" accept="image/*,application/pdf" data-chg="attach" data-id="${x.id}" hidden>` : ""}
      <button class="btn danger" data-act="void-expense" data-id="${x.id}">Anular</button></div>`}
    <div class="row" style="justify-content:flex-end"><button class="btn" data-act="close">Cerrar</button></div>`);
};
ACT["edit-expense"] = (el) => openModal(expenseForm(get("expenses", el.dataset.id)));
ACT["pay-expense"] = (el) => { const x = get("expenses", el.dataset.id);
  openModal(`<h2>Registrar pago</h2><p>${esc(x.desc)} · pendiente ${M(x.amountC - expPaid(x))}</p><form class="f" id="pay-form" data-id="${x.id}">
    ${field("date", "Fecha de pago", inp("date", todayISO(), 'type="date" required'))}${field("amount", "Importe pagado", moneyInp("amount", x.amountC - expPaid(x), "required"))}
    <input type="hidden" name="key" value="${uid()}"><p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Registrar pago</button></div></form>`); };
SUBMIT["pay-form"] = async (form) => { const d = readForm(form); const x = get("expenses", form.dataset.id); const a = F.toCents(d.amount);
  if (x.payments.some((p) => p.id === d.key)) { closeModal(); return; }
  if (!(a > 0) || a > x.amountC - expPaid(x)) return formErr(form, "El pago debe ser mayor que cero y no superar lo pendiente.");
  x.payments.push({ id: d.key, date: d.date, amountC: a }); addLog(x, `Pago registrado ${M(a)}`); await save("expenses", x); closeModal(); toast("Pago registrado."); };
ACT["void-expense"] = (el) => openModal(`<h2>Anular gasto</h2><p>El gasto deja de contar en los resultados, pero queda en el historial.</p><form class="f" id="void-form" data-id="${el.dataset.id}">
  ${field("reason", "Motivo", `<textarea id="reason" name="reason" required></textarea>`, "", true)}<p class="err form-err full" hidden></p>
  <div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Volver</button><button class="btn danger">Anular</button></div></form>`);
SUBMIT["void-form"] = async (form) => { const d = readForm(form); if (!d.reason) return formErr(form, "El motivo es obligatorio.");
  const x = get("expenses", form.dataset.id); x.voided = true; x.voidReason = d.reason; x.voidedAt = new Date().toISOString(); addLog(x, "Anulado: " + d.reason);
  await save("expenses", x); closeModal(); toast("Gasto anulado."); };
ACT["alloc-expense"] = (el) => { const x = get("expenses", el.dataset.id); const evs = all("events").filter((e) => e.status !== "cancelado").sort((a, b) => b.start.localeCompare(a.start));
  openModal(`<h2>Asignar gasto general</h2><p>${esc(x.desc)} · ${M(x.amountC)}. El importe se reparte sin duplicarse: la suma de las porciones es exactamente el gasto original.</p>
  <form class="f" id="alloc-form" data-id="${x.id}">${field("rule", "Regla", sel("rule", [["iguales", "Partes iguales"], ["pesos", "Por pesos que indiques"]], "iguales"), "", true)}
  <div class="full" style="display:flex;flex-direction:column;gap:6px">${evs.map((e) => `<label class="row" style="justify-content:space-between"><span class="row"><input type="checkbox" name="ev_${e.id}" ${x.allocations && x.allocations[e.id] ? "checked" : ""} style="width:auto;min-height:0">${esc(e.code)} · ${esc(e.name)}</span>
    <input name="w_${e.id}" value="1" inputmode="decimal" style="width:80px" aria-label="Peso"></label>`).join("")}</div>
  <p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Asignar</button></div></form>`); };
SUBMIT["alloc-form"] = async (form) => { const d = readForm(form); const x = get("expenses", form.dataset.id); const w = {};
  Object.keys(d).filter((k) => k.startsWith("ev_") && d[k]).forEach((k) => { const id = k.slice(3); const wt = d.rule === "iguales" ? 1000 : F.toMilli(d["w_" + id]); if (wt > 0) w[id] = wt; });
  if (!Object.keys(w).length) return formErr(form, "Elige al menos un evento con peso positivo.");
  x.allocations = F.allocate(x.amountC, w); x.allocRule = d.rule === "iguales" ? "partes iguales" : "por pesos"; addLog(x, `Asignado a ${Object.keys(w).length} eventos (${x.allocRule})`);
  await save("expenses", x); closeModal(); toast("Gasto asignado a eventos."); };
CHG.attach = async (el) => { const file = el.files[0]; if (!file || !assets) return; const x = get("expenses", el.dataset.id);
  try { const r = await assets.upload(file); x.attachment = { id: r.id, url: r.url, name: file.name }; addLog(x, "Comprobante adjunto: " + file.name); await save("expenses", x); closeModal(); toast("Comprobante adjunto."); }
  catch (e) { toast("No se pudo adjuntar: " + (e.message || e.code || "error")); } };
ACT["export-expenses"] = () => offerDownload(`gastos_${todayISO()}.csv`, csv([["Fecha", "Evento", "Categoría", "Descripción", "Proveedor", "Cantidad", "Importe", "Pagado", "Pendiente", "Estado", "Método", "Referencia", "Vencimiento", "Anulado", "Motivo anulación"],
  ...all("expenses").sort((a, b) => a.date.localeCompare(b.date)).map((x) => [x.date, x.eventId ? evName(x.eventId) : "General", x.category, x.desc, x.supplier, F.milliToStr(x.qtyM || 1000), centsCsv(x.amountC), centsCsv(expPaid(x)),
    centsCsv(x.amountC - expPaid(x)), x.voided ? "anulado" : expStatus(x), x.method, x.ref, x.due, x.voided ? "sí" : "no", x.voidReason || ""])]));
