// Trimiterea documentelor la DATEV Upload Mail.
// DATEV acceptă: PDF / TIFF, cel mult 10 documente pe e-mail, cel mult 20 MB pe e-mail.
// Calea 1: Gmail (contul Google al firmei) – trimite singur, inclusiv automat.
// Calea 2: aplicația de e-mail a telefonului (partajare) sau descărcare + adresa copiată.
import { utf8, b64enc } from "./util.js";
import { CLOUD_IDS } from "./store.js";

export const LIMIT = { files: 10, bytes: 19.5 * 1024 * 1024 };
const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const TK = "cp3_gmail";

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.onload = res; s.onerror = () => rej(new Error("Google nu se poate încărca (internet?)")); document.head.appendChild(s); });
}
const saved = () => { try { return JSON.parse(localStorage.getItem(TK) || "null") || {}; } catch (e) { return {}; } };
export const gmailAccount = () => saved().email || "";
export const gmailReady = () => { const t = saved(); return !!(t.token && Date.now() < t.exp - 60000); };

/** Cere acces de trimitere (o fereastră Google). interactive=false → doar dacă tokenul e încă valabil. */
export async function gmailToken(interactive = true) {
  const t = saved(); if (t.token && Date.now() < t.exp - 60000) return t.token;
  if (!interactive) { const e = new Error("Gmail cere reconectare"); e.relogin = true; throw e; }
  await loadGis();
  return new Promise((res, rej) => {
    window.google.accounts.oauth2.initTokenClient({
      client_id: CLOUD_IDS.google, scope: SCOPE, prompt: t.email ? "" : "consent", ...(t.email ? { login_hint: t.email, hint: t.email } : {}),
      callback: async r => {
        if (r.error) return rej(new Error(r.error_description || r.error));
        const o = { token: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000, email: t.email || "" };
        try { localStorage.setItem(TK, JSON.stringify(o)); } catch (e) {}
        res(o.token);
      },
      error_callback: e => rej(new Error(e.type === "popup_closed" ? "fereastra Google a fost închisă" : e.type || "anulat"))
    }).requestAccessToken();
  });
}
export function gmailForget() { try { localStorage.removeItem(TK); } catch (e) {} }
export function gmailSetEmail(email) { const t = saved(); t.email = email; try { localStorage.setItem(TK, JSON.stringify(t)); } catch (e) {} }

const enc = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64enc(utf8(s))}?=`;
const wrap = s => s.replace(/.{1,76}/g, "$&\r\n");
async function mime({ from, to, subject, text, files }) {
  const b = "cpb" + Math.random().toString(36).slice(2);
  let m = `${from ? `From: ${from}\r\n` : ""}To: ${to}\r\nSubject: ${enc(subject)}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${b}"\r\n\r\n`;
  m += `--${b}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64enc(utf8(text || "")))}`;
  for (const f of files) {
    const data = b64enc(new Uint8Array(await f.blob.arrayBuffer())), nm = f.name.replace(/"/g, "");
    m += `--${b}\r\nContent-Type: ${f.blob.type || "application/pdf"}; name="${enc(nm)}"\r\nContent-Disposition: attachment; filename="${enc(nm)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(data)}`;
  }
  return m + `--${b}--\r\n`;
}

/** Trimite un e-mail prin Gmail. Returnează id-ul mesajului. */
export async function gmailSend(msg, { interactive = true } = {}) {
  let token = await gmailToken(interactive);
  const body = await mime(msg);
  const go = tk => fetch("https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media", { method: "POST", headers: { Authorization: "Bearer " + tk, "Content-Type": "message/rfc822" }, body });
  let r = await go(token);
  if (r.status === 401 && interactive) { gmailForget(); token = await gmailToken(true); r = await go(token); }
  if (!r.ok) {
    let j = {}; try { j = await r.json(); } catch (e) {}
    const reason = j.error?.errors?.[0]?.reason || j.error?.status || "";
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason + JSON.stringify(j))) throw new Error("Gmail API nu e pornit în proiectul Google „Contabilitate privata”. Pornește-l o dată în Google Cloud Console → API-uri → Gmail API → Enable.");
    if (r.status === 403) throw new Error("Google nu a dat voie la trimitere (" + (j.error?.message || reason || 403) + ").");
    if (r.status === 401) { gmailForget(); const e = new Error("Gmail cere reconectare"); e.relogin = true; throw e; }
    throw new Error("Gmail: " + (j.error?.message || r.status));
  }
  const j = await r.json();
  if (!gmailAccount()) { try { const p = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: "Bearer " + token } }); if (p.ok) gmailSetEmail((await p.json()).emailAddress || ""); } catch (e) {} }
  return j.id;
}

/** Împarte fișierele în loturi după limitele DATEV */
export function batches(files) {
  const out = []; let cur = [], size = 0;
  for (const f of files) {
    if (f.blob.size > LIMIT.bytes) { out.push({ files: [f], tooBig: true }); continue; }
    if (cur.length >= LIMIT.files || size + f.blob.size > LIMIT.bytes) { out.push({ files: cur }); cur = []; size = 0; }
    cur.push(f); size += f.blob.size;
  }
  if (cur.length) out.push({ files: cur });
  return out;
}

/** Fără Gmail: partajare către aplicația de e-mail (telefon). Returnează true dacă s-a deschis. */
export async function shareFiles(files, title) {
  if (!navigator.canShare) return false;
  const fl = files.map(f => new File([f.blob], f.name, { type: f.blob.type || "application/pdf" }));
  if (!navigator.canShare({ files: fl })) return false;
  try { await navigator.share({ files: fl, title, text: title }); return true; } catch (e) { if (e.name === "AbortError") return "abort"; return false; }
}
