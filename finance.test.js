// Pruebas de paridad con tests/test_finance.py — ejecutar: node --test web/tests
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("../src/finance.js");

test("parseo y redondeo sin float", () => {
  assert.equal(F.toCents("0.1") + F.toCents("0.2"), 30);
  assert.equal(F.toCents("2.675"), 268);
  assert.equal(F.toCents("1,234.5"), 123450);
  assert.ok(Number.isNaN(F.toCents("abc")));
  assert.equal(F.fmtMoney(-123450), "-$1,234.50");
  assert.equal(F.rdiv(-5, 2), -3);
});

test("presupuesto: fórmulas y semáforo", () => {
  const r = F.budgetRow(100000, 120000);
  assert.equal(r.balance, -20000); assert.equal(r.execBp, 12000); assert.equal(r.varianceBp, 2000);
  assert.equal(r.light, "rojo");
  assert.equal(F.budgetRow(100000, 90000).light, "amarillo");
  assert.equal(F.budgetRow(0, 5000).execBp, null);
  assert.equal(F.budgetRow(0, 0).light, "sin");
});

test("reparto exacto de gasto general", () => {
  const o = F.allocate(10000, { a: 1, b: 1, c: 1 });
  assert.equal(o.a + o.b + o.c, 10000);
});

const L = (o) => ({ desc: "x", qtyM: 1000, costC: 100000, taxable: true, ...o });

test("recargo 30 % sobre $1,000 = $1,300", () => {
  const s = F.computeQuote({ lines: [L({ method: "recargo", rateBp: 3000 })] });
  assert.equal(s.subtotalC, 130000); assert.equal(s.profitC, 30000);
});

test("margen 30 % sobre $1,000 = $1,428.57; margen >= 100 bloqueado", () => {
  const s = F.computeQuote({ lines: [L({ method: "margen", rateBp: 3000 })] });
  assert.equal(s.subtotalC, 142857); assert.equal(s.profitC, 42857);
  assert.equal(F.computeQuote({ lines: [L({ method: "margen", rateBp: 10000 })] }).errors.length, 1);
});

test("precio manual se conserva al cambiar el costo", () => {
  const l = L({ qtyM: 2000, costC: 40000, method: "manual", manualC: 65000 });
  assert.equal(F.computeQuote({ lines: [l] }).subtotalC, 130000);
  const s2 = F.computeQuote({ lines: [{ ...l, costC: 50000 }] });
  assert.equal(s2.subtotalC, 130000); assert.equal(s2.profitC, 30000);
});

test("global no se aplica dos veces; precio global manual no altera partidas", () => {
  const s = F.computeQuote({ globalMethod: "recargo", globalRateBp: 2000,
    lines: [L({ costC: 10000, method: "global" }), L({ costC: 10000, method: "recargo", rateBp: 5000 })] });
  assert.deepEqual(s.lines.map((l) => l.saleTotalC), [12000, 15000]);
  const m = F.computeQuote({ manualSubtotalC: 20000, lines: [L({ costC: 10000, method: "recargo", rateBp: 2000 })] });
  assert.equal(m.lines[0].saleTotalC, 12000); assert.equal(m.adjustmentC, 8000); assert.equal(m.profitC, 10000);
});

test("descuentos e impuestos (paridad con Python)", () => {
  const s = F.computeQuote({ discountType: "porcentaje", discountValue: 1000, taxes: [{ name: "ITBMS", bp: 700 }],
    lines: [L({ costC: 70000, method: "manual", manualC: 100000 }),
            L({ costC: 0, method: "manual", manualC: 100000, taxable: false })] });
  assert.equal(s.discountC, 20000); assert.equal(s.netC, 180000);
  assert.equal(s.taxC, 6300); assert.equal(s.totalC, 186300); assert.equal(s.profitC, 110000);
});

test("vista cliente sin datos internos", () => {
  const s = F.computeQuote({ lines: [L({ method: "margen", rateBp: 4000 })] });
  const txt = JSON.stringify(F.clientView(s));
  for (const k of ["cost", "margin", "markup", "profit", "rateBp"]) assert.ok(!txt.includes(k), k);
});

test("distribución del ejemplo de la sección 15", () => {
  const d = F.distributable(400000, 40000);
  assert.equal(d.availableC, 360000);
  const h = [{ id: "A", name: "A", bp: 5000, start: "2025-01-01" }, { id: "B", name: "B", bp: 3000, start: "2025-01-01" },
             { id: "C", name: "C", bp: 2000, start: "2025-01-01" }];
  const p = F.proposeDistribution(d.availableC, h, "2026-10-01");
  assert.deepEqual(p.lines.map((l) => l.amountC), [180000, 108000, 72000]);
  assert.throws(() => F.proposeDistribution(1000, h.slice(0, 2), "2026-10-01"));
  assert.throws(() => F.proposeDistribution(1000, h, "2026-10-01", 1001));
  assert.equal(F.proposeDistribution(F.distributable(-5000).availableC, h, "2026-10-01").distributedC, 0);
});

test("ahorro propuesto y variaciones sin base", () => {
  assert.equal(F.proposeSavings(400000, 1000), 40000);
  assert.equal(F.proposeSavings(-1, 1000), 0);
  assert.equal(F.variation(0, 500).deltaBp, null);
  assert.equal(F.variation(1000000, 1400000).deltaBp, 4000);
});

test("ventas: facturado/cobrado/estado", () => {
  const s = { netC: 100000, taxC: 7000, invoices: [{ amountC: 107000 }], receipts: [{ amountC: 50000 }] };
  assert.equal(F.saleGross(s), 107000); assert.equal(F.saleStatus(s), "parcial");
  assert.equal(F.saleGross(s) - F.saleCollected(s), 57000);
});
