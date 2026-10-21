/* ===================================================== ahorro */
function savingsTable(list) {
  list = list.sort((a, b) => b.date.localeCompare(a.date));
  if (!list.length) return '<p class="muted small">Sin movimientos de ahorro.</p>';
  return `<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Reserva</th><th>Tipo</th><th>Origen / nota</th><th class="n">Importe</th></tr></thead><tbody>
  ${list.map((m) => `<tr><td class="num">${fmtDate(m.date)}</td><td>${esc(S.goals[m.goalId] ? S.goals[m.goalId].name : "—")}</td><td>${m.kind === "aporte" ? pill("good", "Aporte") : pill("warn", "Retiro")}</td>
    <td>${esc(m.eventId ? evName(m.eventId) : "")}${m.note ? `<br><span class="small muted">${esc(m.note)}</span>` : ""}</td><td class="n">${m.kind === "aporte" ? "" : "−"}${M(m.amountC)}</td></tr>`).join("")}</tbody></table></div>`;
}
VIEWS.savings = () => {
  const goals = all("goals"); const c = cfg(); const ym = monthOf(todayISO()); const R = monthR(ym);
  const inM = all("savings").filter((m) => inR(m.date, R)); const ins = F.sum(inM.filter((m) => m.kind === "aporte"), (m) => m.amountC), outs = F.sum(inM.filter((m) => m.kind === "retiro"), (m) => m.amountC);
  const months = []; let m = ym; for (let i = 0; i < 6; i++) { months.unshift(m); m = prevMonth(m); }
  const pf = periodFacts(R); const prop = F.proposeSavings(pf.profit, c.savingsRuleBp);
  return `<div class="topline"><div><h1>Ahorro</h1><p>Reservas internas de fondos. El ahorro no es un gasto operativo.</p></div>
    <div class="bar"><button class="btn" data-act="new-goal">Nueva reserva</button><button class="btn" data-act="new-withdraw" ${goals.length ? "" : "disabled"}>Registrar retiro</button><button class="btn pri" data-act="new-saving" ${goals.length ? "" : "disabled"}>Registrar aporte</button></div></div>
  <div class="kpis">${kpi("Saldo total", money(savingsBalance()), "", "hero")}${kpi("Aportes del mes", money(ins), ymLabel(ym, true))}${kpi("Retiros del mes", money(outs))}${kpi("Caja disponible para reservar", money(cashAvailable()), "Cobros − pagos − reservas")}</div>
  <div class="card"><div class="spread"><div><h2>Propuesta del mes</h2><p class="small muted">Utilidad de ${ymLabel(ym, true)}: ${M(pf.profit)} · regla ${F.bpToInput(c.savingsRuleBp)} % · propuesta ${M(prop)}</p></div>
    <button class="btn pri" data-act="new-saving" data-amt="${prop}" data-note="Regla ${F.bpToInput(c.savingsRuleBp)} % de la utilidad de ${ymLabel(ym, true)}" ${prop > 0 && goals.length ? "" : "disabled"}>Revisar y aplicar</button></div></div>
  ${goals.length ? `<div class="grid g3">${goals.map((g) => { const b = savingsBalance(g.id); const p = g.targetC ? F.ratioBp(b, g.targetC) : null;
    return `<div class="card"><div class="spread"><h3>${esc(g.name)}</h3><button class="btn ghost sm" data-act="edit-goal" data-id="${g.id}">Editar</button></div><p class="small muted">${esc(g.purpose || "")}</p>
      <div class="spread"><b class="num" style="font-size:1.15rem">${M(b)}</b><span class="small muted">${g.targetC ? "Meta " + M(g.targetC) : "Sin meta"}</span></div>
      ${g.targetC ? `<div class="progress" style="margin-top:6px"><i style="width:${Math.min(100, Math.max(0, (p || 0) / 100))}%"></i></div><p class="small muted">${F.fmtPct(p)} de avance</p>` : ""}</div>`; }).join("")}</div>`
    : `<div class="card empty"><b>Crea tu primera reserva</b><p>Por ejemplo: fondo de emergencia, compra de equipos o capital de trabajo.</p><button class="btn pri" data-act="new-goal">Nueva reserva</button></div>`}
  <div class="card"><h2>Evolución del saldo</h2>${lineChart(months.map((x) => ymLabel(x)), months.map((x) => savingsBalance(null, monthEnd(x))), "var(--s3)", "Saldo de ahorro")}</div>
  <h2>Movimientos</h2>${savingsTable(all("savings"))}`;
};
const GOAL_SUG = ["Fondo de emergencia", "Reinversión", "Compra de equipos", "Nuevos eventos", "Capital de trabajo"];
function goalForm(g) { g = g || { name: "", purpose: "", targetC: null };
  return `<h2>${g.id ? "Editar reserva" : "Nueva reserva"}</h2><form class="f" id="goal-form" data-id="${g.id || ""}">
  ${field("name", "Nombre", `<input id="name" name="name" list="goal-sug" value="${esc(g.name)}" required><datalist id="goal-sug">${GOAL_SUG.map((x) => `<option value="${x}">`).join("")}</datalist>`)}
  ${field("target", "Meta", moneyInp("target", g.targetC), "Opcional")}${field("purpose", "Objetivo", `<textarea id="purpose" name="purpose">${esc(g.purpose)}</textarea>`, "", true)}
  <p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Guardar</button></div></form>`; }
ACT["new-goal"] = () => openModal(goalForm()); ACT["edit-goal"] = (el) => openModal(goalForm(get("goals", el.dataset.id)));
SUBMIT["goal-form"] = async (form) => { const d = readForm(form); const t = d.target ? F.toCents(d.target) : null;
  if (!d.name) return formErr(form, "El nombre es obligatorio."); if (t !== null && !(t > 0)) return formErr(form, "La meta debe ser mayor que cero.");
  const id = form.dataset.id || uid(); if (all("goals").some((g) => g.name.toLowerCase() === d.name.toLowerCase() && g.id !== id)) return formErr(form, "Ya existe una reserva con ese nombre.");
  await save("goals", { ...(get("goals", id) || {}), id, name: d.name, purpose: d.purpose, targetC: t }); closeModal(); toast("Reserva guardada."); };
