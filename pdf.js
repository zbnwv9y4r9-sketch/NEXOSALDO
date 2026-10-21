/* ===================================================== PDF (pdf-lib, funciones puras)
 * quotePdfBytes recibe SOLO datos de cliente (lista blanca); no tiene acceso a
 * costos, márgenes, utilidades, ahorro ni accionistas. */
const PDF = (() => {
  const SAFE = /[\x20-\x7E\xA0-\xFF–—‘’“”•…€]/;
  const safe = (s) => Array.from(String(s ?? "")).map((ch) => (ch === "\n" ? "\n" : SAFE.test(ch) ? ch : ch === "\t" ? " " : "")).join("");
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
  const C = { green: "#103C32", lime: "#91C83E", ink: "#202B27", muted: "#6B7671", rule: "#DDE3DF", fill: "#EEF3EF" };

  async function writer() {
    const { PDFDocument, StandardFonts } = PDFLib;
    const doc = await PDFDocument.create();
    const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 612, H = 792, mL = 50, mR = 50, mT = 50, mB = 60;
    const w = { doc, f, fb, W, H, mL, mR, mT, mB, cw: W - mL - mR, page: null, y: 0, onNewPage: null };
    w.newPage = () => { w.page = doc.addPage([W, H]); w.y = mT; if (w.onNewPage) w.onNewPage(); };
    w.width = (s, size, bold) => (bold ? fb : f).widthOfTextAtSize(safe(s), size);
    w.text = (s, x, y, o = {}) => { const size = o.size || 9.5, font = o.bold ? fb : f; s = safe(s);
      let xx = x; if (o.align === "right") xx = x - font.widthOfTextAtSize(s, size); else if (o.align === "center") xx = x - font.widthOfTextAtSize(s, size) / 2;
      w.page.drawText(s, { x: xx, y: H - y, size, font, color: hex(o.color || C.ink) }); };
    w.wrap = (s, width, size = 9.5, bold = false) => { const font = bold ? fb : f; const out = [];
      safe(s).split("\n").forEach((para) => { let line = ""; para.split(/\s+/).filter(Boolean).forEach((word) => {
        const t = line ? line + " " + word : word;
        if (font.widthOfTextAtSize(t, size) <= width) line = t;
        else { if (line) out.push(line); while (font.widthOfTextAtSize(word, size) > width) { let k = word.length; while (k > 1 && font.widthOfTextAtSize(word.slice(0, k), size) > width) k--; out.push(word.slice(0, k)); word = word.slice(k); } line = word; } });
        out.push(line); }); return out; };
    w.line = (x1, y1, x2, y2, color = C.rule, t = 0.5) => w.page.drawLine({ start: { x: x1, y: H - y1 }, end: { x: x2, y: H - y2 }, thickness: t, color: hex(color) });
    w.rect = (x, y, wd, ht, color) => w.page.drawRectangle({ x, y: H - y - ht, width: wd, height: ht, color: hex(color) });
    w.ensure = (h) => { if (w.y + h > H - mB) w.newPage(); };
    // tabla: cols [{label, w (fracción), align}], filas que no se parten; encabezado repetido
    w.table = (cols, rows, o = {}) => { const size = o.size || 9, pad = 5, lh = size + 3; const widths = cols.map((c) => c.w * w.cw);
      const head = () => { let x = mL; cols.forEach((c, i) => { w.text(c.label, c.align === "right" ? x + widths[i] - pad : x + pad, w.y + size + 2, { size: size - 0.5, bold: true, color: C.green, align: c.align }); x += widths[i]; });
        w.y += size + 8; w.line(mL, w.y, mL + w.cw, w.y, C.green, 1); };
      w.ensure(40); head();
      rows.forEach((r) => { const cells = r.map((v, i) => w.wrap(v, widths[i] - 2 * pad, size, o.boldFirst && i === 0)); const h = Math.max(...cells.map((c) => c.length)) * lh + 2 * pad;
        if (w.y + h > H - mB) { w.newPage(); head(); }
        let x = mL; cells.forEach((lines, i) => { lines.forEach((ln, k) => w.text(ln, cols[i].align === "right" ? x + widths[i] - pad : x + pad, w.y + pad + size + k * lh, { size, align: cols[i].align })); x += widths[i]; });
        w.y += h; w.line(mL, w.y, mL + w.cw, w.y); }); };
    w.footer = (fn) => { const pages = doc.getPages(); pages.forEach((p, i) => { w.page = p; fn(i + 1, pages.length); }); };
    return w;
  }

  async function quotePdfBytes(d) {
    const w = await writer(); const { mL, W, cw } = w; const R = W - w.mR; w.newPage();
    let y = w.y;
    if (d.logoBytes) { try { const img = d.logoType === "png" ? await w.doc.embedPng(d.logoBytes) : await w.doc.embedJpg(d.logoBytes);
      const k = Math.min(56 / img.width, 56 / img.height); w.page.drawImage(img, { x: mL, y: w.H - y - img.height * k, width: img.width * k, height: img.height * k }); } catch (e) { d.logoBytes = null; } }
    const lx = d.logoBytes ? mL + 68 : mL;
    w.text(d.issuer.tradeName || "Tu empresa", lx, y + 14, { size: 17, bold: true, color: C.green });
    [d.issuer.legalName, d.issuer.taxId ? "RUC/NIT: " + d.issuer.taxId : "", d.issuer.address, d.issuer.phone, d.issuer.email].filter(Boolean)
      .forEach((t, i) => w.text(t, lx, y + 29 + i * 11, { size: 8.5, color: C.muted }));
    w.text(d.status === "borrador" ? "BORRADOR" : "COTIZACIÓN", R, y + 14, { size: 18, bold: true, color: C.green, align: "right" });
    w.text(`N.º ${d.number} · Versión ${d.version}`, R, y + 30, { bold: true, align: "right" });
    w.text(`Emisión: ${d.issuedOn}`, R, y + 43, { align: "right" }); w.text(`Válida hasta: ${d.validUntil}`, R, y + 56, { align: "right" });
    y += 86; w.line(mL, y, R, y, C.lime, 1.2); y += 22;
    w.text("Cliente", mL, y, { size: 10, bold: true, color: C.green }); w.text("Evento / proyecto", mL + cw / 2, y, { size: 10, bold: true, color: C.green });
    const cl = [d.client.name, d.client.company, d.client.email, d.client.phone].filter(Boolean);
    cl.forEach((t, i) => w.text(t, mL, y + 14 + i * 12, { bold: i === 0 }));
    const ev = w.wrap(d.eventName || "-", cw / 2 - 10); ev.forEach((t, i) => w.text(t, mL + cw / 2, y + 14 + i * 12));
    y += 22 + Math.max(cl.length, ev.length, 1) * 12; w.y = y;
    if (d.description) { const t = w.wrap(d.description, cw); w.ensure(20 + t.length * 12); w.text("Descripción de los servicios", mL, w.y + 4, { size: 10, bold: true, color: C.green });
      t.forEach((ln, i) => w.text(ln, mL, w.y + 18 + i * 12)); w.y += 26 + t.length * 12; }
    const v = d.view;
    w.table([{ label: "Concepto", w: 0.52 }, { label: "Cant.", w: 0.13, align: "right" }, { label: "Precio unit.", w: 0.17, align: "right" }, { label: "Total", w: 0.18, align: "right" }],
      v.lines.map((l) => [l.desc, l.qty + (l.unit ? " " + l.unit : ""), l.unitPrice, l.total]));
    const tot = []; if (v.adjustment) { tot.push(["Suma de partidas", v.linesSubtotal]); tot.push(["Ajuste de precio", v.adjustment]); }
    tot.push(["Subtotal", v.subtotal]); if (v.discount) tot.push(["Descuento", "-" + v.discount]); v.taxes.forEach((t) => tot.push([t.label, t.amount]));
    // los totales nunca quedan aislados: si no caben junto a la tabla, pasan con la última fila
    w.y += 12; if (w.y + tot.length * 15 + 34 > w.H - w.mB) w.newPage();
    tot.forEach(([k, val]) => { w.text(k, R - 120, w.y + 10, { align: "right" }); w.text(val, R, w.y + 10, { align: "right" }); w.y += 15; });
    w.line(R - 250, w.y + 2, R, w.y + 2, C.green, 1.2); w.y += 18;
    w.text(`Total a pagar (${d.currency})`, R - 120, w.y, { size: 11, bold: true, align: "right" }); w.text(v.total, R, w.y, { size: 11, bold: true, align: "right" }); w.y += 30;
    const conds = [["Condiciones de pago", d.terms], ["Anticipo solicitado", d.advance], ["Plazo de ejecución", d.execTerm], ["Vigencia de la oferta", "Hasta el " + d.validUntil], ["Observaciones", d.notes]].filter((x) => x[1]);
    const cl2 = conds.map(([k, t]) => [k, w.wrap(t, cw - 130)]); w.ensure(26 + F.sum(cl2, (x) => x[1].length * 12 + 4));
    w.text("Condiciones comerciales", mL, w.y, { size: 10.5, bold: true, color: C.green }); w.y += 16;
    cl2.forEach(([k, lines]) => { w.text(k + ":", mL, w.y, { bold: true }); lines.forEach((ln, i) => w.text(ln, mL + 130, w.y + i * 12)); w.y += lines.length * 12 + 4; });
    if (d.acceptance !== false) { w.ensure(80); w.y += 18; w.text("Aceptación de la propuesta", mL, w.y, { size: 10.5, bold: true, color: C.green }); w.y += 42;
      w.line(mL, w.y, mL + 260, w.y, C.ink, 0.6); w.line(mL + 300, w.y, mL + 420, w.y, C.ink, 0.6);
      w.text("Firma y nombre del cliente", mL, w.y + 11, { size: 8, color: C.muted }); w.text("Fecha", mL + 300, w.y + 11, { size: 8, color: C.muted }); }
    w.footer((p, n) => { w.text([d.issuer.tradeName, d.issuer.email, d.issuer.phone].filter(Boolean).join(" · "), mL, w.H - 30, { size: 7.5, color: C.muted });
      w.text(`Cotización ${d.number} v${d.version} · Página ${p} de ${n}`, R, w.H - 30, { size: 7.5, color: C.muted, align: "right" }); });
    w.doc.setTitle(safe(`Cotización ${d.number} v${d.version}`)); w.doc.setAuthor(safe(d.issuer.tradeName || "")); w.doc.setCreator("NexoSaldo");
    return w.doc.save();
  }

  async function reportPdfBytes(d) {
    const w = await writer(); const { mL } = w; const R = w.W - w.mR; w.newPage();
    w.text(d.title, mL, w.y + 12, { size: 16, bold: true, color: C.green }); w.y += 28;
    w.wrap(d.subtitle, w.cw, 8.5).forEach((ln) => { w.text(ln, mL, w.y, { size: 8.5, color: C.muted }); w.y += 11; }); w.y += 10;
    d.sections.forEach((s) => { w.ensure(60); w.text(s.title, mL, w.y + 10, { size: 11, bold: true, color: C.green }); w.y += 20;
      w.table(s.cols, s.rows.length ? s.rows : [[s.empty || "Sin datos", ...s.cols.slice(1).map(() => "")]], { size: 8.5 }); w.y += 18; });
    w.footer((p, n) => w.text(`NexoSaldo · uso interno, confidencial · página ${p} de ${n}`, R, w.H - 30, { size: 7.5, color: C.muted, align: "right" }));
    w.doc.setTitle(safe(d.title)); w.doc.setCreator("NexoSaldo"); return w.doc.save();
  }
  return { quotePdfBytes, reportPdfBytes, safe };
})();
if (typeof module !== "undefined") module.exports = PDF;
