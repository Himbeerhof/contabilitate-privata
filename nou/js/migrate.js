// Mutarea datelor din aplicația veche (app.sidor-digital.de) – direct din browser (același site) sau dintr-un backup „facturare”
import { S, list, PIDS, DEFAULT_SETTINGS, mergeSettings } from "./state.js";
import { Store } from "./store.js";
import { calcInvoice, productMatch, cmId } from "./model.js";
import { num, r2, newId, norm, today } from "./util.js";
import { sheet, toast, confirmBox, busy, pickFiles } from "./ui.js";

const COUNTRY = { deutschland: "DE", germany: "DE", germania: "DE", "österreich": "AT", oesterreich: "AT", austria: "AT", schweiz: "CH", italien: "IT", italia: "IT", frankreich: "FR", "rumänien": "RO", romania: "RO" };
/** „Stradă 1\n88099 Neukirch\nDeutschland” → câmpuri */
export function splitAddress(a) {
  const lines = String(a || "").split(/\n|,(?=\s*\d{4,5}\s)/).map(s => s.trim()).filter(Boolean), o = { street: "", zip: "", city: "", country: "", name2: "" };
  let zi = lines.findIndex(l => /^(?:[A-Z]{1,2}[- ])?\d{4,5}\s+\S/.test(l));
  if (zi >= 0) { const m = /^(?:([A-Z]{1,2})[- ])?(\d{4,5})\s+(.+)$/.exec(lines[zi]); o.zip = m[2]; o.city = m[3]; if (m[1]) o.country = m[1] === "A" ? "AT" : m[1] === "D" ? "DE" : m[1]; o.street = lines[zi - 1] || ""; if (zi >= 2) o.name2 = lines.slice(0, zi - 1).join(", "); const c = lines[zi + 1]; if (c && COUNTRY[norm(c)]) o.country = COUNTRY[norm(c)]; }
  else { o.street = lines[0] || ""; o.city = lines[1] || ""; }
  return o;
}
const rates = s => [...new Set(String(s || "").split(/[;\s]+/).map(x => x.trim()).filter(Boolean).map(num))];