ACT["new-saving"] = (el) => { const goals = all("goals"); if (!goals.length) { toast("Primero crea una reserva."); return go("savings"); }
  openModal(`<h2>Registrar aporte</h2><p class="small muted">Revisa el importe antes de confirmarlo. Caja disponible para reservar: <b>${M(cashAvailable())}</b>.</p>
  <form class="f" id="sav-form" data-kind="aporte">${field("goalId", "Reserva", sel("goalId", goals.map((g) => [g.id, g.name]), goals[0].id))}
  ${field("amount", "Importe", moneyInp("amount", el.dataset.amt ? Number(el.dataset.amt) : null, "required"))}${field("date", "Fecha", inp("date", todayISO(), 'type="date"'))}
  ${field("eventId", "Evento de origen", sel("eventId", evOpts("Ninguno"), el.dataset.ev || ""))}${field("note", "Nota", inp("note", el.dataset.note || ""), "", true)}
  <input type="hidden" name="key" value="${uid()}"><p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Confirmar aporte</button></div></form>`); };
ACT["new-withdraw"] = () => { const goals = all("goals");
  openModal(`<h2>Registrar retiro</h2><form class="f" id="sav-form" data-kind="retiro">${field("goalId", "Reserva", sel("goalId", goals.map((g) => [g.id, `${g.name} (${M(savingsBalance(g.id))})`]), goals[0].id))}
  ${field("amount", "Importe", moneyInp("amount", null, "required"))}${field("date", "Fecha", inp("date", todayISO(), 'type="date"'))}${field("note", "Motivo", inp("note", ""), "", true)}
  <input type="hidden" name="key" value="${uid()}"><p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Confirmar retiro</button></div></form>`); };
SUBMIT["sav-form"] = async (form) => { const d = readForm(form); const kind = form.dataset.kind; const a = F.toCents(d.amount);
  if (S.savings[d.key]) { closeModal(); return; }
  if (!(a > 0)) return formErr(form, "El importe debe ser mayor que cero.");
  if (kind === "aporte" && a > cashAvailable()) return formErr(form, `No puedes reservar más que la caja disponible (${M(cashAvailable())}).`);
  if (kind === "retiro" && a > savingsBalance(d.goalId)) return formErr(form, "El retiro supera el saldo de la reserva.");
  await save("savings", { id: d.key, kind, goalId: d.goalId, amountC: a, date: d.date, eventId: d.eventId || null, note: d.note, confirmedAt: new Date().toISOString() });
  closeModal(); toast(kind === "aporte" ? "Aporte reservado." : "Retiro registrado."); };

