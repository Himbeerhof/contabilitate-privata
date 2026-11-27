// Facturi primite și cheltuieli (Eingangsrechnungen) + „De plătit” + venituri diverse
import { S, list, prof, pidOf, defPid, PIDS } from "../state.js";
import { Store } from "../store.js";
import { calcPurchase, purState, STATE, isOpen, paid, CAT_OUT, CAT_IN, CATS, PAY, isLocked, itemsNet, productMatch } from "../model.js";
import { esc, money, fmtDate, today, addDays, newId, clone, num, r2, year, by, norm, ibanOk, fmtIban, ym, MONTHS } from "../util.js";
import { $, $$, icon, sheet, toast, confirmBox, fld, inp, amt, dt, sel, chk, seg, segVal, val, nval, pill, flag, kpi, empty, busy, safe, opts, pickFiles, saveFile } from "../ui.js";
import { linesEditor, paymentsEditor, filesWidget, profOpts, contactsDL, contactByName, rateOpts, nStr } from "./common.js";
import { contactForm } from "./contacts.js";
import { scan } from "../scan.js";
import { parseEInvoice, xmlFromPdf } from "../erechnung.js";
import { sentInfo } from "../belege.js";

let F = { tab: "open", pid: "", y: String(new Date().getFullYear()), m: "", q: "", cat: "" };
export default {
  id: "purchases", title: "Facturi primite", short: "Primite", icon: "in",
  render(el, arg, { acts }) {
    acts.innerHTML = `<button class="btn" id="pu-inc" title="Venit divers (subvenție etc.)"><span class="hide-m">+ Venit</span><span class="only-m">+V</span></button><button class="btn" id="pu-scan">${icon("cam")}<span class="hide-m">Scanează</span></button><button class="btn primary" id="pu-add">${icon("plus")}<span class="hide-m">Cheltuială</span></button>`;
    $("#pu-add").onclick = () => purchaseForm(null);
    $("#pu-scan").onclick = () => scanPurchase();
    $("#pu-inc").onclick = () => incomeForm(null);
    if (arg && S.purchases[arg]) setTimeout(() => purchaseForm(S.purchases[arg]), 0);
    const all = list("purchases"), ys = [...new Set([String(new Date().getFullYear()), ...all.map(p => year(p.date))])].sort().reverse();
    const withSt = all.map(p => ({ p, st: purState(p), c: calcPurchase(p) }));
    const open = withSt.filter(x => isOpen(x.st)).sort(by(x => x.p.due || x.p.date));
    const openSum = r2(open.reduce((s, x) => s + x.c.gross - paid(x.p), 0)), over = open.filter(x => ["over", "partover"].includes(x.st));
    const soon = open.filter(x => x.p.due && x.p.due <= addDays(today(), 7) && !["over", "partover"].includes(x.st));
    let rows = F.tab === "open" ? open : withSt.filter(x => (!F.pid || pidOf(x.p) === F.pid) && (F.y === "all" || year(x.p.date) === F.y) && (!F.m || ym(x.p.date) === F.y + "-" + F.m) && (!F.cat || x.p.cat === F.cat)).sort((a, b) => (b.p.date || "").localeCompare(a.p.date || ""));
    if (F.q) rows = rows.filter(x => norm([x.p.supplier, x.p.docNo, x.p.text, ...(x.p.items || []).map(i => i.name)].join(" ")).includes(norm(F.q)));
    const incomes = F.tab === "inc" ? list("incomes").filter(e => (F.y === "all" || year(e.date) === F.y) && (!F.pid || pidOf(e) === F.pid)).sort(by(e => e.date, -1)) : [];
    const sumRows = r2(rows.reduce((s, x) => s + x.c.gross, 0));
    el.innerHTML = `<div class="grid g3" style="margin-bottom:14px">
        ${kpi("De plătit", money(openSum), `${open.length} facturi`, "var(--warn)")}
        ${kpi("Restante", money(r2(over.reduce((s, x) => s + x.c.gross - paid(x.p), 0))), `${over.length} facturi`, over.length ? "var(--bad)" : "var(--ok)")}
        ${kpi("Scadente în 7 zile", money(r2(soon.reduce((s, x) => s + x.c.gross - paid(x.p), 0))), `${soon.length} facturi`, "var(--info)")}</div>
      <div class="toolbar">${seg("pu-tab", [["open", "De plătit"], ["all", "Toate cheltuielile"], ["inc", "Venituri diverse"]], F.tab)}</div>
      ${F.tab !== "open" ? `<div class="toolbar"><input type="search" id="pu-q" placeholder="Caută furnizor, nr., produs" value="${esc(F.q)}"><select id="pu-pid">${opts([["", "DE + AT"], ...profOpts()], F.pid)}</select>
        <select id="pu-y">${opts([["all", "Toți anii"], ...ys.map(y => [y, y])], F.y)}</select>${F.tab === "all" ? `<select id="pu-m" ${F.y === "all" ? "disabled" : ""}>${opts([["", "Tot anul"], ...MONTHS.map((m, i) => [String(i + 1).padStart(2, "0"), m])], F.m)}</select><select id="pu-cat">${opts([["", "Toate categoriile"], ...CAT_OUT.map(c => [c[0], c[1]])], F.cat)}</select>` : ""}</div>` : ""}
      ${F.tab === "inc" ? `<div class="list">${incomes.length ? incomes.map(e => `<div class="item" data-inc="${esc(e.id)}"><div class="grow"><div class="t">${esc(e.text || CATS[e.cat]?.ro || "Venit")}</div><div class="s">${flag(pidOf(e))}${esc(fmtDate(e.date))} · ${esc(CATS[e.cat]?.ro || "")} · ${esc(PAY[e.method] || "")}</div></div><div class="a amt-in">+${money(num(e.gross))}</div></div>`).join("") : empty("Niciun venit divers (subvenții, despăgubiri, alte încasări fără factură).")}</div>` :
      `<div class="list">${rows.length ? rows.map(({ p, st, c }) => `<div class="item" data-p="${esc(p.id)}"><div class="grow"><div class="t">${esc(p.supplier || "Fără furnizor")}</div>
          <div class="s">${flag(pidOf(p))}${esc(p.docNo || "fără nr.")} · ${esc(fmtDate(p.date))} · ${esc(CATS[p.cat]?.ro || "")}${(p.fileIds || []).length ? " · 📎" : p.noFile ? "" : " · <span style='color:var(--warn)'>fără document</span>"}${sentInfo("purchases", p.id) ? " · ✓ DATEV" : ""}</div></div>
          <div><div class="a amt-out">${money(c.gross)}</div><div style="text-align:right">${isOpen(st) ? pill(STATE[st][1], p.due ? "până " + fmtDate(p.due).slice(0, 5) : STATE[st][0]) : pill("paid", "plătită")}</div></div></div>`).join("")
        : empty(F.tab === "open" ? "Nimic de plătit. 👍" : "Nicio cheltuială în perioada aleasă.")}</div>
      ${F.tab === "all" && rows.length ? `<div class="hint" style="text-align:right">Total: <b>${money(sumRows)}</b> (${rows.length})</div>` : ""}`}`;
    const re = () => this.render(el, "", { acts });
    segVal(el, "pu-tab", v => { F.tab = v; re(); });
    const q = $("#pu-q", el); if (q) q.oninput = e => { F.q = e.target.value; clearTimeout(this._t); this._t = setTimeout(() => { re(); const q2 = $("#pu-q", el); q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); }, 250); };
    ["pid", "y", "m", "cat"].forEach(k => { const s = $("#pu-" + k, el); if (s) s.onchange = e => { F[k] = e.target.value; if (k === "y" && F.y === "all") F.m = ""; re(); }; });
    el.onclick = e => { const it = e.target.closest("[data-p]"); if (it) purchaseForm(S.purchases[it.dataset.p]); const ic = e.target.closest("[data-inc]"); if (ic) incomeForm(S.incomes[ic.dataset.inc]); };
  }
};

