// Casa: zilele de piață (Z), raportul lunar de TVA, mișcări de bani, registrul de casă (Kassenbuch), import Bizerba
import { S, list, prof, pidOf, PIDS } from "../state.js";
import { Store } from "../store.js";
import { dayTotal, cmId, monthSplit, cashBook, cashFloat, cashProfile, placeFor, allPlaces, MOVE_TYPES, isLocked, productMatch, daySplit } from "../model.js";
import { esc, money, fmtDate, today, newId, clone, num, r2, ym, year, lastDay, MONTHS, WD, by, norm, monthLabel, dec2 } from "../util.js";
import { $, $$, icon, sheet, toast, confirmBox, fld, inp, amt, dt, sel, chk, seg, segVal, val, nval, pill, kpi, empty, busy, safe, opts, pickFiles, saveFile, openBlob } from "../ui.js";
import { linesEditor, filesWidget, profOpts, nStr, rateOpts } from "./common.js";
import { scan } from "../scan.js";
import { cashBookPdf } from "../pdf.js";
import { datevCashCsv } from "../datev.js";
import { sendSmart, markSent, addressFor } from "../belege.js";

let F = { tab: "days", m: today().slice(0, 7) };
export default {
  id: "cash", title: "Casă și piețe", short: "Casă", icon: "cash",
  render(el, arg, { acts }) {
    const pid = cashProfile();
    acts.innerHTML = `<button class="btn" id="k-z">${icon("cam")}<span class="hide-m">Scanează Z</span></button><button class="btn primary" id="k-add">${icon("plus")}<span class="hide-m">Zi de casă</span></button>`;
    $("#k-add").onclick = () => dayForm(null);
    $("#k-z").onclick = () => scanZ();
    const [y, mm] = F.m.split("-"), from = F.m + "-01", to = lastDay(F.m);
    const days = list("cashdays").filter(d => ym(d.date) === F.m).sort(by(d => d.date + (d.place || "")));
    const tot = r2(days.reduce((s, d) => s + dayTotal(d), 0)), card = r2(days.reduce((s, d) => s + num(d.card), 0));
    const sp = monthSplit(pid, F.m), spSum = r2(sp.reduce((s, x) => s + x.gross, 0));
    const book = cashBook(pid, from, to);
    const prevM = new Date(+y, +mm - 2, 15), nextM = new Date(+y, +mm, 15), mk = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    el.innerHTML = `<div class="row sb" style="margin-bottom:12px"><div class="row"><button class="btn small" id="k-prev">‹</button><b style="min-width:130px;text-align:center">${esc(monthLabel(F.m))}</b><button class="btn small" id="k-next">›</button></div>
        <div class="row"><label class="btn small" style="cursor:pointer">${icon("up")} Import Bizerba<input type="file" id="k-bz" multiple webkitdirectory style="display:none"></label><button class="btn small" id="k-mv">${icon("plus")} Mișcare de bani</button></div></div>
      <div class="grid g4" style="margin-bottom:14px">
        ${kpi("Încasări luna", money(tot), `${days.length} zile · card ${money(card)}`, "var(--ok)")}
        ${kpi("Sold casă la sfârșit", money(book.end), `fond de casă ${money(cashFloat())}`, book.negative.length ? "var(--bad)" : "var(--brand)")}
        ${kpi("Raport lunar TVA", sp.length ? money(spSum) : "lipsește", sp.length ? sp.map(x => `${String(x.rate).replace(".", ",")} %: ${money(x.gross)}`).join(" · ") : "cotele se estimează", sp.length ? "var(--ok)" : "var(--warn)", "")}
        ${kpi("Diferență Z / numărat", money(r2(days.reduce((s, d) => s + (num(d.zGross) ? dayTotal(d) - num(d.zGross) : 0), 0))), "bacșiș + diferențe", "var(--info)")}</div>
      ${book.negative.length ? `<div class="banner bad">Atenție: soldul casei e negativ în ${book.negative.length} zi(le) (${book.negative.slice(0, 3).map(r => fmtDate(r.date)).join(", ")}). Un registru de casă nu poate avea sold negativ – lipsește o încasare sau o „Pus de la mine”.</div>` : ""}
      <div class="toolbar">${seg("k-tab", [["days", "Zile"], ["book", "Registru de casă"], ["moves", "Mișcări"], ["month", "TVA lunar"]], F.tab)}</div>
      <div id="k-body"></div>`;
    const body = $("#k-body", el);
    if (F.tab === "days") {
      body.innerHTML = `<div class="list">${days.length ? days.map(d => `<div class="item" data-d="${esc(d.id)}"><div class="grow"><div class="t">${esc(WD[new Date(d.date + "T12:00:00").getDay()].slice(0, 3))} ${esc(fmtDate(d.date).slice(0, 5))} · ${esc(d.place || "–")}</div>
          <div class="s">${d.zNo ? "Z " + esc(d.zNo) + " · " : ""}numerar ${money(num(d.cash) + num(d.other))}${num(d.card) ? " · card " + money(num(d.card)) : ""}${num(d.zGross) ? " · Z " + money(num(d.zGross)) : ""}${(d.fileIds || []).length ? " · 📎" : ""}${(d.items || []).length ? " · " + d.items.length + " produse" : ""}</div></div>
          <div class="a amt-in">${money(dayTotal(d))}</div></div>`).join("") : empty("Nicio zi de casă în această lună.", `<button class="btn primary" id="k-add2">${icon("plus")} Zi de casă</button>`)}</div>`;
      $("#k-add2", el) && ($("#k-add2", el).onclick = () => dayForm(null));
    } else if (F.tab === "book") {
      body.innerHTML = `<div class="row end" style="margin-bottom:8px"><button class="btn small" id="kb-pdf">${icon("pdf")} PDF</button><button class="btn small" id="kb-csv">${icon("dl")} DATEV (Kasse)</button><button class="btn small" id="kb-send">${icon("send")} Trimite la DATEV</button></div>
        <div class="list tw"><table class="t"><tr><th>Data</th><th>Document</th><th>Text</th><th class="n">Încasare</th><th class="n">Plată</th><th class="n">Sold</th></tr>
        <tr><td></td><td></td><td><i>Sold inițial</i></td><td></td><td></td><td class="n">${dec2(book.start)}</td></tr>
        ${book.rows.map(r => `<tr ${r.src !== "auto" ? `data-src="${r.src}" data-id="${esc(r.id)}" style="cursor:pointer"` : ""}><td>${esc(fmtDate(r.date).slice(0, 5))}</td><td>${esc(r.doc || "")}</td><td>${esc(r.text)}${r.auto ? ` <span class="pill info">automat</span>` : ""}</td>
          <td class="n">${r.amount >= 0 ? dec2(r.amount) : ""}</td><td class="n">${r.amount < 0 ? dec2(-r.amount) : ""}</td><td class="n" style="${r.bal < 0 ? "color:var(--bad);font-weight:700" : ""}">${dec2(r.bal)}</td></tr>`).join("")}
        <tr class="sum"><td></td><td></td><td>Sold final</td><td class="n">${dec2(book.rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0))}</td><td class="n">${dec2(-book.rows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0))}</td><td class="n">${dec2(book.end)}</td></tr></table></div>
        <div class="hint">${S.settings.cash.skim === "none" ? "Banii scoși din casă se trec manual la „Mișcare de bani”." : `Peste fondul de casă (${money(cashFloat())}), restul se trece automat ca ${S.settings.cash.skim === "private" ? "Privatentnahme" : "depus la bancă (Geldtransit)"} – doar în zilele fără mișcare scrisă de tine.`} Se schimbă în Setări → Casă.</div>`;
      $("#kb-pdf", el).onclick = e => busy(e.currentTarget, async () => openBlob(await cashBookPdf(book, { pid, from, to })));
      $("#kb-csv", el).onclick = () => { try { const r = datevCashCsv({ pid, from, to }); saveFile(r.name, new Blob([r.bytes], { type: "text/csv" })); toast(`${r.n} rânduri exportate` + (r.missing.length ? " · lipsește " + r.missing.join(", ") : ""), 4000); } catch (er) { toast(er.message); } };
      $("#kb-send", el).onclick = e => busy(e.currentTarget, () => sendCashBook(pid, from, to, book));
      body.onclick = e => { const tr = e.target.closest("tr[data-src]"); if (!tr) return; const { src, id } = tr.dataset;
        if (src === "cashdays") dayForm(S.cashdays[id]); else if (src === "cashmoves") moveForm(S.cashmoves[id]); else if (src === "purchases") import("./purchases.js").then(m => m.purchaseForm(S.purchases[id])); else if (src === "invoices") location.hash = "invoices/" + id; else if (src === "incomes") import("./purchases.js").then(m => m.incomeForm(S.incomes[id])); };
    } else if (F.tab === "moves") {
      const mv = list("cashmoves").filter(m => ym(m.date) === F.m).sort(by(m => m.date));
      body.innerHTML = `<div class="list">${mv.length ? mv.map(m => `<div class="item" data-mv="${esc(m.id)}"><div class="grow"><div class="t">${esc((MOVE_TYPES[m.type] || [])[0] || m.type)}</div><div class="s">${esc(fmtDate(m.date))}${m.text ? " · " + esc(m.text) : ""}</div></div><div class="a">${money(num(m.amount))}</div></div>`).join("") : empty("Nicio mișcare scrisă manual în această lună.")}</div>`;
    } else {
      body.innerHTML = monthCard(pid, F.m, days);
      $("#mo-edit", el).onclick = () => monthForm(pid, F.m);
    }
    const re = () => this.render(el, "", { acts });
    segVal(el, "k-tab", v => { F.tab = v; re(); });
    $("#k-prev", el).onclick = () => { F.m = mk(prevM); re(); }; $("#k-next", el).onclick = () => { F.m = mk(nextM); re(); };
    $("#k-mv", el).onclick = () => moveForm(null);
    $("#k-bz", el).onchange = e => { const f = [...e.target.files]; e.target.value = ""; bizerbaImport(f); };
    el.addEventListener("click", e => { const d = e.target.closest("[data-d]"); if (d) dayForm(S.cashdays[d.dataset.d]); const m = e.target.closest("[data-mv]"); if (m) moveForm(S.cashmoves[m.dataset.mv]); });
  }
};

