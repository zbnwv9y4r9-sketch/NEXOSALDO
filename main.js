/* ===================================================== arranque y eventos */
document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-act]"); if (!el) return;
  const fn = ACT[el.dataset.act]; if (!fn) return;
  if (el.disabled) return;
  try { await fn(el, ev); } catch (e) { if (e && e.message !== "read-only") { console.error(e); toast(errText(e)); } }
});
document.addEventListener("submit", async (ev) => {
  const f = ev.target; ev.preventDefault(); const fn = SUBMIT[f.id]; if (!fn) return;
  const b = f.querySelector('button.pri, button[type="submit"]'); if (b) b.disabled = true;
  try { await fn(f); } catch (e) { if (e && e.message !== "read-only") { console.error(e); formErr(f, errText(e)); } }
  finally { if (b && document.body.contains(b)) b.disabled = false; }
});
function onChange(ev) {
  const el = ev.target;
  if (el.dataset.q !== undefined || el.dataset.l !== undefined) { onQuoteInput(el); return; }
  if (ev.type !== "change" && el.dataset.chg !== "exp-filter") return;
  if (el.dataset.qtax !== undefined) return CHG.qtax(el);
  if (el.dataset.qev) return CHG.qev(el);
  if (el.dataset.chg && CHG[el.dataset.chg]) CHG[el.dataset.chg](el);
}
document.addEventListener("input", onChange);
document.addEventListener("change", onChange);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !document.getElementById("modal").hidden) closeModal(); });
render();
initStore();
