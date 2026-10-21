// Runtime falso de window.claude para pruebas locales (db en memoria con onSnapshot)
(() => {
  const store = window.__seedStore || {}; const subs = {};
  const snapOf = (col) => { const docs = Object.entries(store[col] || {}).map(([id, d]) => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(d)), metadata: {} }));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }; };
  const emit = (col) => setTimeout(() => (subs[col] || []).forEach((f) => f(snapOf(col))), 5);
  const db = { collection: (col) => ({ onSnapshot: (next) => { (subs[col] = subs[col] || []).push(next); emit(col); return () => {}; },
      doc: (id) => ({ set: async (d) => { (store[col] = store[col] || {})[id] = JSON.parse(JSON.stringify(d)); emit(col); },
        delete: async () => { if (store[col]) delete store[col][id]; emit(col); } }) }) };
  window.__downloads = [];
  const downloads = { save: async ({ filename, data }) => { window.__downloads.push({ filename, size: data.byteLength || data.length, head: typeof data === "string" ? data.slice(0, 40) : String.fromCharCode(...new Uint8Array(data.buffer || data).slice(0, 5)) }); return { status: "saved" }; } };
  const user = { can: async () => true };
  window.__store = store;
  window.claude = { use: async (n) => ({ db, downloads, user }[n] || null) };
})();