/* ===================================================== accionistas */
VIEWS.shareholders = () => {
  const hs = all("shareholders").sort((a, b) => b.bp - a.bp); const today = todayISO(); const tot = F.sum(F.effectiveHolders(hs, today), (h) => h.bp);
  const from = ui.distFrom || monthOf(today) + "-01", to = ui.distTo || monthEnd(monthOf(today)); const R = { from, to };
  const pf = periodFacts(R); const prevDist = F.sum(all("distributions").filter((d) => d.status === "aprobada" && d.from <= to && d.to >= from), (d) => d.distributedC);
  const dists = all("distributions").sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return `<div class="topline"><div><h1>Accionistas</h1><p>Participaciones vigentes hoy: <b>${F.bpToInput(tot)} %</b></p></div><button class="btn pri" data-act="new-holder">Agregar accionista</button></div>
  ${tot !== 10000 && hs.length ? `<div class="banner err">Las participaciones vigentes suman ${F.bpToInput(tot)} %. Deben sumar 100 % para habilitar una distribución.</div>` : ""}
  ${hs.length ? `<div class="tablewrap"><table><thead><tr><th>Código</th><th>Nombre</th><th class="n">Participación</th><th>Desde</th><th>Hasta</th><th>Estado</th><th class="n">Pagado</th><th></th></tr></thead><tbody>
    ${hs.map((h) => `<tr><td>${esc(h.code)}</td><td>${esc(h.name)}</td><td class="n">${F.bpToInput(h.bp)} %</td><td>${fmtDate(h.start)}</td><td>${fmtDate(h.end)}</td><td>${F.effectiveHolders([h], today).length ? pill("good", "Vigente") : pill("plain", "No vigente")}</td>
    <td class="n">${M(F.sum(all("distributions").filter((d) => d.status === "aprobada"), (d) => F.sum(d.lines.filter((l) => l.shId === h.id), (l) => F.sum(l.payments || [], (p) => p.amountC))))}</td>
    <td><button class="btn sm" data-act="edit-holder" data-id="${h.id}">Editar</button></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="card empty"><b>Sin accionistas</b><p>Registra a cada socio con su porcentaje; deben sumar 100 %.</p></div>`}
  <div class="card"><h2>Calcular distribución</h2><div class="bar"><label class="small" for="d-from">Desde</label><input type="date" id="d-from" value="${from}" data-chg="dist" style="width:auto">
    <label class="small" for="d-to">Hasta</label><input type="date" id="d-to" value="${to}" data-chg="dist" style="width:auto"></div>
    <form class="f" id="dist-form" data-from="${from}" data-to="${to}" style="margin-top:12px">
    <div class="fld full"><dl class="kv"><dt>Ingresos reconocidos</dt><dd>${M(pf.revenue)}</dd><dt>Gastos operativos reconocidos</dt><dd>−${M(pf.expenses)}</dd><dt class="tot">Utilidad operativa</dt><dd class="tot">${M(pf.profit)}</dd>
      <dt>Ahorro aprobado en el período</dt><dd>−${M(Math.max(pf.savedIn, 0))}</dd><dt>Ya distribuido en el período</dt><dd>−${M(prevDist)}</dd></dl></div>
    ${field("other", "Otras reservas aprobadas", moneyInp("other", 0))}${field("oblig", "Impuestos u obligaciones aún no registradas", moneyInp("oblig", 0), "No incluyas lo que ya está registrado como gasto")}
    ${field("amount", "Importe a distribuir", moneyInp("amount", null), "Vacío = todo lo disponible")}
    <p class="err form-err full" hidden></p><div class="row full"><button class="btn pri">Calcular propuesta</button></div></form></div>
  <h2>Historial de distribuciones</h2>
  ${dists.length ? dists.map((d) => `<div class="card"><div class="spread"><div><h3>${fmtDate(d.from)} – ${fmtDate(d.to)}</h3><span class="small muted">Disponible ${M(d.availableC)} · distribuido ${M(d.distributedC)} · aprobada ${fmtDate((d.approvedAt || "").slice(0, 10))}</span></div>${pill("good", "Aprobada")}</div>
    <div class="tablewrap" style="margin-top:8px"><table><thead><tr><th>Accionista</th><th class="n">%</th><th class="n">Aprobado</th><th class="n">Pagado</th><th class="n">Pendiente</th><th></th></tr></thead><tbody>
    ${d.lines.map((l, i) => { const paid = F.sum(l.payments || [], (p) => p.amountC); return `<tr><td>${esc(l.name)}</td><td class="n">${F.bpToInput(l.bp)} %</td><td class="n">${M(l.amountC)}</td><td class="n">${M(paid)}</td><td class="n">${M(l.amountC - paid)}</td>
      <td>${l.amountC - paid > 0 ? `<button class="btn sm" data-act="pay-holder" data-id="${d.id}" data-i="${i}">Registrar pago</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div></div>`).join("") : '<p class="muted small">Todavía no hay distribuciones aprobadas.</p>'}`;
};
CHG.dist = () => { ui.distFrom = document.getElementById("d-from").value; ui.distTo = document.getElementById("d-to").value; render(); };
function holderForm(h) { h = h || { code: "ACC-" + String(all("shareholders").length + 1).padStart(2, "0"), name: "", bp: null, start: todayISO(), end: "", active: true };
  return `<h2>${h.id ? "Editar accionista" : "Agregar accionista"}</h2><p class="small muted">Los cambios de porcentaje no alteran distribuciones ya aprobadas: cada una guarda los porcentajes vigentes al aprobarla.</p>
  <form class="f" id="holder-form" data-id="${h.id || ""}">${field("name", "Nombre", inp("name", h.name, "required"))}${field("code", "Identificador interno", inp("code", h.code, "required"))}
  ${field("pct", "Participación (%)", inp("pct", h.bp === null ? "" : F.bpToInput(h.bp), 'inputmode="decimal" required'))}${field("start", "Inicio de participación", inp("start", h.start, 'type="date" required'))}
  ${field("end", "Fin de participación", inp("end", h.end, 'type="date"'), "Opcional")}${field("active", "Estado", sel("active", [["1", "Activo"], ["0", "Inactivo"]], h.active === false ? "0" : "1"))}
  <p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Guardar</button></div></form>`; }
ACT["new-holder"] = () => openModal(holderForm()); ACT["edit-holder"] = (el) => openModal(holderForm(get("shareholders", el.dataset.id)));
SUBMIT["holder-form"] = async (form) => { const d = readForm(form); const bp = F.toBp(d.pct); const id = form.dataset.id || uid();
  if (!d.name) return formErr(form, "El nombre es obligatorio."); if (!(bp > 0 && bp <= 10000)) return formErr(form, "La participación debe estar entre 0 y 100 %.");
  if (all("shareholders").some((h) => h.code === d.code && h.id !== id)) return formErr(form, "Ese identificador ya existe.");
  if (d.end && d.end < d.start) return formErr(form, "La fecha de fin no puede ser anterior al inicio.");
  const others = F.sum(F.effectiveHolders(all("shareholders").filter((h) => h.id !== id), todayISO()), (h) => h.bp);
  await save("shareholders", { id, name: d.name, code: d.code, bp, start: d.start, end: d.end, active: d.active === "1" }); closeModal();
  toast(others + bp > 10000 ? `Guardado. Atención: las participaciones vigentes suman ${F.bpToInput(others + bp)} %.` : "Accionista guardado."); };
SUBMIT["dist-form"] = async (form) => { const d = readForm(form); const from = form.dataset.from, to = form.dataset.to; const pf = periodFacts({ from, to });
  const other = F.toCents(d.other || "0"), oblig = F.toCents(d.oblig || "0"); if (!(other >= 0) || !(oblig >= 0)) return formErr(form, "Las reservas y obligaciones no pueden ser negativas.");
  const prevDist = F.sum(all("distributions").filter((x) => x.status === "aprobada" && x.from <= to && x.to >= from), (x) => x.distributedC);
  const base = F.distributable(pf.profit, Math.max(pf.savedIn, 0), other, oblig); const avail = Math.max(base.availableC - prevDist, 0);
  const amt = d.amount ? F.toCents(d.amount) : null; let p;
  try { p = F.proposeDistribution(avail, all("shareholders"), to, amt); } catch (e) { return formErr(form, e.message); }
  if (p.distributedC <= 0) return formErr(form, "No hay utilidad disponible para distribuir en este período.");
  const prop = { id: uid(), from, to, opC: pf.profit, savingsC: Math.max(pf.savedIn, 0), otherC: other, obligC: oblig, prevDistC: prevDist, availableC: avail, distributedC: p.distributedC, lines: p.lines, createdAt: new Date().toISOString() };
  ui.pendingDist = prop;
  confirmBox("Aprobar distribución", `<dl class="kv"><dt>Utilidad operativa</dt><dd>${M(prop.opC)}</dd><dt>Ahorro aprobado</dt><dd>−${M(prop.savingsC)}</dd><dt>Otras reservas</dt><dd>−${M(other)}</dd><dt>Obligaciones no registradas</dt><dd>−${M(oblig)}</dd>
    <dt>Ya distribuido</dt><dd>−${M(prevDist)}</dd><dt class="tot">Disponible</dt><dd class="tot">${M(avail)}</dd></dl>
    <div class="tablewrap" style="margin-top:10px"><table><thead><tr><th>Accionista</th><th class="n">%</th><th class="n">Importe</th></tr></thead><tbody>${p.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="n">${F.bpToInput(l.bp)} %</td><td class="n">${M(l.amountC)}</td></tr>`).join("")}</tbody></table></div>
    <p class="small muted">Al aprobarla queda registrada con los porcentajes actuales y no puede modificarse. Los pagos se registran aparte.</p>`, "Aprobar distribución", async () => {
    const x = ui.pendingDist; ui.pendingDist = null; x.status = "aprobada"; x.approvedAt = new Date().toISOString(); await save("distributions", x); toast("Distribución aprobada."); }); };
ACT["pay-holder"] = (el) => { const d = get("distributions", el.dataset.id); const l = d.lines[Number(el.dataset.i)]; const rem = l.amountC - F.sum(l.payments || [], (p) => p.amountC);
  openModal(`<h2>Pago a ${esc(l.name)}</h2><p class="small muted">Pendiente ${M(rem)} · caja disponible ${M(cashAvailable())}</p><form class="f" id="shpay-form" data-id="${d.id}" data-i="${el.dataset.i}">
  ${field("date", "Fecha", inp("date", todayISO(), 'type="date"'))}${field("amount", "Importe pagado", moneyInp("amount", rem, "required"))}<input type="hidden" name="key" value="${uid()}">
  <p class="err form-err full" hidden></p><div class="row full" style="justify-content:flex-end"><button type="button" class="btn" data-act="close">Cancelar</button><button class="btn pri">Registrar pago</button></div></form>`); };
SUBMIT["shpay-form"] = async (form) => { const d = readForm(form); const x = get("distributions", form.dataset.id); const l = x.lines[Number(form.dataset.i)]; const a = F.toCents(d.amount);
  l.payments = l.payments || []; if (l.payments.some((p) => p.id === d.key)) { closeModal(); return; }
  const rem = l.amountC - F.sum(l.payments, (p) => p.amountC);
  if (!(a > 0) || a > rem) return formErr(form, "El pago debe ser positivo y no superar lo pendiente.");
  if (a > cashAvailable()) return formErr(form, `La caja disponible (${M(cashAvailable())}) no alcanza para este pago.`);
  l.payments.push({ id: d.key, date: d.date, amountC: a }); await save("distributions", x); closeModal(); toast("Pago registrado."); };

/* ===================================================== comparativos */
const CMP_METRICS = [["events", "Número de eventos", "n"], ["revenue", "Ingresos", "m"], ["expenses", "Gastos reales", "m"], ["budget", "Presupuesto aprobado", "m"], ["evExp", "Gasto real de esos eventos", "m"],
  ["profit", "Utilidad", "m"], ["marginBp", "Margen", "p"], ["savedIn", "Ahorro", "m"], ["qIssued", "Cotizaciones emitidas", "n"], ["qAccepted", "Cotizaciones aceptadas", "n"],
  ["quoted", "Importe cotizado", "m"], ["invoiced", "Importe facturado", "m"], ["collected", "Dinero cobrado", "m"], ["receivable", "Cuentas por cobrar", "m"], ["avg", "Ingreso promedio por evento", "m"]];
VIEWS.compare = () => {
  const A = periodFacts(monthR(ui.cmpA)), B = periodFacts(monthR(ui.cmpB));
  [A, B].forEach((x) => (x.avg = x.events ? F.rdiv(x.revenue, x.events) : null));
  const fmt = (v, t) => v === null || v === undefined ? "—" : t === "m" ? M(v) : t === "p" ? F.fmtPct(v, "—") : String(v);
  const rows = CMP_METRICS.map(([k, l, t]) => { let delta, dp;
    if (t === "p") { delta = A[k] === null || B[k] === null ? null : B[k] - A[k]; dp = null; } else { const vv = F.variation(A[k], B[k]); delta = vv.delta; dp = vv.deltaBp; }
    return `<tr><td>${l}</td><td class="n">${fmt(A[k], t)}</td><td class="n">${fmt(B[k], t)}</td><td class="n ${delta < 0 ? "neg" : ""}">${delta === null ? "—" : t === "m" ? M(delta) : t === "p" ? `${F.bpToInput(delta)} pts` : (delta > 0 ? "+" : "") + delta}</td>
      <td class="n">${t === "p" ? "—" : dp === null ? '<span class="muted">Sin base de comparación</span>' : F.fmtPct(dp)}</td></tr>`; }).join("");
  const nuevos = [...B.evNames].filter((n) => !A.evNames.has(n)), noRep = [...A.evNames].filter((n) => !B.evNames.has(n));
  const alerts = []; if (A.marginBp !== null && B.marginBp !== null && A.marginBp - B.marginBp >= 500) alerts.push(`Caída de rentabilidad: el margen bajó ${F.bpToInput(A.marginBp - B.marginBp)} puntos.`);
  if (B.profit < 0) alerts.push(`${ymLabel(ui.cmpB, true)} presenta pérdida.`);
  const evB = all("events").filter((e) => inR(e.start, monthR(ui.cmpB)) && e.status !== "cancelado").map(evFacts);
  const byProfit = [...evB].sort((a, b) => b.profit - a.profit), byMargin = [...evB].sort((a, b) => (a.marginBp === null) - (b.marginBp === null) || (b.marginBp || 0) - (a.marginBp || 0));
  const ea = S.events[ui.cmpEvA], eb = S.events[ui.cmpEvB]; const fa = ea && evFacts(ea), fb = eb && evFacts(eb);
  return `<div class="topline"><div><h1>Comparativos</h1><p>Cada fila compara la misma métrica: lo cotizado nunca se compara con lo cobrado.</p></div>
    <div class="bar"><label class="small" for="c-a">Período anterior</label><input type="month" id="c-a" value="${ui.cmpA}" data-chg="cmp" style="width:auto"><label class="small" for="c-b">Período actual</label><input type="month" id="c-b" value="${ui.cmpB}" data-chg="cmp" style="width:auto"></div></div>
  ${alerts.map((a) => `<div class="banner err">${esc(a)}</div>`).join("")}
  <div class="grid charts"><div class="card"><h2>Ingresos, gastos y utilidad</h2>${barChart(["Ingresos", "Gastos", "Utilidad"], [{ name: ymLabel(ui.cmpA, true), color: "var(--s3)", values: [A.revenue, A.expenses, A.profit] }, { name: ymLabel(ui.cmpB, true), color: "var(--s1)", values: [B.revenue, B.expenses, B.profit] }], { label: "Comparación mensual" })}</div>
    <div class="card"><h2>Eventos</h2><dl class="kv"><dt>Eventos nuevos en ${ymLabel(ui.cmpB)}</dt><dd>${nuevos.length}</dd></dl><p class="small">${nuevos.map(esc).join(", ") || "—"}</p>
      <dl class="kv"><dt>Eventos que no se repitieron</dt><dd>${noRep.length}</dd></dl><p class="small">${noRep.map(esc).join(", ") || "—"}</p>
      <p class="small muted">Se identifican por nombre. Usa la comparación entre eventos para revisar eventos similares.</p></div></div>
  <div class="tablewrap"><table><thead><tr><th>Métrica</th><th class="n">${ymLabel(ui.cmpA, true)}</th><th class="n">${ymLabel(ui.cmpB, true)}</th><th class="n">Variación</th><th class="n">Variación %</th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="grid g2"><div class="card"><h2>Ranking por utilidad · ${ymLabel(ui.cmpB)}</h2>${hbars(byProfit.map((f) => ({ label: f.ev.name, value: f.profit, text: M(f.profit) })))}</div>
    <div class="card"><h2>Ranking por margen · ${ymLabel(ui.cmpB)}</h2>${hbars(byMargin.filter((f) => f.marginBp !== null).map((f) => ({ label: f.ev.name, value: f.marginBp, text: F.fmtPct(f.marginBp), color: "var(--s3)" })), { empty: "Sin eventos con ingresos en el período." })}</div></div>
  <div class="card"><h2>Comparar dos eventos</h2><div class="bar">${sel("c-ea", evOpts("Elige un evento"), ui.cmpEvA, 'data-chg="cmpev" aria-label="Evento A" style="width:auto;max-width:280px"')}${sel("c-eb", evOpts("Elige un evento"), ui.cmpEvB, 'data-chg="cmpev" aria-label="Evento B" style="width:auto;max-width:280px"')}</div>
    ${fa && fb ? `${fa.ev.kind && fb.ev.kind && fa.ev.kind.toLowerCase() !== fb.ev.kind.toLowerCase() ? `<p class="small muted">Atención: son eventos de tipos distintos (${esc(fa.ev.kind)} / ${esc(fb.ev.kind)}).</p>` : ""}
      <div class="tablewrap" style="margin-top:8px"><table><thead><tr><th>Métrica</th><th class="n">${esc(fa.ev.name)}</th><th class="n">${esc(fb.ev.name)}</th><th class="n">Variación %</th></tr></thead><tbody>
      ${[["Presupuesto", "budget"], ["Gastos reales", "expenses"], ["Ingresos", "revenue"], ["Utilidad", "profit"], ["Cobrado", "collected"]].map(([l, k]) => `<tr><td>${l}</td><td class="n">${M(fa[k])}</td><td class="n">${M(fb[k])}</td><td class="n">${F.fmtPct(F.variation(fa[k], fb[k]).deltaBp, "Sin base de comparación")}</td></tr>`).join("")}
      <tr><td>Margen</td><td class="n">${F.fmtPct(fa.marginBp, "—")}</td><td class="n">${F.fmtPct(fb.marginBp, "—")}</td><td class="n">—</td></tr></tbody></table></div>` : '<p class="small muted">Elige dos eventos para compararlos.</p>'}</div>`;
};
CHG.cmp = () => { ui.cmpA = document.getElementById("c-a").value || ui.cmpA; ui.cmpB = document.getElementById("c-b").value || ui.cmpB; render(); };
CHG.cmpev = () => { ui.cmpEvA = document.getElementById("c-ea").value; ui.cmpEvB = document.getElementById("c-eb").value; render(); };

/* ===================================================== reportes */
VIEWS.reports = () => {
  const R = rangeFromFilter(ui.filter), eid = ui.filter.eventId; const p = periodFacts(R, eid);
  return `<div class="topline"><div><h1>Reportes</h1><p>${esc(R.label)}${eid ? " · " + esc(evName(eid)) : ""}</p></div>${filterBar()}</div>
  <div class="grid g2"><div class="card"><h2>Reporte financiero interno (PDF)</h2><p class="small">Resumen, presupuesto frente a gastos, cotizaciones, rentabilidad por evento, ingresos y cobros, ahorro y distribuciones. Incluye costos y márgenes: es solo para uso interno.</p>
    <button class="btn pri" data-act="report-pdf">Generar PDF interno</button></div>
    <div class="card"><h2>Exportar datos (CSV)</h2><p class="small">Se abren en Excel, Numbers o Google Sheets.</p><div class="row">
      <button class="btn" data-act="export-events">Eventos y resultados</button><button class="btn" data-act="export-expenses">Gastos</button><button class="btn" data-act="export-sales">Ingresos y cobros</button>
      <button class="btn" data-act="export-savings">Ahorro</button><button class="btn" data-act="export-dist">Distribuciones</button><button class="btn" data-act="export-quotes">Cotizaciones</button></div></div></div>
  <div class="kpis">${kpi("Ingresos", money(p.revenue))}${kpi("Gastos", money(p.expenses))}${kpi("Utilidad", money(p.profit), F.fmtPct(p.marginBp, "sin ingresos"))}${kpi("Cobrado", money(p.collected))}${kpi("Por cobrar", money(p.receivable))}${kpi("Ahorro del período", money(p.savedIn))}</div>`;
};
ACT["export-events"] = () => offerDownload(`eventos_${todayISO()}.csv`, csv([["Código", "Evento", "Tipo", "Cliente", "Inicio", "Fin", "Estado", "Presupuesto", "Gastos reales", "Ingresos", "Utilidad", "Margen %", "Facturado", "Cobrado"],
  ...all("events").map((e) => { const f = evFacts(e); return [e.code, e.name, e.kind, e.client, e.start, e.end, e.status, centsCsv(f.budget), centsCsv(f.expenses), centsCsv(f.revenue), centsCsv(f.profit), f.marginBp === null ? "" : F.bpToInput(f.marginBp), centsCsv(f.invoiced), centsCsv(f.collected)]; })]));
ACT["export-savings"] = () => offerDownload(`ahorro_${todayISO()}.csv`, csv([["Fecha", "Reserva", "Tipo", "Importe", "Evento", "Nota"], ...all("savings").map((m) => [m.date, S.goals[m.goalId] ? S.goals[m.goalId].name : "", m.kind, centsCsv(m.amountC), m.eventId ? evName(m.eventId) : "", m.note])]));
ACT["export-dist"] = () => offerDownload(`distribuciones_${todayISO()}.csv`, csv([["Desde", "Hasta", "Aprobada", "Disponible", "Accionista", "%", "Aprobado", "Pagado"],
  ...all("distributions").flatMap((d) => d.lines.map((l) => [d.from, d.to, (d.approvedAt || "").slice(0, 10), centsCsv(d.availableC), l.name, F.bpToInput(l.bp), centsCsv(l.amountC), centsCsv(F.sum(l.payments || [], (p) => p.amountC))]))]));
ACT["export-quotes"] = () => offerDownload(`cotizaciones_${todayISO()}.csv`, csv([["Número", "Versión", "Estado", "Emisión", "Cliente", "Evento", "Costo interno", "Venta sin impuestos", "Impuestos", "Total cliente", "Ganancia estimada"],
  ...all("quotes").flatMap((q) => q.versions.map((v) => { const s = F.computeQuote(v); return [q.number, v.v, v.status, v.issuedOn, v.client.name, q.eventId ? evName(q.eventId) : "", centsCsv(s.costTotalC), centsCsv(s.netC), centsCsv(s.taxC), centsCsv(s.totalC), centsCsv(s.profitC)]; }))]));
ACT["report-pdf"] = async () => {
  if (!window.PDFLib) return toast("No se pudo cargar el generador de PDF.");
  const R = rangeFromFilter(ui.filter), eid = ui.filter.eventId; const p = periodFacts(R, eid); const c = cfg();
  const r2 = (label) => [{ label, w: 0.7 }, { label: "Importe", w: 0.3, align: "right" }];
  const evs = all("events").filter((e) => (eid ? e.id === eid : inR(e.start, R))).map(evFacts);
  const cats = {}; liveExp().filter((x) => inR(x.date, R) && (!eid || x.eventId === eid)).forEach((x) => (cats[x.category] = (cats[x.category] || 0) + x.amountC));
  const ds = all("distributions").filter((d) => d.status === "aprobada" && d.from <= R.to && d.to >= R.from);
  const qs = all("quotes").filter((q) => !eid || q.eventId === eid).map((q) => ({ q, v: acceptedVer(q) || curVer(q) })).filter(({ v }) => v.status !== "borrador" && inR(v.issuedOn, R));
  const bytes = await PDF.reportPdfBytes({ title: `Reporte financiero · ${c.tradeName || "Empresa"}`,
    subtitle: `Período: ${R.label}${eid ? " · Evento: " + evName(eid) : ""} · Moneda: ${c.currency} · Generado: ${fmtDate(todayISO())} · Documento interno: contiene costos y márgenes.`,
    sections: [
      { title: "Resumen financiero", cols: r2("Concepto"), rows: [["Ingresos reconocidos", M(p.revenue)], ["Gastos reales", M(p.expenses)], ["Utilidad operativa", M(p.profit)], ["Margen", F.fmtPct(p.marginBp, "sin ingresos")],
        ["Facturado", M(p.invoiced)], ["Cobrado", M(p.collected)], ["Cuentas por cobrar", M(p.receivable)], ["Obligaciones pendientes", M(p.payables + p.shOwed)],
        ["Ahorro del período", M(p.savedIn)], ["Ahorro acumulado", M(p.savingsTotal)], ["Disponible para distribuir", M(p.available)]] },
      { title: "Presupuesto frente a gastos y rentabilidad por evento", cols: [{ label: "Evento", w: 0.3 }, { label: "Estado", w: 0.12 }, { label: "Presupuesto", w: 0.12, align: "right" }, { label: "Gasto real", w: 0.12, align: "right" }, { label: "Ingresos", w: 0.12, align: "right" }, { label: "Utilidad", w: 0.12, align: "right" }, { label: "Margen", w: 0.1, align: "right" }],
        rows: evs.map((f) => [`${f.ev.code} ${f.ev.name}`, f.ev.status, M(f.budget), M(f.expenses), M(f.revenue), M(f.profit), F.fmtPct(f.marginBp, "-")]), empty: "Sin eventos en el período" },
      { title: "Cotizaciones", cols: [{ label: "Número", w: 0.2 }, { label: "Cliente", w: 0.28 }, { label: "Estado", w: 0.14 }, { label: "Venta s/imp.", w: 0.19, align: "right" }, { label: "Ganancia est.", w: 0.19, align: "right" }],
        rows: qs.map(({ q, v }) => { const s = F.computeQuote(v); return [`${q.number} v${v.v}`, v.client.name, v.status, M(s.netC), M(s.profitC)]; }), empty: "Sin cotizaciones emitidas" },
      { title: "Gastos por categoría", cols: r2("Categoría"), rows: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, M(v)]), empty: "Sin gastos" },
      { title: "Distribución de utilidades", cols: [{ label: "Período", w: 0.28 }, { label: "Accionista", w: 0.28 }, { label: "%", w: 0.1, align: "right" }, { label: "Aprobado", w: 0.17, align: "right" }, { label: "Pagado", w: 0.17, align: "right" }],
        rows: ds.flatMap((d) => d.lines.map((l) => [`${fmtDate(d.from)} - ${fmtDate(d.to)}`, l.name, F.bpToInput(l.bp) + " %", M(l.amountC), M(F.sum(l.payments || [], (x) => x.amountC))])), empty: "Sin distribuciones aprobadas" } ] });
  await offerDownload(`reporte_interno_${R.from}_${R.to}.pdf`.replace("0000-01-01_9999-12-31", "historial"), bytes);
};