function monthCard(pid, m, days) {
  const sp = monthSplit(pid, m), md = S.cashmonths[cmId(pid, m)], t = r2(days.filter(d => pidOf(d) === pid).reduce((s, d) => s + dayTotal(d), 0));
  return `<div class="card"><h2>Raportul lunar al casei (TVA pe cote)</h2>
    <div class="hint">Casa de marcat arată împărțirea pe cote doar în raportul lunar. Scrie aici sumele brute pe fiecare cotă; zilele lunii se împart după aceleași proporții.</div>
    ${sp.length ? `<table class="t"><tr><th>Cota</th><th class="n">Brut</th><th class="n">Net</th><th class="n">TVA</th></tr>${sp.map(x => { const n = r2(x.gross / (1 + x.rate / 100)); return `<tr><td>${String(x.rate).replace(".", ",")} %</td><td class="n">${money(x.gross)}</td><td class="n">${money(n)}</td><td class="n">${money(r2(x.gross - n))}</td></tr>`; }).join("")}
      <tr class="sum"><td>Total raport</td><td class="n">${money(r2(sp.reduce((s, x) => s + x.gross, 0)))}</td><td></td><td></td></tr></table>
      <div class="hint">Încasări înregistrate pe zile: <b>${money(t)}</b>${Math.abs(t - sp.reduce((s, x) => s + x.gross, 0)) > 0.5 ? " – diferența (bacșiș, numărat) se împarte proporțional pe cote." : "."}${md?.note ? " · " + esc(md.note) : ""}</div>` : `<div class="banner">Lipsește raportul lunar. Până îl introduci, toată suma lunii e socotită la cota implicită ${String(prof(pid).defRate).replace(".", ",")} %.</div>`}
    <button class="btn" id="mo-edit">${sp.length ? "Modifică" : "Introdu raportul lunar"}</button></div>`;
}

