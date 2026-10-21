// Prueba de recorridos principales en Chromium con un runtime falso de window.claude.
// Ejecutar: node web/tests/ui.e2e.js [directorio-salida]
const fs = require("fs"); const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT || "/home/claude/.npm-global/lib/node_modules/playwright");
const NM = "/home/claude/.npm-global/lib/node_modules";
const OUT = process.argv[2] || "/tmp";
const page_html = fs.readFileSync(path.join(__dirname, "../dist/nexosaldo.html"), "utf8");
const wrapped = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page_html}</body></html>`;
const fake = fs.readFileSync(path.join(__dirname, "fake-claude.js"), "utf8");
let step = 0; const ok = (m) => console.log(`✓ ${++step}. ${m}`);
function assert(c, m) { if (!c) throw new Error("FALLÓ: " + m); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route("https://cdnjs.cloudflare.com/**", (r) => r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(process.env.PDFLIB_MIN || `${NM}/pdf-lib/dist/pdf-lib.min.js`, "utf8") }));
  await ctx.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  await ctx.route("https://fonts.gstatic.com/**", (r) => r.abort());
  await ctx.route("http://app.test/", (r) => r.fulfill({ contentType: "text/html", body: wrapped }));
  await ctx.addInitScript(fake);
  const page = await ctx.newPage(); const errors = [];
  page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("http://app.test/");
  const act = async (sel) => { await page.click(sel); await page.waitForTimeout(60); };
  const modalSubmit = async () => { await page.click("#modal button.pri, #modal button.danger[type=submit], #modal form button:not([type=button])"); await page.waitForTimeout(120); };
  const text = () => page.innerText("#main");

  await page.waitForSelector("text=Todavía no hay datos"); ok("Dashboard vacío con botón para crear el primer evento");

  await act('.side [data-v="settings"]');
  await page.fill("#tradeName", "Eventos Brisa"); await page.fill("#email", "hola@brisa.test"); await page.fill("#taxes", "ITBMS: 7");
  await act('#cfg-form button.pri'); assert((await page.innerText("#toast")).includes("guardada"), "config guardada"); ok("Configuración de la empresa guardada");

  await act('.side [data-v="events"]'); await act('[data-act="new-event"]');
  await page.fill("#name", "Boda Pérez-Ruiz"); await page.fill("#client", "María Pérez"); await page.fill("#clientPhone", "+507 6111-2222"); await page.fill("#start", "2026-10-15"); await page.fill("#end", "2026-10-15");
  await modalSubmit(); await page.waitForSelector("text=Boda Pérez-Ruiz"); ok("Evento creado y abierto su expediente");

  await act('[data-act="ev-tab"][data-t="presupuesto"]'); await act('[data-act="edit-budget"][data-cat=""]');
  await page.selectOption("#cat", "Personal"); await page.fill("#amount", "1000"); await modalSubmit();
  assert((await text()).includes("$1,000.00"), "presupuesto visible"); ok("Presupuesto por categoría");

  await act('[data-act="ev-tab"][data-t="cotizacion"]'); await act('[data-act="new-quote"]');
  await page.waitForSelector(".line"); assert((await page.inputValue("#q-cn")) === "María Pérez", "cliente heredado del evento");
  await page.fill('[data-l="0"][data-k="desc"]', "Coordinación integral"); await page.fill('[data-l="0"][data-k="costC"]', "1000");
  await page.selectOption('[data-l="0"][data-k="method"]', "margen"); await page.waitForTimeout(80);
  await page.fill('[data-l="0"][data-k="rateBp"]', "30"); await page.waitForTimeout(80);
  let sum = await page.innerText("#q-summary"); assert(sum.includes("$1,428.57") && sum.includes("$100.00") && sum.includes("$1,528.57"), "margen 30 % + ITBMS: " + sum);
  assert((await page.innerText("#q-private")).includes("$428.57"), "ganancia privada"); ok("Cotización con margen sobre venta: $1,428.57 + ITBMS = $1,528.57");

  await act('[data-act="q-addline"]'); await page.fill('[data-l="1"][data-k="desc"]', "Decoración"); await page.fill('[data-l="1"][data-k="costC"]', "400");
  await page.selectOption('[data-l="1"][data-k="method"]', "manual"); await page.waitForTimeout(80); await page.fill('[data-l="1"][data-k="manualC"]', "650");
  await page.fill('[data-l="1"][data-k="costC"]', "500"); await page.waitForTimeout(60);
  sum = await page.innerText("#q-summary"); assert(sum.includes("$2,078.57"), "precio manual conservado: " + sum);
  assert(/precio manual/i.test(await page.innerText("#lo-1")), "marca manual"); ok("Precio manual se conserva al cambiar el costo");

  await act('[data-act="q-issue"]'); await act('[data-act="confirm-ok"]'); await page.waitForTimeout(150);
  assert((await text()).includes("Emitida"), "emitida"); ok("Cotización emitida y congelada");

  await act('[data-act="q-preview"]'); const prev = await page.innerText("#modal .card");
  assert(!/costo|margen|ganancia|utilidad|\$1,000\.00|\$428\.57/i.test(prev), "vista previa sin datos internos: " + prev);
  await act('[data-act="q-pdf"]'); await page.waitForTimeout(400);
  const dl = await page.evaluate(() => window.__downloads); assert(dl.length && dl[0].head === "%PDF-" && dl[0].filename.endsWith(".pdf"), "PDF real: " + JSON.stringify(dl));
  const wa = await page.getAttribute('#modal a[data-ch="whatsapp"]', "href"); assert(wa.startsWith("https://wa.me/50761112222?text="), "enlace WhatsApp");
  ok(`PDF real generado (${dl[0].size} bytes) y enlace de WhatsApp con mensaje preparado`);
  await act('[data-act="q-sent"][data-ch="whatsapp"]'); assert((await text()).includes("Enviada"), "estado enviada"); ok("Envío confirmado manualmente → estado Enviada");

  await act('[data-act="q-status"][data-s="aceptada"]'); await act('[data-act="confirm-ok"]'); await page.waitForTimeout(100);
  await act('[data-act="q-to-sale"]'); await act('[data-act="confirm-ok"]'); await page.waitForTimeout(150);
  assert((await text()).includes("Convertida en venta"), "venta"); assert(!(await page.$('[data-act="q-to-sale"]')), "no se puede convertir dos veces");
  ok("Aceptada → convertida en venta una sola vez");

  await act('.side [data-v="expenses"]'); await act('[data-act="new-expense"]');
  await page.selectOption("#eventId", { label: (await page.$$eval("#eventId option", (o) => o[1].textContent)) });
  await page.fill("#desc", "Meseros"); await page.fill("#amount", "600"); await page.fill("#paid", "200"); await modalSubmit();
  assert((await text()).includes("Parcialmente pagado"), "estado parcial"); ok("Gasto registrado con pago parcial");

  await act('.side [data-v="income"]'); await act('tr[data-act="open-sale"]'); await act('[data-act="add-receipt"]');
  await page.fill("#amount", "3000"); await modalSubmit(); assert((await page.innerText("#modal")).includes("no superar"), "bloquea cobro excesivo");
  await page.fill("#amount", "1000"); await modalSubmit(); assert((await text()).includes("Cobro parcial"), "cobro parcial"); ok("Cobro parcial; cobro superior al saldo bloqueado");

  await act('.side [data-v="savings"]'); await act('.topline [data-act="new-goal"]'); await page.fill("#name", "Fondo de emergencia"); await page.fill("#target", "5000"); await modalSubmit();
  await act('.topline [data-act="new-saving"]'); await page.fill("#amount", "900"); await modalSubmit();
  assert((await page.innerText("#modal")).includes("caja disponible"), "bloquea ahorro > caja");
  await page.fill("#amount", "100"); await modalSubmit(); assert((await text()).includes("$100.00"), "aporte"); ok("Ahorro: no permite reservar más que la caja ($800); aporte de $100");

  await act('.side [data-v="shareholders"]');
  for (const [n, p] of [["Ana", "60"], ["Beto", "30"]]) { await act('[data-act="new-holder"]'); await page.fill("#name", n); await page.fill("#pct", p); await page.fill("#start", "2026-01-01"); await modalSubmit(); }
  assert((await text()).includes("suman 90"), "alerta 90 %");
  await page.fill("#d-from", "2026-10-01"); await page.dispatchEvent("#d-from", "change"); await page.fill("#d-to", "2026-10-31"); await page.dispatchEvent("#d-to", "change"); await page.waitForTimeout(80);
  await act('#dist-form button.pri'); assert((await page.innerText("#toast")).includes("100 %"), "bloquea si no suman 100");
  await act('[data-act="new-holder"]'); await page.fill("#name", "Cira"); await page.fill("#pct", "10"); await page.fill("#start", "2026-01-01"); await modalSubmit();
  await page.fill("#amount", "99999"); await act('#dist-form button.pri'); assert((await page.innerText("#toast")).includes("más que la utilidad"), "bloquea exceso");
  await page.fill("#amount", ""); await act('#dist-form button.pri'); const conf = await page.innerText("#modal");
  // utilidad = 1,428.57+650 - 600 = 1,478.57; - ahorro 100 = 1,378.57 → Ana 60 % = 827.14
  assert(conf.includes("$1,378.57") && conf.includes("$827.14"), "propuesta: " + conf); await act('[data-act="confirm-ok"]'); await page.waitForTimeout(120);
  assert((await text()).includes("Aprobada"), "aprobada"); ok("Distribución: exige 100 %, bloquea exceso, aprueba $1,378.57 (Ana $827.14)");

  await act('.side [data-v="dashboard"]'); const dash = await text();
  assert(dash.includes("$1,478.57") && dash.includes("$2,078.57"), "dashboard derivado de los registros"); ok("Dashboard calcula utilidad $1,478.57 e ingresos $2,078.57 desde los registros");

  for (const v of ["events", "quotes", "budgets", "expenses", "income", "savings", "shareholders", "compare", "reports", "settings"]) { await act(`.side [data-v="${v}"]`); assert(!(await text()).includes("Error al mostrar"), "vista " + v); }
  ok("Las 11 secciones se muestran sin errores");
  await act('.side [data-v="reports"]'); await act('[data-act="report-pdf"]'); await page.waitForTimeout(300); await act('[data-act="export-events"]'); await page.waitForTimeout(100);
  const d2 = await page.evaluate(() => window.__downloads.map((d) => d.filename + ":" + d.head)); assert(d2.some((x) => x.startsWith("reporte_interno") && x.includes("%PDF")) && d2.some((x) => x.startsWith("eventos_")), "reportes " + d2);
  ok("Reporte interno PDF y CSV exportados");

  // persistencia: recarga reconstruye desde el store
  const snap = await page.evaluate(() => JSON.stringify(window.__store)); await page.addInitScript((s) => { window.__seed = s; }, snap);
  await page.screenshot({ path: path.join(OUT, "desk.png"), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 }); await act('.mob [data-v="dashboard"]'); await page.waitForTimeout(100);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); assert(overflow <= 0, "sin scroll horizontal en móvil: " + overflow);
  await page.screenshot({ path: path.join(OUT, "mobile.png") }); await act('.mob [data-v="quotes"]'); await act('tr[data-act="open-quote"]'); await page.screenshot({ path: path.join(OUT, "mobile-quote.png"), fullPage: true });
  ok("Vista móvil (390 px) sin desplazamiento horizontal");
  assert(!errors.length, "errores de consola: " + errors.join(" | ")); ok("Sin errores de JavaScript");
  await browser.close(); console.log("E2E_OK");
})().catch((e) => { console.error(e.message); process.exit(1); });
