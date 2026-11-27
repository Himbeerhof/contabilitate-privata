// Facturi scrise (Ausgangsrechnungen): listă + editor
import { S, list, prof, pidOf, defPid, PIDS } from "../state.js";
import { Store } from "../store.js";
import { calcInvoice, invState, STATE, isOpen, nextInvoiceNo, nextCustNo, paid, isLocked, PAY } from "../model.js";
import { esc, money, fmtDate, today, addDays, newId, clone, num, r2, year, by, norm } from "../util.js";
import { $, $$, icon, sheet, toast, confirmBox, fld, inp, dt, sel, chk, seg, segVal, val, pill, flag, kpi, empty, saveFile, openBlob, busy, safe, opts } from "../ui.js";
import { linesEditor, paymentsEditor, profOpts, contactsDL, contactByName, nStr } from "./common.js";
import { docBlob, docName, COUNTRY_LIST } from "../pdf.js";
import { xrechnung, eInvoiceProblems } from "../erechnung.js";
import { sendSmart, markSent, sentInfo, addressFor } from "../belege.js";
import { gmailSend, gmailReady } from "../mail.js";
import { contactForm } from "./contacts.js";

let F = { pid: "", st: "", y: String(new Date().getFullYear()), q: "" };
let editing = null;

export default {
  id: "invoices", title: "Facturi", short: "Facturi", icon: "inv",
  render(el, arg, { acts, soft }) {
    if (arg) { if (soft && editing) return "keep"; return editor(el, arg, acts); }
    editing = null;
    acts.innerHTML = `<button class="btn primary" data-go="invoices/new">${icon("plus")}<span class="hide-m">Factură nouă</span></button>`;
    const all = list("invoices");
    const ys = [...new Set([String(new Date().getFullYear()), ...all.map(i => year(i.date))])].sort().reverse();
    const rows = all.filter(i => (!F.pid || pidOf(i) === F.pid) && (F.y === "all" || year(i.date) === F.y))
      .map(i => ({ i, st: invState(i), c: calcInvoice(i) }))
      .filter(x => !F.st || (F.st === "open" ? isOpen(x.st) : F.st === "over" ? ["over", "partover"].includes(x.st) : x.st === F.st))
      .filter(x => !F.q || norm([x.i.no, x.i.to?.name, ...(x.i.items || []).map(t => t.name)].join(" ")).includes(norm(F.q)))
      .sort((a, b) => (b.i.date || "").localeCompare(a.i.date || "") || String(b.i.no).localeCompare(String(a.i.no), "de", { numeric: true }));
    const openAll = all.map(i => ({ i, st: invState(i) })).filter(x => isOpen(x.st));
    const openSum = r2(openAll.reduce((s, x) => s + calcInvoice(x.i).gross - paid(x.i), 0));
    const over = openAll.filter(x => ["over", "partover"].includes(x.st)), overSum = r2(over.reduce((s, x) => s + calcInvoice(x.i).gross - paid(x.i), 0));
    const m = today().slice(0, 7), monthSum = r2(all.filter(i => i.status !== "draft" && i.status !== "cancelled" && (i.date || "").startsWith(m)).reduce((s, i) => s + calcInvoice(i).gross, 0));
    el.innerHTML = `<div class="grid g3" style="margin-bottom:14px">
        ${kpi("De încasat", money(openSum), `${openAll.length} facturi`, "var(--warn)")}
        ${kpi("Restante", money(overSum), `${over.length} facturi`, over.length ? "var(--bad)" : "var(--ok)")}
        ${kpi("Facturat luna aceasta", money(monthSum), "", "var(--brand)")}
      </div>
      <div class="toolbar"><input type="search" id="f-q" placeholder="Caută număr, client, produs" value="${esc(F.q)}">
        <select id="f-pid">${opts([["", "DE + AT"], ...profOpts()], F.pid)}</select>
        <select id="f-st">${opts([["", "Toate"], ["open", "De încasat"], ["over", "Restante"], ["paid", "Plătite"], ["draft", "Ciorne"], ["cancelled", "Anulate"]], F.st)}</select>
        <select id="f-y">${opts([["all", "Toți anii"], ...ys.map(y => [y, y])], F.y)}</select></div>
      <div class="list">${rows.length ? rows.map(({ i, st, c }) => `<div class="item" data-go="invoices/${esc(i.id)}">
          <div class="grow"><div class="t">${esc(i.to?.name || "Fără client")}</div><div class="s">${flag(pidOf(i))}${esc(i.no || "fără număr")} · ${esc(fmtDate(i.date))}${i.due && isOpen(st) ? " · scadent " + esc(fmtDate(i.due)) : ""}${sentInfo("invoices", i.id) ? " · ✓ DATEV" : ""}</div></div>
          <div><div class="a">${money(c.gross)}</div><div style="text-align:right">${pill(STATE[st][1], STATE[st][0])}</div></div></div>`).join("")
        : empty("Nicio factură aici.", `<button class="btn primary" data-go="invoices/new">${icon("plus")} Factură nouă</button>`)}</div>`;
    const re = () => this.render(el, "", { acts });
    $("#f-q", el).oninput = e => { F.q = e.target.value; clearTimeout(this._t); this._t = setTimeout(() => { re(); const q = $("#f-q", el); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250); };
    ["pid", "st", "y"].forEach(k => $("#f-" + k, el).onchange = e => { F[k] = e.target.value; re(); });
  }
};

/* ================= editor ================= */
function blank(contactId) {
  const c = contactId && S.contacts[contactId], pid = c?.pid || defPid(), P = prof(pid), d = today();
  const inv = { id: newId(), pid, type: "invoice", status: "draft", no: "", date: d, due: addDays(d, c?.payDays ?? P.payDays ?? 14), contactId: "", to: {}, items: [], payments: [], small: !!P.small, intro: "", note: "", createdAt: Date.now() };
  if (c) applyContact(inv, c);
  return inv;
}
export function applyContact(doc, c) {
  doc.contactId = c.id; doc.to = { name: c.name || "", name2: c.name2 || "", street: c.street || "", zip: c.zip || "", city: c.city || "", country: c.country || "", no: c.no || "", vatId: c.vatId || "", email: c.email || "", leitweg: c.leitweg || "" };
  if (c.pid && PIDS.includes(c.pid)) doc.pid = c.pid;
}

function editor(el, arg, acts) {
  const isNew = arg === "new" || arg.startsWith("new:");
  const src = isNew ? null : S.invoices[arg];
  if (!isNew && !src) { el.innerHTML = empty("Factura nu există (poate a fost ștearsă).", `<a class="btn" href="#invoices">Înapoi la facturi</a>`); return; }
  const d = src ? clone(src) : (arg.startsWith("new:") && window.__draft ? window.__draft : blank(arg.split(":")[1]));
  window.__draft = null;
  editing = d.id;
  const final = d.status !== "draft", locked = final, cancelled = d.status === "cancelled";
  $("#title").textContent = final ? `${d.type === "storno" ? "Storno" : "Factura"} ${d.no}` : (src ? "Ciornă factură" : "Factură nouă");
  acts.innerHTML = `<a class="btn ghost" href="#invoices">${icon("back")}<span class="hide-m">Facturi</span></a>`;
  const st = final ? invState(d) : "draft";
  el.innerHTML = `
    ${final ? `<div class="banner ${cancelled ? "bad" : "info"}">${cancelled ? "Factura e anulată (Storno)." : "Factura e emisă: nu se mai poate modifica (GoBD). Poți înregistra plăți; pentru o greșeală fă „Storno” și o factură nouă."}${d.type === "storno" && d.refNo ? ` Storno la factura ${esc(d.refNo)}.` : ""}</div>` : ""}
    <div class="card"><div class="row sb"><div class="row">${seg("e-pid", profOpts(), d.pid)}${final ? pill(STATE[st][1], STATE[st][0]) : ""}</div>
      <div class="row hint" style="margin:0">${d.no ? "Nr. <b>" + esc(d.no) + "</b>" : "Numărul se dă la emitere"}</div></div>
      <div class="grid g2 st" style="margin-top:12px">
        <div>${fld("Client", `<div class="row"><input type="text" id="e-cn" list="dl-cust" value="${esc(d.to?.name || "")}" class="grow" placeholder="Nume client" ${locked ? "disabled" : ""}>${locked ? "" : `<button class="btn small" id="e-cnew" title="Client nou">${icon("plus")}</button>`}</div>${contactsDL("dl-cust", "c")}`)}
          <div id="e-addr" class="hint" style="margin-top:-6px">${addrLine(d.to)}</div>
          ${locked ? "" : `<button class="btn small ghost" id="e-aedit">Modifică adresa pe această factură</button>`}</div>
        <div class="grid g2">
          ${fld("Data facturii", dt("e-date", d.date, locked ? "disabled" : ""))}
          ${fld("Scadența", dt("e-due", d.due, locked ? "disabled" : ""))}
          ${fld("Perioada livrării – de la", dt("e-sf", d.serviceFrom, locked ? "disabled" : ""))}
          ${fld("până la", dt("e-st", d.serviceTo, locked ? "disabled" : ""))}
        </div></div>
      <div class="hint" style="margin-top:-4px">Perioada livrării poate rămâne goală dacă fiecare rând are data livrării.</div>
    </div>
    <div class="card"><h2>Poziții</h2><div id="e-lines"></div>
      <div class="totals" id="e-tot" style="margin-top:12px"></div></div>
    <div class="card"><div class="grid g2 st">
      ${fld("Text la început (opțional)", `<textarea id="e-intro" rows="2" ${locked ? "disabled" : ""}>${esc(d.intro || "")}</textarea>`)}
      ${fld("Notă la sfârșit (opțional)", `<textarea id="e-note" rows="2" ${locked ? "disabled" : ""}>${esc(d.note || "")}</textarea>`)}</div>
      <div class="row">${chk("e-small", prof(d.pid).country === "AT" ? "Kleinunternehmer (fără TVA, § 6 UStG AT)" : "Kleinunternehmer (fără TVA, § 19 UStG)", d.small)}${fld("Nr. comandă / referință client", inp("e-ref", d.orderRef || "", locked ? "disabled" : ""), "grow")}</div></div>
    ${final && d.type !== "storno" ? `<div class="card" id="e-pay"></div>` : ""}
    <div class="row end" style="margin:8px 0 30px" id="e-btns"></div>`;
  if (locked) $$("#e-small", el).forEach(x => x.disabled = true);
  const pidGet = segVal(el, "e-pid", v => { if (locked) return; d.pid = v; d.small = !!prof(v).small; $("#e-small", el).checked = d.small; lines.redraw(); upd(); });
  if (locked) $$("#e-pid button", el).forEach(b => b.disabled = true);
  const lines = linesEditor($("#e-lines", el), d.items, { cols: ["date", "ls", "name", "hkl", "qty", "unit", "price", "vat"], pid: () => pidGet() || d.pid, onChange: () => upd(),
    extraBtns: locked ? "" : `<button type="button" class="btn small" id="e-fromls">${icon("ls")} Din Lieferscheine</button>` });
  if (locked) { $$("#e-lines input, #e-lines select, #e-lines button", el).forEach(x => x.disabled = true); }
  let pay = null;
  if (final && d.type !== "storno") pay = paymentsEditor($("#e-pay", el), d.payments, { total: () => calcInvoice(d).gross, label: "Încasări", onChange: () => savePayments() });
  function collect() {
    if (!locked) {
      d.pid = pidGet() || d.pid; d.date = val(el, "e-date"); d.due = val(el, "e-due"); d.serviceFrom = val(el, "e-sf"); d.serviceTo = val(el, "e-st");
      d.intro = val(el, "e-intro"); d.note = val(el, "e-note"); d.small = $("#e-small", el).checked; d.orderRef = val(el, "e-ref"); d.items = lines.get();
      const nm = val(el, "e-cn"); if (nm !== (d.to?.name || "")) { const c = contactByName(nm, "c"); if (c) applyContact(d, c); else { d.contactId = ""; d.to = { ...(d.to || {}), name: nm }; } }
    }
    return d;
  }
  function upd() {
    const c = calcInvoice(collect());
    $("#e-tot", el).innerHTML = d.small ? `<div class="g"><span>Total</span><span>${money(c.gross)}</span></div>` :
      `<div><span>Net</span><span>${money(c.net)}</span></div>${c.vats.map(v => `<div><span>TVA ${String(v.rate).replace(".", ",")} % din ${money(v.base)}</span><span>${money(v.tax)}</span></div>`).join("")}<div class="g"><span>Total</span><span>${money(c.gross)}</span></div>`;
  }
  async function savePayments() {
    const fresh = S.invoices[d.id]; if (!fresh) return;
    d.payments = pay.get(); await safe(() => Store.put("invoices", { ...fresh, payments: d.payments }));
  }
  $("#e-cn", el)?.addEventListener("change", () => { const c = contactByName(val(el, "e-cn"), "c"); if (c) { applyContact(d, c); if (c.pid) { d.pid = c.pid; $$("#e-pid button", el).forEach(b => b.classList.toggle("on", b.dataset.v === c.pid)); } if (c.payDays !== undefined && c.payDays !== "") $("#e-due", el).value = addDays(val(el, "e-date"), c.payDays); } $("#e-addr", el).innerHTML = addrLine(d.to); upd(); });
  $("#e-date", el)?.addEventListener("change", () => { const c = d.contactId && S.contacts[d.contactId]; $("#e-due", el).value = addDays(val(el, "e-date"), c?.payDays ?? prof(d.pid).payDays ?? 14); });
  $("#e-cnew", el)?.addEventListener("click", () => contactForm(null, { role: "c", name: val(el, "e-cn"), pid: pidGet(), onSaved: c => { applyContact(d, c); $("#e-cn", el).value = c.name; $("#e-addr", el).innerHTML = addrLine(d.to); } }));
  $("#e-aedit", el)?.addEventListener("click", () => addrForm(d, () => { $("#e-cn", el).value = d.to.name || ""; $("#e-addr", el).innerHTML = addrLine(d.to); }));
  $("#e-fromls", el)?.addEventListener("click", () => fromNotes(d, lines, upd));
  upd();

  // butoane
  const B = $("#e-btns", el);
  if (!final) {
    B.innerHTML = `${src ? `<button class="btn danger" id="b-del">${icon("trash")} Șterge ciorna</button>` : ""}<button class="btn" id="b-prev">${icon("pdf")} Previzualizare</button><button class="btn" id="b-draft">Salvează ciorna</button><button class="btn primary" id="b-final">${icon("check")} Emite factura</button>`;
    $("#b-draft", el).onclick = async () => { collect(); if (await safe(() => Store.put("invoices", d), "Ciornă salvată")) { editing = null; history.replaceState(null, "", "#invoices/" + d.id); } };
    $("#b-prev", el).onclick = e => busy(e.currentTarget, async () => { collect(); const x = clone(d); x.no = x.no || nextInvoiceNo(x.date, x.pid) + " (Entwurf)"; openBlob(await docBlob(x, "invoice")); });
    $("#b-del", el) && ($("#b-del", el).onclick = async () => { if (await confirmBox("Ștergi ciorna?", { ok: "Șterge" })) { await Store.del("invoices", d.id); editing = null; location.hash = "invoices"; } });
    $("#b-final", el).onclick = async () => {
      collect();
      const probs = [!d.to?.name && "clientul", !d.items.length && "cel puțin un rând", !d.date && "data", d.items.some(i => !i.name) && "numele produsului pe fiecare rând"].filter(Boolean);
      if (probs.length) return toast("Lipsește: " + probs.join(", "), 4000);
      if (isLocked(d.pid, d.date)) return toast("Luna e închisă pentru contabil – alege altă dată sau redeschide luna.", 4500);
      const no = nextInvoiceNo(d.date, d.pid);
      if (!(await confirmBox(`Emit factura ${no}?`, { ok: "Emite", danger: false, detail: "După emitere factura nu se mai poate modifica, doar anula prin Storno." }))) return;
      d.no = no; d.status = "final"; d.finalAt = Date.now();
      if (await safe(() => Store.put("invoices", d))) {
        for (const it of d.items) if (it.lsId && S.notes[it.lsId]) await Store.put("notes", { ...S.notes[it.lsId], invoiceId: d.id });
        if (!d.contactId && d.to?.name && await confirmBox(`Salvez „${d.to.name}” ca client?`, { ok: "Salvează", danger: false })) {
          const c = { id: newId(), role: "c", no: nextCustNo(), name: d.to.name, street: d.to.street || "", zip: d.to.zip || "", city: d.to.city || "", country: d.to.country || "", email: d.to.email || "", vatId: d.to.vatId || "", pid: d.pid };
          await Store.put("contacts", c); await Store.put("invoices", { ...S.invoices[d.id], contactId: c.id, to: { ...d.to, no: c.no } });
        }
        toast("Factura " + d.no + " a fost emisă"); editing = null; location.hash = "invoices/" + d.id;
      }
    };
  } else {
    const sent = sentInfo("invoices", d.id);
    B.innerHTML = `<button class="btn" id="b-pdf">${icon("pdf")} PDF</button><button class="btn" id="b-xml">${icon("dl")} E-Rechnung (XML)</button><button class="btn" id="b-mail">${icon("mail")} Trimite clientului</button>
      <button class="btn" id="b-datev">${icon("send")} ${sent ? "Retrimite la DATEV" : "Trimite la DATEV"}</button><button class="btn" id="b-dup">${icon("copy")} Copie nouă</button>${!cancelled && d.type !== "storno" ? `<button class="btn danger" id="b-storno">Storno</button>` : ""}`;
    if (sent) B.insertAdjacentHTML("beforebegin", `<div class="hint" style="text-align:right">Trimisă la DATEV pe ${fmtDate(new Date(sent.at).toISOString().slice(0, 10))} (${esc(sent.to || "manual")})</div>`);
    $("#b-pdf", el).onclick = e => busy(e.currentTarget, async () => openBlob(await docBlob(d, "invoice")));
    $("#b-xml", el).onclick = async () => { const p = eInvoiceProblems(d); if (p.length && !(await confirmBox("Pentru E-Rechnung lipsesc date", { ok: "Descarcă oricum", danger: false, detail: "Lipsește: " + esc(p.join(", ")) + ". Fișierul va fi respins de validator." }))) return; saveFile(`XRechnung_${d.no}.xml`, new Blob([xrechnung(d)], { type: "application/xml" })); };
    $("#b-mail", el).onclick = () => mailCustomer(d);
    $("#b-datev", el).onclick = e => busy(e.currentTarget, async () => {
      if (!addressFor("out")) return toast("Pune întâi adresa DATEV pentru facturi scrise (Setări → DATEV).", 4500);
      const b = { kind: "invoices", id: d.id, type: "out", date: d.date, no: d.no, party: d.to?.name, amount: calcInvoice(d).gross };
      try { const r = await sendSmart([b]); if (r.manual || r.manualDone) return;
        toast(r.errors.length ? r.errors[0] : `Trimisă la DATEV`, 4000); } catch (er) { toast(er.message, 6000); }
    });
    $("#b-dup", el).onclick = () => { const x = clone(d); Object.assign(x, { id: newId(), status: "draft", no: "", date: today(), due: addDays(today(), prof(d.pid).payDays ?? 14), payments: [], type: "invoice", refNo: "", refDate: "", createdAt: Date.now() }); x.items.forEach(i => { delete i.lsId; }); window.__draft = x; location.hash = "invoices/new:"; };
    $("#b-storno", el) && ($("#b-storno", el).onclick = async () => {
      if (!(await confirmBox(`Anulez factura ${d.no} prin Storno?`, { ok: "Fă Storno", detail: "Se emite o factură Storno cu sume negative, cu număr nou. Factura originală rămâne în evidență ca anulată." }))) return;
      const s = clone(d); Object.assign(s, { id: newId(), type: "storno", status: "final", date: today(), no: nextInvoiceNo(today(), d.pid), refNo: d.no, refDate: d.date, refId: d.id, payments: [], due: "", createdAt: Date.now(), finalAt: Date.now() });
      s.items = s.items.map(i => ({ ...i, qty: -num(i.qty), lsId: "" }));
      await Store.put("invoices", s); await Store.put("invoices", { ...S.invoices[d.id], status: "cancelled", stornoId: s.id });
      for (const it of d.items) if (it.lsId && S.notes[it.lsId]) await Store.put("notes", { ...S.notes[it.lsId], invoiceId: "" });
      toast("Storno " + s.no + " emis"); location.hash = "invoices/" + s.id;
    });
  }
}
const addrLine = to => to && (to.street || to.city) ? esc([to.name2, to.street, [to.zip, to.city].filter(Boolean).join(" "), to.country].filter(Boolean).join(" · ")) + (to.email ? " · " + esc(to.email) : "") : "Adresa vine din fișa clientului.";

function addrForm(d, done) {
  const t = d.to || {};
  const o = sheet(`<h3>Adresa clientului pe factură</h3>
    ${fld("Nume / firmă", inp("a-n", t.name))}${fld("Rând 2 (opțional)", inp("a-n2", t.name2))}${fld("Stradă, nr.", inp("a-s", t.street))}
    <div class="grid g2">${fld("Cod poștal", inp("a-z", t.zip))}${fld("Oraș", inp("a-c", t.city))}</div>
    <div class="grid g2">${fld("Țara", sel("a-co", [["", "–"], ...COUNTRY_LIST], t.country))}${fld("E-mail (pt. E-Rechnung)", inp("a-e", t.email))}</div>
    <div class="grid g2">${fld("Nr. client", inp("a-no", t.no))}${fld("USt-IdNr. / UID client", inp("a-v", t.vatId))}</div>
    ${fld("Leitweg-ID (doar autorități)", inp("a-l", t.leitweg))}
    <div class="foot"><button class="btn" data-close>Renunță</button><button class="btn primary" id="a-ok">Gata</button></div>`);
  o.q("#a-ok").onclick = () => { d.to = { name: val(o, "a-n"), name2: val(o, "a-n2"), street: val(o, "a-s"), zip: val(o, "a-z"), city: val(o, "a-c"), country: val(o, "a-co"), email: val(o, "a-e"), no: val(o, "a-no"), vatId: val(o, "a-v"), leitweg: val(o, "a-l") }; o.close(); done(); };
}

function fromNotes(d, lines, upd) {
  const nm = d.to?.name || "", open = list("notes").filter(l => !l.invoiceId && (!d.contactId || l.contactId === d.contactId || norm(l.to?.name) === norm(nm))).sort(by(l => l.date));
  const o = sheet(`<h3>Adaugă din Lieferscheine</h3><div class="hint">Lieferscheine nefacturate${nm ? " pentru " + esc(nm) : ""}.</div>
    ${open.length ? `<div class="list">${open.map(l => `<label class="item"><input type="checkbox" value="${esc(l.id)}" checked style="width:18px;height:18px;accent-color:var(--brand)"><div class="grow"><div class="t">${esc(l.no)} · ${esc(fmtDate(l.date))}</div><div class="s">${esc(l.to?.name || "")} · ${(l.items || []).map(i => esc(i.name)).join(", ")}</div></div></label>`).join("")}</div>` : empty("Nu există Lieferscheine nefacturate.")}
    <div class="foot"><button class="btn" data-close>Renunță</button>${open.length ? `<button class="btn primary" id="n-ok">Adaugă</button>` : ""}</div>`);
  o.q("#n-ok") && (o.q("#n-ok").onclick = () => {
    const ids = o.qa("input:checked").map(i => i.value), cur = lines.get();
    ids.forEach(id => { const l = S.notes[id]; if (!d.contactId && l.contactId && S.contacts[l.contactId]) applyContact(d, S.contacts[l.contactId]);
      (l.items || []).forEach(it => cur.push({ date: l.date, ls: l.no, lsId: l.id, name: it.name, productId: it.productId || "", hkl: it.hkl || "", qty: it.qty, unit: it.unit, price: it.price || S.products[it.productId]?.price || "", vat: it.vat !== undefined && it.vat !== "" ? it.vat : prof(d.pid).defRate })); });
    lines.set(cur); o.close(); upd(); document.getElementById("e-cn").value = d.to?.name || ""; toast(`${ids.length} Lieferschein(e) adăugate`);
  });
}

async function mailCustomer(d) {
  const to = d.to?.email || "", subject = `Rechnung ${d.no} – ${S.settings.company.name || ""}`.trim();
  const text = `Guten Tag,\n\nanbei erhalten Sie unsere Rechnung ${d.no} vom ${fmtDate(d.date)} über ${money(calcInvoice(d).gross)}.\n${d.due ? `Bitte überweisen Sie den Betrag bis ${fmtDate(d.due)}.\n` : ""}\nMit freundlichen Grüßen\n${S.settings.company.owner || S.settings.company.name || ""}`;
  const files = [{ name: docName(d, "invoice"), blob: await docBlob(d, "invoice") }];
  if (!eInvoiceProblems(d).length) files.push({ name: `XRechnung_${d.no}.xml`, blob: new Blob([xrechnung(d)], { type: "application/xml" }) });
  const o = sheet(`<h3>Trimite factura clientului</h3>${fld("Către (e-mail)", inp("m-to", to))}${fld("Subiect", inp("m-s", subject))}${fld("Text", `<textarea id="m-t" rows="7">${esc(text)}</textarea>`)}
    <div class="hint">Atașate: ${files.map(f => esc(f.name)).join(", ")}</div>
    <div class="foot"><button class="btn" data-close>Renunță</button><button class="btn" id="m-share">${icon("send")} Cu aplicația de e-mail</button>${S.settings.datev.gmail ? `<button class="btn primary" id="m-gmail">${icon("mail")} Trimite din Gmail</button>` : ""}</div>`);
  o.q("#m-share").onclick = async () => {
    const fl = files.map(f => new File([f.blob], f.name, { type: f.blob.type }));
    if (navigator.canShare && navigator.canShare({ files: fl })) { try { await navigator.share({ files: fl, title: val(o, "m-s"), text: val(o, "m-t") }); o.close(); } catch (e) {} }
    else { files.forEach(f => saveFile(f.name, f.blob)); location.href = `mailto:${encodeURIComponent(val(o, "m-to"))}?subject=${encodeURIComponent(val(o, "m-s"))}&body=${encodeURIComponent(val(o, "m-t") + "\n\n(PDF-ul e descărcat – atașează-l)")}`; o.close(); }
  };
  o.q("#m-gmail") && (o.q("#m-gmail").onclick = e => busy(e.currentTarget, async () => {
    try { await gmailSend({ to: val(o, "m-to"), subject: val(o, "m-s"), text: val(o, "m-t"), files }); await Store.put("invoices", { ...S.invoices[d.id], mailedAt: Date.now(), mailedTo: val(o, "m-to") }); toast("Factura a fost trimisă"); o.close(); }
    catch (er) { toast(er.message, 6000); }
  }));
}