/* ---------- zi de casă ---------- */
export function dayForm(d0, pre = {}) {
  const isNew = !d0, pid = cashProfile();
  const d = d0 ? clone(d0) : { id: newId(), pid, date: today(), place: placeFor(today()), zNo: "", zGross: "", cash: "", card: "", other: "", counted: "", items: [], fileIds: [], note: "", ...pre };
  const locked = !isNew && isLocked(pidOf(d), d.date), fl = cashFloat();
  const o = sheet(`<h3>${isNew ? "Zi de casă" : "Casă " + esc(fmtDate(d.date)) + " · " + esc(d.place || "")}</h3>
    ${pre._note ? `<div class="banner info">${esc(pre._note)}</div>` : ""}${locked ? `<div class="banner">Luna e închisă pentru contabil.</div>` : ""}
    <div class="grid g3">${fld("Data", dt("z-d", d.date))}${fld("Piața", `<input type="text" id="z-p" list="dl-pl" value="${esc(d.place || "")}"><datalist id="dl-pl">${allPlaces().map(p => `<option value="${esc(p)}">`).join("")}</datalist>`)}${fld("Nr. Z", inp("z-no", d.zNo))}</div>
    <div class="card" style="background:#fcfafb;padding:10px 12px">
      <div class="grid g3">${fld("Total pe Z", amt("z-zg", d.zGross))}${fld("Plătit cu cardul", amt("z-card", d.card))}${fld("Numărat în casă (cu fond)", amt("z-cnt", d.counted, `placeholder="ex. ${dec2(fl + 500)}"`))}</div>
      <div class="grid g3">${fld("Numerar (încasat)", amt("z-cash", d.cash))}${fld("Altele (bonuri, voucher)", amt("z-oth", d.other))}<div class="fld"><label class="f">Încasare totală</label><div id="z-tot" style="font-size:20px;font-weight:800;padding-top:4px"></div></div></div>
      <div class="hint" id="z-calc" style="margin:0"></div></div>
    <details ${d.items?.length ? "open" : ""}><summary style="cursor:pointer;font-weight:650;margin:8px 0">Produse vândute (din Z, pentru inventar și statistici)</summary><div id="z-items"></div></details>
    <div id="z-files" style="margin-top:10px"></div>
    ${fld("Notă", inp("z-note", d.note))}
    <div class="foot">${!isNew && !locked ? `<button class="btn danger" id="z-del" style="margin-right:auto">${icon("trash")}</button>` : ""}<button class="btn" data-close>Renunță</button><button class="btn primary" id="z-ok">Salvează</button></div>`, { wide: true, dismiss: false });
  const items = linesEditor(o.q("#z-items"), d.items || [], { cols: ["name", "qty", "unit", "price"], noTotal: false });
  const files = filesWidget(o.q("#z-files"), d.fileIds, { title: "Poza Z-ului / raportul casei" });
  o.q("#z-d").addEventListener("change", () => { if (!o.q("#z-p").dataset.t) o.q("#z-p").value = placeFor(val(o, "z-d")); });
  o.q("#z-p").addEventListener("input", e => e.target.dataset.t = "1");
  const calc = () => {
    const cnt = nval(o, "z-cnt"), card = nval(o, "z-card"), zg = nval(o, "z-zg");
    if (val(o, "z-cnt") !== "" && document.activeElement?.id !== "z-cash") o.q("#z-cash").value = nStr(r2(cnt - fl));
    const total = r2(nval(o, "z-cash") + card + nval(o, "z-oth"));
    o.q("#z-tot").textContent = money(total);
    o.q("#z-calc").innerHTML = zg ? `Față de Z: <b>${total - zg >= 0 ? "+" : ""}${money(r2(total - zg))}</b> ${total - zg > 0.004 ? "(bacșiș / în plus)" : total - zg < -0.004 ? "(lipsă în casă)" : ""} · Se trece la încasări suma numărată${val(o, "z-cnt") !== "" ? ` (numărat ${money(cnt)} − fond ${money(fl)})` : ""}.` : `Fondul de casă: ${money(fl)}. Dacă scrii suma numărată, numerarul se calculează singur.`;
  };
  ["z-cnt", "z-card", "z-zg", "z-cash", "z-oth"].forEach(id => o.q("#" + id).addEventListener("input", calc)); calc();
  if (locked) o.qa("input, select, textarea").forEach(x => x.disabled = true);
  o.q("#z-ok").onclick = async () => {
    const n = { ...d, date: val(o, "z-d"), place: val(o, "z-p"), zNo: val(o, "z-no"), zGross: val(o, "z-zg") === "" ? "" : r2(nval(o, "z-zg")), card: r2(nval(o, "z-card")), counted: val(o, "z-cnt") === "" ? "" : r2(nval(o, "z-cnt")),
      cash: r2(nval(o, "z-cash")), other: r2(nval(o, "z-oth")), items: items.get(), fileIds: files.get(), note: val(o, "z-note") };
    if (!n.date) return toast("Alege data."); if (!dayTotal(n) && !n.zGross) return toast("Scrie sumele.");
    if (!locked && isLocked(pidOf(n), n.date)) return toast("Luna e închisă pentru contabil.");
    if (isNew && list("cashdays").some(x => x.date === n.date && norm(x.place) === norm(n.place)) && !(await confirmBox(`Există deja casă pe ${fmtDate(n.date)} la ${n.place}. Adaug încă una?`, { ok: "Adaugă", danger: false }))) return;
    for (const it of n.items) if (!it.productId && it.name) { const pr = productMatch(it.name); if (pr) it.productId = pr.id; else if (await confirmBox(`Produs nou din Z: „${it.name}”. Îl adaug la produse?`, { ok: "Adaugă", danger: false })) { const p = { id: newId(), name: it.name, unit: it.unit || "kg", price: it.price || "", track: true }; await Store.put("products", p); it.productId = p.id; } }
    if (await safe(() => Store.put("cashdays", n), "Salvat · " + money(dayTotal(n)))) o.close();
  };
  o.q("#z-del") && (o.q("#z-del").onclick = async () => { if (await confirmBox("Ștergi ziua de casă?", { ok: "Șterge" })) { await Store.del("cashdays", d.id); o.close(); } });
  return { o, items, files };
}

