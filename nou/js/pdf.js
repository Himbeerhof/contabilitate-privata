// PDF: facturi, Lieferscheine, registrul de casă, poze → PDF (pentru DATEV)
import { S, prof, pidOf } from "./state.js";
import { calcInvoice, lineNet, uLabel, MOVE_TYPES } from "./model.js";
import { money, dec2, numStr, fmtDate, num, r2, pct, fmtIban } from "./util.js";

let jsP = null;
export function loadPdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  return jsP ||= new Promise((res, rej) => { const s = document.createElement("script"); s.src = "../vendor/jspdf.umd.min.js"; s.onload = () => res(window.jspdf.jsPDF); s.onerror = () => { jsP = null; rej(new Error("Generatorul PDF nu s-a încărcat")); }; document.head.appendChild(s); });
}
// fonturile standard PDF au doar Latin-1: literele românești se scriu fără diacritice
const T = s => String(s ?? "").replace(/[ăâ]/g, "a").replace(/[ĂÂ]/g, "A").replace(/[îÎ]/g, c => c === "î" ? "i" : "I").replace(/[șş]/g, "s").replace(/[ȘŞ]/g, "S").replace(/[țţ]/g, "t").replace(/[ȚŢ]/g, "T").replace(/[–—]/g, "-").replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'").replace(/…/g, "...").replace(/[^\x00-\xFF€]/g, "?");
const BRAND = [184, 35, 79];

function companyLines() {
  const c = S.settings.company; return [c.name, c.owner && c.owner !== c.name ? c.owner : "", c.street, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean);
}
function footer(doc, pid) {
  const c = S.settings.company, b = S.settings.bank, P = prof(pid), W = 210, y = 280;
  doc.setDrawColor(220); doc.line(20, y - 4, W - 20, y - 4); doc.setFontSize(7.4); doc.setTextColor(110);
  const col1 = [c.name, c.street, [c.zip, c.city].filter(Boolean).join(" ")].filter(Boolean);
  const col2 = [c.phone && "Tel. " + c.phone, c.email, c.web].filter(Boolean);
  const col3 = [P.taxNo && "Steuernr. " + P.taxNo, P.vatId && (pid === "at" ? "UID " : "USt-IdNr. ") + P.vatId].filter(Boolean);
  const col4 = [b.bank, b.iban && "IBAN " + fmtIban(b.iban), b.bic && "BIC " + b.bic].filter(Boolean);
  [[20, col1], [64, col2], [104, col3], [142, col4]].forEach(([x, l]) => l.forEach((t, i) => doc.text(T(t), x, y + i * 3.4)));
  doc.setTextColor(0);
}
async function logoOf(doc) {
  const l = S.settings.company.logo; if (!l) return null;
  try { const img = new Image(); img.src = l; await img.decode(); const h = 16, w = Math.min(50, h * img.width / img.height); return { data: l, w, h, fmt: /png/i.test(l.slice(0, 30)) ? "PNG" : "JPEG" }; } catch (e) { return null; }
}