/* ---------- formular factură primită ---------- */
export function purchaseForm(p0, prefill = {}) {
  const isNew = !p0;
  const p = p0 ? clone(p0) : { id: newId(), pid: defPid(), supplier: "", contactId: "", docNo: "", date: today(), due: "", cat: "goods", splits: [], items: [], payments: [], fileIds: [], text: "", ...prefill };
  const locked = !isNew && isLocked(pidOf(p), p.date);
  const sp = (p.splits && p.splits.length ? p.splits : [{ rate: prof(pidOf(p)).defRate, gross: p.gross || "" }]).map(s => ({ ...s }));
  const o = sheet(`<h3>${isNew ? "Factură primită / cheltuială" : esc(p.supplier || "Cheltuială")}</h3>
    ${locked ? `<div class="banner">Luna e închisă pentru contabil: poți adăuga doar plăți și documente.</div>` : ""}
    ${prefill._note ? `<div class="banner info">${esc(prefill._note)}</div>` : ""}
    <div class="row" style="margin-bottom:10px">${seg("q-pid", profOpts(), pidOf(p))}<span class="hint" style="margin:0">Țara în care contează cheltuiala</span></div>
    <div class="grid g2">${fld("Furnizor", `<div class="row"><input type="text" id="q-s" list="dl-sup" value="${esc(p.supplier)}" class="grow" autofocus><button type="button" class="btn small" id="q-snew" title="Furnizor nou">${icon("plus")}</button></div>${contactsDL("dl-sup", "s")}`)}
      ${fld("Categorie", sel("q-cat", CAT_OUT.map(c => [c[0], c[1]]), p.cat))}</div>
    <div class="grid g3">${fld("Nr. factură", inp("q-no", p.docNo))}${fld("Data facturii", dt("q-d", p.date))}${fld("Scadența (opțional)", dt("q-due", p.due))}</div>
    <div class="card" style="padding:10px 12px;background:#fcfafb"><div class="row sb"><b>Sume (cu TVA)</b><span id="q-sum" class="hint" style="margin:0"></span></div><div id="q-splits"></div></div>
    <div id="q-goods" class="${p.cat === "goods" ? "" : "hidden"}"><div class="sec" style="margin-top:4px">Marfă (pentru inventar, opțional)</div><div id="q-items"></div></div>
    <div class="card" style="padding:10px 12px" id="q-pay"></div>
    <div id="q-files"></div>
    ${chk("q-nofile", "Nu am document pentru această cheltuială", p.noFile)}
    <div class="grid g2">${fld("IBAN furnizor (pentru plată)", inp("q-iban", p.iban ? fmtIban(p.iban) : ""))}${fld("Text / notă", inp("q-t", p.text))}</div>
    ${pidOf(p) === "de" ? chk("q-for", "TVA străină (ex. factură austriacă) – nu se deduce în Germania", p.foreignVat) : ""}
    <div class="foot">${!isNew && !locked ? `<button class="btn danger" id="q-del" style="margin-right:auto">${icon("trash")}</button>` : ""}<button class="btn" data-close>Renunță</button><button class="btn primary" id="q-ok">Salvează</button></div>`, { wide: true, dismiss: false });
  const pidGet = segVal(o, "q-pid", () => drawSplits());
  function drawSplits() {
    const pid = pidGet();
    o.q("#q-splits").innerHTML = sp.map((s, k) => `<div class="row" style="margin-top:6px"><input type="text" inputmode="decimal" class="r" data-s="${k}" data-c="gross" value="${esc(nStr(s.gross))}" placeholder="Brut €" style="width:130px" ${locked ? "disabled" : ""}>
      <select data-s="${k}" data-c="rate" style="width:auto" ${locked ? "disabled" : ""}>${opts(rateOpts(pid, s.rate), s.rate)}</select><span class="hint" style="margin:0" data-sn="${k}"></span>${sp.length > 1 && !locked ? `<button type="button" class="btn ghost small" data-srm="${k}">${icon("x")}</button>` : ""}</div>`).join("")
      + (locked ? "" : `<button type="button" class="btn small ghost" id="q-sadd" style="margin-top:6px">${icon("plus")} Altă cotă TVA</button>`);
    upd();
  }
  function upd() {
    const c = calcPurchase({ splits: sp.map(s => ({ rate: num(s.rate), gross: num(s.gross) })) });
    c.splits.forEach((s, k) => { const h = o.q(`[data-sn="${k}"]`); if (h) h.textContent = `net ${money(s.net)} + TVA ${money(s.tax)}`; });
    o.q("#q-sum").innerHTML = `Total <b>${money(c.gross)}</b>`;
    pay && pay.redraw();
  }
  o.q("#q-splits").addEventListener("input", e => { const t = e.target; if (t.dataset.s !== undefined) { sp[t.dataset.s][t.dataset.c] = t.value; upd(); } });
  o.q("#q-splits").addEventListener("change", e => { const t = e.target; if (t.dataset.s !== undefined) { sp[t.dataset.s][t.dataset.c] = t.value; upd(); } });
  o.q("#q-splits").addEventListener("click", e => { if (e.target.closest("#q-sadd")) { sp.push({ rate: prof(pidGet()).rates.find(r => !sp.some(s => num(s.rate) === r)) ?? 0, gross: "" }); drawSplits(); } const rm = e.target.closest("[data-srm]"); if (rm) { sp.splice(+rm.dataset.srm, 1); drawSplits(); } });
  const items = linesEditor(o.q("#q-items"), p.items || [], { cols: ["name", "qty", "unit", "price"], pid: pidGet, onChange: () => { const n = itemsNet(items.get()); o.q("#q-inet") && (o.q("#q-inet").textContent = n ? "marfă net " + money(n) : ""); },
    extraBtns: `<span class="hint" id="q-inet" style="margin:0 0 0 auto"></span>` });
  let pay = null;
  pay = paymentsEditor(o.q("#q-pay"), p.payments, { total: () => calcPurchase({ splits: sp.map(s => ({ rate: num(s.rate), gross: num(s.gross) })) }).gross, label: "Plată" });
  drawSplits();
  const files = filesWidget(o.q("#q-files"), p.fileIds, { onAdd: async added => {
    // E-Rechnung atașată: completează singur
    for (const a of added) {
      let xml = null;
      if (/xml/.test(a.blob.type) || /\.xml$/i.test(a.file.name)) xml = await a.blob.text();
      else if (/pdf/.test(a.blob.type)) xml = await xmlFromPdf(a.blob).catch(() => null);
      if (xml) { try { const d = parseEInvoice(xml); fillFrom(d); toast("Am completat din factura electronică"); } catch (e) { console.warn(e); } }
    }
  } });
  function fillFrom(d) {
    if (d.supplier && !val(o, "q-s")) o.q("#q-s").value = d.supplier;
    if (d.docNo) o.q("#q-no").value = d.docNo; if (d.date) o.q("#q-d").value = d.date; if (d.due) o.q("#q-due").value = d.due;
    if (d.iban) o.q("#q-iban").value = fmtIban(d.iban);
    if (d.splits?.length) { sp.length = 0; d.splits.forEach(s => sp.push({ rate: s.rate, gross: s.gross })); drawSplits(); }
    if (d.items?.length && val(o, "q-cat") === "goods") items.set(d.items.map(i => { const pr = productMatch(i.name); return { name: pr ? pr.name : i.name, productId: pr?.id || "", qty: i.qty, unit: pr?.unit || i.unit, price: i.price }; }));
  }
  o.q("#q-cat").onchange = e => o.q("#q-goods").classList.toggle("hidden", e.target.value !== "goods");
  o.q("#q-s").addEventListener("change", () => { const c = contactByName(val(o, "q-s"), "s"); if (c) { if (c.iban && !val(o, "q-iban")) o.q("#q-iban").value = fmtIban(c.iban); if (c.pid) o.qa("#q-pid button").forEach(b => b.classList.toggle("on", b.dataset.v === c.pid));
    const last = list("purchases").filter(x => x.contactId === c.id).sort(by(x => x.date, -1))[0]; if (last && isNew) { o.q("#q-cat").value = last.cat; o.q("#q-goods").classList.toggle("hidden", last.cat !== "goods"); } } });
  o.q("#q-snew").onclick = () => contactForm(null, { role: "s", name: val(o, "q-s"), pid: pidGet(), onSaved: c => { o.q("#q-s").value = c.name; } });
  if (locked) o.qa("#q-s, #q-cat, #q-no, #q-d, #q-due, #q-snew, #q-pid button").forEach(x => x.disabled = true);
  o.q("#q-ok").onclick = async () => {
    const n = { ...p, pid: pidGet(), supplier: val(o, "q-s"), cat: val(o, "q-cat"), docNo: val(o, "q-no"), date: val(o, "q-d"), due: val(o, "q-due"),
      splits: sp.map(s => ({ rate: num(s.rate), gross: r2(num(s.gross)) })).filter(s => s.gross), payments: pay.get(), fileIds: files.get(), noFile: val(o, "q-nofile"),
      iban: val(o, "q-iban").replace(/\s/g, ""), text: val(o, "q-t"), foreignVat: !!(o.q("#q-for") && o.q("#q-for").checked), items: val(o, "q-cat") === "goods" ? items.get() : [] };
    if (!n.supplier) return toast("Scrie furnizorul."); if (!n.splits.length) return toast("Scrie suma.");
    if (!locked && isLocked(n.pid, n.date)) return toast("Luna e închisă pentru contabil – alege altă dată.", 4000);
    if (n.iban && !ibanOk(n.iban)) return toast("IBAN-ul nu pare corect.", 4000);
    const c = contactByName(n.supplier, "s") || contactByName(n.supplier);
    if (c) n.contactId = c.id;
    else if (await confirmBox(`Salvez „${n.supplier}” ca furnizor?`, { ok: "Da", danger: false })) { const nc = { id: newId(), role: "s", name: n.supplier, iban: n.iban, pid: n.pid }; await Store.put("contacts", nc); n.contactId = nc.id; }
    if (n.contactId && n.iban && !S.contacts[n.contactId].iban) await Store.put("contacts", { ...S.contacts[n.contactId], iban: n.iban });
    // produse noi din marfă
    for (const it of n.items) if (!it.productId && it.name) { const pr = { id: newId(), name: it.name, unit: it.unit || "kg", track: true, cost: it.price }; await Store.put("products", pr); it.productId = pr.id; }
    if (list("purchases").some(x => x.id !== n.id && n.docNo && x.docNo === n.docNo && norm(x.supplier) === norm(n.supplier)) && !(await confirmBox("Factura pare deja introdusă (același furnizor și număr). Salvez totuși?", { ok: "Salvează", danger: false }))) return;
    if (await safe(() => Store.put("purchases", n), "Salvat")) o.close();
  };
  o.q("#q-del") && (o.q("#q-del").onclick = async () => { if (await confirmBox("Ștergi factura primită?", { ok: "Șterge" })) { for (const f of p.fileIds || []) await Store.delFile(f); await Store.del("purchases", p.id); o.close(); } });
  return { o, fillFrom };
}

