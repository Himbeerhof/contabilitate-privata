// Componente comune pentru ecrane: poziții (rânduri), plăți, atașamente, alegerea clientului
import { S, list, prof, PIDS } from "../state.js";
import { Store } from "../store.js";
import { lineNet, UNITS, uLabel, PAY, productMatch } from "../model.js";
import { esc, num, r2, money, numStr, fmtDate, today, newId, fmtSize } from "../util.js";
import { $, sheet, toast, opts, pickFiles, openBlob, confirmBox, icon } from "../ui.js";

export const profOpts = () => PIDS.map(p => [p, prof(p).label]);
export const rateOpts = (pid, cur) => { const l = [...new Set([...(prof(pid).rates || []).map(Number), ...(cur !== undefined && cur !== "" ? [num(cur)] : [])])]; return l.map(r => [r, String(r).replace(".", ",") + " %"]); };
export const unitOpts = cur => { const l = UNITS.slice(); if (cur && !l.some(u => u[0] === cur)) l.push([cur, cur]); return l; };
export const productsDL = (id = "dl-products") => `<datalist id="${id}">${list("products").sort((a, b) => a.name.localeCompare(b.name, "de")).map(p => `<option value="${esc(p.name)}">`).join("")}</datalist>`;
export const contactsDL = (id, role) => `<datalist id="${id}">${list("contacts").filter(c => !role || (c.role || "c").includes(role)).sort((a, b) => a.name.localeCompare(b.name, "de")).map(c => `<option value="${esc(c.name)}">`).join("")}</datalist>`;
export const contactByName = (n, role) => { const k = String(n || "").trim().toLowerCase(); return k ? list("contacts").find(c => c.name.trim().toLowerCase() === k && (!role || (c.role || "c").includes(role))) : null; };
export const nStr = v => v === "" || v === null || v === undefined ? "" : String(v).replace(".", ",");

/* ---------- poziții (factură, Lieferschein, intrare marfă) ---------- */
/**
 * Editor de rânduri. opts: { pid, cols: ["date","ls","name","hkl","qty","unit","price","vat"], onChange }
 * Returnează { el, get() } ; rândurile sunt păstrate în memorie, re-desenate la adăugare/ștergere.
 */
