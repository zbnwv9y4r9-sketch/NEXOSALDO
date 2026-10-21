// PDF real con pdf-lib: genera muestras para verificar con pdfplumber (tests/check_pdf.py)
const fs = require("fs"); const path = require("path");
global.PDFLib = require(process.env.PDFLIB || "/home/claude/.npm-global/lib/node_modules/pdf-lib");
global.F = require("../src/finance.js"); const PDF = require("../src/pdf.js");
(async () => {
  const v = { lines: [], discountType: "porcentaje", discountValue: 500, taxes: [{ name: "ITBMS", bp: 700 }] };
  for (let i = 0; i < 45; i++) v.lines.push({ desc: `Servicio número ${i} con descripción larga de montaje, logística y coordinación del día — ñandú`, qtyM: 2000, unit: "día", costC: 73137, method: "margen", rateBp: 3750, taxable: true });
  const s = F.computeQuote(v); const cv = F.clientView(s);
  const d = { issuer: { tradeName: "Eventos Brisa", legalName: "Eventos Brisa S.A.", email: "hola@brisa.test", phone: "+507 6000-0000" }, number: "COT-2026-0007", version: 2, status: "emitida",
    issuedOn: "21/10/2026", validUntil: "05/11/2026", client: { name: "María Pérez", company: "Pérez & Asoc.", email: "maria@cliente.test", phone: "+507 6111-2222" }, eventName: "Boda Pérez-Ruiz 😀",
    description: "Montaje integral.", terms: "50 % de anticipo", advance: "50 %", execTerm: "15/11/2026", notes: "", currency: "USD",
    view: { lines: cv.lines.map((l) => ({ desc: l.desc, qty: F.milliToStr(l.qtyM), unit: l.unit, unitPrice: F.fmtMoney(l.unitPriceC), total: F.fmtMoney(l.totalC) })),
      linesSubtotal: F.fmtMoney(cv.linesSubtotalC), adjustment: "", subtotal: F.fmtMoney(cv.subtotalC), discount: F.fmtMoney(cv.discountC),
      taxes: cv.taxes.map((t) => ({ label: `${t.name} (7 %)`, amount: F.fmtMoney(t.amountC) })), total: F.fmtMoney(cv.totalC) } };
  const out = process.argv[2] || "/tmp"; fs.writeFileSync(path.join(out, "q.pdf"), await PDF.quotePdfBytes(d));
  fs.writeFileSync(path.join(out, "secrets.json"), JSON.stringify({ total: F.fmtMoney(s.totalC), secrets: ["731.37", F.fmtMoney(s.costTotalC).slice(1), F.fmtMoney(s.profitC).slice(1), "37.5", "costo", "margen", "recargo", "utilidad", "ganancia", "accionista", "ahorro"] }));
  fs.writeFileSync(path.join(out, "r.pdf"), await PDF.reportPdfBytes({ title: "Reporte financiero · Demo", subtitle: "Período de prueba", sections: [{ title: "Resumen", cols: [{ label: "Concepto", w: 0.7 }, { label: "Importe", w: 0.3, align: "right" }], rows: [["Ingresos", "$1.00"]] }, { title: "Vacía", cols: [{ label: "A", w: 0.5 }, { label: "B", w: 0.5 }], rows: [] }] }));
  console.log("PDF_OK");
})().catch((e) => { console.error(e); process.exit(1); });
