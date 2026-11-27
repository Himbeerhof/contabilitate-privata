// Interfață: ferestre, mesaje, iconițe, câmpuri de formular, navigare
import { esc, num, money, fmtDate } from "./util.js";

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const P = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  inv: '<path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6M9 8h2"/>',
  ls: '<path d="M3 7h11v10H3zM14 10h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
  in: '<path d="M4 4h16v16H4z"/><path d="M12 8v8M8 12l4 4 4-4"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M7 9v.01M17 15v.01"/>',
  stock: '<path d="M3 8l9-5 9 5-9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3 3 0 010 6M21 20c0-2.6-1.6-4.8-4-5.6"/>',
  prod: '<path d="M12 3c3 2.5 5 5 5 8a5 5 0 01-10 0c0-3 2-5.5 5-8z"/><path d="M12 21v-5"/>',
  docs: '<path d="M4 6h6l2 2h8v11H4z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  datev: '<path d="M4 12h12M12 6l6 6-6 6"/><path d="M20 4v16"/>',
  set: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  dl: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', back: '<path d="M15 5l-7 7 7 7"/>',
  pdf: '<path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4"/><path d="M9 14h6M9 17h4"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12l5 5 9-11"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>', up: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>', search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>', send: '<path d="M4 12l16-8-6 16-2-7z"/>', trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'
};
export const icon = (n, cls = "ic") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ""}</svg>`;

export function toast(msg, ms = 2800) {
  $$(".toast").forEach(x => x.remove());
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/** Fereastră modală. Returnează elementul; .close() o închide. Apăsarea pe fundal o închide dacă dismiss=true. */
export function sheet(html, { wide = false, dismiss = true, onClose } = {}) {
  const o = document.createElement("div"); o.className = "overlay";
  o.innerHTML = `<div class="sheet ${wide ? "wide" : ""}" role="dialog">${html}</div>`;
  document.body.appendChild(o); document.body.style.overflow = "hidden";
  o.close = () => { if (!o.isConnected) return; o.remove(); if (!$(".overlay")) { document.body.style.overflow = ""; document.dispatchEvent(new Event("sheet-closed")); } onClose && onClose(); };
  o.addEventListener("click", e => { if (e.target === o && dismiss) o.close(); if (e.target.closest("[data-close]")) o.close(); });
  o.q = s => o.querySelector(s); o.qa = s => [...o.querySelectorAll(s)];
  setTimeout(() => { const f = o.querySelector("[autofocus]"); f && f.focus(); }, 30);
  return o;
}
export function confirmBox(text, { ok = "Da", danger = true, detail = "" } = {}) {
  return new Promise(res => {
    const o = sheet(`<h3>${esc(text)}</h3>${detail ? `<div class="hint">${detail}</div>` : ""}<div class="foot"><button class="btn" data-a="0">Renunță</button><button class="btn ${danger ? "danger" : "primary"}" data-a="1">${esc(ok)}</button></div>`, { onClose: () => res(false) });
    o.addEventListener("click", e => { const a = e.target.closest("[data-a]")?.dataset.a; if (a !== undefined) { res(a === "1"); o.close(); } });
  });
}
export function prompt(title, { value = "", label = "", type = "text", hint = "" } = {}) {
  return new Promise(res => {
    const o = sheet(`<h3>${esc(title)}</h3><div class="fld">${label ? `<label class="f">${esc(label)}</label>` : ""}<input type="${type}" id="pr-v" value="${esc(value)}" autofocus></div>${hint ? `<div class="hint">${hint}</div>` : ""}
      <div class="foot"><button class="btn" data-close>Renunță</button><button class="btn primary" data-a="ok">OK</button></div>`, { onClose: () => res(null) });
    const ok = () => { const v = o.q("#pr-v").value; o.close(); res(v); };
    o.q('[data-a="ok"]').onclick = ok; o.q("#pr-v").onkeydown = e => { if (e.key === "Enter") ok(); };
  });
}

/* ---------- câmpuri ---------- */
export const fld = (label, inner, cls = "") => `<div class="fld ${cls}"><label class="f">${esc(label)}</label>${inner}</div>`;
export const inp = (id, v = "", attrs = "") => `<input type="text" id="${id}" value="${esc(v)}" ${attrs}>`;
export const amt = (id, v = "", attrs = "") => `<input type="text" inputmode="decimal" class="r" id="${id}" value="${v === "" || v === null || v === undefined ? "" : esc(String(v).replace(".", ","))}" ${attrs}>`;
export const dt = (id, v = "", attrs = "") => `<input type="date" id="${id}" value="${esc(v || "")}" ${attrs}>`;
export const opts = (pairs, cur) => pairs.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur ?? "") ? "selected" : ""}>${esc(l)}</option>`).join("");
export const sel = (id, pairs, cur, attrs = "") => `<select id="${id}" ${attrs}>${opts(pairs, cur)}</select>`;
export const chk = (id, label, on, hint = "") => `<label class="chk"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><span>${label}${hint ? `<span class="hint" style="display:block;margin:2px 0 0">${hint}</span>` : ""}</span></label>`;
export const seg = (id, pairs, cur) => `<div class="seg" id="${id}">${pairs.map(([v, l]) => `<button type="button" data-v="${esc(v)}" class="${String(v) === String(cur) ? "on" : ""}">${esc(l)}</button>`).join("")}</div>`;
export function segVal(root, id, onChange) {
  const el = root.querySelector("#" + id);
  el.addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b) return; el.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); onChange && onChange(b.dataset.v); });
  return () => el.querySelector("button.on")?.dataset.v;
}
export const val = (root, id) => { const e = root.querySelector("#" + id); return e ? (e.type === "checkbox" ? e.checked : e.value.trim()) : ""; };
export const nval = (root, id) => num(val(root, id));
export const pill = (cls, txt) => `<span class="pill ${cls}">${esc(txt)}</span>`;
export const flag = pid => `<span class="flag">${pid === "at" ? "AT" : "DE"}</span>`;
export const kpi = (label, value, sub = "", color = "", go = "") => `<div class="kpi" style="--c:${color || "var(--line)"}" ${go ? `data-go="${esc(go)}"` : ""}><div class="l">${esc(label)}</div><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>`;
export const empty = (txt, btn = "") => `<div class="empty">${txt}${btn ? `<div style="margin-top:12px">${btn}</div>` : ""}</div>`;
export const m = money, d = fmtDate;

