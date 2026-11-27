// Contabilitate privată (nou) – merge și fără internet. Fișierele aplicației se iau întâi de pe internet (actualizări imediate), fără semnal din copie.
const CACHE = "cp3-v1";
const SHELL = ["./", "./index.html", "./app.css", "./manifest.webmanifest", "../cp-core.js", "../icon-192.png", "../favicon-32.png", "../vendor/jspdf.umd.min.js",
  ...["app", "state", "store", "util", "ui", "model", "pdf", "erechnung", "datev", "mail", "belege", "scan", "migrate", "backup"].map(f => `./js/${f}.js`),
  ...["common", "home", "invoices", "notes", "purchases", "cash", "stock", "contacts", "products", "docs", "datev", "reports", "settings"].map(f => `./js/views/${f}.js`)];
const BIG = ["../cp-scan.js", "../models/det.onnx", "../models/rec.onnx", "../models/keys.txt", "../ort/ort-wasm-simd-threaded.wasm", "../ort/ort-wasm-simd-threaded.mjs", "../vendor/exceljs.min.js"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).then(() => c.addAll(BIG).catch(() => {}))).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("cp3-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  if (/\/(models|ort)\/|cp-scan\.js$|exceljs/.test(u.pathname)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(resp => { if (resp.ok) { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return resp; })));
  } else {
    e.respondWith(fetch(req, { cache: "no-cache" }).then(resp => { if (resp.ok) { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return resp; }).catch(() => caches.match(req, { ignoreSearch: true })));
  }
});
