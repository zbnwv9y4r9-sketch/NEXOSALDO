// Pruebas de la versión para GitHub Pages (site/): modo local y modo Supabase simulado.
// Ejecutar: node web/tests/site.e2e.js [directorio-salida]
const fs = require("fs"); const path = require("path");
const PW = process.env.PLAYWRIGHT || "/home/claude/.npm-global/lib/node_modules/playwright";
const PDFLIB = process.env.PDFLIB_MIN || "/home/claude/.npm-global/lib/node_modules/pdf-lib/dist/pdf-lib.min.js";
const { chromium } = require(PW);
const SITE = path.join(__dirname, "../../site"); const OUT = process.argv[2] || "/tmp";
let n = 0; const ok = (m) => console.log(`✓ ${++n}. ${m}`); const assert = (c, m) => { if (!c) throw new Error("FALLÓ: " + m); };
const TYPES = { html: "text/html", js: "application/javascript", svg: "image/svg+xml", png: "image/png", webmanifest: "application/manifest+json" };

async function context(browser, configJs) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  await ctx.route("https://nexosaldo.test/**", (r) => { const u = new URL(r.request().url()); let p = u.pathname.replace(/^\//, "") || "index.html";
    if (p === "config.js" && configJs !== undefined) return r.fulfill({ contentType: "application/javascript", body: configJs });
    const f = path.join(SITE, p); if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ contentType: TYPES[p.split(".").pop()] || "application/octet-stream", body: fs.readFileSync(f) }); });
  await ctx.route("https://cdnjs.cloudflare.com/**", (r) => r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(PDFLIB, "utf8") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/@supabase/**", (r) => r.fulfill({ contentType: "application/javascript", body: fs.readFileSync(path.join(__dirname, "mock-supabase.js"), "utf8") }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ body: "" }));
  return ctx;
}
async function newEvent(page, name) {
  await page.click('.side [data-v="events"]'); await page.click('.topline [data-act="new-event"]');
  await page.fill("#name", name); await page.click("#modal button.pri"); await page.waitForSelector(`h1:has-text("${name}")`);
}

(async () => {
  const browser = await chromium.launch(); const errors = [];
  // ---------------- modo local
  let ctx = await context(browser); let page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("https://nexosaldo.test/");
  await page.waitForSelector("text=Modo local"); ok("Sin configuración arranca en modo local con aviso");
  await newEvent(page, "Feria local");
  await page.reload(); await page.click('.side [data-v="events"]'); await page.waitForSelector("text=Feria local"); ok("Los datos persisten al recargar (localStorage)");
  await page.click('.side [data-v="settings"]');
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="backup-export"]')]);
  const file = path.join(OUT, "respaldo.json"); await dl.saveAs(file); const bk = JSON.parse(fs.readFileSync(file, "utf8"));
  assert(bk.app === "NexoSaldo" && Object.keys(bk.data.events).length === 1, "respaldo"); ok("Respaldo JSON descargado con el evento");
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.click('.side [data-v="settings"]');
  await page.setInputFiles("#backup-in", file); await page.click('[data-act="confirm-ok"]'); await page.waitForTimeout(150);
  await page.click('.side [data-v="events"]'); await page.waitForSelector("text=Feria local"); ok("Respaldo restaurado tras borrar los datos del navegador");
  await page.click('[data-act="open-event"]'); await page.click('[data-act="new-quote"]'); await page.fill('[data-l="0"][data-k="desc"]', "Stand"); await page.fill('[data-l="0"][data-k="costC"]', "100");
  await page.fill("#q-cn", "Cliente"); await page.click('[data-act="q-issue"]'); await page.click('[data-act="confirm-ok"]'); await page.waitForTimeout(100);
  await page.click('[data-act="q-preview"]');
  const [pdf] = await Promise.all([page.waitForEvent("download"), page.click('[data-act="q-pdf"]')]);
  const pf = path.join(OUT, "site-quote.pdf"); await pdf.saveAs(pf); assert(fs.readFileSync(pf).slice(0, 5).toString() === "%PDF-", "pdf"); ok(`PDF descargado en el navegador (${pdf.suggestedFilename()})`);
  await page.keyboard.press("Escape"); await page.setViewportSize({ width: 390, height: 844 }); await page.click('.mob [data-v="dashboard"]');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "sin scroll horizontal"); await page.screenshot({ path: path.join(OUT, "site-mobile.png") }); ok("Diseño móvil correcto");
  await ctx.close();

  // ---------------- modo Supabase (simulado)
  ctx = await context(browser, 'window.NEXOSALDO_CONFIG={supabaseUrl:"https://x.supabase.co",supabaseAnonKey:"anon",companyName:"Brisa"};');
  page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("https://nexosaldo.test/"); await page.waitForSelector("#login");
  await page.fill("#lg-email", "dueno@brisa.test"); await page.fill("#lg-pass", "clave-segura-1"); await page.click('#login [data-x="signup"]');
  await page.waitForSelector("#login", { state: "detached" }); ok("Pantalla de acceso y creación de cuenta");
  await newEvent(page, "Gala en la nube");
  const stored = await page.evaluate(() => window.__sb.rows.map((r) => r.collection + ":" + r.data.name));
  assert(stored.includes("events:Gala en la nube"), "guardado en Supabase " + stored); ok("Evento guardado en la base de datos (tabla nexosaldo_docs)");
  await page.click('.side [data-v="settings"]'); await page.waitForSelector("text=dueno@brisa.test"); assert(await page.$("#member-form"), "form miembros");
  await page.fill("#m-email", "nadie@x.test"); await page.click("#member-form button.pri"); await page.waitForSelector("text=aún no ha creado su cuenta"); ok("Propietario ve su cuenta y gestiona el equipo");
  // un intento de borrar un registro financiero es rechazado por la base
  const delErr = await page.evaluate(async () => { const d = await window.claude.use("db"); try { await d.collection("events").doc(Object.keys(window.__sb.rows.reduce((o, r) => (o[r.id] = 1, o), {}))[0]).delete(); return "borrado"; } catch (e) { return e.message; } });
  assert(/no se eliminan/.test(delErr), "borrado bloqueado: " + delErr); ok("La base rechaza borrar registros financieros");
  await ctx.close(); await browser.close();
  assert(!errors.length, "errores JS: " + errors.join(" | ")); ok("Sin errores de JavaScript"); console.log("SITE_E2E_OK");
})().catch((e) => { console.error(e.message); process.exit(1); });