async function scanZ() {
  const fl = await pickFiles({ accept: "image/*", multiple: true }); if (!fl.length) return;
  const st = sheet(`<h3>Citesc raportul Z…</h3><div class="hint" id="sc-st">Pregătesc pozele…</div><div class="bar"><i style="width:35%"></i></div>`, { dismiss: false });
  let d;
  try { d = await scan("z", fl, t => { const s = st.q("#sc-st"); if (s) s.textContent = t; }); } catch (e) { st.close(); toast(e.message, 5000); return; }
  st.close();
  const items = (d.items || []).map(i => { const pr = i.product ? list("products").find(p => p.name === i.product) : productMatch(i.name); return { name: pr ? pr.name : i.name, productId: pr?.id || "", qty: num(i.qty), unit: i.unit || "kg", price: num(i.qty) ? r2(num(i.total) / num(i.qty)) : "" }; });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d.date || "") ? d.date : today();
  const ok = d.check && d.check.ok;
  const f = dayForm(null, { date, place: placeFor(date), zNo: d.zNo ? String(d.zNo) : "", zGross: d.gross || "", card: d.card || "", items, _note: `Citit din Z${ok === false ? " – suma produselor nu se potrivește cu totalul, verifică" : ""}. Scrie suma numărată în casă.` });
  f.o.q("#z-files").dispatchEvent(new CustomEvent("cp-add-files", { detail: fl }));
}

