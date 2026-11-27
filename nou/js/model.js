// Logica de contabilitate: calcule, stări, numerotare, registrul (jurnalul), casa, stocul, TVA.
import { S, prof, pidOf, list, PIDS } from "./state.js";
import { r2, r3, num, today, ym, year, lastDay, addDays, norm, matchKey, editDist, uniq, by } from "./util.js";

/* ---------------- categorii ---------------- */
export const CAT_OUT = [
  ["goods", "Marfă pentru revânzare", "Wareneingang"],
  ["plants", "Plante, răsaduri, semințe", "Pflanzen & Saatgut"],
  ["fert", "Îngrășăminte, protecția plantelor", "Dünger & Pflanzenschutz"],
  ["pack", "Ambalaje (caserole, lăzi)", "Verpackungsmaterial"],
  ["wages", "Salarii, culegători", "Löhne & Erntehelfer"],
  ["fuel", "Motorină, vehicule", "Kfz-Kosten & Treibstoff"],
  ["mach", "Utilaje, reparații", "Reparaturen & Instandhaltung"],
  ["rent", "Arendă, chirie", "Pacht & Miete"],
  ["market", "Taxe piață (Standgebühr)", "Marktstandgebühren"],
  ["energy", "Curent, apă", "Strom, Gas, Wasser"],
  ["ins", "Asigurări, taxe, contribuții", "Versicherungen & Beiträge"],
  ["office", "Birou, telefon, internet", "Büro, Telefon, Internet"],
  ["advice", "Contabil, consultanță", "Steuerberatung"],
  ["bankfee", "Taxe bancare", "Nebenkosten Geldverkehr"],
  ["other", "Altele", "Sonstige Kosten"]];
export const CAT_IN = [
  ["sales", "Facturi (vânzări)", "Erlöse aus Rechnungen"],
  ["direct", "Casă / piață", "Erlöse Direktverkauf (Kasse)"],
  ["subs", "Subvenții, ajutoare", "Zuschüsse"],
  ["otherin", "Alte venituri", "Sonstige Erträge"]];
export const CATS = Object.fromEntries([...CAT_OUT, ...CAT_IN].map(([k, ro, de]) => [k, { ro, de }]));
export const PAY = { bank: "Bancă / online", cash: "Numerar (casă)", card: "Card" };
export const PAY_DE = { bank: "Überweisung", cash: "Bar", card: "Karte" };
export const UNITS = [["kg", "kg"], ["Stk.", "buc."], ["Schale", "caserole"], ["Kiste", "lăzi"], ["Bund", "legături"], ["Glas", "borcane"], ["l", "l"], ["Palette", "paleți"]];
export const uLabel = u => (UNITS.find(x => x[0] === u) || [u, u || "kg"])[1];

/* ---------------- facturi ---------------- */
export const lineNet = it => r2(num(it.qty) * num(it.price));
export function calcInvoice(inv) {
  const small = !!inv.small; let net = 0; const byRate = {};
  (inv.items || []).forEach(it => { const l = lineNet(it); net += l; const rate = small ? 0 : num(it.vat); byRate[rate] = (byRate[rate] || 0) + l; });
  const vats = Object.keys(byRate).map(Number).sort((a, b) => b - a).map(rate => ({ rate, base: r2(byRate[rate]), tax: r2(byRate[rate] * rate / 100) }));
  const vat = r2(vats.reduce((s, v) => s + v.tax, 0));
  return { net: r2(net), vats, vat, gross: r2(net + vat) };
}
export const paid = doc => r2((doc.payments || []).reduce((s, p) => s + num(p.amount), 0));
export function invState(inv, at = today()) {
  if (inv.status === "draft") return "draft";
  if (inv.status === "cancelled") return "cancelled";
  const g = calcInvoice(inv).gross, p = paid(inv);
  if (g <= 0.004 && inv.type === "storno") return "storno";
  if (Math.abs(g) - Math.abs(p) <= 0.004) return "paid";
  if (inv.due && inv.due < at) return p ? "partover" : "over";
  return p ? "partial" : "open";
}
export const STATE = { draft: ["Ciornă", "draft"], open: ["Deschisă", "open"], partial: ["Plătită parțial", "partial"], over: ["Restantă", "over"], partover: ["Restantă (parțial)", "over"],
  paid: ["Plătită", "paid"], cancelled: ["Anulată", "cancelled"], storno: ["Storno", "cancelled"] };
