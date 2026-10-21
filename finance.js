/* NexoSaldo — capa financiera (navegador). Paridad con nexosaldo/finance (Python).
 * Importes en CENTAVOS enteros; porcentajes en PUNTOS BÁSICOS (1 % = 100 bp);
 * cantidades en MILÉSIMAS (1 unidad = 1000). Divisiones exactas con BigInt y
 * redondeo HALF_UP. Ningún cálculo usa coma flotante sobre importes. */
const F = (() => {
  const B = (x) => BigInt(x);
  // a/b con redondeo half-up (simétrico respecto a cero). a,b enteros; b != 0.
  function rdiv(a, b) {
    a = B(a); b = B(b);
    if (b === 0n) throw new Error("División por cero");
    const neg = (a < 0n) !== (b < 0n);
    if (a < 0n) a = -a; if (b < 0n) b = -b;
    let q = a / b; const r = a - q * b;
    if (2n * r >= b) q += 1n;
    return Number(neg ? -q : q);
  }
  const mulDiv = (a, m, d) => rdiv(B(a) * B(m), d);

  // Texto -> entero escalado (sin float). "1,234.5" -> 123450 con scale 2.
  function parseScaled(str, scale) {
    if (str === null || str === undefined) return null;
    let s = String(str).trim().replace(/[\s,$%]/g, "");
    if (s === "") return null;
    if (!/^-?\d*(\.\d*)?$/.test(s) || s === "-" || s === ".") return NaN;
    const neg = s.startsWith("-"); if (neg) s = s.slice(1);
    let [ip, fp = ""] = s.split(".");
    ip = ip || "0";
    const extra = fp.slice(scale); fp = fp.slice(0, scale).padEnd(scale, "0");
    let v = B(ip) * 10n ** B(scale) + B(fp || "0");
    if (extra && Number(extra[0]) >= 5) v += 1n;
    return Number(neg ? -v : v);
  }
  const toCents = (s) => parseScaled(s, 2);
  const toBp = (s) => parseScaled(s, 2);
  const toMilli = (s) => parseScaled(s, 3);

  const fmtMoney = (c, cur = "USD") => {
    if (c === null || c === undefined || Number.isNaN(c)) return "—";
    const neg = c < 0; const a = Math.abs(c);
    const ip = Math.trunc(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const s = `$${ip}.${String(a % 100).padStart(2, "0")}`;
    return (neg ? "-" : "") + s;
  };
  const centsToInput = (c) => (c === null || c === undefined) ? "" :
    `${c < 0 ? "-" : ""}${Math.trunc(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`;
  const bpToInput = (bp) => (bp === null || bp === undefined) ? "" : centsToInput(bp).replace(/\.00$/, "");
  const milliToStr = (m) => { const i = Math.trunc(m / 1000), f = Math.abs(m % 1000);
    return f ? `${i}.${String(f).padStart(3, "0").replace(/0+$/, "")}` : String(i); };
  // porcentaje en bp de num/den (None si den == 0)
  const ratioBp = (num, den) => (den === 0 || den === null) ? null : mulDiv(num, 10000, den);
  const fmtPct = (bp, empty = "Sin base") => bp === null || bp === undefined ? empty : `${bpToInput(bp)} %`;
  const sum = (arr, f = (x) => x) => arr.reduce((t, x) => t + (f(x) || 0), 0);

  // ---------------------------------------------------------- presupuesto
  function budgetLight(budget, actual, warnBp = 8500, overBp = 10000) {
    if (!budget) return actual > 0 ? "rojo" : "sin";
    const ex = ratioBp(actual, budget);
    if (ex > overBp) return "rojo";
    if (ex >= warnBp) return "amarillo";
    return "verde";
  }
  function budgetRow(budget, actual, th) {
    return { budget, actual, balance: budget - actual, execBp: ratioBp(actual, budget),
      variance: actual - budget, varianceBp: ratioBp(actual - budget, budget),
      light: budgetLight(budget, actual, th && th.warnBp, th && th.overBp) };
  }
  function expenseStatus(e) {
    const paid = e.paidC || 0;
    if (paid <= 0) return "pendiente";
    if (paid < e.amountC) return "parcial";
    return "pagado";
  }
  // Reparto exacto de un gasto general según pesos (residuo al mayor peso).
  function allocate(amountC, weights) {
    const keys = Object.keys(weights); const tw = sum(keys, (k) => weights[k]);
    if (tw <= 0) throw new Error("La regla necesita pesos positivos.");
    const out = {}; keys.forEach((k) => out[k] = mulDiv(amountC, weights[k], tw));
    const res = amountC - sum(keys, (k) => out[k]);
    if (res) { const top = keys.reduce((a, b) => weights[b] > weights[a] ? b : a); out[top] += res; }
    return out;
  }

  // ---------------------------------------------------------- cotización
  function unitPrice(line, q) {
    let method = line.method, bp = line.rateBp;
    if (method === "global") { method = q.globalMethod || "recargo"; bp = q.globalRateBp || 0; }
    if (method === "manual") {
      if (line.manualC === null || line.manualC === undefined || line.manualC < 0)
        throw new Error(`Precio manual inválido en «${line.desc || "partida"}».`);
      return { method, price: line.manualC };
    }
    if (bp === null || bp === undefined || bp < 0) throw new Error(`Porcentaje inválido en «${line.desc || "partida"}».`);
    if (method === "recargo") return { method, price: mulDiv(line.costC, 10000 + bp, 10000) };
    if (method === "margen") {
      if (bp >= 10000) throw new Error("El margen sobre la venta debe ser menor que 100 %.");
      return { method, price: mulDiv(line.costC, 10000, 10000 - bp) };
    }
    throw new Error("Método de precio desconocido.");
  }
  function computeQuote(q) {
    const errors = [];
    const lines = (q.lines || []).map((l) => {
      try {
        if (!(l.qtyM > 0)) throw new Error(`Cantidad inválida en «${l.desc || "partida"}».`);
        if (!(l.costC >= 0)) throw new Error(`Costo inválido en «${l.desc || "partida"}».`);
        const { method, price } = unitPrice(l, q);
        const cost = rdiv(B(l.qtyM) * B(l.costC), 1000);
        const sale = rdiv(B(l.qtyM) * B(price), 1000);
        return { ...l, effMethod: method, manual: method === "manual", unitPriceC: price,
          costTotalC: cost, saleTotalC: sale, profitC: sale - cost,
          marginBp: ratioBp(sale - cost, sale), markupBp: ratioBp(sale - cost, cost) };
      } catch (e) { errors.push(e.message); return { ...l, error: e.message, unitPriceC: 0, costTotalC: 0, saleTotalC: 0, profitC: 0 }; }
    });
    const s = { lines, errors };
    s.costTotalC = sum(lines, (l) => l.costTotalC);
    s.linesSubtotalC = sum(lines, (l) => l.saleTotalC);
    if (q.manualSubtotalC !== null && q.manualSubtotalC !== undefined) {
      if (q.manualSubtotalC < 0) errors.push("El precio global manual no puede ser negativo.");
      s.subtotalC = q.manualSubtotalC; s.adjustmentC = s.subtotalC - s.linesSubtotalC;
    } else { s.subtotalC = s.linesSubtotalC; s.adjustmentC = 0; }
    s.discountC = 0;
    if (q.discountType === "porcentaje") {
      const bp = q.discountValue || 0;
      if (bp < 0 || bp > 10000) errors.push("El descuento porcentual debe estar entre 0 y 100.");
      else s.discountC = mulDiv(s.subtotalC, bp, 10000);
    } else if (q.discountType === "importe") {
      const v = q.discountValue || 0;
      if (v < 0 || v > s.subtotalC) errors.push("El descuento no puede ser negativo ni mayor que el subtotal.");
      else s.discountC = v;
    }
    s.netC = s.subtotalC - s.discountC;
    const taxable = sum(lines.filter((l) => l.taxable !== false), (l) => l.saleTotalC);
    const base = s.linesSubtotalC > 0 ? mulDiv(s.netC, taxable, s.linesSubtotalC) : 0;
    s.taxes = (q.taxes || []).map((t) => ({ name: t.name, bp: t.bp, amountC: mulDiv(base, t.bp, 10000) }));
    s.taxC = sum(s.taxes, (t) => t.amountC);
    s.totalC = s.netC + s.taxC;
    s.profitC = s.netC - s.costTotalC;           // impuestos no son ingreso propio
    s.marginBp = ratioBp(s.profitC, s.netC);
    return s;
  }
  // Lista blanca para documentos del cliente.
  function clientView(s) {
    return { lines: s.lines.map((l) => ({ desc: l.desc, qtyM: l.qtyM, unit: l.unit || "",
      unitPriceC: l.unitPriceC, totalC: l.saleTotalC })),
      linesSubtotalC: s.linesSubtotalC, adjustmentC: s.adjustmentC, subtotalC: s.subtotalC,
      discountC: s.discountC, taxes: s.taxes.map((t) => ({ name: t.name, bp: t.bp, amountC: t.amountC })),
      totalC: s.totalC };
  }
  const QUOTE_FLOW = {
    borrador: ["emitida", "cancelada"],
    emitida: ["enviada", "aceptada", "rechazada", "vencida", "cancelada"],
    enviada: ["aceptada", "rechazada", "vencida", "cancelada"],
    aceptada: ["cancelada"], rechazada: [], vencida: [], cancelada: [],
  };

  // ---------------------------------------------------------- ventas/cobros
  const saleGross = (s) => (s.netC || 0) + (s.taxC || 0);
  const saleInvoiced = (s) => sum((s.invoices || []).filter((i) => !i.voided), (i) => i.amountC);
  const saleCollected = (s) => sum((s.receipts || []).filter((r) => !r.voided), (r) => r.amountC);
  const saleStatus = (s) => { const c = saleCollected(s), g = saleGross(s);
    return c <= 0 ? "pendiente" : c < g ? "parcial" : "cobrado"; };

  // ---------------------------------------------------------- resultados
  function distributable(opC, savingsC = 0, otherC = 0, obligC = 0) {
    const avail = opC - savingsC - otherC - obligC;
    return { opC, savingsC, otherC, obligC, availableC: Math.max(avail, 0) };
  }
  const proposeSavings = (opC, ruleBp) => opC > 0 ? mulDiv(opC, ruleBp, 10000) : 0;
  function effectiveHolders(holders, onISO) {
    return holders.filter((h) => h.active !== false && h.start <= onISO && (!h.end || onISO <= h.end));
  }
  function proposeDistribution(availableC, holders, onISO, amountC) {
    const eff = effectiveHolders(holders, onISO);
    const tot = sum(eff, (h) => h.bp);
    if (tot !== 10000) throw new Error(`Las participaciones vigentes suman ${bpToInput(tot)} %; deben sumar 100 %.`);
    let amt = amountC === undefined || amountC === null ? availableC : amountC;
    if (amt < 0) throw new Error("El importe a distribuir no puede ser negativo.");
    if (amt > availableC) throw new Error("No se puede distribuir más que la utilidad disponible.");
    if (availableC <= 0) amt = 0;
    const lines = eff.map((h) => ({ shId: h.id, name: h.name, bp: h.bp, amountC: mulDiv(amt, h.bp, 10000), payments: [] }));
    const res = amt - sum(lines, (l) => l.amountC);
    if (res && lines.length) lines.reduce((a, b) => b.bp > a.bp ? b : a).amountC += res;
    return { availableC, distributedC: amt, lines };
  }
  function variation(prev, cur) {
    if (prev === null || cur === null || prev === undefined || cur === undefined) return { delta: null, deltaBp: null };
    return { delta: cur - prev, deltaBp: prev === 0 ? null : ratioBp(cur - prev, prev) };
  }

  return { rdiv, mulDiv, toCents, toBp, toMilli, fmtMoney, fmtPct, centsToInput, bpToInput, milliToStr,
    ratioBp, sum, budgetLight, budgetRow, expenseStatus, allocate, unitPrice, computeQuote, clientView,
    QUOTE_FLOW, saleGross, saleInvoiced, saleCollected, saleStatus, distributable, proposeSavings,
    effectiveHolders, proposeDistribution, variation };
})();
if (typeof module !== "undefined") module.exports = F;
