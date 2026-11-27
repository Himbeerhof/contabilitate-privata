// Utilitare comune (fără DOM, se pot testa în Node)

export const r2 = n => { n = Number(n) || 0; const s = n < 0 ? -1 : 1; return s * Math.round(Math.abs(n) * 100 + 1e-7) / 100 || 0; };
export const r3 = n => Math.round((Number(n) || 0) * 1000) / 1000;
export const r4 = n => Math.round((Number(n) || 0) * 10000) / 10000;
export const sum = (arr, f = x => x) => r2(arr.reduce((s, x) => s + (Number(f(x)) || 0), 0));

/** Citește numere scrise „ca la noi”: 1.234,56 · 1234,56 · 1234.56 · 12,5 kg */
export function num(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v ?? "").trim().replace(/\s|€|eur/gi, "");
  if (!s) return 0;
  const neg = /^-|^−/.test(s); s = s.replace(/^[-−+]/, "");
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  return isFinite(n) ? (neg ? -n : n) : 0;
}
export const has = v => v !== undefined && v !== null && String(v).trim() !== "";

const nf2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n, cur = "€") => nf2.format(r2(n)) + (cur ? " " + cur : "");
export const dec2 = n => nf2.format(r2(n));
export const numStr = (n, max = 3) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: max }).format(Number(n) || 0);
export const pct = r => numStr(r, 2) + " %";

export const pad = (n, l = 2) => String(n).padStart(l, "0");
export const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => localISO();
export const ym = d => String(d || "").slice(0, 7);
export const year = d => String(d || "").slice(0, 4);
export function fmtDate(iso) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; }
export function addDays(iso, n) { const d = new Date((iso || today()) + "T12:00:00"); d.setDate(d.getDate() + (Number(n) || 0)); return localISO(d); }
export function lastDay(ymStr) { const [y, m] = ymStr.split("-").map(Number); return localISO(new Date(y, m, 0, 12)); }
export const weekday = iso => new Date(iso + "T12:00:00").getDay();
export const MONTHS = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
export const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const MONTHS_AT = ["Jänner", ...MONTHS_DE.slice(1)];
export const WD = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];
export const monthLabel = s => { const [y, m] = String(s).split("-"); return m ? `${MONTHS[+m - 1]} ${y}` : s; };
/** Data din „12.03.2026”, „12.3.26”, „2026-03-12” */
export function parseDate(s) {
  s = String(s || "").trim(); let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/.exec(s))) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  return "";
}

let _idc = 0;
export const newId = () => Date.now().toString(36) + (++_idc).toString(36) + Math.random().toString(36).slice(2, 7);
export const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const norm = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
export const matchKey = s => norm(s).replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export function editDist(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9; let prev = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length];
}
export const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m; }, {});
export const uniq = arr => [...new Set(arr)];
export const by = (f, dir = 1) => (a, b) => { const x = f(a), y = f(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; };

export function ibanOk(iban) {
  const v = String(iban || "").replace(/\s+/g, "").toUpperCase(); if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  const r = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55)); let m = 0;
  for (const ch of r) m = (m * 10 + +ch) % 97; return m === 1;
}
export const fmtIban = v => String(v || "").replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
export const fmtSize = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB";

export function b64enc(u8) { let s = ""; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode(...u8.subarray(i, i + 32768)); return btoa(s); }
export const b64dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const b64url = u8 => b64enc(u8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const utf8 = s => new TextEncoder().encode(s);

/** Text în Windows-1252 (cum cere DATEV) */
export function cp1252(s) {
  const map = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "–": 0x96, "—": 0x97, "Š": 0x8A, "š": 0x9A, "Ž": 0x8E, "ž": 0x9E };
  const out = [];
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) out.push(c);
    else if (map[ch]) out.push(map[ch]);
    else { const b = ch.normalize("NFD")[0].codePointAt(0); out.push(b < 0x80 ? b : 0x3F); }
  }
  return new Uint8Array(out);
}
export const csvCell = (v, sep = ";") => { const s = String(v ?? ""); return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s; };