export const isOpen = st => ["open", "partial", "over", "partover"].includes(st);

/* ---------------- numerotare ---------------- */
function nextIn(docs, head, start) {
  let max = 0;
  docs.forEach(d => { const n = String(d.no || ""); if (n.startsWith(head)) { const v = parseInt(n.slice(head.length), 10); if (v > max) max = v; } });
  return Math.max(max + 1, start);
}
export function invHead(date, pid) { const p = (prof(pid).invPrefix || "").trim(), y = year(date || today()); return p ? `${p}-${y}-` : `${y}-`; }
export function nextInvoiceNo(date, pid) {
  const P = prof(pid), head = invHead(date, pid), y = year(date || today());
  const n = nextIn(list("invoices").filter(i => i.status !== "draft"), head, y === String(new Date().getFullYear()) ? (+P.invStart || 1) : 1);
  return head + ((P.invPrefix || "").trim() ? String(n).padStart(3, "0") : String(n));
}
export function lsHead(date, pid) { const p = (prof(pid).lsPrefix || "").trim(), y = year(date || today()); return (p ? p + "-" : "") + y + "-"; }
export function nextLsNo(date, pid) {
  const P = prof(pid), y = year(date || today());
  return lsHead(date, pid) + nextIn(list("notes"), lsHead(date, pid), y === String(new Date().getFullYear()) ? (+P.lsStart || 1) : 1);
}
export function nextCustNo() {
  let max = 1000; list("contacts").forEach(c => { const m = /^K-(\d+)$/.exec(c.no || ""); if (m) max = Math.max(max, +m[1]); });
  return "K-" + (max + 1);
}
export function nextDatevNo(role) {
  const base = role === "s" ? 70000 : 10000; let max = base;
  list("contacts").forEach(c => { const n = parseInt(role === "s" ? c.datevS : c.datevC, 10); if (n >= base && n < base + 60000) max = Math.max(max, n); });
  return String(max + 1);
}

/* ---------------- facturi primite / cheltuieli ---------------- */
export function splitsOf(p) {
  const l = (p.splits || []).filter(s => num(s.gross));
  return l.length ? l.map(s => ({ rate: num(s.rate), gross: r2(num(s.gross)) })) : (num(p.gross) ? [{ rate: num(p.rate), gross: r2(num(p.gross)) }] : []);
}
export function calcPurchase(p) {
  const sp = splitsOf(p).map(s => { const net = r2(s.gross / (1 + s.rate / 100)); return { ...s, net, tax: r2(s.gross - net) }; });
  return { splits: sp, gross: r2(sp.reduce((s, x) => s + x.gross, 0)), net: r2(sp.reduce((s, x) => s + x.net, 0)), vat: r2(sp.reduce((s, x) => s + x.tax, 0)) };
}
export const itemsNet = items => r2((items || []).reduce((s, it) => s + lineNet(it), 0));
export function purState(p, at = today()) {
  const g = calcPurchase(p).gross, pd = paid(p);
  if (g - pd <= 0.004) return "paid";
  if (p.due && p.due < at) return pd ? "partover" : "over";
  return pd ? "partial" : "open";
}

/* ---------------- casa ---------------- */
export const dayTotal = d => r2(num(d.cash) + num(d.card) + num(d.other));
export const cmId = (pid, m) => pid + "-" + m;
export function monthSplit(pid, m) {
  const md = S.cashmonths[cmId(pid, m)];
  return Object.entries((md && md.split) || {}).map(([r, g]) => ({ rate: num(r), gross: r2(num(g)) })).filter(x => x.gross).sort((a, b) => a.rate - b.rate);
}
/** Împarte o sumă pe cote după proporțiile date; restul de rotunjire merge la ultima cotă */
export function splitBy(amount, parts) {
  const tot = parts.reduce((s, p) => s + p.gross, 0); if (!tot || !parts.length) return [];
  let rest = r2(amount);
  return parts.map((p, i) => { const v = i === parts.length - 1 ? rest : r2(amount * p.gross / tot); rest = r2(rest - v); return { rate: p.rate, gross: v }; }).filter(x => x.gross);
}
export function daySplit(d) {
  const pid = pidOf(d), sp = monthSplit(pid, ym(d.date)), t = dayTotal(d);
  if (sp.length) return { est: false, parts: splitBy(t, sp) };
  return { est: true, parts: t ? [{ rate: num(prof(pid).defRate), gross: t }] : [] };
}
export const cashProfile = () => PIDS.includes(S.settings.cash.profile) ? S.settings.cash.profile : "at";
export const cashFloat = () => num(S.settings.cash.float);
const WP = () => ({ 2: "Bregenz", 5: "Bregenz", 3: "Dornbirn", 6: "Dornbirn", ...(S.settings.cash.weekPlaces || {}) });
export function placeFor(date) {
  const wd = new Date(date + "T12:00:00").getDay(), p = WP()[wd];
  if (p) return p;
  return (list("cashdays").filter(c => c.place).sort(by(c => c.date, -1))[0] || {}).place || "";
}
export const allPlaces = () => uniq([...(S.settings.cash.markets || []), ...list("cashdays").map(c => c.place).filter(Boolean)]).sort((a, b) => a.localeCompare(b, "de"));