/** Transformă datele vechi în cele noi. old = { settings, customers:{}, invoices:{} ... } */
export function convert(old) {
  const os = old.settings || {}, out = { settings: null, contacts: {}, products: {}, invoices: {}, notes: {}, purchases: {}, incomes: {}, cashdays: {}, cashmonths: {}, cashmoves: {}, stockmoves: {} }, warn = [];
  const st = mergeSettings({});
  st.company = { ...st.company, name: os.name || "", owner: os.owner || "", street: os.street || "", zip: os.zip || "", city: os.city || "", country: COUNTRY[norm(os.country)] || "DE", phone: os.phone || "", email: os.email || "", web: os.web || "", logo: os.logo || "" };
  st.bank = { holder: os.holder || "", iban: (os.iban || "").replace(/\s/g, ""), bic: os.bic || "", bank: os.bank || "" };
  st.defaultProfile = PIDS.includes(os.defaultProfile) ? os.defaultProfile : "de";
  const oldProf = id => { const legacy = {}; if (id === "de" && !os.profiles) ["taxNo", "vatId", "kleinunternehmer", "vatRates", "defaultVat", "prefix", "reStart", "lsPrefix", "lsStart"].forEach(k => { if (os[k] !== undefined && os[k] !== "") legacy[k] = os[k]; }); return { ...legacy, ...((os.profiles || {})[id] || {}) }; };
  PIDS.forEach(id => { const p = oldProf(id), d = st.profiles[id];
    st.profiles[id] = { ...d, taxNo: p.taxNo || "", vatId: p.vatId || "", small: !!p.kleinunternehmer, rates: p.vatRates ? rates(p.vatRates) : d.rates, defRate: p.defaultVat !== undefined && p.defaultVat !== "" ? num(p.defaultVat) : d.defRate,
      invPrefix: p.prefix ?? d.invPrefix, invStart: +p.reStart || 1, lsPrefix: p.lsPrefix ?? d.lsPrefix, lsStart: +p.lsStart || 1, payDays: os.payDays ?? d.payDays }; });
  st.invoice = { ...st.invoice, lsPrices: os.lsPrices !== false };
  st.cash = { ...st.cash, float: os.cashFloat === undefined ? 362.9 : num(os.cashFloat), weekPlaces: { ...st.cash.weekPlaces, ...(os.weekPlaces || {}) }, bzMarkets: os.bzMarkets || {} };
  const L = k => Object.values(old[k] || {});
  if (L("deposits").length) st.cash.skim = "none";
  out.settings = st;

  // clienți
  L("customers").forEach(c => { const a = splitAddress(c.address);
    out.contacts[c.id] = { id: c.id, role: "c", pid: PIDS.includes(c.profileId) ? c.profileId : "de", no: c.number || "", name: c.name || "", ...a, email: c.email || "", phone: c.phone || "", vatId: c.vatId || "", leitweg: c.buyerRef || "", note: c.note || "", migrated: true }; });
  // produse
  L("products").forEach(p => { out.products[p.id] = { id: p.id, name: p.name || "", unit: p.unit || "kg", price: p.price !== undefined && p.price !== "" ? num(p.price) : "", vat: p.vat !== undefined && p.vat !== "" ? num(p.vat) : "", plu: p.plu || "", alias: Array.isArray(p.alias) ? p.alias : String(p.alias || "").split(";").map(s => s.trim()).filter(Boolean), own: !!p.own, track: p.own ? false : true, cost: p.cost ? num(p.cost) : "", migrated: true }; });
  L("moves").filter(m => m.type === "in" && m.kind === "prod").forEach(m => (m.items || []).forEach(it => { const p = Object.values(out.products).find(x => norm(x.name) === norm(it.name)); if (p) { p.own = true; p.track = false; } }));
  const pmatch = n => { const k = norm(n); return Object.values(out.products).find(p => norm(p.name) === k || (p.alias || []).some(a => norm(a) === k)); };
  const item = it => { const p = pmatch(it.desc || it.name); return { date: it.date || "", ls: it.ls || "", lsId: it.lsId || "", name: it.desc || it.name || "", productId: p?.id || "", hkl: it.hkl || "", qty: num(it.qty), unit: it.unit || "kg", price: num(it.price), vat: it.vat === "" || it.vat === undefined ? "" : num(it.vat) }; };
  // facturi
  L("invoices").forEach(i => { const a = splitAddress(i.customer?.address), pid = PIDS.includes(i.profileId) ? i.profileId : "de";
    const inv = { id: i.id, pid, type: "invoice", status: i.status === "cancelled" ? "cancelled" : "final", no: i.number || "", date: i.date || "", due: i.dueDate || "", serviceFrom: i.serviceDate || "", serviceTo: "",
      contactId: i.customerId || "", to: { name: i.customer?.name || "", ...a, no: i.customer?.number || "", vatId: i.customer?.vatId || "", email: i.customer?.email || "", leitweg: i.customer?.buyerRef || "" },
      items: (i.items || []).map(item), payments: [], small: !!i.kleinunternehmer, intro: i.intro || "", note: i.notes || "", createdAt: i.createdAt || Date.now(), finalAt: i.createdAt || Date.now(), migrated: true };
    if (i.status === "paid") inv.payments = [{ id: newId(), date: i.paidDate || i.date, amount: calcInvoice(inv).gross, method: "bank" }];
    out.invoices[i.id] = inv; });
  // Lieferscheine
  const lsInv = {}; Object.values(out.invoices).forEach(i => i.items.forEach(it => { if (it.lsId) lsInv[it.lsId] = i.id; }));
  L("notes").forEach(n => { const a = splitAddress(n.customer?.address);
    out.notes[n.id] = { id: n.id, pid: PIDS.includes(n.profileId) ? n.profileId : "de", no: n.number || "", date: n.date || "", contactId: n.customerId || "", to: { name: n.customer?.name || "", ...a, no: n.customer?.number || "" },
      items: (n.items || []).map(item).map(x => ({ ...x, vat: n.vat !== undefined && n.vat !== "" ? num(n.vat) : x.vat })), note: n.note || "", invoiceId: lsInv[n.id] || n.invoiceId || "", migrated: true }; });
  // cheltuieli (entries) + intrări de marfă (moves)
  const usedEntries = new Set();
  L("moves").forEach(m => {
    if (m.type === "in" && m.kind !== "prod") {
      const en = m.entryId && old.entries?.[m.entryId]; if (en) usedEntries.add(en.id);
      const bk = m.bk || {}, pid = PIDS.includes(bk.pid) ? bk.pid : en && PIDS.includes(en.profileId) ? en.profileId : "de";
      const gross = num(m.gross) || num(en?.gross) || r2((m.items || []).reduce((s, it) => s + num(it.qty) * num(it.price), 0) * (1 + num(bk.vat ?? en?.vat ?? 7) / 100));
      const rate = num(bk.vat ?? en?.vat ?? (pid === "at" ? 10 : 7)), paidOk = m.paid !== false;
      out.purchases[m.id] = { id: m.id, pid, supplier: m.party || "", contactId: "", docNo: m.docNo || "", date: m.date || "", due: m.dueDate || "", cat: "goods", splits: [{ rate, gross: r2(gross) }],
        items: (m.items || []).map(it => ({ name: it.name || "", productId: pmatch(it.name)?.id || "", qty: num(it.qty), unit: it.unit || "kg", price: num(it.price) })),
        payments: paidOk ? [{ id: newId(), date: m.paidDate || en?.date || m.date, amount: r2(gross), method: m.pay || en?.pay || "bank" }] : [], fileIds: [], iban: m.iban || "", text: m.note || "", noFile: true, migrated: true };
      if (bk.on === false && !en) out.purchases[m.id].payments = paidOk ? out.purchases[m.id].payments : [];
    } else if (m.type === "in" && m.kind === "prod") {
      (m.items || []).forEach((it, k) => { const p = pmatch(it.name); if (p && p.track !== false) out.stockmoves[m.id + "-" + k] = { id: m.id + "-" + k, productId: p.id, date: m.date, qty: num(it.qty), reason: "own", text: "Producție proprie", migrated: true }; });
    } else if (m.type === "out") {
      if (m.cashId) return; // se leagă la ziua de casă mai jos
      (m.items || []).forEach((it, k) => { const p = pmatch(it.name); if (p) out.stockmoves[m.id + "-" + k] = { id: m.id + "-" + k, productId: p.id, date: m.date, qty: -num(it.qty), reason: m.kind === "sale" ? "other" : m.kind || "other", text: ({ sale: "Vânzare", own: "Consum propriu", loss: "Pierdere", other: "Ieșire" })[m.kind] || "Ieșire", migrated: true }; });
    }
  });
  L("entries").forEach(e => {
    if (usedEntries.has(e.id)) return;
    const pid = PIDS.includes(e.profileId) ? e.profileId : "de", g = r2(num(e.gross)), rate = num(e.vat);
    if (e.type === "out") out.purchases[e.id] = { id: e.id, pid, supplier: e.party || e.desc || "", contactId: "", docNo: e.docNo || "", date: e.date || "", due: e.dueDate || "", cat: e.cat || "other", splits: [{ rate, gross: g }], items: [],
      payments: e.paid === false ? [] : [{ id: newId(), date: e.date, amount: g, method: e.pay || "bank" }], fileIds: [], iban: e.iban || "", text: e.desc || e.note || "", noFile: true, migrated: true };
    else out.incomes[e.id] = { id: e.id, pid, date: e.date || "", cat: ["subs", "otherin", "direct"].includes(e.cat) ? e.cat : "otherin", text: e.desc || "", gross: g, rate, method: e.pay || "bank", party: e.party || "", docNo: e.docNo || "", fileIds: [], migrated: true };
  });
  // furnizori din cheltuieli
  Object.values(out.purchases).forEach(p => { if (!p.supplier) return; let c = Object.values(out.contacts).find(x => norm(x.name) === norm(p.supplier));
    if (!c) { c = { id: newId(), role: "s", pid: p.pid, name: p.supplier, iban: p.iban || "", migrated: true }; out.contacts[c.id] = c; } else if (c.role === "c") c.role = "cs"; p.contactId = c.id; });
  // casa
  const zItems = {}; L("moves").forEach(m => { if (m.type === "out" && m.cashId) zItems[m.cashId] = { items: m.items || [], zNo: (m.docNo || "").replace(/^Z\s*/, ""), gross: r2((m.items || []).reduce((s, it) => s + num(it.qty) * num(it.price), 0)) }; });
  L("cash").forEach(c => { const z = zItems[c.id];
    out.cashdays[c.id] = { id: c.id, pid: PIDS.includes(c.profileId) ? c.profileId : "at", date: c.date || "", place: c.place || "", cash: r2(num(c.cash)), card: r2(num(c.card)), other: r2(num(c.other)), counted: c.counted !== undefined && c.counted !== "" ? r2(num(c.counted)) : "",
      zGross: c.bz?.gross || "", zNo: z?.zNo || "", items: (z?.items || []).map(it => ({ name: it.name, productId: pmatch(it.name)?.id || "", qty: num(it.qty), unit: it.unit || "kg", price: num(it.price) })), fileIds: [], note: c.note || "", bz: c.bz || undefined, migrated: true }; });
  L("cashmonths").forEach(m => { const pid = PIDS.includes(m.pid) ? m.pid : "at", split = {}; Object.entries(m.split || {}).forEach(([r, g]) => { if (num(g)) split[num(r)] = r2(num(g)); });
    out.cashmonths[cmId(pid, m.month)] = { id: cmId(pid, m.month), pid, month: m.month, split, note: m.note || "", migrated: true }; });
  L("deposits").forEach(d => { out.cashmoves[d.id] = { id: d.id, pid: "at", date: d.date, type: "tobank", amount: r2(num(d.amount)), text: [d.bank, d.note].filter(Boolean).join(" · "), migrated: true }; });
  return { data: out, warn };
}

