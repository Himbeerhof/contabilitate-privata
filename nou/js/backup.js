// Backup: fișier JSON complet (cu poze) + backup automat într-un dosar ales (ex. Synology Drive pe PC)
import { S } from "./state.js";
import { Store } from "./store.js";
import { today } from "./util.js";
import { saveFile, toast } from "./ui.js";

const HDB = "cp-nou-handles";
function hdb(mode, fn) {
  return new Promise((res, rej) => { const r = indexedDB.open(HDB, 1); r.onupgradeneeded = () => r.result.createObjectStore("h"); r.onerror = () => rej(r.error);
    r.onsuccess = () => { const t = r.result.transaction("h", mode), q = fn(t.objectStore("h")); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }; });
}
export const folderSupported = () => typeof window.showDirectoryPicker === "function";
export const getFolder = () => hdb("readonly", s => s.get("dir")).catch(() => null);
export async function chooseFolder() {
  const h = await window.showDirectoryPicker({ id: "cp-backup", mode: "readwrite" });
  await hdb("readwrite", s => s.put(h, "dir")); return h;
}
export async function forgetFolder() { await hdb("readwrite", s => s.delete("dir")); }

export async function backupBlob(withFiles = true) {
  const data = await Store.exportAll(withFiles);
  return new Blob([JSON.stringify(data)], { type: "application/json" });
}
export async function downloadBackup() {
  const b = await backupBlob(true); saveFile(`Contabilitate_backup_${today()}.json`, b);
  localStorage.setItem("cp3_lastbackup", String(Date.now()));
}
/** Scrie backup-ul în dosarul ales. interactive=true poate cere permisiunea din nou. */
export async function backupToFolder(interactive = false) {
  const h = await getFolder(); if (!h) return false;
  let p = await h.queryPermission({ mode: "readwrite" });
  if (p !== "granted" && interactive) p = await h.requestPermission({ mode: "readwrite" });
  if (p !== "granted") return "perm";
  const b = await backupBlob(true), f = await h.getFileHandle(`Contabilitate_backup_${today()}.json`, { create: true }), w = await f.createWritable();
  await w.write(b); await w.close();
  // păstrează doar ultimele 8
  try { const names = []; for await (const [n] of h.entries()) if (/^Contabilitate_backup_\d{4}-\d{2}-\d{2}\.json$/.test(n)) names.push(n); names.sort(); for (const n of names.slice(0, -8)) await h.removeEntry(n); } catch (e) {}
  localStorage.setItem("cp3_lastbackup", String(Date.now())); return true;
}
export async function autoBackup() {
  const every = (S.settings.backup?.every || 7) * 864e5, last = +localStorage.getItem("cp3_lastbackup") || 0;
  if (Date.now() - last < every) return;
  try { const r = await backupToFolder(false); if (r === true) toast("Backup automat făcut în dosarul ales"); } catch (e) { console.warn("backup", e); }
}
