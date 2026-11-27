// Pornirea aplicației, meniul și navigarea
import { S } from "./state.js";
import { Store, onChange } from "./store.js";
import { $, $$, icon, toast, sheet } from "./ui.js";
import { esc } from "./util.js";
import { runAuto, pendingAuto } from "./belege.js";
import { invState, purState, isOpen } from "./model.js";
import { list } from "./state.js";

import home from "./views/home.js";
import invoices from "./views/invoices.js";
import notes from "./views/notes.js";
import purchases from "./views/purchases.js";
import cash from "./views/cash.js";
import stock from "./views/stock.js";
import contacts from "./views/contacts.js";
import products from "./views/products.js";
import docs from "./views/docs.js";
import datev from "./views/datev.js";
import reports from "./views/reports.js";
import settings from "./views/settings.js";

const VIEWS = { home, invoices, notes, purchases, cash, stock, contacts, products, docs, datev, reports, settings };
const MENU = [
  ["Zilnic", ["home", "invoices", "notes", "purchases", "cash"]],
  ["Evidență", ["stock", "contacts", "products"]],
  ["Pentru contabil", ["docs", "datev", "reports"]],
  ["", ["settings"]]
];
const TABS = ["home", "invoices", "purchases", "cash"];
let cur = { view: "home", arg: "" };

function badges() {
  const openPur = list("purchases").filter(p => isOpen(purState(p))).length;
  const over = list("invoices").filter(i => ["over", "partover"].includes(invState(i))).length;
  return { purchases: openPur, invoices: over, docs: pendingAuto().length || 0 };
}
function renderNav() {
  const b = badges(), item = id => { const v = VIEWS[id]; return `<a href="#${id}" data-v="${id}" class="${cur.view === id ? "on" : ""}">${icon(v.icon)}<span>${esc(v.title)}</span>${b[id] ? `<span class="badge ${id === "docs" ? "w" : ""}">${b[id]}</span>` : ""}</a>`; };
  $("#nav").innerHTML = MENU.map(([g, ids]) => (g ? `<div class="grp">${esc(g)}</div>` : `<div style="height:10px"></div>`) + ids.map(item).join("")).join("");
  $("#tabbar").innerHTML = TABS.map(id => { const v = VIEWS[id]; return `<a href="#${id}" class="${cur.view === id ? "on" : ""}">${icon(v.icon)}<span>${esc(v.short || v.title)}</span>${b[id] ? `<span class="badge">${b[id]}</span>` : ""}</a>`; }).join("")
    + `<a href="#" id="more-btn" class="${TABS.includes(cur.view) ? "" : "on"}">${icon("more")}<span>Mai mult</span></a>`;
  $("#more-btn").onclick = e => { e.preventDefault(); openMore(); };
}
function openMore() {
  const o = document.createElement("div"); o.id = "more";
  o.innerHTML = `<div class="pane"><nav>${MENU.map(([g, ids]) => (g ? `<div class="grp">${esc(g)}</div>` : "") + ids.map(id => `<a href="#${id}">${icon(VIEWS[id].icon)}<span>${esc(VIEWS[id].title)}</span></a>`).join("")).join("")}</nav></div>`;
  o.onclick = e => { if (e.target === o || e.target.closest("a")) o.remove(); };
  document.body.appendChild(o);
}
function renderSync() {
  const st = Store.status || {}, cfg = Store.cloudCfg(), dot = $("#sync .dot"), t = $("#sync-t");
  const names = { google: "Google Drive", onedrive: "OneDrive", webdav: "NAS / WebDAV" };
  if (!cfg || cfg.type === "none") { dot.className = "dot"; t.textContent = "Doar pe acest dispozitiv"; return; }
  if (Store.needRelogin || st.state === "relogin") { dot.className = "dot warn"; t.textContent = "Atinge ca să reconectezi " + names[cfg.type]; return; }
  if (st.state === "syncing") { dot.className = "dot busy"; t.textContent = "Se sincronizează…"; return; }
  if (st.state === "error") { dot.className = "dot err"; t.textContent = "Eroare de sincronizare"; return; }
  dot.className = "dot ok"; t.textContent = (names[cfg.type] || "Cloud") + (st.at ? " · " + new Date(st.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "");
}

export function go(view, arg = "") { location.hash = arg ? `${view}/${arg}` : view; }
window.__go = go;
function parseHash() { const [v, ...rest] = location.hash.replace(/^#/, "").split("/"); return { view: VIEWS[v] ? v : "home", arg: decodeURIComponent(rest.join("/") || "") }; }

let renderT = null;
export function render(soft = false) {
  const v = VIEWS[cur.view];
  document.title = v.title + " · Contabilitate privată";
  const prevT = $("#title").textContent, prevA = $("#acts").innerHTML;
  $("#title").textContent = v.title;
  $("#acts").innerHTML = "";
  const el = $("#view"), y = soft ? window.scrollY : 0;
  try { if (v.render(el, cur.arg, { acts: $("#acts"), soft }) === "keep") { $("#title").textContent = prevT; $("#acts").innerHTML = prevA; renderNav(); return; } } catch (e) { console.error(e); el.innerHTML = `<div class="banner bad">A apărut o eroare: ${esc(e.message)}</div>`; }
  if (soft) window.scrollTo(0, y); else window.scrollTo(0, 0);
  renderNav();
}
const softRender = () => { clearTimeout(renderT); renderT = setTimeout(() => { if (!document.querySelector(".overlay")) render(true); else { pending = true; renderNav(); } }, 60); };

let pending = false;
document.addEventListener("sheet-closed", () => { if (pending) { pending = false; render(true); } });
addEventListener("hashchange", () => { $$(".overlay").forEach(o => o.close ? o.close() : o.remove()); cur = parseHash(); render(); });
addEventListener("scroll", () => $("#top").classList.toggle("sc", window.scrollY > 4), { passive: true });
document.addEventListener("click", e => { const g = e.target.closest("[data-go]"); if (g && !e.target.closest("input,select,textarea,button:not([data-go])")) { const [v, a] = g.dataset.go.split("/"); go(v, a || ""); } });

async function start() {
  if (!window.CP) { $("#view").innerHTML = `<div class="banner bad">Nu s-a putut încărca motorul de date (cp-core.js). Verifică internetul și reîncarcă pagina.</div>`; return; }
  try { await Store.init(); } catch (e) { console.error(e); $("#view").innerHTML = `<div class="banner bad">Baza de date locală nu se poate deschide: ${esc(e.message)}. În modul privat al browserului aplicația nu poate salva.</div>`; return; }
  onChange(kinds => { if (kinds.includes("_sync")) { renderSync(); if (Store.status?.state === "ok") runAuto().then(r => r && r.sent && toast(`Trimis automat la DATEV: ${r.sent} documente`)); return; } softRender(); });
  $("#sync").onclick = () => go("settings", "sync");
  cur = parseHash();
  render(); renderSync();
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  setTimeout(() => runAuto().then(r => r && r.sent && toast(`Trimis automat la DATEV: ${r.sent} documente`)), 4000);
  setInterval(() => runAuto(), 5 * 60000);
  setTimeout(() => import("./backup.js").then(b => b.autoBackup()), 8000);
  // la prima pornire: oferă mutarea datelor din aplicația veche
  if (!S.settings.company.name && !list("invoices").length && !localStorage.getItem("cp3_mig_asked")) {
    localStorage.setItem("cp3_mig_asked", "1");
    import("./migrate.js").then(m => m.offerMigration()).catch(e => console.warn(e));
  }
}
start();
