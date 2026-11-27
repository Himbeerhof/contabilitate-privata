// Export DATEV: format EXTF 700, „Buchungsstapel” (versiunea 13), cod Windows-1252.
// Conturile sunt propuneri SKR03 / SKR04 și se pot schimba în Setări → DATEV (se stabilesc o dată cu contabilul).
import { S, prof, pidOf, list } from "./state.js";
import { journal, cashBook, calcInvoice, calcPurchase, CATS, MOVE_TYPES, cashProfile } from "./model.js";
import { r2, num, cp1252, pad } from "./util.js";

export const DEF = {
  "03": { bank: "1200", cash: "1000", card: "1360", transit: "1360", privout: "1800", privin: "1890", debitor: "10000", kreditor: "70000", diffplus: "2700", diffminus: "4900",
    rev19: "8400", rev7: "8300", rev0: "8200", revOther: "8200", revSmall: "8195", revAT: "8338",
    goods19: "3400", goods7: "3300", goods0: "3200",
    plants: "3200", fert: "3200", pack: "4710", wages: "4100", fuel: "4530", mach: "4805", rent: "4220", market: "4210", energy: "4240", ins: "4360", office: "4920", advice: "4950", bankfee: "4970", other: "4900",
    subs: "2700", otherin: "2700" },
  "04": { bank: "1800", cash: "1600", card: "1460", transit: "1460", privout: "2100", privin: "2180", debitor: "10000", kreditor: "70000", diffplus: "4830", diffminus: "6300",
    rev19: "4400", rev7: "4300", rev0: "4200", revOther: "4200", revSmall: "4185", revAT: "4338",
    goods19: "5400", goods7: "5300", goods0: "5200",
    plants: "5200", fert: "5200", pack: "6710", wages: "6010", fuel: "6530", mach: "6460", rent: "6315", market: "6310", energy: "6325", ins: "6400", office: "6805", advice: "6825", bankfee: "6855", other: "6300",
    subs: "4830", otherin: "4830" }
};
// conturi „automate” (TVA inclusă în cont) – la ele nu se pune cheie BU
const AUTO = new Set(["rev19", "rev7", "goods19", "goods7"]);
export const ACC_LABELS = [
  ["Bani", [["bank", "Bancă"], ["cash", "Casă"], ["card", "Plăți cu cardul (Geldtransit)"], ["transit", "Depuneri casă → bancă (Geldtransit)"], ["privout", "Privatentnahme"], ["privin", "Privateinlage"], ["debitor", "Debitor colectiv (clienți)"], ["kreditor", "Creditor colectiv (furnizori)"], ["diffplus", "Diferență de casă +"], ["diffminus", "Diferență de casă −"]]],
  ["Venituri", [["rev19", "Venituri 19 % (automat)"], ["rev7", "Venituri 7 % (automat)"], ["rev0", "Venituri 0 %"], ["revOther", "Venituri alte cote (ex. § 24)"], ["revSmall", "Venituri Kleinunternehmer"], ["revAT", "Venituri Austria (TVA austriacă)"], ["subs", "Subvenții"], ["otherin", "Alte venituri"]]],
  ["Cheltuieli", [["goods19", "Marfă 19 % (automat)"], ["goods7", "Marfă 7 % (automat)"], ["goods0", "Marfă fără TVA"], ...Object.entries(CATS).filter(([k]) => !["goods", "sales", "direct", "subs", "otherin"].includes(k)).map(([k, v]) => [k, v.ro])]]
];

export function cfg() {
  const d = S.settings.datev || {}, skr = d.skr === "04" ? "04" : "03";
  return { ...d, skr, acc: { ...DEF[skr], ...((d.acc || {})[skr] || {}) } };
}