/* ---------- raport lunar ---------- */
function monthForm(pid, m) {
  const md = S.cashmonths[cmId(pid, m)] || { id: cmId(pid, m), pid, month: m, split: {} };
  const rates = [...new Set([...(prof(pid).rates || []).map(Number), ...Object.keys(md.split || {}).map(Number)])].sort((a, b) => a - b);
  const o = sheet(`<h3>Raport lunar ${esc(monthLabel(m))}</h3><div class="hint">Sumele brute (cu TVA) pe cote, din raportul lunar al casei de marcat.</div>
    ${rates.map(r => fld(`Cota ${String(r).replace(".", ",")} %`, amt("mo-" + String(r).replace(".", "_"), md.split?.[r] ?? md.split?.[String(r)] ?? ""))).join("")}
    ${fld("Notă", inp("mo-note", md.note))}
    <div class="foot">${S.cashmonths[md.id] ? `<button class="btn danger" id="mo-del" style="margin-right:auto">${icon("trash")}</button>` : ""}<button class="btn" data-close>Renunță</button><button class="btn primary" id="mo-ok">Salvează</button></div>`);
  o.q("#mo-ok").onclick = async () => { const split = {}; rates.forEach(r => { const v = nval(o, "mo-" + String(r).replace(".", "_")); if (v) split[r] = r2(v); });
    if (isLocked(pid, m + "-01")) return toast("Luna e închisă pentru contabil.");
    if (await safe(() => Store.put("cashmonths", { ...md, split, note: val(o, "mo-note") }), "Salvat")) o.close(); };
  o.q("#mo-del") && (o.q("#mo-del").onclick = async () => { await Store.del("cashmonths", md.id); o.close(); });
}

