// Inventar: stocul de marfă, mișcări, inventariere (Inventur), producția proprie
import { S, list } from "../state.js";
import { Store } from "../store.js";
import { stockOf, stockMoves, lastPrice, uLabel, lineNet } from "../model.js";
import { esc, money, fmtDate, today, newId, num, r2, r3, numStr, norm, by, ym, MONTHS, year } from "../util.js";
import { $, icon, sheet, toast, confirmBox, fld, inp, amt, dt, sel, val, nval, kpi, empty, safe, opts, seg, segVal, saveFile } from "../ui.js";

let F = { tab: "stock", q: "", y: String(new Date().getFullYear()) };
const REASONS = { loss: "Pierdere / stricat", own: "Consum propriu", gift: "Dăruit / mostre", correct: "Corectură", other: "Altele" };
export default {
  id: "stock", title: "Inventar", icon: "stock",
  render(el, arg, { acts }) {
    acts.innerHTML = `<button class="btn" id="s-adj">${icon("plus")}<span class="hide-m">Corectură</span></button><button class="btn primary" id="s-inv">${icon("check")}<span class="hide-m">Inventariere</span></button>`;
    $("#s-adj").onclick = () => adjForm(); $("#s-inv").onclick = () => inventurForm();
    const prods = list("products").filter(p => p.track !== false && !p.own).filter(p => !F.q || norm(p.name).includes(norm(F.q))).sort((a, b) => a.name.localeCompare(b.name, "de"));
    const rows = prods.map(p => { const q = stockOf(p.id), pr = lastPrice(p.id); return { p, q, val: r2(Math.max(0, q) * pr), pr }; });
    const lastInv = list("inventories").sort(by(i => i.date, -1))[0];
    el.innerHTML = `<div class="grid g3" style="margin-bottom:14px">${kpi("Valoarea stocului", money(r2(rows.reduce((s, r) => s + r.val, 0))), "la ultimul preț de cumpărare", "var(--brand)")}
        ${kpi("Produse în stoc", String(rows.filter(r => r.q > 0.0005).length), `${rows.filter(r => r.q < -0.0005).length} cu stoc negativ`, rows.some(r => r.q < -0.0005) ? "var(--warn)" : "var(--ok)")}
        ${kpi("Ultima inventariere", lastInv ? fmtDate(lastInv.date) : "niciuna", lastInv ? Object.keys(lastInv.counts || {}).length + " produse numărate" : "fă una la început de an", "var(--info)")}</div>
      <div class="toolbar">${seg("s-tab", [["stock", "Stoc"], ["own", "Producție proprie"], ["inv", "Inventarieri"]], F.tab)}${F.tab === "stock" ? `<input type="search" id="s-q" placeholder="Caută produs" value="${esc(F.q)}">` : ""}${F.tab === "own" ? `<select id="s-y">${opts([...new Set([String(new Date().getFullYear()), ...list("cashdays").map(d => year(d.date))])].sort().reverse().map(y => [y, y]), F.y)}</select>` : ""}</div>
      <div id="s-body"></div>`;
    const body = $("#s-body", el);
    if (F.tab === "stock") {
      body.innerHTML = `<div class="list tw"><table class="t"><tr><th>Produs</th><th class="n">Stoc</th><th class="n">Preț cump.</th><th class="n">Valoare</th></tr>
        ${rows.length ? rows.map(r => `<tr data-p="${esc(r.p.id)}" style="cursor:pointer"><td>${esc(r.p.name)}</td><td class="n" style="${r.q < -0.0005 ? "color:var(--bad);font-weight:700" : ""}">${numStr(r.q)} ${esc(uLabel(r.p.unit))}</td><td class="n">${r.pr ? money(r.pr) : "–"}</td><td class="n">${r.val ? money(r.val) : "–"}</td></tr>`).join("") : `<tr><td colspan="4">${empty("Niciun produs cu stoc. Stocul crește din facturile de marfă și scade din Z-uri, facturi și Lieferscheine.")}</td></tr>`}</table></div>
        <div class="hint">Stoc negativ = s-a vândut mai mult decât s-a înregistrat la intrări (lipsesc facturi de marfă sau numele din Z nu se potrivește cu produsul).</div>`;
      body.onclick = e => { const tr = e.target.closest("[data-p]"); if (tr) movesSheet(S.products[tr.dataset.p]); };
      const q = $("#s-q", el); q.oninput = e => { F.q = e.target.value; clearTimeout(this._t); this._t = setTimeout(() => { this.render(el, "", { acts }); const q2 = $("#s-q", el); q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); }, 250); };
    } else if (F.tab === "own") {
      const own = list("products").filter(p => p.own), ids = new Set(own.map(p => p.id)), byP = {};
      const add = (pid, d, qty, eur) => { const k = byP[pid] ||= { m: Array(12).fill(0), e: 0, q: 0 }; k.m[+d.slice(5, 7) - 1] = r3(k.m[+d.slice(5, 7) - 1] + qty); k.q = r3(k.q + qty); k.e = r2(k.e + eur); };
      list("cashdays").filter(d => year(d.date) === F.y).forEach(d => (d.items || []).forEach(i => { if (ids.has(i.productId)) add(i.productId, d.date, num(i.qty), num(i.qty) * num(i.price)); }));
      list("invoices").filter(i => i.status !== "draft" && i.status !== "cancelled" && year(i.date) === F.y).forEach(inv => (inv.items || []).forEach(i => { if (ids.has(i.productId)) add(i.productId, i.date || inv.date, num(i.qty), lineNet(i)); }));
      body.innerHTML = own.length ? `<div class="list tw"><table class="t"><tr><th>Produs</th>${MONTHS.map(m => `<th class="n">${m.slice(0, 3)}</th>`).join("")}<th class="n">Total</th><th class="n">€</th></tr>
        ${own.map(p => { const k = byP[p.id] || { m: Array(12).fill(0), q: 0, e: 0 }; return `<tr><td>${esc(p.name)}</td>${k.m.map(v => `<td class="n">${v ? numStr(v, 1) : ""}</td>`).join("")}<td class="n"><b>${numStr(k.q, 1)}</b> ${esc(uLabel(p.unit))}</td><td class="n">${k.e ? money(k.e) : ""}</td></tr>`; }).join("")}</table></div>
        <div class="hint">Din produsele vândute pe Z-uri și din facturi. Marchează produsele proprii la Produse („Producție proprie”).</div><button class="btn small" id="s-csv">${icon("dl")} CSV</button>`
        : empty("Niciun produs marcat „Producție proprie”. Deschide un produs la Produse și bifează.");
      $("#s-csv", el) && ($("#s-csv", el).onclick = () => { const l = ["Produkt;" + MONTHS.join(";") + ";Total;EUR", ...own.map(p => { const k = byP[p.id] || { m: Array(12).fill(0), q: 0, e: 0 }; return [p.name, ...k.m.map(v => String(v).replace(".", ",")), String(k.q).replace(".", ","), String(k.e).replace(".", ",")].join(";"); })];
        saveFile(`Eigenproduktion_${F.y}.csv`, new Blob(["﻿" + l.join("\r\n")], { type: "text/csv" })); });
      $("#s-y", el).onchange = e => { F.y = e.target.value; this.render(el, "", { acts }); };
    } else {
      const invs = list("inventories").sort(by(i => i.date, -1));
      body.innerHTML = `<div class="list">${invs.length ? invs.map(i => `<div class="item" data-i="${esc(i.id)}"><div class="grow"><div class="t">Inventariere ${esc(fmtDate(i.date))}</div><div class="s">${Object.keys(i.counts || {}).length} produse${i.note ? " · " + esc(i.note) : ""}</div></div><div class="a">${money(r2(Object.entries(i.counts || {}).reduce((s, [p, q]) => s + num(q) * num(i.prices?.[p] ?? lastPrice(p)), 0)))}</div></div>`).join("") : empty("Nicio inventariere. La începutul anului (sau ca să pornești de la zero) numără marfa și trece aici.")}</div>`;
      body.onclick = e => { const it = e.target.closest("[data-i]"); if (it) inventurForm(S.inventories[it.dataset.i]); };
    }
    segVal(el, "s-tab", v => { F.tab = v; this.render(el, "", { acts }); });
  }
};

