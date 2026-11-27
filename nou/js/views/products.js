// Produse (articole): nume ca pe bonul Z, unitate, preț, TVA, PLU, alte denumiri
import { S, list, prof } from "../state.js";
import { Store } from "../store.js";
import { stockOf, UNITS, uLabel } from "../model.js";
import { esc, money, newId, norm, num, numStr } from "../util.js";
import { $, icon, sheet, toast, confirmBox, fld, inp, amt, sel, chk, val, nval, empty, safe, opts } from "../ui.js";
import { unitOpts, nStr } from "./common.js";

let F = { q: "", g: "" };
export default {
  id: "products", title: "Produse", icon: "prod",
  render(el, arg, { acts }) {
    acts.innerHTML = `<button class="btn primary" id="p-add">${icon("plus")}<span class="hide-m">Produs nou</span></button>`;
    $("#p-add").onclick = () => productForm(null);
    const rows = list("products").filter(p => (!F.g || (F.g === "own" ? p.own : !p.own)) && (!F.q || norm([p.name, p.plu, ...(p.alias || [])].join(" ")).includes(norm(F.q)))).sort((a, b) => a.name.localeCompare(b.name, "de"));
    el.innerHTML = `<div class="toolbar"><input type="search" id="p-q" placeholder="Caută produs, PLU" value="${esc(F.q)}"><select id="p-g">${opts([["", "Toate"], ["own", "Producție proprie"], ["buy", "Cumpărate"]], F.g)}</select><span class="hint" style="margin:0">${rows.length} produse</span></div>
      <div class="list">${rows.length ? rows.map(p => `<div class="item" data-p="${esc(p.id)}"><div class="grow"><div class="t">${esc(p.name)}${p.own ? ` <span class="pill ok">proprie</span>` : ""}</div>
        <div class="s">${p.plu ? "PLU " + esc(p.plu) + " · " : ""}${esc(uLabel(p.unit))}${p.vat !== undefined && p.vat !== "" ? " · TVA " + esc(String(p.vat).replace(".", ",")) + " %" : ""}${(p.alias || []).length ? " · " + (p.alias || []).length + " alte denumiri" : ""}</div></div>
        <div style="text-align:right">${p.price ? `<div class="a">${money(p.price)}</div>` : ""}${p.track !== false && !p.own ? `<div class="s">stoc ${numStr(stockOf(p.id))} ${esc(uLabel(p.unit))}</div>` : ""}</div></div>`).join("") : empty("Niciun produs. Produsele apar și singure din Z-uri și facturile scanate.")}</div>`;
    $("#p-q", el).oninput = e => { F.q = e.target.value; clearTimeout(this._t); this._t = setTimeout(() => { this.render(el, "", { acts }); const q = $("#p-q", el); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
    $("#p-g", el).onchange = e => { F.g = e.target.value; this.render(el, "", { acts }); };
    el.onclick = e => { const it = e.target.closest("[data-p]"); if (it) productForm(S.products[it.dataset.p]); };
  }
};

export function productForm(p, onSaved) {
  const isNew = !p; p = p ? { ...p } : { id: newId(), name: "", unit: "kg", price: "", vat: "", plu: "", alias: [], own: false, track: true };
  const o = sheet(`<h3>${isNew ? "Produs nou" : esc(p.name)}</h3>
    ${fld("Nume (exact ca pe bonul Z / factură)", inp("pr-n", p.name, "autofocus"))}
    <div class="grid g3">${fld("Unitate", sel("pr-u", unitOpts(p.unit), p.unit))}${fld("Preț de vânzare (net)", amt("pr-p", p.price))}${fld("TVA %", amt("pr-v", p.vat, 'placeholder="implicit"'))}</div>
    <div class="grid g2">${fld("PLU / Nr. articol la casă", inp("pr-plu", p.plu))}${fld("Preț de cumpărare (opțional)", amt("pr-c", p.cost))}</div>
    ${chk("pr-own", "Producție proprie (zmeură, căpșuni …)", p.own, "Apare în statistica producției proprii; nu are stoc de marfă.")}
    ${chk("pr-t", "Țin evidența stocului", p.track !== false && !p.own)}
    ${fld("Alte denumiri (cum le citește scanerul; una pe rând)", `<textarea id="pr-a" rows="3">${esc((p.alias || []).join("\n"))}</textarea>`)}
    <div class="foot">${isNew ? "" : `<button class="btn danger" id="pr-del" style="margin-right:auto">${icon("trash")}</button>`}<button class="btn" data-close>Renunță</button><button class="btn primary" id="pr-ok">Salvează</button></div>`);
  o.q("#pr-own").onchange = e => { if (e.target.checked) o.q("#pr-t").checked = false; };
  o.q("#pr-ok").onclick = async () => {
    const n = { ...p, name: val(o, "pr-n"), unit: val(o, "pr-u"), price: val(o, "pr-p") === "" ? "" : nval(o, "pr-p"), vat: val(o, "pr-v") === "" ? "" : nval(o, "pr-v"), plu: val(o, "pr-plu"), cost: val(o, "pr-c") === "" ? "" : nval(o, "pr-c"),
      own: val(o, "pr-own"), track: val(o, "pr-t"), alias: val(o, "pr-a").split(/\n/).map(s => s.trim()).filter(Boolean) };
    if (!n.name) return toast("Scrie numele.");
    if (list("products").some(x => x.id !== n.id && norm(x.name) === norm(n.name))) return toast("Există deja un produs cu acest nume.");
    if (await safe(() => Store.put("products", n), "Salvat")) { o.close(); onSaved && onSaved(n); }
  };
  o.q("#pr-del") && (o.q("#pr-del").onclick = async () => { if (await confirmBox(`Ștergi „${p.name}”?`, { ok: "Șterge", detail: "Documentele vechi își păstrează numele produsului." })) { await Store.del("products", p.id); o.close(); } });
}
