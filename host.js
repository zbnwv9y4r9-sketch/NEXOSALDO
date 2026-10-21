/* NexoSaldo — anfitrión para la versión publicada fuera de Claude (GitHub Pages).
 * Ofrece la misma interfaz que la app espera (claude.use("db" | "downloads" | "user")):
 *   - Sin configuración: los datos se guardan en este navegador (localStorage).
 *   - Con config.js (supabaseUrl + supabaseAnonKey): inicio de sesión y base de datos
 *     PostgreSQL en Supabase, con aislamiento por empresa aplicado por RLS. */
(() => {
  const CFG = window.NEXOSALDO_CONFIG || {};
  const USE_SB = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const MIME = { pdf: "application/pdf", csv: "text/csv;charset=utf-8", json: "application/json" };
  const coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  const err = (code, message) => Object.assign(new Error(message), { code });

  /* ------------------------------------------------ descargas y compartir */
  function shareSheetFallback(file) {
    // Safari exige un toque directo para abrir la hoja de compartir: se lo pedimos.
    return new Promise((resolve, reject) => {
      const o = document.createElement("div");
      o.className = "modal-back"; o.style.zIndex = 90;
      o.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h2>PDF listo</h2><p>Toca «Compartir» para enviarlo por WhatsApp, Mail u otra app, o guárdalo en Archivos.</p>
        <div class="row" style="justify-content:flex-end"><button class="btn" data-x="no">Cancelar</button><button class="btn pri" data-x="si">Compartir</button></div></div>`;
      o.addEventListener("click", async (e) => {
        const b = e.target.closest("[data-x]"); if (!b) return; o.remove();
        if (b.dataset.x === "no") return reject(err("declined", "Cancelado"));
        try { await navigator.share({ files: [file], title: file.name }); resolve({ status: "saved" }); }
        catch (x) { reject(err(x && x.name === "AbortError" ? "declined" : "unavailable", "No se pudo compartir")); }
      });
      document.body.appendChild(o);
    });
  }
  const downloads = {
    async save({ filename, data }) {
      const ext = filename.split(".").pop().toLowerCase();
      const blob = data instanceof Blob ? data : new Blob([data], { type: MIME[ext] || "application/octet-stream" });
      const file = new File([blob], filename, { type: blob.type });
      if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: filename }); return { status: "saved" }; }
        catch (x) { if (x && x.name === "AbortError") throw err("declined", "Cancelado"); return shareSheetFallback(file); }
      }
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000); return { status: "saved" };
    },
  };

  /* ------------------------------------------------ almacenamiento local */
  function localDb() {
    const KEY = "nexosaldo:datos:v1"; const subs = {};
    let st; try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { st = {}; }
    const snap = (c) => { const docs = Object.entries(st[c] || {}).map(([id, d]) => ({ id, exists: true, data: () => d, metadata: {} })); return { docs, size: docs.length, empty: !docs.length }; };
    const emit = (c) => (subs[c] || []).forEach((f) => f(snap(c)));
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { throw err("quota_exceeded", "El navegador no tiene espacio para guardar más datos. Exporta un respaldo."); } };
    window.addEventListener("storage", (e) => { if (e.key === KEY) { try { st = JSON.parse(e.newValue) || {}; } catch { st = {}; } Object.keys(subs).forEach(emit); } });
    return { collection: (c) => ({
      onSnapshot(next) { (subs[c] = subs[c] || []).push(next); setTimeout(() => next(snap(c)), 0); return () => {}; },
      doc: (id) => ({
        async set(d) { const prev = st[c] && st[c][id]; (st[c] = st[c] || {})[id] = JSON.parse(JSON.stringify(d)); try { persist(); } catch (x) { if (prev) st[c][id] = prev; else delete st[c][id]; throw x; } emit(c); },
        async delete() { if (st[c]) delete st[c][id]; persist(); emit(c); },
      }) }) };
  }

  /* ------------------------------------------------ Supabase */
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar " + src)); document.head.appendChild(s); }); }
  function loginScreen(sb) {
    return new Promise((resolve) => {
      const o = document.createElement("div"); o.id = "login";
      o.style.cssText = "position:fixed;inset:0;z-index:80;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px 16px;overflow:auto";
      o.innerHTML = `<form class="card" style="max-width:380px;width:100%;display:flex;flex-direction:column;gap:12px">
        <div class="row">${typeof LOGO === "function" ? LOGO(36) : ""}<div><h1 style="font-size:1.3rem">NexoSaldo</h1><span class="small muted">Cada proyecto, bajo control</span></div></div>
        <div class="fld"><label for="lg-email">Correo</label><input id="lg-email" type="email" autocomplete="email" required></div>
        <div class="fld"><label for="lg-pass">Contraseña</label><input id="lg-pass" type="password" autocomplete="current-password" minlength="8" required></div>
        <p class="err" id="lg-msg" hidden></p>
        <button class="btn pri" type="submit">Entrar</button>
        <div class="spread"><button class="btn ghost sm" type="button" data-x="signup">Crear cuenta</button><button class="btn ghost sm" type="button" data-x="reset">Olvidé mi contraseña</button></div></form>`;
      document.body.appendChild(o);
      const msg = (t, ok) => { const m = o.querySelector("#lg-msg"); m.textContent = t; m.hidden = !t; m.style.color = ok ? "var(--good)" : ""; };
      const creds = () => ({ email: o.querySelector("#lg-email").value.trim(), password: o.querySelector("#lg-pass").value });
      o.querySelector("form").addEventListener("submit", async (e) => { e.preventDefault(); msg("");
        const { error } = await sb.auth.signInWithPassword(creds()); if (error) msg(error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message); });
      o.addEventListener("click", async (e) => { const b = e.target.closest("[data-x]"); if (!b) return; const c = creds();
        if (!c.email) return msg("Escribe tu correo.");
        if (b.dataset.x === "signup") { if (c.password.length < 8) return msg("La contraseña debe tener al menos 8 caracteres.");
          const { data, error } = await sb.auth.signUp({ ...c, options: { emailRedirectTo: location.href.split("#")[0] } });
          if (error) return msg(error.message); if (!data.session) msg("Cuenta creada. Revisa tu correo para confirmarla y luego entra.", true); }
        else { const { error } = await sb.auth.resetPasswordForEmail(c.email, { redirectTo: location.href.split("#")[0] }); msg(error ? error.message : "Te enviamos un correo para cambiar la contraseña.", !error); } });
      const done = (session) => { if (session) { o.remove(); resolve(session); } };
      sb.auth.getSession().then(({ data }) => done(data.session));
      sb.auth.onAuthStateChange((_ev, session) => done(session));
    });
  }
  async function supabaseDb() {
    await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js");
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const session = await loginScreen(sb);
    const { data: boot, error: be } = await sb.rpc("nexosaldo_bootstrap", { company_name: CFG.companyName || "Mi empresa" });
    if (be || !boot || !boot.length) throw err("unavailable", "No se pudo preparar tu empresa: " + (be ? be.message : "sin respuesta") + ". ¿Ejecutaste supabase/schema.sql?");
    const company = boot[0].company_id, role = boot[0].role;
    Object.assign(HOST, { email: session.user.email, role, companyId: company,
      signOut: async () => { await sb.auth.signOut(); location.reload(); },
      addMember: async (email, r) => { const { error } = await sb.rpc("nexosaldo_add_member", { c: company, member_email: email, member_role: r }); if (error) throw err("invalid_argument", error.message); },
      members: async () => { const { data } = await sb.from("nexosaldo_members").select("email,role").eq("company_id", company); return data || []; } });
    const cache = {}, subs = {};
    const snap = (c) => { const docs = Object.entries(cache[c] || {}).map(([id, d]) => ({ id, exists: true, data: () => d, metadata: {} })); return { docs, size: docs.length, empty: !docs.length }; };
    const emit = (c) => (subs[c] || []).forEach((f) => f(snap(c)));
    const mapErr = (e) => err(e && e.code === "42501" ? "invalid_argument" : e && /no se eliminan/.test(e.message) ? "invalid_argument" : "unavailable", (e && e.message) || "Error de base de datos");
    async function load(c) { let rows = [], from = 0;
      for (;;) { const { data, error } = await sb.from("nexosaldo_docs").select("id,data").eq("company_id", company).eq("collection", c).range(from, from + 999);
        if (error) throw mapErr(error); rows = rows.concat(data); if (data.length < 1000) break; from += 1000; }
      cache[c] = Object.fromEntries(rows.map((r) => [r.id, r.data])); emit(c); }
    sb.channel("nexosaldo-" + company).on("postgres_changes", { event: "*", schema: "public", table: "nexosaldo_docs", filter: `company_id=eq.${company}` }, (p) => {
      const row = p.eventType === "DELETE" ? p.old : p.new; if (!row || !row.collection) return;
      cache[row.collection] = cache[row.collection] || {};
      if (p.eventType === "DELETE") delete cache[row.collection][row.id]; else cache[row.collection][row.id] = row.data;
      emit(row.collection); }).subscribe();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) Object.keys(subs).forEach((c) => load(c).catch(() => {})); });
    return { collection: (c) => ({
      onSnapshot(next, onErr) { (subs[c] = subs[c] || []).push(next); load(c).catch((e) => onErr && onErr(e)); return () => {}; },
      doc: (id) => ({
        async set(d) { const { error } = await sb.from("nexosaldo_docs").upsert({ company_id: company, collection: c, id, data: d }); if (error) throw mapErr(error);
          (cache[c] = cache[c] || {})[id] = JSON.parse(JSON.stringify(d)); emit(c); },
        async delete() { const { error } = await sb.from("nexosaldo_docs").delete().match({ company_id: company, collection: c, id }); if (error) throw mapErr(error);
          if (cache[c]) delete cache[c][id]; emit(c); },
      }) }), canWrite: role !== "lector" };
  }

  const HOST = window.NEXOSALDO_HOST = { kind: USE_SB ? "supabase" : "local" };
  let dbPromise = null;
  const getDb = () => (dbPromise = dbPromise || (USE_SB ? supabaseDb() : Promise.resolve(localDb())));
  window.claude = { use: async (name) => {
    if (name === "db") { try { return await getDb(); } catch (e) { HOST.error = e.message; console.error(e); return null; } }
    if (name === "downloads") return downloads;
    if (name === "user") return { can: async () => { try { const d = await getDb(); return d && d.canWrite !== false; } catch { return null; } } };
    return null; } };
})();