function movesSheet(p) {
  const mv = stockMoves(p.id).reverse().slice(0, 200);
  sheet(`<h3>${esc(p.name)} · stoc ${numStr(stockOf(p.id))} ${esc(uLabel(p.unit))}</h3><div class="list tw"><table class="t"><tr><th>Data</th><th>Ce</th><th class="n">Cantitate</th></tr>
    ${mv.map(m => `<tr><td>${esc(fmtDate(m.date))}</td><td>${esc(m.what || "")}</td><td class="n" style="color:${m.qty < 0 ? "var(--out)" : "var(--in)"}">${m.qty > 0 ? "+" : ""}${numStr(m.qty)}</td></tr>`).join("") || `<tr><td colspan="3">Nicio mișcare.</td></tr>`}</table></div>
    <div class="hint">Stocul pornește de la ultima inventariere.</div><div class="foot"><button class="btn" data-close>Închide</button></div>`, { wide: true });
}

function adjForm() {
  const prods = list("products").filter(p => p.track !== false && !p.own).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const o = sheet(`<h3>Corectură de stoc</h3>
    <div class="grid g2">${fld("Produs", sel("a-p", prods.map(p => [p.id, p.name])))}${fld("Data", dt("a-d", today()))}</div>
    <div class="grid g2">${fld("Cantitate (minus = scade)", amt("a-q", "", 'placeholder="ex. -5"'))}${fld("Motiv", sel("a-r", Object.entries(REASONS)))}</div>
    ${fld("Notă", inp("a-n", ""))}<div class="foot"><button class="btn" data-close>Renunță</button><button class="btn primary" id="a-ok">Salvează</button></div>`);
  o.q("#a-ok").onclick = async () => { const q = nval(o, "a-q"); if (!q) return toast("Scrie cantitatea.");
    if (await safe(() => Store.put("stockmoves", { id: newId(), productId: val(o, "a-p"), date: val(o, "a-d"), qty: q, reason: val(o, "a-r"), text: REASONS[val(o, "a-r")] + (val(o, "a-n") ? " · " + val(o, "a-n") : "") }), "Salvat")) o.close(); };
}