/** Rândurile de contare (fără formatare) pentru un profil și o perioadă */
export function bookings({ pid, from, to }) {
  const C = cfg(), A = C.acc, P = prof(pid), warn = new Set(), out = [];
  const opos = C.mode === "opos", de = pid === "de";
  const money = m => ({ bank: A.bank, cash: A.cash, card: A.card })[m] || A.bank;
  const deb = id => (S.contacts[id]?.datevC) || A.debitor, kred = id => (S.contacts[id]?.datevS) || A.kreditor;
  const revAcc = r => {
    if (!de) return { acc: A.revAT, bu: "" };
    if (P.small || r.small) return { acc: A.revSmall, bu: "" };
    if (r.rate === 19) return { acc: A.rev19, bu: "" };
    if (r.rate === 7) return { acc: A.rev7, bu: "" };
    if (r.rate === 0) return { acc: A.rev0, bu: "" };
    warn.add(`Cota ${String(r.rate).replace(".", ",")} % (ex. § 24 UStG) nu are cheie DATEV standard: e contată pe ${A.revOther} fără cheie – stabilește cu contabilul.`);
    return { acc: A.revOther, bu: "" };
  };
  const inAcc = r => r.cat === "subs" ? { acc: A.subs, bu: "" } : r.cat === "otherin" ? { acc: A.otherin, bu: de && !P.small ? ({ 19: "3", 7: "2" })[r.rate] || "" : "" } : revAcc(r);
  const outAcc = r => {
    if (r.cat === "goods" && de && !P.small && !r.foreign) { if (r.rate === 19) return { acc: A.goods19, bu: "" }; if (r.rate === 7) return { acc: A.goods7, bu: "" }; }
    const acc = r.cat === "goods" ? A.goods0 : (A[r.cat] || A.other);
    let bu = "";
    if (de && !P.small && !r.foreign && r.vat) { bu = ({ 19: "9", 7: "8" })[r.rate] || ""; if (!bu) warn.add(`Cheltuială cu cota ${String(r.rate).replace(".", ",")} %: fără cheie BU standard – verifică.`); }
    return { acc, bu };
  };
  const text = (...a) => a.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  const push = (o, src) => { if (Math.abs(o.amt) < 0.005) return; const neg = o.amt < 0; out.push({ ...o, amt: Math.abs(r2(o.amt)), sh: neg ? (o.sh === "S" ? "H" : "S") : o.sh, src }); };

  journal({ pid, from, to, mode: "ist" }).forEach(r => {
    if (opos && (r.src === "invoices" || r.src === "purchases")) return;
    if (r.type === "in") { const g = inAcc(r); push({ konto: money(r.method), gegen: g.acc, bu: g.bu, amt: r.gross, sh: "S", date: r.date, doc: r.doc, text: text(r.party, r.text), lsd: r.docDate }, r); }
    else { const g = outAcc(r); push({ konto: money(r.method), gegen: g.acc, bu: g.bu, amt: r.gross, sh: "H", date: r.date, doc: r.doc, text: text(r.party, r.text) }, r); }
  });
  if (opos) {
    journal({ pid, from, to, mode: "soll" }).forEach(r => {
      if (r.src === "invoices") { const g = revAcc(r); push({ konto: deb(r.contactId), gegen: g.acc, bu: g.bu, amt: r.gross, sh: "S", date: r.date, doc: r.doc, text: text(r.party, r.text) }, r); }
      if (r.src === "purchases") { const g = outAcc(r); push({ konto: kred(r.contactId), gegen: g.acc, bu: g.bu, amt: r.gross, sh: "H", date: r.date, doc: r.doc, text: text(r.party, r.text) }, r); }
    });
    list("invoices").filter(i => pidOf(i) === pid && i.status !== "draft" && i.status !== "cancelled").forEach(i => (i.payments || []).forEach(p => {
      if (p.date >= from && p.date <= to) push({ konto: money(p.method), gegen: deb(i.contactId), bu: "", amt: num(p.amount), sh: "S", date: p.date, doc: i.no, text: text("Zahlung", i.to?.name, i.no) }, { src: "invoices", id: i.id });
    }));
    list("purchases").filter(p => pidOf(p) === pid).forEach(pu => (pu.payments || []).forEach(p => {
      if (p.date >= from && p.date <= to) push({ konto: money(p.method), gegen: kred(pu.contactId), bu: "", amt: num(p.amount), sh: "H", date: p.date, doc: pu.docNo, text: text("Zahlung", pu.supplier, pu.docNo) }, { src: "purchases", id: pu.id });
    }));
  }
  // mișcări de bani din casă (depuneri, retrageri, diferențe, scoaterea automată)
  const book = cashBook(pid, from, to);
  book.rows.filter(r => r.src === "cashmoves" || r.src === "auto").forEach(r => {
    const t = r.move;
    if (t === "tobank") push({ konto: A.cash, gegen: A.transit, bu: "", amt: -r.amount, sh: "H", date: r.date, doc: "", text: r.text }, r);
    else if (t === "frombank") push({ konto: A.cash, gegen: A.bank, bu: "", amt: r.amount, sh: "S", date: r.date, doc: "", text: r.text }, r);
    else if (t === "privout") push({ konto: A.cash, gegen: A.privout, bu: "", amt: -r.amount, sh: "H", date: r.date, doc: "", text: r.text }, r);
    else if (t === "privin") push({ konto: A.cash, gegen: A.privin, bu: "", amt: r.amount, sh: "S", date: r.date, doc: "", text: r.text }, r);
    else push({ konto: A.cash, gegen: r.amount >= 0 ? A.diffplus : A.diffminus, bu: "", amt: r.amount, sh: "S", date: r.date, doc: "", text: r.text || "Kassendifferenz" }, r);
  });
  if (!de) warn.add("Profilul Austria: sumele sunt exportate brut, fără chei de TVA germane (TVA austriacă nu e TVA germană). Contabilul stabilește conturile.");
  if (book.negative.length) warn.add(`Casa are sold negativ în ${book.negative.length} zi(le) – verifică registrul de casă înainte de trimitere.`);
  if (journal({ pid, from, to }).some(r => r.est)) warn.add("Pentru unele luni lipsește raportul lunar de TVA al casei – cotele sunt estimate.");
  return { rows: out.sort((a, b) => a.date.localeCompare(b.date)), warn: [...warn], cfg: C };
}