/** Alegere fișiere (poză / PDF) */
export function pickFiles({ accept = "image/*,application/pdf", multiple = true, capture = false } = {}) {
  return new Promise(res => {
    const i = document.createElement("input"); i.type = "file"; i.accept = accept; i.multiple = multiple; if (capture) i.capture = "environment";
    i.onchange = () => res([...i.files]); i.oncancel = () => res([]); i.click();
  });
}
export async function saveFile(name, blob) {
  if (navigator.canShare && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { const f = new File([blob], name, { type: blob.type }); if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return; } } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
}
export function openBlob(blob) { const u = URL.createObjectURL(blob); const w = window.open(u, "_blank"); if (!w) saveFile("document" + (blob.type === "application/pdf" ? ".pdf" : ""), blob); setTimeout(() => URL.revokeObjectURL(u), 120000); }

export async function busy(btn, fn) {
  const t = btn ? btn.innerHTML : ""; if (btn) { btn.disabled = true; btn.innerHTML = "Se lucrează…"; }
  try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = t; } }
}
export async function safe(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; }
  catch (e) { console.error(e); toast(e?.code === "quota_exceeded" ? "Spațiul de stocare e plin. Fă un backup și șterge date vechi." : "Eroare: " + (e?.message || "nu s-a putut salva"), 4500); return false; }
}