/* ---------- mișcări de bani ---------- */
export function moveForm(m0) {
  const isNew = !m0, m = m0 ? clone(m0) : { id: newId(), pid: cashProfile(), date: today(), type: "tobank", amount: "", text: "" };
  const o = sheet(`<h3>Mișcare de bani în casă</h3>
    <div class="grid g2">${fld("Ce", sel("mv-t", Object.entries(MOVE_TYPES).map(([k, v]) => [k, v[0]]), m.type))}${fld("Data", dt("mv-d", m.date))}</div>
    <div class="grid g2">${fld("Suma", amt("mv-a", m.amount))}${fld("Casa (profil)", sel("mv-p", profOpts(), pidOf(m)))}</div>
    ${fld("Text (opțional)", inp("mv-x", m.text))}<div class="hint">La „Diferență de casă” scrie minus dacă lipsesc bani.</div>
    <div class="foot">${isNew ? "" : `<button class="btn danger" id="mv-del" style="margin-right:auto">${icon("trash")}</button>`}<button class="btn" data-close>Renunță</button><button class="btn primary" id="mv-ok">Salvează</button></div>`);
  o.q("#mv-ok").onclick = async () => { const n = { ...m, type: val(o, "mv-t"), date: val(o, "mv-d"), amount: r2(nval(o, "mv-a")), pid: val(o, "mv-p"), text: val(o, "mv-x") };
    if (!n.amount) return toast("Scrie suma."); if (isLocked(n.pid, n.date)) return toast("Luna e închisă pentru contabil.");
    if (await safe(() => Store.put("cashmoves", n), "Salvat")) o.close(); };
  o.q("#mv-del") && (o.q("#mv-del").onclick = async () => { await Store.del("cashmoves", m.id); o.close(); });
}

/* ---------- trimiterea registrului de casă la DATEV ---------- */
async function sendCashBook(pid, from, to, book) {
  if (!addressFor("cash")) return toast("Pune întâi adresa DATEV pentru casă (Setări → DATEV).", 4500);
  const blob = await cashBookPdf(book, { pid, from, to });
  const f = await Store.addFile(blob, { name: `Kassenbuch_${from.slice(0, 7)}.pdf` });
  const id = "kb-" + pid + "-" + from.slice(0, 7), prev = S.extradocs[id];
  for (const fid of prev?.fileIds || []) await Store.delFile(fid);
  await Store.put("extradocs", { id, pid, date: to, type: "cash", title: "Kassenbuch " + from.slice(0, 7), fileIds: [f.id] });
  const b = { kind: "extradocs", id, type: "cash", date: to, no: "Kassenbuch " + from.slice(0, 7), party: prof(pid).label, amount: book.end };
  try { const r = await sendSmart([b]); if (r.manual || r.manualDone) return;
    toast(r.errors.length ? r.errors[0] : "Registrul de casă a fost trimis la DATEV", 4000); } catch (e) { toast(e.message, 6000); }
}