/** Factură / Storno / Lieferschein */
export async function docPdf(d, kind = "invoice") {
  const jsPDF = await loadPdf(), doc = new jsPDF({ unit: "mm", format: "a4" }), pid = pidOf(d), P = prof(pid), st = S.settings;
  const isLs = kind === "ls", showPrice = !isLs || st.invoice.lsPrices !== false;
  const c = isLs ? null : calcInvoice(d);
  const lg = await logoOf(doc);
  const head = first => {
    if (lg) try { doc.addImage(lg.data, lg.fmt, 20, 12, lg.w, lg.h); } catch (e) {}
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...BRAND); doc.text(T(st.company.name || ""), 190, 18, { align: "right" });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.6); doc.setTextColor(80);
    companyLines().slice(1).concat([st.company.phone && "Tel. " + st.company.phone, st.company.email].filter(Boolean)).forEach((t, i) => doc.text(T(t), 190, 23 + i * 3.8, { align: "right" }));
    doc.setTextColor(0);
    if (!first) { doc.setFontSize(9); doc.text(T(`${isLs ? "Lieferschein" : "Rechnung"} ${d.no || ""} – Fortsetzung`), 20, 40); }
  };
  head(true);
  // fereastra de adresă
  doc.setFontSize(7); doc.setTextColor(110); doc.text(T([st.company.name, st.company.street, [st.company.zip, st.company.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ")), 20, 48);
  doc.setTextColor(0); doc.setFontSize(10.5);
  const to = d.to || {}, addr = [to.name, to.name2, ...(String(to.address || "").split(/\n/)), to.street, [to.zip, to.city].filter(Boolean).join(" "), to.country && to.country !== P.country ? countryName(to.country) : ""].filter(x => x && String(x).trim());
  [...new Set(addr)].slice(0, 7).forEach((t, i) => doc.text(T(t), 20, 55 + i * 5));
  // bloc informații
  const info = [];
  if (isLs) { info.push(["Lieferschein-Nr.", d.no], ["Datum", fmtDate(d.date)]); }
  else {
    info.push([d.type === "storno" ? "Storno-Nr." : d.type === "credit" ? "Gutschrift-Nr." : "Rechnungs-Nr.", d.no], ["Rechnungsdatum", fmtDate(d.date)]);
    if (d.serviceFrom || d.serviceTo) info.push(["Leistungszeitraum", d.serviceTo && d.serviceTo !== d.serviceFrom ? `${fmtDate(d.serviceFrom)} – ${fmtDate(d.serviceTo)}` : fmtDate(d.serviceFrom || d.serviceTo)]);
    else { const ds = (d.items || []).map(i => i.date).filter(Boolean).sort(); if (ds.length) info.push(["Lieferdatum", ds[0] === ds[ds.length - 1] ? fmtDate(ds[0]) : `${fmtDate(ds[0])} – ${fmtDate(ds[ds.length - 1])}`]); else info.push(["Lieferdatum", "= Rechnungsdatum"]); }
  }
  if (to.no) info.push(["Kunden-Nr.", to.no]);
  if (to.vatId) info.push([pid === "at" ? "UID Kunde" : "USt-IdNr. Kunde", to.vatId]);
  if (d.orderRef) info.push(["Ihre Bestellung", d.orderRef]);
  doc.setFontSize(9);
  info.forEach(([k, v], i) => { doc.setTextColor(100); doc.text(T(k), 125, 55 + i * 5); doc.setTextColor(0); doc.text(T(v || ""), 190, 55 + i * 5, { align: "right" }); });
  // titlu
  let y = 100;
  doc.setFont("helvetica", "bold"); doc.setFontSize(15);
  doc.text(T(isLs ? "Lieferschein" : d.type === "storno" ? "Stornorechnung" : d.type === "credit" ? "Gutschrift" : "Rechnung"), 20, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); y += 7;
  if (d.type === "storno" && d.refNo) { doc.text(T(`Storno zur Rechnung ${d.refNo}${d.refDate ? " vom " + fmtDate(d.refDate) : ""}.`), 20, y); y += 6; }
  const intro = d.intro || (isLs ? "" : st.invoice.intro);
  if (intro) { const ls = doc.splitTextToSize(T(intro), 170); doc.text(ls, 20, y); y += ls.length * 4.4 + 3; }
  // tabel
  const hasDate = (d.items || []).some(i => i.date), hasLs = !isLs && (d.items || []).some(i => i.ls);
  const cols = [];
  if (hasDate) cols.push({ k: "date", h: "Datum", w: 19 });
  if (hasLs) cols.push({ k: "ls", h: "LS-Nr.", w: 18 });
  cols.push({ k: "name", h: "Artikel", w: 0 });
  cols.push({ k: "qty", h: "Menge", w: 18, r: 1 }, { k: "unit", h: "Einh.", w: 13 });
  if (showPrice) { cols.push({ k: "price", h: "Preis", w: 19, r: 1 }); if (!isLs && !d.small) cols.push({ k: "vat", h: "USt", w: 12, r: 1 }); cols.push({ k: "total", h: "Betrag", w: 22, r: 1 }); }
  const fixed = cols.reduce((s, c) => s + c.w, 0); cols.find(c => c.k === "name").w = 170 - fixed;
  let x = 20; cols.forEach(c => { c.x = x; x += c.w; });
  const th = () => { doc.setFillColor(246, 240, 243); doc.rect(20, y - 4.2, 170, 6.4, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(8.6);
    cols.forEach(c => doc.text(T(c.h), c.r ? c.x + c.w - 1 : c.x + 1, y, c.r ? { align: "right" } : {})); doc.setFont("helvetica", "normal"); y += 6; };
  th();
  doc.setFontSize(9);
  for (const it of d.items || []) {
    const name = [it.name, it.hkl && st.invoice.showHkl !== false ? "Kl. " + it.hkl : "", it.origin ? "Herkunft " + it.origin : ""].filter(Boolean).join(" · ");
    const nl = doc.splitTextToSize(T(name), cols.find(c => c.k === "name").w - 2), hgt = Math.max(1, nl.length) * 4 + 1.6;
    if (y + hgt > 262) { footer(doc, pid); doc.addPage(); head(false); y = 50; th(); doc.setFontSize(9); }
    const v = { date: it.date ? fmtDate(it.date).slice(0, 6) + fmtDate(it.date).slice(8) : "", ls: it.ls || "", qty: numStr(num(it.qty)), unit: it.unit || "kg",
      price: showPrice ? dec2(num(it.price)) : "", vat: d.small ? "" : pct(num(it.vat)).replace(" ", ""), total: showPrice ? dec2(lineNet(it)) : "" };
    cols.forEach(c => { if (c.k === "name") doc.text(nl, c.x + 1, y); else doc.text(T(v[c.k]), c.r ? c.x + c.w - 1 : c.x + 1, y, c.r ? { align: "right" } : {}); });
    y += hgt; doc.setDrawColor(235); doc.line(20, y - 3.2, 190, y - 3.2);
  }
  y += 2;
  if (y > 235) { footer(doc, pid); doc.addPage(); head(false); y = 50; }
  if (!isLs) {
    const R = (l, v, b) => { doc.setFont("helvetica", b ? "bold" : "normal"); doc.text(T(l), 140, y, { align: "right" }); doc.text(T(v), 190, y, { align: "right" }); y += 5; };
    doc.setFontSize(9.5);
    if (d.small) R("Gesamtbetrag", money(c.gross), true);
    else {
      R("Summe netto", money(c.net));
      c.vats.forEach(v => R(`zzgl. ${pct(v.rate)} USt auf ${money(v.base)}`, money(v.tax)));
      y += 1.2; doc.setDrawColor(40); doc.line(120, y - 4.2, 190, y - 4.2); doc.setFontSize(11); R(d.type === "storno" ? "Storno-Betrag" : "Rechnungsbetrag", money(c.gross), true); doc.setFontSize(9.5);
    }
    y += 3;
    const notes = [];
    if (d.small) notes.push(pid === "at" ? "Umsatzsteuerbefreit – Kleinunternehmer gemäß § 6 Abs. 1 Z 27 UStG." : "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.");
    if (P.p24 && !d.small && pid === "de") notes.push("Durchschnittssatz gemäß § 24 UStG.");
    if (d.type !== "storno") {
      const paidAll = (d.payments || []).reduce((s, p) => s + num(p.amount), 0) >= c.gross - 0.004 && c.gross > 0;
      if (paidAll) notes.push("Betrag dankend erhalten.");
      else if (d.due) notes.push(`Zahlbar bis ${fmtDate(d.due)} ohne Abzug${S.settings.bank.iban ? ` auf das Konto IBAN ${fmtIban(S.settings.bank.iban)}` : ""}. Bitte geben Sie die Rechnungsnummer ${d.no} an.`);
    }
    if (d.note) notes.push(d.note); if (st.invoice.footer) notes.push(st.invoice.footer);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    notes.forEach(n => { const l = doc.splitTextToSize(T(n), 170); if (y + l.length * 4.2 > 270) { footer(doc, pid); doc.addPage(); head(false); y = 50; } doc.text(l, 20, y); y += l.length * 4.2 + 1.5; });
  } else {
    doc.setFontSize(9);
    if (d.note) { const l = doc.splitTextToSize(T(d.note), 170); doc.text(l, 20, y); y += l.length * 4.2 + 3; }
    if (showPrice) { const net = r2((d.items || []).reduce((s, i) => s + lineNet(i), 0)); doc.setFont("helvetica", "bold"); doc.text(T("Warenwert netto: " + money(net)), 190, y, { align: "right" }); doc.setFont("helvetica", "normal"); y += 8; }
    y = Math.max(y + 12, 240); doc.setDrawColor(120); doc.line(20, y, 85, y); doc.line(120, y, 190, y);
    doc.setFontSize(8); doc.text(T("Ware übergeben (Datum, Unterschrift)"), 20, y + 4); doc.text(T("Ware erhalten (Datum, Unterschrift)"), 120, y + 4);
  }
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); footer(doc, pid); if (n > 1) { doc.setFontSize(7.5); doc.setTextColor(120); doc.text(`Seite ${i} von ${n}`, 190, 292, { align: "right" }); doc.setTextColor(0); } }
  doc.setProperties({ title: T((isLs ? "Lieferschein " : "Rechnung ") + (d.no || "")), author: T(st.company.name), creator: "Contabilitate privata" });
  return doc;
}
export const docBlob = async (d, kind) => (await docPdf(d, kind)).output("blob");
export const docName = (d, kind) => `${kind === "ls" ? "Lieferschein" : d.type === "storno" ? "Storno" : "Rechnung"}_${String(d.no || "").replace(/[^\w.-]+/g, "_")}.pdf`;

const COUNTRIES = { DE: "Deutschland", AT: "Österreich", CH: "Schweiz", IT: "Italien", FR: "Frankreich", RO: "Rumänien", NL: "Niederlande", ES: "Spanien", LI: "Liechtenstein" };
export const countryName = c => COUNTRIES[c] || c || "";
export const COUNTRY_LIST = Object.entries(COUNTRIES);

/** Poze (JPEG/PNG) → un PDF, câte o pagină A4 per poză (DATEV Upload Mail primește doar PDF / TIFF) */
export async function imagesToPdf(blobs, title = "Beleg") {
  const jsPDF = await loadPdf(), doc = new jsPDF({ unit: "mm", format: "a4" });
  for (let i = 0; i < blobs.length; i++) {
    const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blobs[i]); });
    const img = new Image(); img.src = url; await img.decode();
    if (i) doc.addPage();
    const W = 200, H = 287, s = Math.min(W / img.width, H / img.height), w = img.width * s, h = img.height * s;
    doc.addImage(url, /png/.test(blobs[i].type) ? "PNG" : "JPEG", 5 + (W - w) / 2, 5 + (H - h) / 2, w, h, undefined, "MEDIUM");
  }
  doc.setProperties({ title: T(title) });
  return doc.output("blob");
}