/* ---------- scanare factură primită ---------- */
export function scanPurchase() {
  const o = sheet(`<h3>Scanează o factură primită</h3>
    <div class="grid g2"><button class="btn" data-k="in" style="min-height:74px;flex-direction:column">${icon("stock")}<b>Factură de marfă</b><span class="hint" style="margin:0">cu produse, pentru inventar</span></button>
    <button class="btn" data-k="exp" style="min-height:74px;flex-direction:column">${icon("in")}<b>Altă cheltuială</b><span class="hint" style="margin:0">telefon, motorină, chirie…</span></button></div>
    <div class="hint" style="margin-top:12px">Poți alege una sau mai multe poze, sau un PDF / XML de factură electronică (XRechnung, ZUGFeRD) – acelea se citesc exact.</div>
    <div class="foot"><button class="btn" data-close>Renunță</button></div>`);
  o.addEventListener("click", async e => { const b = e.target.closest("[data-k]"); if (!b) return; o.close(); await scanRun(b.dataset.k); });
}
async function scanRun(kind) {
  const fl = await pickFiles({ accept: "image/*,application/pdf,.xml,text/xml", multiple: true }); if (!fl.length) return;
  const xmlF = fl.find(f => /xml/.test(f.type) || /\.xml$/i.test(f.name)), pdfF = fl.find(f => /pdf/.test(f.type));
  if (xmlF || pdfF) {
    let d = null;
    try { d = parseEInvoice(xmlF ? await xmlF.text() : (await xmlFromPdf(pdfF)) || ""); } catch (e) { d = null; }
    const f = purchaseForm(null, { cat: kind === "in" ? "goods" : "other", _note: d ? `Completat din factura electronică (${d.format}). Verifică datele.` : "PDF fără factură electronică înăuntru – completează sumele." });
    if (d) f.fillFrom(d);
    f.o.q("#q-files").dispatchEvent(new CustomEvent("cp-add-files", { detail: fl }));
    return;
  }
  const st = sheet(`<h3>Citesc factura…</h3><div class="hint" id="sc-st">Pregătesc pozele…</div><div class="bar"><i style="width:35%"></i></div>`, { dismiss: false });
  let d = null;
  try { d = await scan(kind, fl, t => { const s = st.q("#sc-st"); if (s) s.textContent = t; }); } catch (e) { st.close(); toast(e.message, 5000); return; }
  st.close();
  const pid = d.country === "at" ? "at" : d.country === "de" ? "de" : defPid();
  const f = purchaseForm(null, { pid, cat: kind === "in" ? "goods" : (CAT_OUT.some(c => c[0] === d.cat) ? d.cat : "other"), _note: "Citit din poză – verifică furnizorul, sumele și cotele de TVA." });
  const O = f.o, set = (id, v) => { if (v) O.q(id).value = v; };
  set("#q-s", d.supplier ? String(d.supplier) : ""); set("#q-no", d.invoiceNo || d.number ? String(d.invoiceNo || d.number) : "");
  const okDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
  if (okDate(d.date)) O.q("#q-d").value = d.date; if (okDate(d.dueDate) && d.dueDate !== d.date) O.q("#q-due").value = d.dueDate;
  if (d.iban && !d.directDebit) O.q("#q-iban").value = fmtIban(String(d.iban));
  if (d.desc) O.q("#q-t").value = String(d.desc) + (d.directDebit ? " · Lastschrift" : "");
  const groups = (Array.isArray(d.vatGroups) ? d.vatGroups : []).map(x => ({ rate: num(x.rate), gross: num(x.gross) })).filter(x => x.gross);
  const gross = num(d.gross) || groups.reduce((s, x) => s + x.gross, 0);
  const items = (d.items || []).map(i => ({ name: i.product || i.name, qty: i.qty, unit: i.unit, price: num(i.price) || (num(i.total) && num(i.qty) ? r2(num(i.total) / num(i.qty)) : "") }));
  f.fillFrom({ splits: groups.length ? groups : gross ? [{ rate: d.vatRate !== undefined && d.vatRate !== null ? num(d.vatRate) : prof(pid).defRate, gross }] : [], items });
  O.q("#q-goods").classList.toggle("hidden", kind !== "in");
  if (d.paid || d.directDebit) O.q("#q-pay").querySelector(d.directDebit ? '[data-pfull="bank"]' : '[data-pfull="cash"]')?.click();
  O.q("#q-files").dispatchEvent(new CustomEvent("cp-add-files", { detail: fl }));
}