/** Citește datele aplicației vechi din acest browser (doar pe app.sidor-digital.de) */
export async function readOldLocal() {
  if (!window.CP) return null;
  try {
    const dbs = indexedDB.databases ? await indexedDB.databases() : [{ name: "contabilitate-privata" }];
    if (!dbs.some(d => d.name === "contabilitate-privata")) return null;
    const local = new window.CP.IdbLocal("contabilitate-privata"), all = await local.allDocs();
    if (!all || !Object.keys(all).length) return null;
    return { settings: (all.settings || {}).main || {}, ...Object.fromEntries(Object.entries(all).filter(([k]) => k !== "settings")) };
  } catch (e) { console.warn(e); return null; }
}
export function fromBackupFile(d) {
  if (!d || d.app !== "facturare") throw new Error("Fișierul nu e un backup al aplicației vechi („facturare-backup-….json”).");
  const o = { settings: d.settings || {} };
  ["customers", "invoices", "notes", "entries", "products", "moves", "cash", "cashmonths", "deposits"].forEach(k => { o[k] = Object.fromEntries((d[k] || []).filter(x => x && x.id).map(x => [x.id, x])); });
  return o;
}
const count = d => ({ contacts: Object.keys(d.contacts).length, invoices: Object.keys(d.invoices).length, notes: Object.keys(d.notes).length, purchases: Object.keys(d.purchases).length, cashdays: Object.keys(d.cashdays).length, products: Object.keys(d.products).length });