export const MOVE_TYPES = {
  tobank: ["Depus la bancă (Geldtransit)", "Geldtransit an Bank", -1],
  frombank: ["Scos de la bancă în casă", "Bank an Kasse", 1],
  privout: ["Scos pentru mine (Privatentnahme)", "Privatentnahme", -1],
  privin: ["Pus de la mine (Privateinlage)", "Privateinlage", 1],
  diff: ["Diferență de casă", "Kassendifferenz", 1]
};

/** Registrul de casă pentru un profil: rânduri în ordine cu sold; include, opțional, scoaterea automată până la fondul de casă */
export function cashBook(pid, from, to) {
  const cs = S.settings.cash, ev = [];
  list("cashdays").filter(d => pidOf(d) === pid).forEach(d => {
    const v = r2(num(d.cash) + num(d.other)); if (v) ev.push({ date: d.date, ord: 1, src: "cashdays", id: d.id, text: `Einnahmen ${d.place || ""}${d.zNo ? " · Z " + d.zNo : ""}`.trim(), amount: v, doc: d.zNo ? "Z" + d.zNo : "" });
  });
  list("purchases").filter(p => pidOf(p) === pid).forEach(p => (p.payments || []).forEach(pm => {
    if (pm.method === "cash" && num(pm.amount)) ev.push({ date: pm.date, ord: 2, src: "purchases", id: p.id, text: `${p.supplier || "Ausgabe"}${p.docNo ? " · " + p.docNo : ""}`, amount: -r2(num(pm.amount)), doc: p.docNo || "" });
  }));
  list("incomes").filter(p => pidOf(p) === pid && p.method === "cash").forEach(p => ev.push({ date: p.date, ord: 1, src: "incomes", id: p.id, text: p.text || "Einnahme", amount: r2(num(p.gross)), doc: p.docNo || "" }));
  list("invoices").filter(i => pidOf(i) === pid && i.status !== "draft").forEach(i => (i.payments || []).forEach(pm => {
    if (pm.method === "cash" && num(pm.amount)) ev.push({ date: pm.date, ord: 1, src: "invoices", id: i.id, text: `Rechnung ${i.no} ${i.to?.name || ""}`.trim(), amount: r2(num(pm.amount)), doc: i.no });
  }));
  list("cashmoves").filter(m => pidOf(m) === pid).forEach(m => { const t = MOVE_TYPES[m.type] || MOVE_TYPES.diff;
    ev.push({ date: m.date, ord: 3, src: "cashmoves", id: m.id, text: m.text || t[1], amount: r2(t[2] * Math.abs(num(m.amount)) * (m.type === "diff" && num(m.amount) < 0 ? -1 : 1)), doc: "", move: m.type }); });
  ev.sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.ord - b.ord);
  const openDate = cs.openingDate || (ev[0] && ev[0].date) || today();
  let bal = r2(cs.openingDate ? num(cs.opening) : cashFloat());
  const rows = [], float = cashFloat(), skim = pid === cashProfile() ? cs.skim : "none";
  const days = uniq(ev.map(e => e.date)).sort();
  for (const day of days) {
    if (day < openDate) { ev.filter(e => e.date === day).forEach(e => bal = r2(bal + e.amount)); continue; }
    const start = bal;
    ev.filter(e => e.date === day).forEach(e => { bal = r2(bal + e.amount); rows.push({ ...e, bal }); });
    const hasIncome = ev.some(e => e.date === day && e.src === "cashdays"), manual = ev.some(e => e.date === day && (e.move === "tobank" || e.move === "privout"));
    if (skim && skim !== "none" && hasIncome && !manual && bal > float + 0.004) {
      const amt = r2(bal - float); bal = float;
      rows.push({ date: day, ord: 4, src: "auto", id: "auto-" + day, text: skim === "private" ? "Privatentnahme (automat)" : "Geldtransit an Bank (automat)", amount: -amt, bal, move: skim === "private" ? "privout" : "tobank", auto: true });
    }
    rows.filter(r => r.date === day).forEach(r => r.start = start);
  }
  const f = rows.filter(r => (!from || r.date >= from) && (!to || r.date <= to));
  const before = rows.filter(r => from && r.date < from);
  const startBal = before.length ? before[before.length - 1].bal : (f.length ? r2(f[0].bal - f[0].amount) : bal);
  return { rows: f, start: startBal, end: f.length ? f[f.length - 1].bal : startBal, negative: f.filter(r => r.bal < -0.004) };
}