function inventurForm(inv0) {
  const isNew = !inv0, inv = inv0 ? { ...inv0 } : { id: newId(), date: today(), counts: {}, prices: {}, note: "" };
  const prods = list("products").filter(p => p.track !== false && !p.own).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const o = sheet(`<h3>${isNew ? "Inventariere" : "Inventariere " + esc(fmtDate(inv.date))}</h3>
    <div class="hint">Numără marfa și scrie cantitățile. De la această dată, stocul pornește de la aceste cifre (de ex. la 1 ianuarie, ca un an nou: marfa veche nu se mai socotește). Produsele lăsate goale = 0.</div>
    <div class="grid g2">${fld("Data", dt("i-d", inv.date))}${fld("Notă", inp("i-n", inv.note, 'placeholder="ex. Inventur 31.12."'))}</div>
    <div class="list tw"><table class="t"><tr><th>Produs</th><th class="n">Calculat</th><th class="n">Numărat</th><th class="n">Preț</th></tr>
    ${prods.map(p => `<tr><td>${esc(p.name)}</td><td class="n">${numStr(stockOf(p.id, inv.date))}</td><td class="n"><input type="text" inputmode="decimal" class="r" data-c="${esc(p.id)}" value="${inv.counts[p.id] !== undefined ? esc(String(inv.counts[p.id]).replace(".", ",")) : ""}" style="width:90px"></td>
      <td class="n"><input type="text" inputmode="decimal" class="r" data-pr="${esc(p.id)}" value="${esc(String(inv.prices?.[p.id] ?? lastPrice(p.id) ?? "").replace(".", ","))}" style="width:80px"></td></tr>`).join("")}</table></div>
    <div class="foot">${isNew ? "" : `<button class="btn danger" id="i-del" style="margin-right:auto">${icon("trash")}</button>`}<button class="btn" data-close>Renunță</button><button class="btn primary" id="i-ok">Salvează</button></div>`, { wide: true, dismiss: false });
  o.q("#i-ok").onclick = async () => { const counts = {}, prices = {};
    o.qa("[data-c]").forEach(i => { if (i.value.trim() !== "") counts[i.dataset.c] = num(i.value); });
    o.qa("[data-pr]").forEach(i => { if (i.value.trim() !== "") prices[i.dataset.pr] = num(i.value); });
    if (await safe(() => Store.put("inventories", { ...inv, date: val(o, "i-d"), note: val(o, "i-n"), counts, prices }), "Inventariere salvată")) o.close(); };
  o.q("#i-del") && (o.q("#i-del").onclick = async () => { if (await confirmBox("Ștergi inventarierea?", { ok: "Șterge" })) { await Store.del("inventories", inv.id); o.close(); } });
}
