// Salvare locală (IndexedDB) + sincronizare criptată opțională prin Google Drive / OneDrive / NAS (WebDAV).
// Motorul de sincronizare e cel din ../cp-core.js (folosit deja de aplicația veche), dar cu fișiere proprii
// („n3-…”) în cloud, ca cele două aplicații să nu se amestece.
import { S, KINDS, mergeSettings } from "./state.js";
import { clone, b64enc, b64dec } from "./util.js";

const CLOUD_KEY = "cp3_cloud", DEV_KEY = "cp3_device", PREFIX = "n3-", DB = "cp-nou";
export const CLOUD_IDS = { google: "1064945498511-slp6ff0nqhaj44rrons0jkecj07t5oa8.apps.googleusercontent.com", microsoft: "" };

/** Adaptor care pune fișierele aplicației noi într-un „dosar” separat (prin prefix) */
class Prefixed {
  constructor(inner) { this.inner = inner; this.connect = inner.connect ? (...a) => inner.connect(...a) : null; this.forget = inner.forget ? () => inner.forget() : null; }
  async list() { return (await this.inner.list()).filter(f => f.name.startsWith(PREFIX)).map(f => ({ ...f, name: f.name.slice(PREFIX.length), _raw: f })); }
  get(f) { return this.inner.get(f._raw || f); }
  put(name, body) { return this.inner.put(PREFIX + name, body); }
  del(f) { return this.inner.del(f._raw || f); }
}

/* ---------- fișiere (poze, PDF) – IndexedDB separat ---------- */
const FileDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => { const r = indexedDB.open(DB + "-files", 1); r.onupgradeneeded = () => r.result.createObjectStore("blobs"); r.onsuccess = () => res(this.db = r.result); r.onerror = () => rej(r.error); });
  },
  async op(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction("blobs", mode), st = t.objectStore("blobs"), r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); },
  put(id, blob) { return this.op("readwrite", s => s.put(blob, id)); },
  get(id) { return this.op("readonly", s => s.get(id)); },
  del(id) { return this.op("readwrite", s => s.delete(id)); },
  keys() { return this.op("readonly", s => s.getAllKeys()); }
};

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = kinds => listeners.forEach(f => { try { f(kinds); } catch (e) { console.error(e); } });