/* ===================================================== configuración */
VIEWS.settings = () => { const c = cfg();
  return `<div class="topline"><div><h1>Configuración</h1><p>Identidad comercial de la empresa que emite las cotizaciones. NexoSaldo es solo la herramienta.</p></div></div>
  <form class="card f" id="cfg-form"><h2 class="full">Empresa</h2>
    ${field("tradeName", "Nombre comercial", inp("tradeName", c.tradeName, "required"))}${field("legalName", "Nombre legal", inp("legalName", c.legalName))}${field("taxId", "Identificación fiscal (RUC/NIT)", inp("taxId", c.taxId))}
    ${field("email", "Correo", inp("email", c.email, 'type="email"'))}${field("phone", "Teléfono", inp("phone", c.phone))}${field("address", "Dirección", inp("address", c.address))}
    <div class="fld"><label for="logo-in">Logo para PDF</label><input type="file" id="logo-in" accept="image/png,image/jpeg" data-chg="logo">${c.logo ? `<img src="${esc(c.logo)}" alt="Logo actual" style="height:48px;width:auto;object-fit:contain;margin-top:4px">` : '<small>PNG o JPG; se reduce automáticamente.</small>'}</div>
    ${field("currency", "Moneda principal", sel("currency", [["USD", "USD — dólar estadounidense"]], c.currency), "Preparado para más monedas en el futuro")}
    <h2 class="full" style="margin-top:8px">Reglas</h2>
    ${field("warn", "Alerta amarilla de presupuesto (%)", inp("warn", F.bpToInput(c.warnBp), 'inputmode="decimal"'))}${field("over", "Alerta roja por encima de (%)", inp("over", F.bpToInput(c.overBp), 'inputmode="decimal"'))}
    ${field("rule", "Ahorro sugerido (% de la utilidad)", inp("rule", F.bpToInput(c.savingsRuleBp), 'inputmode="decimal"'))}${field("validity", "Vigencia de cotizaciones (días)", inp("validity", c.validityDays, 'type="number" min="1"'))}
    ${field("terms", "Condiciones de pago predeterminadas", `<textarea id="terms" name="terms">${esc(c.terms)}</textarea>`, "", true)}
    ${field("taxes", "Impuestos aplicables", `<textarea id="taxes" name="taxes">${esc(c.taxes.map((t) => `${t.name}: ${F.bpToInput(t.bp)}`).join("\n"))}</textarea>`, "Uno por línea, «Nombre: porcentaje». Verifica el tratamiento fiscal de tu jurisdicción.", true)}
    ${field("cats", "Categorías de gasto", `<textarea id="cats" name="cats">${esc(c.categories.join("\n"))}</textarea>`, "Una por línea", true)}
    ${field("methods", "Métodos de pago", `<textarea id="methods" name="methods">${esc(c.methods.join("\n"))}</textarea>`, "Uno por línea", true)}
    <p class="err form-err full" hidden></p><div class="row full"><button class="btn pri">Guardar configuración</button></div></form>
  <div class="card"><h2>Datos de demostración</h2><p class="small">${hasDemo() ? "Hay registros de demostración marcados. Elimínalos antes de cargar tus datos reales." : "No hay datos de demostración."}</p>
    ${hasDemo() ? '<button class="btn danger" data-act="clear-demo">Eliminar datos de demostración</button>' : ""}</div>
  ${hostCard()}
  <div class="card"><h2>Respaldo de datos</h2><p class="small">Descarga todos tus registros en un archivo JSON, o restaura un respaldo. Restaurar agrega o reemplaza registros con el mismo identificador; no borra los demás.</p>
    <div class="row"><button class="btn" data-act="backup-export">Descargar respaldo</button><label class="btn" for="backup-in">Restaurar respaldo</label><input type="file" id="backup-in" accept="application/json,.json" data-chg="backup-import" hidden></div></div>`; };