export function linesEditor(host, items, o) {
  const cols = o.cols, rows = items.length ? items.map(i => ({ ...i })) : [blank()];
  function blank(prev) { return { date: prev?.date || o.defDate || "", ls: prev?.ls || "", name: "", hkl: "", qty: "", unit: "kg", price: "", vat: o.pid ? prof(o.pid()).defRate : "" }; }
  const L = { date: "Data livrării", ls: "Nr. LS", name: "Produs", hkl: "Clasa", qty: "Cantitate", unit: "Unitate", price: "Preț / unit.", vat: "TVA", tot: "Total" };
  const cell = (r, k, c) => {
    const v = r[c];
    if (c === "date") return `<td data-l="${L[c]}" class="w2"><input type="date" data-k="${k}" data-c="date" value="${esc(v || "")}"></td>`;
    if (c === "ls") return `<td data-l="${L[c]}"><input type="text" data-k="${k}" data-c="ls" value="${esc(v || "")}" style="width:86px"></td>`;
    if (c === "name") return `<td data-l="${L[c]}" class="w3" style="min-width:180px"><input type="text" list="dl-products" data-k="${k}" data-c="name" value="${esc(v || "")}" placeholder="ex. Himbeeren"></td>`;
    if (c === "hkl") return `<td data-l="${L[c]}"><select data-k="${k}" data-c="hkl" style="width:72px">${opts([["", "–"], ["Extra", "Extra"], ["I", "I"], ["II", "II"]], v)}</select></td>`;
    if (c === "qty") return `<td data-l="${L[c]}"><input type="text" inputmode="decimal" class="r" data-k="${k}" data-c="qty" value="${esc(nStr(v))}" style="width:84px"></td>`;
    if (c === "unit") return `<td data-l="${L[c]}"><select data-k="${k}" data-c="unit" style="width:96px">${opts(unitOpts(v), v || "kg")}</select></td>`;
    if (c === "price") return `<td data-l="${L[c]}"><input type="text" inputmode="decimal" class="r" data-k="${k}" data-c="price" value="${esc(nStr(v))}" style="width:90px"></td>`;
    if (c === "vat") return `<td data-l="${L[c]}"><select data-k="${k}" data-c="vat" style="width:84px">${opts(rateOpts(o.pid(), v), v)}</select></td>`;
    return "";
  };
  function draw() {
    host.innerHTML = `${productsDL()}<table class="lines"><thead><tr>${cols.map(c => `<th>${L[c]}</th>`).join("")}${o.noTotal ? "" : `<th style="text-align:right">${L.tot}</th>`}<th></th></tr></thead><tbody>
      ${rows.map((r, k) => `<tr>${cols.map(c => cell(r, k, c)).join("")}${o.noTotal ? "" : `<td class="tot" data-l="Total" data-tot="${k}">${money(lineNet(r))}</td>`}<td><button type="button" class="btn ghost small" data-rm="${k}" title="Șterge rândul">${icon("x")}</button></td></tr>`).join("")}
      </tbody></table><div class="row" style="margin-top:8px"><button type="button" class="btn small" data-add>${icon("plus")} Rând</button>${o.extraBtns || ""}</div>`;
  }
  draw();
  host.addEventListener("input", e => {
    const t = e.target, k = t.dataset.k, c = t.dataset.c; if (k === undefined) return;
    rows[k][c] = ["qty", "price", "vat"].includes(c) ? t.value : t.value;
    if (c === "name") {
      const p = productMatch(t.value);
      if (p && list("products").some(x => x.name === t.value)) { rows[k].productId = p.id; if (!num(rows[k].price) && p.price) { rows[k].price = p.price; host.querySelector(`[data-k="${k}"][data-c="price"]`).value = nStr(p.price); }
        if (p.unit) { rows[k].unit = p.unit; const u = host.querySelector(`[data-k="${k}"][data-c="unit"]`); if (u) u.innerHTML = opts(unitOpts(p.unit), p.unit); }
        if (o.pid && p.vat !== undefined && p.vat !== "" && cols.includes("vat") && (prof(o.pid()).rates || []).map(Number).includes(num(p.vat))) { rows[k].vat = p.vat; host.querySelector(`[data-k="${k}"][data-c="vat"]`).value = String(p.vat); } }
      else rows[k].productId = "";
    }
    const td = host.querySelector(`[data-tot="${k}"]`); if (td) td.textContent = money(lineNet(rows[k]));
    o.onChange && o.onChange();
  });
  host.addEventListener("change", e => { const t = e.target; if (t.tagName === "SELECT" && t.dataset.k !== undefined) { rows[t.dataset.k][t.dataset.c] = t.value; o.onChange && o.onChange(); } });
  host.addEventListener("click", e => {
    if (e.target.closest("[data-add]")) { rows.push(blank(rows[rows.length - 1])); draw(); o.onChange && o.onChange(); const ins = host.querySelectorAll(`[data-c="name"]`); ins[ins.length - 1]?.focus(); }
    const rm = e.target.closest("[data-rm]"); if (rm) { rows.splice(+rm.dataset.rm, 1); if (!rows.length) rows.push(blank()); draw(); o.onChange && o.onChange(); }
  });
  return {
    get: () => rows.filter(r => String(r.name || "").trim() || num(r.qty) || num(r.price)).map(r => {
      const p = r.productId ? S.products[r.productId] : productMatch(r.name);
      return { ...r, name: String(r.name || "").trim(), productId: p && (p.name === r.name || (p.alias || []).includes(r.name)) ? p.id : (r.productId || ""), qty: num(r.qty), price: num(r.price), vat: r.vat === "" ? "" : num(r.vat) };
    }),
    set: arr => { rows.length = 0; arr.forEach(x => rows.push({ ...x })); if (!rows.length) rows.push(blank()); draw(); },
    redraw: draw, rows
  };
}

/* ---------- plăți ---------- */
export function paymentsEditor(host, payments, { total, onChange, label = "Plăți" }) {
  const pays = (payments || []).map(p => ({ ...p }));
  function draw() {
    const t = total(), pd = r2(pays.reduce((s, p) => s + num(p.amount), 0)), rest = r2(t - pd);
    host.innerHTML = `<div class="row sb" style="margin-bottom:6px"><b>${esc(label)}</b><span class="hint" style="margin:0">${rest > 0.004 ? `Rest: <b>${money(rest)}</b>` : rest < -0.004 ? `Plătit în plus: ${money(-rest)}` : t ? "<span style='color:var(--ok);font-weight:650'>Plătit complet</span>" : ""}</span></div>
      ${pays.map((p, k) => `<div class="row" style="margin-bottom:6px"><input type="date" data-p="${k}" data-c="date" value="${esc(p.date || "")}" style="width:150px">
        <input type="text" inputmode="decimal" class="r" data-p="${k}" data-c="amount" value="${esc(nStr(p.amount))}" style="width:110px">
        <select data-p="${k}" data-c="method" style="width:auto">${opts(Object.entries(PAY), p.method || "bank")}</select>
        <button type="button" class="btn ghost small" data-prm="${k}">${icon("x")}</button></div>`).join("")}
      <div class="row">${rest > 0.004 ? `<button type="button" class="btn small" data-pfull="bank">Plătit tot – bancă</button><button type="button" class="btn small" data-pfull="cash">Plătit tot – numerar</button>` : ""}<button type="button" class="btn small ghost" data-padd>${icon("plus")} Plată parțială</button></div>`;
  }
  draw();
  host.addEventListener("input", e => { const t = e.target; if (t.dataset.p === undefined) return; pays[t.dataset.p][t.dataset.c] = t.dataset.c === "amount" ? t.value : t.value; onChange && onChange(); });
  host.addEventListener("change", e => { const t = e.target; if (t.dataset.p !== undefined) { pays[t.dataset.p][t.dataset.c] = t.value; draw(); onChange && onChange(); } });
  host.addEventListener("click", e => {
    const f = e.target.closest("[data-pfull]"); if (f) { const rest = r2(total() - pays.reduce((s, p) => s + num(p.amount), 0)); pays.push({ id: newId(), date: today(), amount: rest, method: f.dataset.pfull }); draw(); onChange && onChange(); }
    if (e.target.closest("[data-padd]")) { pays.push({ id: newId(), date: today(), amount: "", method: "bank" }); draw(); }
    const rm = e.target.closest("[data-prm]"); if (rm) { pays.splice(+rm.dataset.prm, 1); draw(); onChange && onChange(); }
  });
  return { get: () => pays.filter(p => num(p.amount)).map(p => ({ id: p.id || newId(), date: p.date || today(), amount: r2(num(p.amount)), method: p.method || "bank" })), redraw: draw };
}