/* ---------- import Bizerba (jurnalul RKSV de pe stick) ---------- */
async function bizerbaImport(files) {
  files = files.filter(f => /jour_export\.json$/i.test(f.name));
  if (!files.length) return toast("N-am găsit fișiere „…_jour_export.json”. Alege folderul „fiscal_data” de pe stick.", 5000);
  const pid = cashProfile(), mk = { ...(S.settings.cash.bzMarkets || {}) };
  const o = sheet(`<h3>Import casa Bizerba</h3><div class="hint" id="bz-st">Citesc ${files.length} fișier(e)…</div><div id="bz-out"></div>
    <div class="foot"><button class="btn" data-close>Renunță</button><button class="btn primary hidden" id="bz-ok">Trece în Casă</button></div>`, { wide: true, dismiss: false });
  let rec;
  try { rec = await window.CP.readJournals(files, (a, b) => { const s = o.q("#bz-st"); if (s) s.textContent = `Citesc bonurile… ${a} / ${b}`; }); }
  catch (e) { o.q("#bz-st").textContent = "Fișierele nu au putut fi citite: " + e.message; return; }
  if (!rec.length) { o.q("#bz-st").textContent = "Nu am găsit bonuri."; return; }
  const wdKey = (date, k) => "wd" + new Date(date + "T12:00:00").getDay() + "|" + k;
  const marketOf = (date, k) => mk[date + "|" + k] ?? mk[wdKey(date, k)] ?? placeFor(date);
  const dk = {};
  rec.forEach(r => { const date = r.end.slice(0, 10), k = date + "|" + r.kasse, x = dk[k] ||= { date, kasse: r.kasse, gross: 0, cash: 0, card: 0, other: 0, n: 0 };
    x.gross += r.grand; x.n++; Object.entries(r.tender || {}).forEach(([t, v]) => { if (/cash|bar/i.test(t)) x.cash += v; else if (/card|karte|credit|debit|ec/i.test(t)) x.card += v; else x.other += v; }); });
  const dlist = Object.values(dk).sort((a, b) => a.date.localeCompare(b.date) || String(a.kasse).localeCompare(String(b.kasse)));
  const months = {};
  rec.forEach(r => { const m = r.end.slice(0, 7), x = months[m] ||= { gross: 0, split: {}, from: r.end.slice(0, 10), to: r.end.slice(0, 10) }; x.gross += r.grand; if (r.end.slice(0, 10) > x.to) x.to = r.end.slice(0, 10); if (r.end.slice(0, 10) < x.from) x.from = r.end.slice(0, 10);
    Object.entries(r.vat || {}).forEach(([k, v]) => { const kk = String(parseFloat(k)); x.split[kk] = (x.split[kk] || 0) + v.base; }); });
  const mOn = {}; Object.entries(months).forEach(([m, x]) => { mOn[m] = x.from <= m + "-07" && (x.to >= lastDay(m) || m < today().slice(0, 7)); });
  const repl = new Set();
  const groups = () => { const g = {}; dlist.forEach(x => { const mkt = marketOf(x.date, x.kasse), k = x.date + "|" + norm(mkt), y = g[k] ||= { date: x.date, market: mkt, gross: 0, cash: 0, card: 0, other: 0, n: 0 }; ["gross", "cash", "card", "other", "n"].forEach(f => y[f] += x[f]); });
    return Object.values(g).map(y => { ["gross", "cash", "card", "other"].forEach(f => y[f] = r2(y[f])); y.ex = list("cashdays").find(c => c.date === y.date && pidOf(c) === pid && norm(c.place) === norm(y.market)); return y; }).sort((a, b) => a.date.localeCompare(b.date)); };
  const draw = () => {
    const gl = groups(), bad = rec.filter(r => !r.ok).length;
    o.q("#bz-st").innerHTML = `${rec.length} bonuri · ${fmtDate(rec[0].end.slice(0, 10))} – ${fmtDate(rec[rec.length - 1].end.slice(0, 10))} · total <b>${money(r2(rec.reduce((s, r) => s + r.grand, 0)))}</b> · <span style="color:${bad ? "var(--warn)" : "var(--ok)"};font-weight:650">${bad ? bad + " bonuri nu se verifică" : "✓ toate bonurile verificate"}</span>`;
    o.q("#bz-out").innerHTML = `<div class="sec">Casa și piața pe zile</div><div class="hint">Piața se ține minte pe zi a săptămânii și casă.</div>
      <div class="tw"><table class="t"><tr><th>Data</th><th>Casa</th><th class="n">Bonuri</th><th class="n">Total</th><th>Piața</th></tr>${dlist.map(x => `<tr><td>${WD[new Date(x.date + "T12:00:00").getDay()].slice(0, 3)} ${fmtDate(x.date).slice(0, 5)}</td><td>${esc(x.kasse)}</td><td class="n">${x.n}</td><td class="n">${money(r2(x.gross))}</td>
        <td><input type="text" list="bz-dl" data-dk="${esc(x.date + "|" + x.kasse)}" value="${esc(marketOf(x.date, x.kasse))}" style="min-width:110px"></td></tr>`).join("")}</table><datalist id="bz-dl">${allPlaces().map(p => `<option value="${esc(p)}">`).join("")}</datalist></div>
      <div class="sec">Ce se trece la casă</div><div class="tw"><table class="t"><tr><th>Data</th><th>Piața</th><th class="n">Numerar</th><th class="n">Card</th><th class="n">Total</th><th></th></tr>${gl.map(g => `<tr><td>${fmtDate(g.date).slice(0, 5)}</td><td>${esc(g.market || "–")}</td><td class="n">${money(g.cash)}</td><td class="n">${money(r2(g.card + g.other))}</td><td class="n"><b>${money(g.gross)}</b></td>
        <td>${g.ex ? `<label class="chk" style="margin:0"><input type="checkbox" data-rp="${esc(g.date + "|" + norm(g.market))}" ${repl.has(g.date + "|" + norm(g.market)) ? "checked" : ""}><span>înlocuiește (acum ${money(dayTotal(g.ex))})</span></label>` : `<span class="pill ok">nou</span>`}</td></tr>`).join("")}</table></div>
      <div class="sec">Raport lunar TVA</div>${Object.entries(months).sort().map(([m, x]) => `<label class="chk"><input type="checkbox" data-mo="${m}" ${mOn[m] ? "checked" : ""}><span><b>${esc(monthLabel(m))}</b>: ${Object.entries(x.split).sort((a, b) => +a[0] - +b[0]).map(([r, g]) => `${r} %: ${money(r2(g))}`).join(" · ")}${!mOn[m] ? " <span class='hint'>(lună incompletă pe acest stick)</span>" : ""}</span></label>`).join("")}`;
    o.q("#bz-ok").classList.remove("hidden");
  };
  draw();
  o.addEventListener("change", e => { const t = e.target; if (t.dataset.dk) { const [date, k] = t.dataset.dk.split("|"); mk[date + "|" + k] = t.value.trim(); mk[wdKey(date, k)] = t.value.trim(); draw(); } else if (t.dataset.rp) t.checked ? repl.add(t.dataset.rp) : repl.delete(t.dataset.rp); else if (t.dataset.mo) mOn[t.dataset.mo] = t.checked; });
  o.q("#bz-ok").onclick = async e => {
    e.target.disabled = true; let nNew = 0, nRep = 0, nMo = 0;
    try {
      const keep = {}; Object.entries(mk).forEach(([k, v]) => { if (k.startsWith("wd") || dlist.some(x => k === x.date + "|" + x.kasse)) keep[k] = v; });
      S.settings.cash.bzMarkets = { ...(S.settings.cash.bzMarkets || {}), ...keep }; await Store.saveSettings();
      for (const g of groups()) {
        const k = g.date + "|" + norm(g.market), bz = { gross: g.gross, cash: g.cash, card: g.card, other: g.other, n: g.n };
        if (isLocked(pid, g.date)) continue;
        if (!g.ex) { await Store.put("cashdays", { id: newId(), pid, date: g.date, place: g.market, zGross: g.gross, cash: g.cash, card: g.card, other: g.other, items: [], fileIds: [], note: "Casa Bizerba", bz }); nNew++; }
        else if (repl.has(k)) { await Store.put("cashdays", { ...g.ex, cash: g.cash, card: g.card, other: g.other, zGross: g.gross, counted: "", bz }); nRep++; }
        else await Store.put("cashdays", { ...g.ex, zGross: g.ex.zGross || g.gross, bz });
      }
      for (const [m, x] of Object.entries(months)) { if (!mOn[m] || isLocked(pid, m + "-01")) continue; const split = {}; Object.entries(x.split).forEach(([r, g]) => { if (Math.abs(g) >= 0.005) split[r] = r2(g); });
        await Store.put("cashmonths", { ...(S.cashmonths[cmId(pid, m)] || {}), id: cmId(pid, m), pid, month: m, split, note: `Casa Bizerba ${fmtDate(x.from)} – ${fmtDate(x.to)}` }); nMo++; }
      o.close(); F.m = rec[rec.length - 1].end.slice(0, 7);
      toast(`Trecut la casă: ${nNew} zile noi${nRep ? `, ${nRep} înlocuite` : ""}${nMo ? `, ${nMo} rapoarte lunare` : ""}`, 4500);
    } catch (er) { console.error(er); toast("Eroare: " + er.message, 5000); e.target.disabled = false; }
  };
}