export const COLS = ["Umsatz (ohne Soll/Haben-Kz)", "Soll/Haben-Kennzeichen", "WKZ Umsatz", "Kurs", "Basis-Umsatz", "WKZ Basis-Umsatz", "Konto", "Gegenkonto (ohne BU-Schlüssel)", "BU-Schlüssel", "Belegdatum", "Belegfeld 1", "Belegfeld 2", "Skonto", "Buchungstext",
  "Postensperre", "Diverse Adressnummer", "Geschäftspartnerbank", "Sachverhalt", "Zinssperre", "Beleglink",
  ...Array.from({ length: 8 }, (_, i) => [`Beleginfo - Art ${i + 1}`, `Beleginfo - Inhalt ${i + 1}`]).flat(),
  "KOST1 - Kostenstelle", "KOST2 - Kostenstelle", "Kost-Menge", "EU-Land u. UStID (Bestimmung)", "EU-Steuersatz (Bestimmung)", "Abw. Versteuerungsart", "Sachverhalt L+L", "Funktionsergänzung L+L",
  "BU 49 Hauptfunktionstyp", "BU 49 Hauptfunktionsnummer", "BU 49 Funktionsergänzung",
  ...Array.from({ length: 20 }, (_, i) => [`Zusatzinformation - Art ${i + 1}`, `Zusatzinformation- Inhalt ${i + 1}`]).flat(),
  "Stück", "Gewicht", "Zahlweise", "Forderungsart", "Veranlagungsjahr", "Zugeordnete Fälligkeit", "Skontotyp", "Auftragsnummer", "Buchungstyp", "USt-Schlüssel (Anzahlungen)", "EU-Mitgliedstaat (Anzahlungen)",
  "Sachverhalt L+L (Anzahlungen)", "EU-Steuersatz (Anzahlungen)", "Erlöskonto (Anzahlungen)", "Herkunft-Kz", "Buchungs GUID", "KOST-Datum", "SEPA-Mandatsreferenz", "Skontosperre", "Gesellschaftername",
  "Beteiligtennummer", "Identifikationsnummer", "Zeichnernummer", "Postensperre bis", "Bezeichnung SoBil-Sachverhalt", "Kennzeichen SoBil-Buchung", "Festschreibung", "Leistungsdatum", "Datum Zuord. Steuerperiode",
  "Fälligkeit", "Generalumkehr (GU)", "Steuersatz", "Land", "Abrechnungsreferenz", "BVV-Position", "EU-Mitgliedstaat u. UStID (Ursprung)", "EU-Steuersatz (Ursprung)", "Abw. Skontokonto"];