/** Registrul de casă (Kassenbuch) pe o perioadă */
export async function cashBookPdf(book, { pid, from, to }) {
  const jsPDF = await loadPdf(), doc = new jsPDF({ unit: "mm", format: "a4" }), st = S.settings;
  let y = 18;
  const head = () => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text("Kassenbuch", 15, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(T(`${st.company.name} · ${prof(pid).label} · ${fmtDate(from)} – ${fmtDate(to)}`), 195, y, { align: "right" }); y += 9;
    doc.setFillColor(246, 240, 243); doc.rect(15, y - 4.2, 180, 6.4, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(8.4);
    [["Datum", 16], ["Beleg", 36], ["Text", 58]].forEach(([t, x]) => doc.text(t, x, y));
    [["Einnahme", 148], ["Ausgabe", 171], ["Bestand", 194]].forEach(([t, x]) => doc.text(t, x, y, { align: "right" }));
    doc.setFont("helvetica", "normal"); y += 6;
  };
  head(); doc.setFontSize(8.6);
  doc.text(T("Anfangsbestand"), 58, y); doc.text(T(dec2(book.start)), 194, y, { align: "right" }); y += 5;
  let tin = 0, tout = 0;
  for (const r of book.rows) {
    if (y > 280) { doc.addPage(); y = 18; head(); doc.setFontSize(8.6); }
    doc.text(fmtDate(r.date), 16, y); doc.text(T(String(r.doc || "").slice(0, 14)), 36, y); doc.text(T(String(r.text).slice(0, 62)), 58, y);
    if (r.amount >= 0) { doc.text(dec2(r.amount), 148, y, { align: "right" }); tin += r.amount; } else { doc.text(dec2(-r.amount), 171, y, { align: "right" }); tout -= r.amount; }
    doc.text(dec2(r.bal), 194, y, { align: "right" }); y += 4.6;
  }
  y += 1; doc.setDrawColor(60); doc.line(15, y - 3, 195, y - 3); doc.setFont("helvetica", "bold");
  doc.text("Summe / Endbestand", 58, y); doc.text(dec2(tin), 148, y, { align: "right" }); doc.text(dec2(tout), 171, y, { align: "right" }); doc.text(dec2(book.end), 194, y, { align: "right" });
  return doc.output("blob");
}
