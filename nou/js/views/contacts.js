// Clienți și furnizori
import { S, list, prof, pidOf, defPid } from "../state.js";
import { Store } from "../store.js";
import { calcInvoice, calcPurchase, invState, isOpen, paid, nextCustNo, nextDatevNo } from "../model.js";
import { esc, money, newId, norm, r2, fmtDate, ibanOk, fmtIban } from "../util.js";
import { $, icon, sheet, toast, confirmBox, fld, inp, sel, chk, val, flag, empty, safe, opts } from "../ui.js";
import { profOpts } from "./common.js";
import { COUNTRY_LIST } from "../pdf.js";

let F = { q: "", role: "" };
export default {
  id: "contacts", title: "Clienți și furnizori", short: "Contacte", icon: "people",
  render(el, arg, { acts }) {
    acts.innerHTML = `<button class="btn primary" id="c-add">${icon("plus")}<span class="hide-m">Contact nou</span></button>`;
    $("#c-add").onclick = () => contactForm(null, { role: F.role || "c" });
    const rows = list("contacts").filter(c => (!F.role || (c.role || "c").includes(F.role)) && (!F.q || norm([c.name, c.city, c.no, c.email].join(" ")).includes(norm(F.q)))).sort((a, b) => a.name.localeCompare(b.name, "de"));
    const stat = c => {
      const inv = list("invoices").filter(i => i.contactId === c.id && i.status !== "draft" && i.status !== "cancelled"), pur = list("purchases").filter(p => p.contactId === c.id);
      const open = r2(inv.filter(i => isOpen(invState(i))).reduce((s, i) => s + calcInvoice(i).gross - paid(i), 0));
      return { n: inv.length + pur.length, open, ys: r2(inv.filter(i => (i.date || "").startsWith(String(new Date().getFullYear()))).reduce((s, i) => s + calcInvoice(i).gross, 0)) };
    };
    el.innerHTML = `<div class="toolbar"><input type="search" id="c-q" placeholder="Caută" value="${esc(F.q)}"><select id="c-r">${opts([["", "Toți"], ["c", "Clienți"], ["s", "Furnizori"]], F.role)}</select></div>
      <div class="list">${rows.length ? rows.map(c => { const s = stat(c); return `<div class="item" data-c="${esc(c.id)}"><div class="grow"><div class="t">${esc(c.name)}</div>
        <div class="s">${flag(pidOf(c))}${(c.role || "c") === "s" ? "Furnizor" : (c.role || "c") === "cs" ? "Client și furnizor" : "Client"}${c.no ? " · " + esc(c.no) : ""}${c.city ? " · " + esc(c.city) : ""}</div></div>
        <div style="text-align:right">${s.open ? `<div class="a">${money(s.open)}</div><div class="s">de încasat</div>` : s.ys ? `<div class="s">${money(s.ys)} anul acesta</div>` : ""}</div></div>`; }).join("") : empty("Niciun contact.")}</div>`;
    $("#c-q", el).oninput = e => { F.q = e.target.value; clearTimeout(this._t); this._t = setTimeout(() => { this.render(el, "", { acts }); const q = $("#c-q", el); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
    $("#c-r", el).onchange = e => { F.role = e.target.value; this.render(el, "", { acts }); };
    el.onclick = e => { const it = e.target.closest("[data-c]"); if (it) contactForm(S.contacts[it.dataset.c]); };
  }
};

export function contactForm(c, { role = "c", name = "", pid = "", onSaved } = {}) {
  const isNew = !c;
  c = c ? { ...c } : { id: newId(), role, name, pid: pid || defPid(), no: role.includes("c") ? nextCustNo() : "", country: "" };
  const inv = list("invoices").filter(i => i.contactId === c.id && i.status !== "draft").sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 8);
  const o = sheet(`<h3>${isNew ? "Contact nou" : esc(c.name)}</h3>
    <div class="grid g2">${fld("Tip", sel("k-r", [["c", "Client"], ["s", "Furnizor"], ["cs", "Client și furnizor"]], c.role || "c"))}${fld("Țara fiscală (profil)", sel("k-p", profOpts(), pidOf(c)))}</div>
    ${fld("Nume / firmă", inp("k-n", c.name, "autofocus"))}${fld("Rând 2 (opțional)", inp("k-n2", c.name2))}
    ${fld("Stradă, nr.", inp("k-s", c.street))}
    <div class="grid g3">${fld("Cod poștal", inp("k-z", c.zip))}${fld("Oraș", inp("k-c", c.city))}${fld("Țara", sel("k-co", [["", "–"], ...COUNTRY_LIST], c.country))}</div>
    <div class="grid g2">${fld("E-mail", `<input type="email" id="k-e" value="${esc(c.email || "")}">`)}${fld("Telefon", inp("k-t", c.phone))}</div>
    <div class="grid g3">${fld("Nr. client", inp("k-no", c.no))}${fld("USt-IdNr. / UID", inp("k-v", c.vatId))}${fld("Termen de plată (zile)", inp("k-pd", c.payDays ?? "", 'inputmode="numeric" placeholder="implicit"'))}</div>
    <div class="grid g2">${fld("IBAN (furnizori)", inp("k-iban", c.iban ? fmtIban(c.iban) : ""))}${fld("Leitweg-ID (autorități)", inp("k-l", c.leitweg))}</div>
    <div class="grid g2">${fld("Cont DATEV debitor (opțional)", inp("k-dc", c.datevC, 'inputmode="numeric" placeholder="ex. 10001"'))}${fld("Cont DATEV creditor (opțional)", inp("k-ds", c.datevS, 'inputmode="numeric" placeholder="ex. 70001"'))}</div>
    ${fld("Notițe", `<textarea id="k-note" rows="2">${esc(c.note || "")}</textarea>`)}
    ${inv.length ? `<div class="sec" style="margin-top:6px">Ultimele facturi</div><div class="list">${inv.map(i => `<div class="item" data-go="invoices/${esc(i.id)}"><div class="grow"><div class="t">${esc(i.no)}</div><div class="s">${esc(fmtDate(i.date))}</div></div><div class="a">${money(calcInvoice(i).gross)}</div></div>`).join("")}</div>` : ""}
    <div class="foot">${isNew ? "" : `<button class="btn danger" id="k-del" style="margin-right:auto">${icon("trash")}</button><button class="btn" id="k-newinv">${icon("inv")} Factură</button>`}<button class="btn" data-close>Renunță</button><button class="btn primary" id="k-ok">Salvează</button></div>`);
  o.q("#k-dc").addEventListener("focus", e => { if (!e.target.value && S.settings.datev.mode === "opos") e.target.value = nextDatevNo("c"); });
  o.q("#k-ds").addEventListener("focus", e => { if (!e.target.value && S.settings.datev.mode === "opos") e.target.value = nextDatevNo("s"); });
  o.q("#k-ok").onclick = async () => {
    const n = { ...c, role: val(o, "k-r"), pid: val(o, "k-p"), name: val(o, "k-n"), name2: val(o, "k-n2"), street: val(o, "k-s"), zip: val(o, "k-z"), city: val(o, "k-c"), country: val(o, "k-co"), email: val(o, "k-e"), phone: val(o, "k-t"),
      no: val(o, "k-no"), vatId: val(o, "k-v"), payDays: val(o, "k-pd") === "" ? "" : parseInt(val(o, "k-pd"), 10) || 0, iban: val(o, "k-iban").replace(/\s/g, ""), leitweg: val(o, "k-l"), datevC: val(o, "k-dc"), datevS: val(o, "k-ds"), note: val(o, "k-note") };
    if (!n.name) return toast("Scrie numele.");
    if (n.iban && !ibanOk(n.iban)) return toast("IBAN-ul nu pare corect – verifică cifrele.", 4000);
    if (list("contacts").some(x => x.id !== n.id && norm(x.name) === norm(n.name)) && !(await confirmBox(`Există deja „${n.name}”. Salvez totuși?`, { ok: "Salvează", danger: false }))) return;
    if (await safe(() => Store.put("contacts", n), "Salvat")) { o.close(); onSaved && onSaved(S.contacts[n.id]); }
  };
  o.q("#k-del") && (o.q("#k-del").onclick = async () => {
    const used = list("invoices").some(i => i.contactId === c.id) || list("purchases").some(p => p.contactId === c.id);
    if (await confirmBox(`Ștergi „${c.name}”?`, { ok: "Șterge", detail: used ? "Documentele existente își păstrează adresa; doar fișa contactului dispare." : "" })) { await Store.del("contacts", c.id); o.close(); }
  });
  o.q("#k-newinv") && (o.q("#k-newinv").onclick = () => { o.close(); location.hash = "invoices/new:" + c.id; });
  return o;
}