SUBMIT["cfg-form"] = async (form) => { const d = readForm(form); const c = cfg();
  const taxes = []; for (const ln of d.taxes.split("\n").map((x) => x.trim()).filter(Boolean)) { const [n, v] = ln.split(":"); const bp = F.toBp((v || "").trim()); if (!n || !(bp >= 0)) return formErr(form, `Impuesto inválido: «${ln}». Usa «Nombre: porcentaje».`); taxes.push({ name: n.trim(), bp }); }
  const warn = F.toBp(d.warn), over = F.toBp(d.over), rule = F.toBp(d.rule);
  if (!(warn > 0 && over >= warn)) return formErr(form, "El umbral amarillo debe ser positivo y menor o igual que el rojo.");
  if (!(rule >= 0 && rule <= 10000)) return formErr(form, "El ahorro sugerido debe estar entre 0 y 100 %.");
  const cats = d.cats.split("\n").map((x) => x.trim()).filter(Boolean), methods = d.methods.split("\n").map((x) => x.trim()).filter(Boolean);
  if (!cats.length || !methods.length) return formErr(form, "Necesitas al menos una categoría y un método de pago.");
  await save("config", { ...c, id: "company", tradeName: d.tradeName, legalName: d.legalName, taxId: d.taxId, email: d.email, phone: d.phone, address: d.address, currency: d.currency,
    warnBp: warn, overBp: over, savingsRuleBp: rule, validityDays: Math.max(1, parseInt(d.validity, 10) || 15), terms: d.terms, taxes, categories: cats, methods }); toast("Configuración guardada."); };
