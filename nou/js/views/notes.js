// Lieferscheine (avize de livrare)
import { S, list, prof, pidOf, defPid } from "../state.js";
import { Store } from "../store.js";
import { nextLsNo, lineNet, nextInvoiceNo } from "../model.js";
import { esc, money, fmtDate, today, newId, clone, r2, year, norm, addDays } from "../util.js";
import { $, $$, icon, sheet, toast, confirmBox, fld, inp, dt, val, pill, flag, empty, openBlob, saveFile, busy, safe, opts, seg, segVal } from "../ui.js";
import { linesEditor, profOpts, contactsDL, contactByName } from "./common.js";
import { applyContact } from "./invoices.js";
import { docBlob, docName } from "../pdf.js";

let F = { q: "", st: "open", y: String(new Date().getFullYear()) };
export default {
  id: "notes", title: "Lieferscheine", icon: "ls",
  render(el, arg, { acts }) {
    acts.innerHTML = `<button class="btn primary" id="n-add">${icon("plus")}<span class="hide-m">Lieferschein nou</span></button>`;
    $("#n-add").onclick = () => noteForm(null);
    const all = list("notes"), ys = [...new Set([String(new Date().getFullYear()), ...all.map(n => year(n.date))])].sort().reverse();
    const rows = all.filter(n => (F.y === "all" || year(n.date) === F.y) && (!F.st || (F.st === "open" ? !n.invoiceId : !!n.invoiceId)) && (!F.q || norm([n.no, n.to?.name, ...(n.items || []).map(i => i.name)].join(" ")).includes(norm(F.q))))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "") || String(b.no).localeCompare(String(a.no), "de", { numeric: true }));
    const groups = {}; all.filter(n => !n.invoiceId).forEach(n => { const k = n.contactId || norm(n.to?.name); (groups[k] ||= { name: n.to?.name || "?", cid: n.contactId, n: 0, sum: 0 }); groups[k].n++; groups[k].sum = r2(groups[k].sum + r2((n.items || []).reduce((s, i) => s + lineNet(i), 0))); });
    el.innerHTML = `${Object.keys(groups).length ? `<div class="card"><h2>Nefacturate</h2>${Object.values(groups).map(g => `<div class="row sb" style="padding:4px 0"><span><b>${esc(g.name)}</b> · ${g.n} Lieferschein(e)${g.sum ? " · " + money(g.sum) : ""}</span>${g.cid ? `<button class="btn small" data-bill="${esc(g.cid)}">${icon("inv")} Facturează</button>` : ""}</div>`).join("")}</div>` : ""}
      <div class="toolbar"><input type="search" id="n-q" placeholder="Caută" value="${esc(F.q)}"><select id="n-st">${opts([["open", "Nefacturate"], ["done", "Facturate"], ["", "Toate"]], F.st)}</select><select id="n-y">${opts([["all", "Toți anii"], ...ys.map(y => [y, y])], F.y)}</select></div>
      <div class="list">${rows.length ? rows.map(n => `<div class="item" data-n="${esc(n.id)}"><div class="grow"><div class="t">${esc(n.to?.name || "–")}</div><div class="s">${flag(pidOf(n))}${esc(n.no)} · ${esc(fmtDate(n.date))} · ${(n.items || []).map(i => esc(i.name)).join(", ")}</div></div>
        <div>${n.invoiceId ? pill("paid", S.invoices[n.invoiceId]?.no || "facturat") : pill("open", "nefacturat")}</div></div>`).join("") : empty("Niciun Lieferschein aici.")}</div>`;
    const re = () => this.render(el, "", { acts });
    $("#n-q", el).oninput = e => { F.q = e.target.value; clearTimeout(this._t); this._t = setTimeout(() => { re(); const q = $("#n-q", el); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
    $("#n-st", el).onchange = e => { F.st = e.target.value; re(); }; $("#n-y", el).onchange = e => { F.y = e.target.value; re(); };
    el.onclick = e => { const b = e.target.closest("[data-bill]"); if (b) return billContact(b.dataset.bill); const it = e.target.closest("[data-n]"); if (it) noteForm(S.notes[it.dataset.n]); };
  }
};

export function billContact(cid, ids) {
  const c = S.contacts[cid], open = list("notes").filter(n => !n.invoiceId && (ids ? ids.includes(n.id) : n.contactId === cid)).sort((a, b) => a.date.localeCompare(b.date));
  if (!open.length) return toast("Nu sunt Lieferscheine nefacturate.");
  const pid = pidOf(open[0]), P = prof(pid), d = today();
  const inv = { id: newId(), pid, type: "invoice", status: "draft", no: "", date: d, due: addDays(d, c?.payDays ?? P.payDays ?? 14), contactId: "", to: {}, items: [], payments: [], small: !!P.small, createdAt: Date.now() };
  if (c) applyContact(inv, c); else inv.to = clone(open[0].to || {});
  open.forEach(n => (n.items || []).forEach(it => inv.items.push({ date: n.date, ls: n.no, lsId: n.id, name: it.name, productId: it.productId || "", hkl: it.hkl || "", qty: it.qty, unit: it.unit, price: it.price || S.products[it.productId]?.price || "", vat: it.vat !== undefined && it.vat !== "" ? it.vat : P.defRate })));
  const ds = open.map(n => n.date).sort(); inv.serviceFrom = ds[0]; inv.serviceTo = ds[ds.length - 1];
  window.__draft = inv; location.hash = "invoices/new:";
}

export function noteForm(n0, preset) {
  const isNew = !n0, n = n0 ? clone(n0) : { id: newId(), pid: defPid(), no: "", date: today(), contactId: "", to: {}, items: [], note: "", ...(preset || {}) };
  const done = !!n.invoiceId;
  const o = sheet(`<h3>${isNew ? "Lieferschein nou" : "Lieferschein " + esc(n.no)}</h3>
    ${done ? `<div class="banner info">Facturat pe ${esc(S.invoices[n.invoiceId]?.no || "")} – nu se mai modifică.</div>` : ""}
    <div class="row" style="margin-bottom:10px">${seg("l-pid", profOpts(), pidOf(n))}</div>
    <div class="grid g2">${fld("Client", `<input type="text" id="l-c" list="dl-lc" value="${esc(n.to?.name || "")}" ${done ? "disabled" : ""}>${contactsDL("dl-lc", "c")}`)}${fld("Data", dt("l-d", n.date, done ? "disabled" : ""))}</div>
    <div id="l-lines"></div>
    ${fld("Notă", `<textarea id="l-note" rows="2" ${done ? "disabled" : ""}>${esc(n.note || "")}</textarea>`)}
    <div class="foot">${!isNew && !done ? `<button class="btn danger" id="l-del" style="margin-right:auto">${icon("trash")}</button>` : ""}
      ${!isNew ? `<button class="btn" id="l-pdf">${icon("pdf")} PDF</button>` : ""}${!isNew && !done && n.contactId ? `<button class="btn" id="l-bill">${icon("inv")} Facturează</button>` : ""}
      <button class="btn" data-close>Închide</button>${done ? "" : `<button class="btn primary" id="l-ok">Salvează</button>`}</div>`, { wide: true, dismiss: false });
  const pidGet = segVal(o, "l-pid");
  const S_ = S.settings.invoice.lsPrices !== false;
  const lines = linesEditor(o.q("#l-lines"), n.items, { cols: S_ ? ["name", "hkl", "qty", "unit", "price"] : ["name", "hkl", "qty", "unit"], noTotal: !S_, pid: () => pidGet() });
  if (done) o.qa("#l-lines input, #l-lines select, #l-lines button, #l-pid button").forEach(x => x.disabled = true);
  const collect = () => { n.pid = pidGet(); n.date = val(o, "l-d"); n.note = val(o, "l-note"); n.items = lines.get(); const nm = val(o, "l-c"); if (nm !== (n.to?.name || "")) { const c = contactByName(nm, "c"); if (c) applyContact(n, c); else { n.contactId = ""; n.to = { name: nm }; } } if (pidGet()) n.pid = pidGet(); return n; };
  o.q("#l-ok") && (o.q("#l-ok").onclick = async () => {
    collect(); if (!n.to?.name || !n.items.length) return toast("Scrie clientul și cel puțin un produs.");
    if (!n.no) n.no = nextLsNo(n.date, n.pid);
    if (await safe(() => Store.put("notes", n), "Lieferschein " + n.no + " salvat")) { o.close(); if (isNew) noteForm(S.notes[n.id]); }
  });
  o.q("#l-pdf") && (o.q("#l-pdf").onclick = e => busy(e.currentTarget, async () => { const b = await docBlob(done ? n : collect(), "ls"); /Android|iPhone|iPad/i.test(navigator.userAgent) ? saveFile(docName(n, "ls"), b) : openBlob(b); }));
  o.q("#l-del") && (o.q("#l-del").onclick = async () => { if (await confirmBox("Ștergi Lieferschein-ul " + n.no + "?", { ok: "Șterge" })) { await Store.del("notes", n.id); o.close(); } });
  o.q("#l-bill") && (o.q("#l-bill").onclick = () => { o.close(); billContact(n.contactId, [n.id]); });
}