/* ---------- venit divers ---------- */
export function incomeForm(e0) {
  const isNew = !e0, e = e0 ? clone(e0) : { id: newId(), pid: defPid(), date: today(), cat: "subs", text: "", gross: "", rate: 0, method: "bank", fileIds: [] };
  const o = sheet(`<h3>${isNew ? "Venit divers" : "Venit"}</h3><div class="hint">Încasări fără factură scrisă de tine: subvenții, despăgubiri, alte venituri. Facturile și casa se trec separat.</div>
    <div class="row" style="margin-bottom:10px">${seg("v-pid", profOpts(), pidOf(e))}</div>
    <div class="grid g2">${fld("Categorie", sel("v-cat", CAT_IN.filter(c => !["sales", "direct"].includes(c[0])).map(c => [c[0], c[1]]), e.cat))}${fld("Data", dt("v-d", e.date))}</div>
    ${fld("Descriere", inp("v-t", e.text, 'placeholder="ex. Agrarförderung 2026"'))}
    <div class="grid g3">${fld("Suma (brut)", amt("v-g", e.gross))}${fld("TVA %", `<select id="v-r">${opts(rateOpts(pidOf(e), e.rate), e.rate)}</select>`)}${fld("Încasat", sel("v-m", Object.entries(PAY), e.method))}</div>
    <div class="grid g2">${fld("De la (opțional)", inp("v-p", e.party))}${fld("Nr. document", inp("v-no", e.docNo))}</div>
    <div id="v-files"></div>
    <div class="foot">${isNew ? "" : `<button class="btn danger" id="v-del" style="margin-right:auto">${icon("trash")}</button>`}<button class="btn" data-close>Renunță</button><button class="btn primary" id="v-ok">Salvează</button></div>`);
  const pidGet = segVal(o, "v-pid"), files = filesWidget(o.q("#v-files"), e.fileIds);
  o.q("#v-ok").onclick = async () => {
    const n = { ...e, pid: pidGet(), cat: val(o, "v-cat"), date: val(o, "v-d"), text: val(o, "v-t"), gross: r2(nval(o, "v-g")), rate: nval(o, "v-r"), method: val(o, "v-m"), party: val(o, "v-p"), docNo: val(o, "v-no"), fileIds: files.get() };
    if (!n.gross) return toast("Scrie suma."); if (isLocked(n.pid, n.date)) return toast("Luna e închisă pentru contabil.");
    if (await safe(() => Store.put("incomes", n), "Salvat")) o.close();
  };
  o.q("#v-del") && (o.q("#v-del").onclick = async () => { if (await confirmBox("Ștergi venitul?", { ok: "Șterge" })) { await Store.del("incomes", e.id); o.close(); } });
}