/* ---------- atașamente (poze, PDF, XML) ---------- */
export function filesWidget(host, fileIds, { onAdd, title = "Documente (poză / PDF)", accept = "image/*,application/pdf,.xml,text/xml" } = {}) {
  const ids = [...(fileIds || [])];
  const thumbs = new Map();
  async function draw() {
    host.innerHTML = `<div class="row sb" style="margin-bottom:6px"><b>${esc(title)}</b></div><div class="thumbs">${ids.map(id => { const m = S.files[id] || {}; return `<div class="thumb" data-open="${id}" title="${esc(m.name || "")}" ${thumbs.get(id) ? `style="background-image:url('${thumbs.get(id)}')"` : ""}>${thumbs.get(id) ? "" : esc((m.type || "").includes("pdf") ? "PDF" : (m.type || "").includes("xml") ? "XML" : "fișier")}<b data-del="${id}">×</b></div>`; }).join("")}
      <button type="button" class="thumb" data-addf="cam" style="border-style:dashed">${icon("cam")}</button><button type="button" class="thumb" data-addf="file" style="border-style:dashed;flex-direction:column">${icon("up")}<span>fișier</span></button></div>`;
    for (const id of ids) if (!thumbs.has(id) && /^image\//.test(S.files[id]?.type || "")) { const b = await Store.fileBlob(id); if (b) { thumbs.set(id, URL.createObjectURL(b)); const t = host.querySelector(`[data-open="${id}"]`); if (t) { t.style.backgroundImage = `url('${thumbs.get(id)}')`; t.firstChild.nodeType === 3 && (t.firstChild.textContent = ""); } } }
  }
  draw();
  host.addEventListener("click", async e => {
    const del = e.target.closest("[data-del]"); if (del) { e.stopPropagation(); if (await confirmBox("Scot documentul?", { ok: "Scoate" })) { ids.splice(ids.indexOf(del.dataset.del), 1); draw(); } return; }
    const op = e.target.closest("[data-open]"); if (op) { const b = await Store.fileBlob(op.dataset.open); b ? openBlob(b) : toast("Fișierul nu e pe acest dispozitiv încă (se descarcă la sincronizare)."); return; }
    const ad = e.target.closest("[data-addf]"); if (ad) { const fl = await pickFiles({ accept: ad.dataset.addf === "cam" ? "image/*" : accept, capture: ad.dataset.addf === "cam" }); await add(fl); }
  });
  async function add(fl) {
    const added = [];
    for (const f of fl) { const blob = /^image\//.test(f.type) ? await shrink(f) : f; const m = await Store.addFile(blob, { name: f.name }); ids.push(m.id); added.push({ meta: m, file: f, blob }); }
    draw(); if (added.length && onAdd) onAdd(added);
  }
  host.addEventListener("cp-add-files", e => add(e.detail || []));
  return { get: () => ids.slice(), add };
}
/** Micșorează pozele mari (păstrează lizibilitatea pentru DATEV) */
export async function shrink(file, max = 2200, q = 0.85) {
  try {
    const url = URL.createObjectURL(file), img = new Image(); img.src = url; await img.decode();
    const sc = Math.min(1, max / Math.max(img.width, img.height)); if (sc === 1 && file.size < 1.6e6 && /jpe?g/.test(file.type)) { URL.revokeObjectURL(url); return file; }
    const cv = document.createElement("canvas"); cv.width = Math.round(img.width * sc); cv.height = Math.round(img.height * sc);
    const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
    return await new Promise(r => cv.toBlob(b => r(b || file), "image/jpeg", q));
  } catch (e) { return file; }
}

export const periodOpts = (yearSel, monthSel, dates, { all = false } = {}) => {
  const ys = [...new Set([String(new Date().getFullYear()), ...dates.filter(Boolean).map(d => d.slice(0, 4))])].sort().reverse();
  return { years: (all ? [["all", "Toți anii"]] : []).concat(ys.map(y => [y, y])) };
};