export async function runMigration(old, { keepSettings = false } = {}) {
  const { data } = convert(old);
  if (!keepSettings || !S.settings.company.name) await Store.put("settings", { ...data.settings, migratedAt: Date.now() });
  for (const k of Object.keys(data)) if (k !== "settings") { const arr = Object.values(data[k]).filter(o => !S[k][o.id]); if (arr.length) await Store.putMany(k, arr); }
  localStorage.setItem("cp3_migrated", String(Date.now()));
  return count(data);
}

export async function offerMigration(force = false) {
  const old = await readOldLocal();
  const o = sheet(`<h3>Bine ai venit în aplicația nouă</h3>
    ${old ? `<p>Am găsit în acest browser datele din aplicația veche (<b>${Object.keys(old.invoices || {}).length}</b> facturi, <b>${Object.keys(old.customers || {}).length}</b> clienți, <b>${Object.keys(old.cash || {}).length}</b> zile de casă, <b>${Object.keys(old.moves || {}).length + Object.keys(old.entries || {}).length}</b> intrări și cheltuieli).</p>
      <p class="hint">Le copiez aici. Aplicația veche rămâne neschimbată și poți lucra în continuare în ea.</p>`
      : `<p>Dacă ai folosit aplicația veche pe alt dispozitiv, fă acolo „Backup” și încarcă aici fișierul <b>facturare-backup-….json</b>. Altfel pornești de la zero.</p>`}
    <div class="foot"><button class="btn" data-close>${force ? "Închide" : "Încep de la zero"}</button><button class="btn" id="mg-file">Din fișier backup</button>${old ? `<button class="btn primary" id="mg-go">Copiază datele</button>` : ""}</div>`);
  const done = c => { o.close(); toast(`Copiat: ${c.invoices} facturi, ${c.contacts} contacte, ${c.purchases} cheltuieli, ${c.cashdays} zile de casă, ${c.products} produse`, 6000); };
  o.q("#mg-go") && (o.q("#mg-go").onclick = e => busy(e.currentTarget, async () => { try { done(await runMigration(old, { keepSettings: force })); } catch (er) { console.error(er); toast("Eroare: " + er.message, 6000); } }));
  o.q("#mg-file").onclick = async () => { const [f] = await pickFiles({ accept: ".json,application/json", multiple: false }); if (!f) return;
    try { const d = fromBackupFile(JSON.parse(await f.text())); done(await runMigration(d, { keepSettings: force })); } catch (er) { toast(er.message, 6000); } };
}
