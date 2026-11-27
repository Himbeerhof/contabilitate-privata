// Arhiva de documente (Belege) și trimiterea la DATEV Upload Mail
import { S, list, pidOf, prof } from "./state.js";
import { calcInvoice, calcPurchase, dayTotal, invState } from "./model.js";
import { Store } from "./store.js";
import { docBlob, docName, imagesToPdf, loadPdf } from "./pdf.js";
import { gmailSend, gmailReady, batches, shareFiles } from "./mail.js";
import { r2, num, fmtDate, ym, money, today } from "./util.js";

export const TYPES = { out: ["Facturi scrise", "Rechnungsausgang"], in: ["Facturi primite / bonuri", "Rechnungseingang"], cash: ["Casă (Z, registru)", "Kasse"], other: ["Alte documente", "Sonstige"] };
export const key = (kind, id) => kind + ":" + id;
export const sentInfo = (kind, id) => S.datevlog[key(kind, id)] || null;

/** Toate documentele, cu starea lor */
export function belege({ pid = "", from = "", to = "" } = {}) {
  const out = [], inP = d => (!pid || pidOf(d) === pid) && (!from || d.date >= from) && (!to || d.date <= to);
  list("invoices").filter(i => i.status !== "draft" && inP(i)).forEach(i => out.push({ kind: "invoices", id: i.id, type: "out", pid: pidOf(i), date: i.date, no: i.no, party: i.to?.name || "", amount: calcInvoice(i).gross,
    files: 1, gen: true, cancelled: i.status === "cancelled", state: invState(i) }));
  list("purchases").filter(inP).forEach(p => out.push({ kind: "purchases", id: p.id, type: "in", pid: pidOf(p), date: p.date, no: p.docNo || "", party: p.supplier || "", amount: calcPurchase(p).gross, files: (p.fileIds || []).filter(f => S.files[f]).length, noFileOk: !!p.noFile }));
  list("cashdays").filter(inP).forEach(d => out.push({ kind: "cashdays", id: d.id, type: "cash", pid: pidOf(d), date: d.date, no: d.zNo ? "Z " + d.zNo : "", party: d.place || "Casă", amount: dayTotal(d), files: (d.fileIds || []).filter(f => S.files[f]).length, noFileOk: true }));
  list("incomes").filter(inP).forEach(e => out.push({ kind: "incomes", id: e.id, type: "other", pid: pidOf(e), date: e.date, no: e.docNo || "", party: e.party || e.text || "", amount: num(e.gross), files: (e.fileIds || []).filter(f => S.files[f]).length }));
  list("extradocs").filter(inP).forEach(e => out.push({ kind: "extradocs", id: e.id, type: e.type || "other", pid: pidOf(e), date: e.date, no: e.title || "", party: e.party || "", amount: 0, files: (e.fileIds || []).filter(f => S.files[f]).length, extra: true }));
  out.forEach(b => { const s = sentInfo(b.kind, b.id); b.sent = s; b.missing = !b.gen && !b.files && !b.noFileOk; });
  return out.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

/** Fișierele PDF care pleacă pentru un document */
export async function belegFiles(b) {
  const d = S[b.kind][b.id]; if (!d) return [];
  if (b.kind === "invoices") return [{ name: docName(d, "invoice"), blob: await docBlob(d, "invoice") }];
  const ids = (d.fileIds || []).filter(f => S.files[f]), imgs = [], res = [];
  const base = (b.kind === "extradocs" ? (d.title || "Dokument") : b.kind === "purchases" ? `ER_${d.supplier || "Beleg"}_${d.docNo || d.date}` : b.kind === "cashdays" ? `Kasse_${d.date}_${d.place || ""}` : `Beleg_${d.date}_${d.docNo || ""}`).replace(/[^\w.-]+/g, "_").replace(/_+$/, "");
  for (const id of ids) {
    const blob = await Store.fileBlob(id), m = S.files[id]; if (!blob) continue;
    if (/^image\//.test(blob.type)) imgs.push(blob);
    else if (/pdf|tiff/.test(blob.type)) res.push({ name: (res.length ? base + "_" + (res.length + 1) : base) + (/tiff/.test(blob.type) ? ".tif" : ".pdf"), blob });
    else if (/xml/.test(blob.type) && !ids.some(i => /pdf/.test(S.files[i]?.type))) res.push({ name: base + "_E-Rechnung.pdf", blob: await xmlSummaryPdf(d, m) });
  }
  if (imgs.length) res.unshift({ name: base + ".pdf", blob: await imagesToPdf(imgs, base) });
  return res;
}
async function xmlSummaryPdf(p, m) {
  const jsPDF = await loadPdf(), doc = new jsPDF({ unit: "mm", format: "a4" }), c = calcPurchase(p);
  doc.setFontSize(14); doc.text("E-Rechnung (Sichtbeleg)", 20, 25); doc.setFontSize(10);
  [["Lieferant", p.supplier], ["Rechnungs-Nr.", p.docNo], ["Datum", fmtDate(p.date)], ["Fällig", fmtDate(p.due)], ["Brutto", money(c.gross)], ...c.splits.map(s => [`davon ${s.rate} %`, `${money(s.net)} netto + ${money(s.tax)} USt`]), ["Original", m?.name || "XML"]]
    .forEach(([k, v], i) => { doc.text(String(k), 20, 40 + i * 7); doc.text(String(v || ""), 70, 40 + i * 7); });
  doc.setFontSize(8); doc.text("Das strukturierte Original (XML) liegt in der Buchhaltung des Absenders vor und wird auf Anfrage übermittelt.", 20, 120);
  return doc.output("blob");
}

export const addressFor = type => (S.settings.datev.upload || {})[type] || "";
export const canGmail = () => !!S.settings.datev.gmail;

/** Trimite o listă de documente. via: "gmail" | "share" | "manual" */
export async function sendBelege(list_, { via = "gmail", interactive = true, onProgress = () => {} } = {}) {
  const byType = {}; list_.forEach(b => (byType[b.type] ||= []).push(b));
  let sent = 0, mails = 0; const errors = [];
  for (const [type, bs] of Object.entries(byType)) {
    const to = addressFor(type); if (!to && via !== "manual") { errors.push(`Lipsește adresa DATEV pentru „${TYPES[type][0]}” (Setări → DATEV).`); continue; }
    const files = [];
    for (const b of bs) { onProgress(`Pregătesc ${b.no || fmtDate(b.date)}…`); const fl = await belegFiles(b); fl.forEach(f => files.push({ ...f, b })); if (!fl.length) errors.push(`${b.no || fmtDate(b.date)}: nu are fișier.`); }
    for (const bt of batches(files)) {
      if (bt.tooBig) { errors.push(`${bt.files[0].name} are peste 20 MB – DATEV nu-l primește pe e-mail.`); continue; }
      const docs = [...new Set(bt.files.map(f => f.b))];
      const subject = `${TYPES[type][1]} ${S.settings.company.name || ""} – ${docs.length} Beleg${docs.length > 1 ? "e" : ""}`.trim();
      const text = docs.map(b => `${fmtDate(b.date)}  ${b.no || ""}  ${b.party || ""}  ${money(b.amount)}`).join("\n");
      let msg = "", how = via;
      if (via === "gmail") { onProgress(`Trimit e-mailul ${mails + 1}…`); msg = await gmailSend({ to, subject, text, files: bt.files }, { interactive }); }
      else if (via === "share") { const r = await shareFiles(bt.files, subject); if (r === "abort") return { sent, mails, errors, aborted: true }; if (!r) throw new Error("Telefonul nu poate partaja fișiere – folosește descărcarea."); how = "share"; }
      for (const b of docs) await Store.put("datevlog", { id: key(b.kind, b.id), kind: b.kind, ref: b.id, type, at: Date.now(), to, via: how, msg, files: bt.files.filter(f => f.b === b).map(f => f.name) });
      sent += docs.length; mails++;
    }
  }
  return { sent, mails, errors };
}
/** Alege singur calea: Gmail → partajare (telefon) → descărcare + e-mail deschis (PC) */
export async function sendSmart(bs, opts = {}) {
  if (canGmail()) return sendBelege(bs, { ...opts, via: "gmail" });
  const probe = navigator.canShare && navigator.canShare({ files: [new File([new Blob(["x"], { type: "application/pdf" })], "t.pdf", { type: "application/pdf" })] });
  if (probe) return sendBelege(bs, { ...opts, via: "share" });
  // PC fără Gmail: descarcă fișierele, apoi o fereastră cu e-mailul gata adresat pentru fiecare tip
  const byType = {}; bs.forEach(b => (byType[b.type] ||= []).push(b)); const errors = [], links = [];
  for (const [type, l] of Object.entries(byType)) {
    const to = addressFor(type); if (!to) { errors.push(`Lipsește adresa DATEV pentru „${TYPES[type][0]}”.`); continue; }
    let n = 0;
    for (const b of l) for (const f of await belegFiles(b)) { const a = document.createElement("a"); a.href = URL.createObjectURL(f.blob); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); n++; await new Promise(r => setTimeout(r, 350)); }
    links.push({ type, to, n, docs: l });
  }
  if (!links.length) return { sent: 0, mails: 0, errors };
  const { sheet } = await import("./ui.js");
  return new Promise(res => {
    const o = sheet(`<h3>Fișierele sunt descărcate</h3><div class="hint">Deschide e-mailul, atașează fișierele din „Descărcări” (cel mult 10 pe e-mail) și trimite. Apoi apasă „Gata, trimise”.</div>
      ${links.map(l => `<div class="row sb" style="padding:6px 0;border-top:1px solid var(--line)"><span><b>${TYPES[l.type][0]}</b> · ${l.n} fișier(e)<br><span class="hint">${l.to}</span></span><a class="btn" href="mailto:${encodeURIComponent(l.to)}?subject=${encodeURIComponent(TYPES[l.type][1] + " " + (S.settings.company.name || ""))}">Deschide e-mailul</a></div>`).join("")}
      <div class="foot"><button class="btn" data-close>Încă nu</button><button class="btn primary" id="ms-ok">Gata, trimise</button></div>`, { onClose: () => res({ sent: 0, mails: 0, errors, manual: true }) });
    o.q("#ms-ok").onclick = async () => { const all = links.flatMap(l => l.docs); await markSent(all); res({ sent: all.length, mails: links.length, errors, manualDone: true }); o.close(); };
  });
}
export async function markSent(bs, via = "manual") {
  for (const b of bs) await Store.put("datevlog", { id: key(b.kind, b.id), kind: b.kind, ref: b.id, type: b.type, at: Date.now(), to: addressFor(b.type), via, msg: "" });
}
export const unmark = b => Store.del("datevlog", key(b.kind, b.id));

/** Ce trebuie trimis automat (după setări) */
export function pendingAuto() {
  const a = S.settings.datev.auto || {}, since = S.settings.datev.autoSince || "";
  return belege().filter(b => !b.sent && !b.cancelled && (!since || b.date >= since) && ((b.type === "out" && a.out) || (b.type === "in" && a.in && b.files) || (b.type === "cash" && a.cash && b.files)));
}
let running = false;
export async function runAuto() {
  if (running || !canGmail() || !gmailReady() || !navigator.onLine) return null;
  const p = pendingAuto(); if (!p.length) return null;
  running = true;
  try { return await sendBelege(p.slice(0, 30), { via: "gmail", interactive: false }); }
  catch (e) { console.warn("DATEV automat", e); return { error: e }; }
  finally { running = false; }
}

/** Verificare lunară pentru contabil */
export function monthCheck(pid, m) {
  const from = m + "-01", to = m + "-31", bs = belege({ pid, from, to }), out = [];
  const outB = bs.filter(b => b.type === "out"), inB = bs.filter(b => b.type === "in"), cashB = bs.filter(b => b.type === "cash");
  const unsent = bs.filter(b => !b.sent && !b.cancelled && (b.gen || b.files));
  out.push({ ok: outB.every(b => b.sent || b.cancelled), txt: `Facturi scrise: ${outB.length}`, sub: outB.filter(b => !b.sent && !b.cancelled).length ? `${outB.filter(b => !b.sent && !b.cancelled).length} netrimise` : "toate trimise" });
  const miss = inB.filter(b => b.missing);
  out.push({ ok: !miss.length && inB.every(b => b.sent || !b.files), warn: !!miss.length, txt: `Facturi primite: ${inB.length}`, sub: [miss.length && `${miss.length} fără poză/PDF`, inB.filter(b => b.files && !b.sent).length && `${inB.filter(b => b.files && !b.sent).length} netrimise`].filter(Boolean).join(" · ") || "complete" });
  const openP = list("purchases").filter(p => pidOf(p) === pid && ym(p.date) === m && calcPurchase(p).gross - (p.payments || []).reduce((s, x) => s + num(x.amount), 0) > 0.004);
  if (openP.length) out.push({ warn: true, txt: `${openP.length} facturi primite încă neplătite`, sub: "apar în contabilitate abia la plată" });
  if (pid === (S.settings.cash.profile || "at")) {
    const md = S.cashmonths[pid + "-" + m];
    out.push({ ok: cashB.length > 0, warn: !cashB.length, txt: `Zile de casă: ${cashB.length}`, sub: cashB.length ? money(r2(cashB.reduce((s, b) => s + b.amount, 0))) : "nicio zi înregistrată" });
    out.push({ ok: !!(md && Object.keys(md.split || {}).length), warn: !(md && Object.keys(md.split || {}).length), txt: "Raportul lunar de TVA al casei", sub: md ? "introdus" : "lipsește – cotele se estimează" });
  }
  return { items: out, unsent, all: bs };
}