/* ---------------- registrul (jurnal) – principiul încasării (Ist) ---------------- */
function proportional(total, parts, key = "gross") {
  const tot = parts.reduce((s, p) => s + p[key], 0); let rest = r2(total);
  return parts.map((p, i) => { const v = i === parts.length - 1 ? rest : (tot ? r2(total * p[key] / tot) : 0); rest = r2(rest - v); return { ...p, part: v }; });
}
const netOf = (gross, rate) => r2(gross / (1 + rate / 100));
/** Toate mișcările cu efect în contabilitate. mode: "ist" (la plată) sau "soll" (la data documentului) */
export function journal({ pid = "", from = "", to = "", mode = "ist" } = {}) {
  const rows = [], push = r => { if ((!pid || r.pid === pid) && (!from || r.date >= from) && (!to || r.date <= to)) rows.push(r); };
  list("invoices").forEach(inv => {
    if (inv.status === "draft" || inv.status === "cancelled") return;
    const c = calcInvoice(inv), parts = c.vats.map(v => ({ rate: v.rate, gross: r2(v.base + v.tax) })), P = pidOf(inv);
    const base = { pid: P, src: "invoices", id: inv.id, doc: inv.no, party: inv.to?.name || "", type: "in", cat: "sales", contactId: inv.contactId || "", small: !!inv.small, docDate: inv.date };
    if (mode === "soll") proportional(c.gross, parts).forEach(p => push({ ...base, date: inv.date, rate: p.rate, gross: p.part, net: netOf(p.part, p.rate), vat: r2(p.part - netOf(p.part, p.rate)), method: "open", text: `Rechnung ${inv.no}` }));
    else (inv.payments || []).forEach(pm => proportional(num(pm.amount), parts).forEach(p => push({ ...base, date: pm.date, rate: p.rate, gross: p.part, net: netOf(p.part, p.rate), vat: r2(p.part - netOf(p.part, p.rate)), method: pm.method || "bank", text: `Rechnung ${inv.no}` })));
  });
  list("purchases").forEach(p => {
    const c = calcPurchase(p), P = pidOf(p);
    const base = { pid: P, src: "purchases", id: p.id, doc: p.docNo || "", party: p.supplier || "", type: "out", cat: p.cat || "other", contactId: p.contactId || "", docDate: p.date, foreign: P === "de" && p.foreignVat };
    if (mode === "soll") proportional(c.gross, c.splits).forEach(s => push({ ...base, date: p.date, rate: s.rate, gross: s.part, net: netOf(s.part, s.rate), vat: r2(s.part - netOf(s.part, s.rate)), method: "open", text: p.text || (CATS[p.cat]?.de || "") }));
    else (p.payments || []).forEach(pm => proportional(num(pm.amount), c.splits).forEach(s => push({ ...base, date: pm.date, rate: s.rate, gross: s.part, net: netOf(s.part, s.rate), vat: r2(s.part - netOf(s.part, s.rate)), method: pm.method || "bank", text: p.text || (CATS[p.cat]?.de || "") })));
  });
  list("incomes").forEach(e => { const g = r2(num(e.gross)), rate = num(e.rate);
    push({ pid: pidOf(e), src: "incomes", id: e.id, doc: e.docNo || "", party: e.party || "", type: "in", cat: e.cat || "otherin", date: e.date, rate, gross: g, net: netOf(g, rate), vat: r2(g - netOf(g, rate)), method: e.method || "bank", text: e.text || "" }); });
  list("cashdays").forEach(d => {
    const { est, parts } = daySplit(d), t = dayTotal(d); if (!t) return;
    const pays = [["cash", r2(num(d.cash) + num(d.other))], ["card", r2(num(d.card))]].filter(x => x[1]);
    pays.forEach(([method, amt]) => proportional(amt, parts).forEach(p => p.part && push({ pid: pidOf(d), src: "cashdays", id: d.id, doc: d.zNo ? "Z" + d.zNo : "", party: d.place || "", type: "in", cat: "direct",
      date: d.date, rate: p.rate, gross: p.part, net: netOf(p.part, p.rate), vat: r2(p.part - netOf(p.part, p.rate)), method, est, text: `Tageslosung ${d.place || ""}`.trim() })));
  });
  return rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

/** Rezumat pe perioadă: venituri / cheltuieli nete, TVA încasată / plătită, pe categorii */
export function summary(opts) {
  const rows = journal(opts), sum = (t, f) => r2(rows.filter(r => r.type === t).reduce((s, r) => s + r[f], 0));
  const cats = {}; rows.forEach(r => { const k = r.type + ":" + r.cat; cats[k] = r2((cats[k] || 0) + r.net); });
  return { rows, inNet: sum("in", "net"), outNet: sum("out", "net"), inVat: sum("in", "vat"), outVat: sum("out", "vat"), inGross: sum("in", "gross"), outGross: sum("out", "gross"), cats, result: r2(sum("in", "net") - sum("out", "net")) };
}

/* ---------------- TVA: UStVA (DE) / UVA (AT) ---------------- */
export function vatReport(pid, from, to) {
  const P = prof(pid), mode = P.vatMode === "soll" ? "soll" : "ist";
  const rows = journal({ pid, from, to, mode: mode === "soll" ? "soll" : "ist" });
  const out = {}, inp = {}; let foreign = 0;
  rows.forEach(r => {
    if (r.type === "in") { const o = out[r.rate] ||= { base: 0, tax: 0 }; o.base = r2(o.base + r.net); o.tax = r2(o.tax + r.vat); }
    else if (r.foreign) foreign = r2(foreign + r.vat);
    else { const o = inp[r.rate] ||= { base: 0, tax: 0 }; o.base = r2(o.base + r.net); o.tax = r2(o.tax + r.vat); }
  });
  const outTax = r2(Object.values(out).reduce((s, x) => s + x.tax, 0)), inTax = r2(Object.values(inp).reduce((s, x) => s + x.tax, 0));
  const kz = [];
  const base = rt => r2((out[rt] || {}).base || 0), tax = rt => r2((out[rt] || {}).tax || 0);
  if (P.small) {
    kz.push(["", "Kleinunternehmer – nu se declară TVA", ""]);
  } else if (pid === "de") {
    kz.push(["81", "Umsätze 19 % (Bemessungsgrundlage)", base(19)], ["", "Steuer 19 %", tax(19)], ["86", "Umsätze 7 % (Bemessungsgrundlage)", base(7)], ["", "Steuer 7 %", tax(7)]);
    const other = Object.keys(out).map(Number).filter(r => ![19, 7, 0].includes(r));
    if (other.length) kz.push(["35", "Umsätze zu anderen Steuersätzen", r2(other.reduce((s, r) => s + base(r), 0))], ["36", "Steuer darauf", r2(other.reduce((s, r) => s + tax(r), 0))]);
    if (base(0)) kz.push(["", "Steuerfreie / nicht steuerbare Umsätze (verifică încadrarea)", base(0)]);
    kz.push(["66", "Vorsteuerbeträge", inTax], ["83", "Verbleibende Umsatzsteuer-Vorauszahlung", r2(outTax - inTax)]);
  } else {
    const all = r2(Object.values(out).reduce((s, x) => s + x.base, 0));
    kz.push(["000", "Gesamtbetrag der Lieferungen und Leistungen", all], ["022", "Normalsteuersatz 20 %", base(20)], ["", "Steuer 20 %", tax(20)], ["029", "ermäßigter Steuersatz 10 %", base(10)], ["", "Steuer 10 %", tax(10)],
      ["006", "ermäßigter Steuersatz 13 %", base(13)], ["", "Steuer 13 %", tax(13)]);
    const other = Object.keys(out).map(Number).filter(r => ![20, 10, 13, 0].includes(r));
    if (other.length) kz.push(["", "Alte cote: " + other.join(", ") + " % (verifică)", r2(other.reduce((s, r) => s + tax(r), 0))]);
    kz.push(["060", "Gesamtbetrag der Vorsteuern", inTax], ["095", "Zahllast (+) / Gutschrift (−)", r2(outTax - inTax)]);
  }
  return { out, inp, outTax, inTax, due: r2(outTax - inTax), kz, mode, foreign, est: rows.some(r => r.est) };
}

/* ---------------- produse și stoc ---------------- */
export const productByName = n => { n = norm(n); return n ? list("products").find(p => norm(p.name) === n) : null; };
const gradeLess = k => k.replace(/(\s+(kl|klasse))?\s+(i{1,3}|1|2|3)$/, "").trim();
const prodKeys = p => [p.name, ...(p.alias || [])].map(matchKey).filter(Boolean);
export function productMatch(n) {
  const ex = productByName(n); if (ex) return ex;
  const k = matchKey(n); if (!k) return null;
  const all = list("products"), one = arr => arr.length === 1 ? arr[0] : null;
  let r = one(all.filter(p => prodKeys(p).includes(k))); if (r) return r;
  const g = gradeLess(k), cmp = x => x === k ? 0 : (g === k || gradeLess(x) === x) ? editDist(gradeLess(x), g) : gradeLess(x) === g ? 9 : editDist(x, k);
  r = one(all.filter(p => prodKeys(p).some(x => cmp(x) === 0))); if (r) return r;
  if (g.length < 5) return null;
  let best = null, bd = 9, tie = false;
  for (const p of all) { const d = Math.min(...prodKeys(p).map(cmp)); if (d < bd) { bd = d; best = p; tie = false; } else if (d === bd && best !== p) tie = true; }
  return !tie && bd <= (g.length >= 10 ? 2 : 1) ? best : null;
}
const pidKey = it => it.productId || (productMatch(it.name || it.desc)?.id) || "";
/** Mișcările de stoc ale unui produs (intrări +, ieșiri −) */
export function stockMoves(productId, upTo = "9999") {
  const mv = [];
  list("purchases").forEach(p => (p.items || []).forEach(it => { if (pidKey(it) === productId && p.date <= upTo) mv.push({ date: p.date, qty: num(it.qty), what: "Intrare " + (p.supplier || ""), src: "purchases", id: p.id, price: num(it.price) }); }));
  list("cashdays").forEach(d => (d.items || []).forEach(it => { if (pidKey(it) === productId && d.date <= upTo) mv.push({ date: d.date, qty: -num(it.qty), what: "Vânzare casă " + (d.place || ""), src: "cashdays", id: d.id }); }));
  list("invoices").forEach(i => { if (i.status === "draft" || i.status === "cancelled") return; (i.items || []).forEach(it => { if (!it.lsId && pidKey(it) === productId && (it.date || i.date) <= upTo) mv.push({ date: it.date || i.date, qty: -num(it.qty), what: "Factură " + i.no, src: "invoices", id: i.id }); }); });
  list("notes").forEach(l => (l.items || []).forEach(it => { if (pidKey(it) === productId && l.date <= upTo) mv.push({ date: l.date, qty: -num(it.qty), what: "Lieferschein " + l.no, src: "notes", id: l.id }); }));
  list("stockmoves").forEach(m => { if (m.productId === productId && m.date <= upTo) mv.push({ date: m.date, qty: num(m.qty), what: m.text || m.reason, src: "stockmoves", id: m.id }); });
  return mv.sort((a, b) => a.date.localeCompare(b.date));
}
export function stockOf(productId, upTo = "9999") {
  const inv = list("inventories").filter(x => x.date <= upTo).sort(by(x => x.date, -1))[0];
  let q = 0, since = "";
  if (inv && inv.counts && productId in inv.counts) { q = num(inv.counts[productId]); since = inv.date; }
  else if (inv) { q = 0; since = inv.date; }
  stockMoves(productId, upTo).forEach(m => { if (!since || m.date > since) q += m.qty; });
  return r3(q);
}
export function lastPrice(productId) {
  const l = stockMoves(productId).filter(m => m.price); return l.length ? l[l.length - 1].price : num(S.products[productId]?.cost);
}

/* ---------------- închiderea lunii (GoBD) ---------------- */
export const isLocked = (pid, date) => !!(date && S.closings[cmId(pid, ym(date))]);
export const lockedMonths = pid => list("closings").filter(c => c.pid === pid).map(c => c.month).sort();

export { lastDay, addDays, r2 };