const q = v => `"${String(v ?? "").replace(/"/g, "'")}"`;
const amtStr = n => r2(n).toFixed(2).replace(".", ",");
const belegfeld = s => String(s || "").replace(/[^A-Za-z0-9$&%*+\-/]/g, "").slice(0, 36);

const LSD = COLS.indexOf("Leistungsdatum");
function build({ pid, from, to, label, rows, C }) {
  const now = new Date(), ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${pad(now.getMilliseconds(), 3)}`;
  const ymd = s => s.replace(/-/g, ""), wj = from.slice(0, 4) + pad(+C.wjBegin || 1) + "01";
  const berater = (C.berater || {})[pid] || "", mandant = (C.mandant || {})[pid] || "";
  const head = ['"EXTF"', 700, 21, q("Buchungsstapel"), 13, ts, "", q("RE"), q("Contabilitate"), q(""), berater || 1001, mandant || 1, wj, C.accLen || 4, ymd(from), ymd(to),
    q((label || `${prof(pid).label} ${from.slice(0, 7)}`).slice(0, 30)), q(""), 1, 0, 0, q("EUR"), "", q(""), "", "", q(C.skr), "", "", q(""), q("")].join(";");
  const lines = rows.map(r => {
    const f = new Array(COLS.length).fill("");
    f[0] = amtStr(r.amt); f[1] = q(r.sh); f[2] = q("EUR"); f[6] = r.konto; f[7] = r.gegen; f[8] = q(r.bu); f[9] = r.date.slice(8, 10) + r.date.slice(5, 7);
    f[10] = q(belegfeld(r.doc)); f[11] = q(""); f[13] = q(String(r.text || "").slice(0, 60));
    if (r.lsd && r.lsd !== r.date) { const l = ymd(r.lsd); f[LSD] = l.slice(6, 8) + l.slice(4, 6) + l.slice(0, 4); }
    return f.join(";");
  });
  return { bytes: cp1252([head, COLS.join(";"), ...lines].join("\r\n") + "\r\n"), missing: [!berater && "Beraternummer", !mandant && "Mandantennummer"].filter(Boolean) };
}

/** Fișierul EXTF cu tot ce s-a întâmplat în perioadă. from/to trebuie să fie în același an (an fiscal). */
export function datevCsv({ pid, from, to, label = "", only = null }) {
  if (from.slice(0, 4) !== to.slice(0, 4)) throw new Error("Perioada trebuie să fie în același an.");
  let { rows, warn, cfg: C } = bookings({ pid, from, to });
  if (only) rows = rows.filter(only(C.acc));
  const b = build({ pid, from, to, label, rows, C });
  return { ...b, name: `EXTF_${only ? "Kasse" : "Buchungsstapel"}_${pid.toUpperCase()}_${from.replace(/-/g, "")}_${to.replace(/-/g, "")}.csv`, n: rows.length, warn, rows };
}
/** Doar registrul de casă (tot ce trece prin contul Kasse) */
export const datevCashCsv = ({ pid, from, to }) => datevCsv({ pid, from, to, label: "Kasse " + from.slice(0, 7), only: A => r => r.konto === A.cash || r.gegen === A.cash });