export const Store = {
  engine: null, status: { state: "off" }, needRelogin: false, ready: false,
  device() { let d = ""; try { d = localStorage.getItem(DEV_KEY); } catch (e) {} if (!d) { d = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); try { localStorage.setItem(DEV_KEY, d); } catch (e) {} } return d; },
  cloudCfg() { try { return JSON.parse(localStorage.getItem(CLOUD_KEY) || "null") || { type: "none" }; } catch (e) { return { type: "none" }; } },
  async adapterFor(cfg) {
    const CP = window.CP; let a = null;
    if (cfg.type === "google") a = new CP.GoogleDriveAdapter({ clientId: cfg.clientId || CLOUD_IDS.google });
    else if (cfg.type === "onedrive") a = new CP.OneDriveAdapter({ clientId: cfg.clientId || CLOUD_IDS.microsoft, redirectUri: location.origin + location.pathname });
    else if (cfg.type === "webdav") a = new CP.WebDavAdapter({ url: cfg.url, user: cfg.user, pass: cfg.pass });
    return a ? new Prefixed(a) : null;
  },
  async init() {
    const CP = window.CP, local = new CP.IdbLocal(DB), cfg = this.cloudCfg();
    let crypto = null;
    if (cfg.secret && cfg.salt) { try { crypto = await CP.makeCrypto(cfg.secret, cfg.salt); } catch (e) { console.warn(e); } }
    this.engine = new CP.SyncEngine({ local, adapter: await this.adapterFor(cfg), deviceId: this.device(), crypto,
      onRemoteChange: kinds => this.reload(kinds), onStatus: st => { this.status = st; if (st.state === "relogin") this.needRelogin = true; emit(["_sync"]); } });
    await this.reload();
    this.ready = true;
    if (this.engine.adapter) this.sync();
    setInterval(() => { if (this.engine.adapter && navigator.onLine) this.sync(); }, 60000);
    addEventListener("online", () => this.engine.adapter && this.sync());
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && this.engine.adapter) this.sync(); });
    const relogin = async () => {
      const ad = this.engine.adapter; if (!this.needRelogin || !ad || !ad.connect || this._rl) return;
      this._rl = true; try { await ad.connect(true); this.needRelogin = false; this.sync(); } catch (e) { console.warn(e); } finally { this._rl = false; }
    };
    document.addEventListener("pointerdown", relogin, true);
  },
  sync() {
    return this.engine.sync().then(() => { this.needRelogin = false; return this.syncFiles(); }).catch(e => {
      if (e && e.relogin) { this.needRelogin = true; this.status = { state: "relogin" }; } else { console.warn(e); this.status = { state: "error", error: e }; }
      emit(["_sync"]);
    });
  },
  async reload(kinds) {
    const all = await this.engine.all();
    S.settings = mergeSettings((all.settings || {}).main || {});
    KINDS.forEach(k => S[k] = all[k] || {});
    emit(kinds || ["*"]);
  },
  async put(kind, obj) {
    const c = clone(obj); for (const k of Object.keys(c)) if (k.startsWith("_")) delete c[k];
    if (kind === "settings") { S.settings = mergeSettings(c); await this.engine.put("settings", "main", c); }
    else { if (!c.id) throw new Error("fără id"); c.mt = Date.now(); S[kind][c.id] = c; await this.engine.put(kind, c.id, c); }
    emit([kind]); return c;
  },
  async putMany(kind, arr) { for (const o of arr) { const c = clone(o); c.mt = Date.now(); S[kind][c.id] = c; await this.engine.put(kind, c.id, c); } emit([kind]); },
  async del(kind, id) { delete S[kind][id]; await this.engine.del(kind, id); emit([kind]); },
  saveSettings() { return this.put("settings", S.settings); },

  /* ----- fișiere ----- */
  async addFile(blob, meta = {}) {
    const id = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await FileDB.put(id, blob);
    const m = { id, name: meta.name || "document", type: blob.type || meta.type || "application/octet-stream", size: blob.size, at: Date.now(), ref: meta.ref || null, cloud: false };
    await this.put("files", m);
    if (this.engine.adapter) this.syncFiles();
    return m;
  },
  async fileBlob(id) {
    let b = await FileDB.get(id); if (b) return b;
    const ad = this.engine.adapter; if (!ad) return null;
    try {
      const f = (await ad.list()).find(x => x.name === `file-${id}.json`); if (!f) return null;
      let txt = await ad.get(f); if (this.engine.crypto) txt = await this.engine.crypto.dec(txt);
      const j = JSON.parse(txt); b = new Blob([b64dec(j.data)], { type: j.type }); await FileDB.put(id, b); return b;
    } catch (e) { console.warn(e); return null; }
  },
  async delFile(id) { await FileDB.del(id).catch(() => {}); if (S.files[id]) await this.del("files", id); },
  async syncFiles() {
    const ad = this.engine.adapter; if (!ad || this._fs) return; this._fs = true;
    try {
      const keys = new Set(await FileDB.keys());
      for (const m of Object.values(S.files)) {
        if (m.cloud || !keys.has(m.id)) continue;
        const b = await FileDB.get(m.id); if (!b) continue;
        let txt = JSON.stringify({ type: m.type, name: m.name, data: b64enc(new Uint8Array(await b.arrayBuffer())) });
        if (this.engine.crypto) txt = await this.engine.crypto.enc(txt);
        await ad.put(`file-${m.id}.json`, txt);
        await this.put("files", { ...m, cloud: true });
      }
    } catch (e) { console.warn("fișiere", e); } finally { this._fs = false; }
  },

  /* ----- conectare cloud ----- */
  async connect(cfg) {
    const CP = window.CP, ad = await this.adapterFor(cfg);
    if (ad && ad.connect) await ad.connect(true);
    let crypto = null;
    if (ad) {
      const files = await ad.list(), kf = files.find(f => f.name === "key.json");
      if (cfg.secret) {
        if (kf) {
          const k = JSON.parse(await ad.get(kf)); crypto = await CP.makeCrypto(cfg.secret, k.salt);
          try { if ((await crypto.dec(k.check)) !== "contabilitate-nou") throw 0; } catch (e) { throw new Error("Parola de criptare nu e cea folosită pe celelalte dispozitive."); }
          cfg.salt = k.salt;
        } else {
          crypto = await CP.makeCrypto(cfg.secret); cfg.salt = crypto.salt;
          await ad.put("key.json", JSON.stringify({ salt: crypto.salt, check: await crypto.enc("contabilitate-nou") }));
        }
      } else if (kf) throw new Error("Datele din acest cloud sunt criptate. Scrie parola de criptare.");
    }
    try { localStorage.setItem(CLOUD_KEY, JSON.stringify(cfg)); } catch (e) {}
    this.engine.adapter = ad; this.engine.crypto = crypto;
    const meta = await this.engine.local.getMeta(); meta.seen = {}; await this.engine.local.setMeta(meta);
    await this.engine.local.queueAll?.();
    Object.values(S.files).forEach(m => { if (m.cloud) S.files[m.id] = { ...m, cloud: false }; });
    if (ad) await this.sync();
  },
  async disconnect() {
    try { localStorage.setItem(CLOUD_KEY, JSON.stringify({ type: "none" })); } catch (e) {}
    this.engine.adapter?.forget?.(); this.engine.adapter = null; this.engine.crypto = null; this.status = { state: "off" }; emit(["_sync"]);
  },

  /* ----- backup complet ----- */
  async exportAll(withFiles = true) {
    const data = { app: "contabilitate-nou", v: 1, at: new Date().toISOString(), settings: S.settings };
    KINDS.forEach(k => data[k] = S[k]);
    if (withFiles) {
      data.blobs = {};
      for (const id of Object.keys(S.files)) { const b = await this.fileBlob(id); if (b) data.blobs[id] = { type: b.type, data: b64enc(new Uint8Array(await b.arrayBuffer())) }; }
    }
    return data;
  },
  async importAll(data, { replace = false } = {}) {
    if (!data || data.app !== "contabilitate-nou") throw new Error("Fișierul nu e un backup al acestei aplicații.");
    if (replace) for (const k of KINDS) for (const id of Object.keys(S[k])) await this.engine.del(k, id);
    if (data.settings) await this.put("settings", data.settings);
    for (const k of KINDS) for (const o of Object.values(data[k] || {})) { S[k][o.id] = o; await this.engine.put(k, o.id, o); }
    for (const [id, b] of Object.entries(data.blobs || {})) await FileDB.put(id, new Blob([b64dec(b.data)], { type: b.type }));
    await this.reload();
  }
};