CHG.logo = (el) => { const f = el.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { const img = new Image(); img.onload = async () => {
  const k = Math.min(1, 320 / Math.max(img.width, img.height)); const cv = document.createElement("canvas"); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
  const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
  await save("config", { ...cfg(), id: "company", logo: cv.toDataURL("image/jpeg", 0.85) }); toast("Logo actualizado."); }; img.src = r.result; }; r.readAsDataURL(f); };
ACT["clear-demo"] = () => confirmBox("Eliminar datos de demostración", "<p>Se eliminarán todos los registros marcados como demostración. Tus registros reales no se tocan. Esta acción no se puede deshacer.</p>", "Eliminar", async () => {
  for (const c of COLS) for (const d of all(c).filter((x) => x.demo)) await remove(c, d.id); toast("Datos de demostración eliminados."); }, true);

function hostCard() {
  const H = window.NEXOSALDO_HOST;
  if (!H) return `<div class="card"><h2>Sobre este prototipo</h2><p class="small">Los datos se guardan en el almacenamiento de este artifact y los ve quien tenga acceso a él. Para publicarlo en GitHub con usuarios y base de datos propia, usa la versión de la carpeta <code>site/</code>.</p></div>`;
  if (H.kind === "local") return `<div class="card"><h2>Almacenamiento</h2><p class="small"><b>Modo local.</b> Los datos viven solo en este navegador y este dispositivo; si borras los datos del navegador se pierden. Para usar NexoSaldo desde varios dispositivos o con tu equipo, configura Supabase (ver docs/GITHUB.md).</p></div>`;
  return `<div class="card"><h2>Cuenta y equipo</h2><dl class="kv"><dt>Sesión</dt><dd>${esc(H.email || "")}</dd><dt>Rol</dt><dd>${esc(H.role || "")}</dd></dl>
    <div class="row" style="margin-top:10px"><button class="btn" data-act="host-members">Ver miembros</button><button class="btn danger" data-act="host-signout">Cerrar sesión</button></div>
    ${H.role === "propietario" ? `<form class="f" id="member-form" style="margin-top:12px">${field("m-email", "Correo de la persona", inp("m-email", "", 'type="email" required'), "Debe haber creado su cuenta en NexoSaldo antes")}
      ${field("m-role", "Rol", sel("m-role", [["editor", "Editor (registra y modifica)"], ["lector", "Lector (solo consulta)"]], "editor"))}<p class="err form-err full" hidden></p>
      <div class="row full"><button class="btn pri">Agregar al equipo</button></div></form>` : ""}</div>`;
}
ACT["host-signout"] = () => window.NEXOSALDO_HOST.signOut();
ACT["host-members"] = async () => { const ms = await window.NEXOSALDO_HOST.members();
  openModal(`<h2>Miembros de la empresa</h2><dl class="kv">${ms.map((m) => `<dt>${esc(m.email || "")}</dt><dd>${esc(m.role)}</dd>`).join("")}</dl><div class="row" style="justify-content:flex-end"><button class="btn" data-act="close">Cerrar</button></div>`); };
