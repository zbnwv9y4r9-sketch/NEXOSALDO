// Supabase falso (en memoria) para probar el adaptador de host.js sin red.
// Reproduce: auth con contraseña, rpc bootstrap/add_member, from().select/upsert/delete,
// RLS básica por empresa, bloqueo de borrado de registros no-demo y canal realtime.
(() => {
  const users = {}; let session = null; const listeners = [];
  const rows = []; const members = []; const channels = [];
  const now = () => new Date().toISOString();
  window.__sb = { rows, members };
  function q(table) {
    const f = {}; let range = [0, 1e9];
    const api = {
      select() { return api; }, eq(k, v) { f[k] = v; return api; }, range(a, b) { range = [a, b]; return api; },
      match(m) { Object.assign(f, m); return api; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
      async upsert(r) { if (!session) return { error: { code: "42501", message: "sin sesión" } };
        const mem = members.find((m) => m.company_id === r.company_id && m.user_id === session.user.id);
        if (!mem || mem.role === "lector") return { error: { code: "42501", message: "new row violates row-level security policy" } };
        const i = rows.findIndex((x) => x.company_id === r.company_id && x.collection === r.collection && x.id === r.id);
        const row = JSON.parse(JSON.stringify(r)); if (i >= 0) rows[i] = row; else rows.push(row);
        channels.forEach((c) => c.fire({ eventType: i >= 0 ? "UPDATE" : "INSERT", new: row, old: {} })); return { error: null }; },
      delete() { api._del = true; return api; },
    };
    function visible(r) { return session && members.some((m) => m.company_id === r.company_id && m.user_id === session.user.id); }
    function run() {
      if (table === "nexosaldo_members") return { data: members.filter((m) => m.company_id === f.company_id && visible(m)).map(({ email, role }) => ({ email, role })), error: null };
      const sel = rows.filter((r) => visible(r) && Object.entries(f).every(([k, v]) => r[k] === v));
      if (api._del) { for (const r of sel) { if (!(r.data && r.data.demo)) return { error: { code: "P0001", message: "Los registros financieros no se eliminan" } }; }
        sel.forEach((r) => { rows.splice(rows.indexOf(r), 1); channels.forEach((c) => c.fire({ eventType: "DELETE", new: {}, old: { company_id: r.company_id, collection: r.collection, id: r.id } })); }); return { error: null }; }
      return { data: sel.slice(range[0], range[1] + 1).map((r) => ({ id: r.id, data: r.data })), error: null };
    }
    return api;
  }
  window.supabase = { createClient: () => ({
    auth: {
      async getSession() { return { data: { session } }; },
      onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
      async signUp({ email, password }) { if (users[email]) return { error: { message: "User already registered" } }; users[email] = { id: crypto.randomUUID(), email, password }; return this.signInWithPassword({ email, password }); },
      async signInWithPassword({ email, password }) { const u = users[email]; if (!u || u.password !== password) return { error: { message: "Invalid login credentials" } };
        session = { user: { id: u.id, email } }; listeners.forEach((l) => l("SIGNED_IN", session)); return { data: { session }, error: null }; },
      async signOut() { session = null; }, async resetPasswordForEmail() { return { error: null }; },
    },
    async rpc(fn, args) {
      if (fn === "nexosaldo_bootstrap") { let m = members.find((x) => x.user_id === session.user.id);
        if (!m) { m = { company_id: crypto.randomUUID(), user_id: session.user.id, email: session.user.email, role: "propietario", at: now() }; members.push(m); }
        return { data: [{ company_id: m.company_id, role: m.role }], error: null }; }
      if (fn === "nexosaldo_add_member") { const u = users[args.member_email]; if (!u) return { error: { message: "Esa persona aún no ha creado su cuenta en NexoSaldo." } };
        members.push({ company_id: args.c, user_id: u.id, email: args.member_email, role: args.member_role }); return { error: null }; }
      return { error: { message: "rpc desconocida" } };
    },
    from: q,
    channel() { const ch = { on(_e, _f, cb) { ch.cb = cb; return ch; }, subscribe() { channels.push(ch); return ch; }, fire(p) { if (ch.cb) setTimeout(() => ch.cb(p), 0); } }; return ch; },
  }) };
})();
