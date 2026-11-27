// Starea aplicației: toate datele sunt aici, în memorie; store.js le salvează și le sincronizează.

export const KINDS = ["contacts", "products", "invoices", "notes", "purchases", "incomes", "cashdays", "cashmonths", "cashmoves", "stockmoves", "inventories", "files", "datevlog", "closings", "extradocs"];

export const DEFAULT_PROFILES = {
  de: { label: "Germania", country: "DE", taxNo: "", vatId: "", small: false, p24: false, rates: [7, 19, 0], defRate: 7, invPrefix: "RE", lsPrefix: "", invStart: 1, lsStart: 1, payDays: 14 },
  at: { label: "Austria", country: "AT", taxNo: "", vatId: "", small: false, p24: false, rates: [10, 13, 20, 0], defRate: 10, invPrefix: "RE-AT", lsPrefix: "AT", invStart: 1, lsStart: 1, payDays: 14 }
};
export const PIDS = ["de", "at"];

export const DEFAULT_SETTINGS = {
  company: { name: "", owner: "", street: "", zip: "", city: "", country: "DE", phone: "", email: "", web: "", logo: "" },
  bank: { holder: "", iban: "", bic: "", bank: "" },
  profiles: DEFAULT_PROFILES,
  defaultProfile: "de",
  invoice: { intro: "", footer: "", lsPrices: true, showHkl: true, lang: "de" },
  cash: { profile: "at", float: 362.9, skim: "bank", weekPlaces: { 2: "Bregenz", 5: "Bregenz", 3: "Dornbirn", 6: "Dornbirn" },
    markets: ["Dornbirn", "Bregenz", "Feldkirch", "Hard", "Götzis"], firms: [], bzMarkets: {}, openingDate: "", opening: 0 },
  datev: { skr: "03", accLen: 4, mode: "ist", berater: { de: "", at: "" }, mandant: { de: "", at: "" }, wjBegin: "01", acc: {},
    upload: { out: "", in: "", cash: "", other: "" }, auto: { out: false, in: false, cash: false }, sender: "", gmail: false },
  backup: { every: 7, last: 0 },
  startYear: ""
};

export const S = {
  settings: structuredClone(DEFAULT_SETTINGS),
  contacts: {}, products: {}, invoices: {}, notes: {}, purchases: {}, incomes: {}, cashdays: {}, cashmonths: {}, cashmoves: {},
  stockmoves: {}, inventories: {}, files: {}, datevlog: {}, closings: {}, extradocs: {}
};

/** Combină setările salvate cu valorile implicite (adânc, pe un nivel + profile) */
export function mergeSettings(saved = {}) {
  const d = structuredClone(DEFAULT_SETTINGS), out = { ...d, ...saved };
  for (const k of ["company", "bank", "invoice", "cash", "datev", "backup"]) out[k] = { ...d[k], ...(saved[k] || {}) };
  out.datev.upload = { ...d.datev.upload, ...((saved.datev || {}).upload || {}) };
  out.datev.auto = { ...d.datev.auto, ...((saved.datev || {}).auto || {}) };
  out.datev.berater = { ...d.datev.berater, ...((saved.datev || {}).berater || {}) };
  out.datev.mandant = { ...d.datev.mandant, ...((saved.datev || {}).mandant || {}) };
  out.profiles = {};
  for (const p of PIDS) out.profiles[p] = { ...d.profiles[p], ...((saved.profiles || {})[p] || {}) };
  return out;
}
export function resetState() {
  S.settings = structuredClone(DEFAULT_SETTINGS);
  for (const k of KINDS) S[k] = {};
}
export const prof = pid => ({ ...S.settings.profiles[PIDS.includes(pid) ? pid : "de"], id: PIDS.includes(pid) ? pid : "de" });
export const pidOf = d => (d && PIDS.includes(d.pid)) ? d.pid : "de";
export const defPid = () => PIDS.includes(S.settings.defaultProfile) ? S.settings.defaultProfile : "de";
export const list = kind => Object.values(S[kind] || {});