SUBMIT["member-form"] = async (form) => { const d = readForm(form);
  try { await window.NEXOSALDO_HOST.addMember(d["m-email"], d["m-role"]); form.reset(); toast("Miembro agregado."); } catch (e) { formErr(form, e.message); } };
ACT["backup-export"] = () => { const data = {}; COLS.forEach((c) => (data[c] = S[c]));
  return offerDownload(`nexosaldo_respaldo_${todayISO()}.json`, JSON.stringify({ app: "NexoSaldo", version: 1, exportedAt: new Date().toISOString(), data }, null, 1)); };
CHG["backup-import"] = (el) => { const f = el.files[0]; if (!f) return; const r = new FileReader();
  r.onload = () => { let b; try { b = JSON.parse(r.result); } catch { return toast("El archivo no es un respaldo válido."); }
    if (!b || b.app !== "NexoSaldo" || !b.data) return toast("El archivo no es un respaldo de NexoSaldo.");
    const items = []; COLS.forEach((c) => Object.entries(b.data[c] || {}).forEach(([id, d]) => { const { id: _x, ...body } = d; items.push([c, id, body]); }));
    confirmBox("Restaurar respaldo", `<p>Se escribirán <b>${items.length}</b> registros del respaldo del ${esc((b.exportedAt || "").slice(0, 10))}. Los registros con el mismo identificador se reemplazan.</p>`, "Restaurar", async () => {
      let n = 0; for (const [c, id, body] of items) { await save(c, { id, ...body }); n++; } toast(`${n} registros restaurados.`); }); };
  r.readAsText(f); el.value = ""; };
