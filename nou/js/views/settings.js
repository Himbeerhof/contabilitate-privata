// Setări: firma, profilele fiscale DE / AT, facturi, casă, sincronizare, backup, mutarea datelor
import { S, PIDS, prof } from "../state.js";
import { Store } from "../store.js";
import { esc, num, r2, ibanOk, fmtIban, WD, money } from "../util.js";
import { $, $$, icon, toast, confirmBox, fld, inp, amt, sel, chk, val, nval, busy, pickFiles, sheet, opts } from "../ui.js";
import { COUNTRY_LIST } from "../pdf.js";
import { downloadBackup, folderSupported, getFolder, chooseFolder, forgetFolder, backupToFolder } from "../backup.js";

const SECS = [["company", "Firma"], ["profiles", "Țări (DE / AT)"], ["invoice", "Facturi"], ["cash", "Casă"], ["sync", "Sincronizare"], ["backup", "Backup și date"]];
export default {
  id: "settings", title: "Setări", icon: "set",
  render(el, arg, { acts }) {
    const sec = SECS.some(s => s[0] === arg) ? arg : "company";
    el.innerHTML = `<div class="toolbar"><div class="seg">${SECS.map(([k, l]) => `<button data-sec="${k}" class="${k === sec ? "on" : ""}">${l}</button>`).join("")}</div></div><div id="st-body"></div>`;
    $$("[data-sec]", el).forEach(b => b.onclick = () => { location.hash = "settings/" + b.dataset.sec; });
    const body = $("#st-body", el);
    ({ company, profiles, invoice, cash, sync, backup })[sec](body);
  }
};
const saveBtn = id => `<div class="row end"><button class="btn primary" id="${id}">Salvează</button></div>`;

function company(b) {
  const c = S.settings.company, k = S.settings.bank;
  b.innerHTML = `<div class="card"><h2>Firma ta</h2>
    <div class="grid g2">${fld("Nume firmă (pe facturi)", inp("co-n", c.name))}${fld("Proprietar / persoană de contact", inp("co-o", c.owner))}</div>
    ${fld("Stradă, nr.", inp("co-s", c.street))}
    <div class="grid g3">${fld("Cod poștal", inp("co-z", c.zip))}${fld("Oraș", inp("co-c", c.city))}${fld("Țara", sel("co-co", COUNTRY_LIST, c.country || "DE"))}</div>
    <div class="grid g3">${fld("Telefon", inp("co-p", c.phone))}${fld("E-mail", inp("co-e", c.email))}${fld("Site", inp("co-w", c.web))}</div>
    <div class="row"><div id="co-logo" style="width:120px;height:56px;border:1px dashed var(--line);border-radius:10px;background:#fff center/contain no-repeat ${c.logo ? `url('${c.logo}')` : ""}"></div><button class="btn small" id="co-lup">Logo…</button>${c.logo ? `<button class="btn small ghost" id="co-ldel">Scoate logo</button>` : ""}</div></div>
    <div class="card"><h2>Bancă (apare pe facturi și în E-Rechnung)</h2>
    <div class="grid g2">${fld("Titular cont", inp("bk-h", k.holder))}${fld("Banca", inp("bk-b", k.bank))}</div>
    <div class="grid g2">${fld("IBAN", inp("bk-i", fmtIban(k.iban)))}${fld("BIC", inp("bk-c", k.bic))}</div></div>${saveBtn("co-ok")}`;
  let logo = c.logo;
  $("#co-lup", b).onclick = async () => { const [f] = await pickFiles({ accept: "image/png,image/jpeg", multiple: false }); if (!f) return;
    const url = await new Promise(r => { const img = new Image(), u = URL.createObjectURL(f); img.onload = () => { const s = Math.min(1, 400 / img.width, 160 / img.height), cv = document.createElement("canvas"); cv.width = img.width * s; cv.height = img.height * s; cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); r(cv.toDataURL("image/png")); URL.revokeObjectURL(u); }; img.src = u; });
    logo = url; $("#co-logo", b).style.backgroundImage = `url('${url}')`; };
  $("#co-ldel", b) && ($("#co-ldel", b).onclick = () => { logo = ""; $("#co-logo", b).style.backgroundImage = ""; });
  $("#co-ok", b).onclick = async () => {
    const iban = val(b, "bk-i").replace(/\s/g, "").toUpperCase(); if (iban && !ibanOk(iban)) return toast("IBAN-ul nu pare corect.");
    S.settings.company = { name: val(b, "co-n"), owner: val(b, "co-o"), street: val(b, "co-s"), zip: val(b, "co-z"), city: val(b, "co-c"), country: val(b, "co-co"), phone: val(b, "co-p"), email: val(b, "co-e"), web: val(b, "co-w"), logo };
    S.settings.bank = { holder: val(b, "bk-h"), bank: val(b, "bk-b"), iban, bic: val(b, "bk-c").toUpperCase() };
    await Store.saveSettings(); toast("Salvat");
  };
}

function profiles(b) {
  b.innerHTML = PIDS.map(p => { const P = prof(p); return `<div class="card"><h2><span class="flag">${p.toUpperCase()}</span> ${esc(P.label)}</h2>
    <div class="grid g2">${fld("Steuernummer", inp(`p-${p}-tax`, P.taxNo))}${fld(p === "at" ? "UID-Nummer" : "USt-IdNr.", inp(`p-${p}-vat`, P.vatId))}</div>
    <div class="grid g3">${fld("Cote TVA (separate prin ;)", inp(`p-${p}-rates`, (P.rates || []).join("; ").replace(/\./g, ",")))}${fld("Cota implicită", inp(`p-${p}-def`, String(P.defRate).replace(".", ","), 'inputmode="decimal"'))}${fld("Termen de plată (zile)", inp(`p-${p}-pd`, P.payDays, 'inputmode="numeric"'))}</div>
    <div class="grid g4">${fld("Prefix factură", inp(`p-${p}-ip`, P.invPrefix))}${fld("Prima factură a anului nr.", inp(`p-${p}-is`, P.invStart, 'inputmode="numeric"'))}${fld("Prefix Lieferschein", inp(`p-${p}-lp`, P.lsPrefix))}${fld("Primul Lieferschein nr.", inp(`p-${p}-ls`, P.lsStart, 'inputmode="numeric"'))}</div>
    <div class="hint" style="margin-top:-6px">Facturile arată așa: ${esc((P.invPrefix ? P.invPrefix + "-" : "") + new Date().getFullYear() + "-" + (P.invPrefix ? "001" : "1"))}</div>
    <div class="grid g2">${fld("TVA se datorează", sel(`p-${p}-vm`, [["ist", "la încasare (Ist)"], ["soll", "la data facturii (Soll)"]], P.vatMode || "ist"))}<div>${chk(`p-${p}-small`, p === "at" ? "Kleinunternehmer (§ 6 Abs. 1 Z 27 UStG)" : "Kleinunternehmer (§ 19 UStG)", P.small)}${p === "de" ? chk(`p-${p}-p24`, "Pauschallandwirt (§ 24 UStG)", P.p24, "Scrie cota § 24 la cote TVA (ex. 7,8).") : ""}</div></div></div>`; }).join("")
    + `<div class="card">${fld("Țara implicită pentru documente noi", sel("p-def", PIDS.map(p => [p, prof(p).label]), S.settings.defaultProfile))}</div>${saveBtn("p-ok")}`;
  $("#p-ok", b).onclick = async () => {
    PIDS.forEach(p => { const g = k => val(b, `p-${p}-${k}`);
      S.settings.profiles[p] = { ...S.settings.profiles[p], taxNo: g("tax"), vatId: g("vat").replace(/\s/g, ""), rates: [...new Set(g("rates").split(/[;\s]+/).filter(Boolean).map(num))], defRate: num(g("def")), payDays: parseInt(g("pd"), 10) || 0,
        invPrefix: g("ip"), invStart: parseInt(g("is"), 10) || 1, lsPrefix: g("lp"), lsStart: parseInt(g("ls"), 10) || 1, vatMode: g("vm"), small: g("small"), p24: p === "de" ? g("p24") : false }; });
    S.settings.defaultProfile = val(b, "p-def"); await Store.saveSettings(); toast("Salvat");
  };
}

function invoice(b) {
  const i = S.settings.invoice;
  b.innerHTML = `<div class="card"><h2>Facturi și Lieferscheine</h2>
    ${fld("Text standard la începutul facturii", `<textarea id="i-in" rows="2" placeholder="ex. Vielen Dank für Ihren Auftrag. Wir berechnen Ihnen:">${esc(i.intro || "")}</textarea>`)}
    ${fld("Text standard la sfârșit", `<textarea id="i-ft" rows="2" placeholder="ex. Es gelten unsere AGB.">${esc(i.footer || "")}</textarea>`)}
    ${chk("i-lsp", "Prețuri pe Lieferscheine", i.lsPrices !== false)}${chk("i-hkl", "Clasa de calitate (Kl. I / II) pe facturi", i.showHkl !== false)}</div>${saveBtn("i-ok")}`;
  $("#i-ok", b).onclick = async () => { S.settings.invoice = { ...i, intro: val(b, "i-in"), footer: val(b, "i-ft"), lsPrices: val(b, "i-lsp"), showHkl: val(b, "i-hkl") }; await Store.saveSettings(); toast("Salvat"); };
}

function cash(b) {
  const c = S.settings.cash;
  b.innerHTML = `<div class="card"><h2>Casa de marcat</h2>
    <div class="grid g3">${fld("Casa e în", sel("c-p", PIDS.map(p => [p, prof(p).label]), c.profile))}${fld("Fond de casă (rămâne mereu)", amt("c-f", c.float))}${fld("Banii peste fond", sel("c-s", [["bank", "se depun la bancă (automat)"], ["private", "îi iau eu (Privatentnahme, automat)"], ["none", "îi trec eu manual"]], c.skim))}</div>
    <div class="grid g2">${fld("Registrul de casă începe la", `<input type="date" id="c-od" value="${esc(c.openingDate || "")}">`)}${fld("cu soldul", amt("c-ob", c.openingDate ? c.opening : ""))}</div>
    <div class="hint">Gol = registrul pornește de la fondul de casă la prima zi înregistrată.</div></div>
    <div class="card"><h2>Piețele pe zile</h2><div class="grid g4">${[1, 2, 3, 4, 5, 6, 0].map(d => fld(WD[d], inp("c-w" + d, (c.weekPlaces || {})[d] || ""))).join("")}</div>
    ${fld("Piețe (separate prin ;)", inp("c-m", (c.markets || []).join("; ")))}${fld("Firme unde vinzi (pentru Excel, separate prin ;)", inp("c-fi", (c.firms || []).join("; ")))}</div>${saveBtn("c-ok")}`;
  $("#c-ok", b).onclick = async () => {
    const wp = {}; [0, 1, 2, 3, 4, 5, 6].forEach(d => { const v = val(b, "c-w" + d); if (v) wp[d] = v; });
    const spl = v => v.split(";").map(s => s.trim()).filter(Boolean);
    S.settings.cash = { ...c, profile: val(b, "c-p"), float: r2(nval(b, "c-f")), skim: val(b, "c-s"), openingDate: val(b, "c-od"), opening: r2(nval(b, "c-ob")), weekPlaces: wp, markets: spl(val(b, "c-m")), firms: spl(val(b, "c-fi")) };
    await Store.saveSettings(); toast("Salvat");
  };
}

function sync(b) {
  const cfg = Store.cloudCfg(), st = Store.status || {};
  const names = { none: "Doar pe acest dispozitiv", google: "Google Drive", onedrive: "OneDrive", webdav: "Synology NAS / WebDAV" };
  b.innerHTML = `<div class="card"><h2>Sincronizare între dispozitive</h2>
    <div class="banner ${cfg.type === "none" ? "" : st.state === "error" ? "bad" : "ok"}">Acum: <b>${names[cfg.type] || cfg.type}</b>${cfg.secret ? " · criptat" : ""}${st.state === "error" ? " · eroare: " + esc(st.error?.message || "") : st.at ? " · ultima sincronizare " + new Date(st.at).toLocaleString("de-DE") : ""}</div>
    <div class="hint">Datele stau într-un dosar ascuns al aplicației în contul tău (nimeni altcineva nu le vede). Pe fiecare telefon / tabletă / PC alegi același cont. Datele aplicației noi sunt separate de cele ale aplicației vechi.</div>
    ${fld("Unde", sel("s-t", Object.entries(names), cfg.type))}
    <div id="s-wd" class="${cfg.type === "webdav" ? "" : "hidden"}"><div class="grid g3">${fld("Adresa WebDAV", inp("s-u", cfg.url || "", 'placeholder="https://nas.local:5006/contabilitate"'))}${fld("Utilizator", inp("s-us", cfg.user || ""))}${fld("Parolă", `<input type="password" id="s-pw" value="${esc(cfg.pass || "")}">`)}</div></div>
    ${fld("Parolă de criptare (opțional, aceeași pe toate dispozitivele)", `<input type="password" id="s-sec" value="${esc(cfg.secret || "")}" autocomplete="new-password">`)}
    <div class="hint">Cu parolă, datele din cloud sunt criptate. Dacă o uiți, datele din cloud nu se mai pot citi (cele de pe dispozitive rămân).</div>
    <div class="row end"><button class="btn" id="s-now" ${cfg.type === "none" ? "disabled" : ""}>Sincronizează acum</button><button class="btn primary" id="s-ok">Conectează</button></div></div>`;
  $("#s-t", b).onchange = () => $("#s-wd", b).classList.toggle("hidden", val(b, "s-t") !== "webdav");
  $("#s-now", b).onclick = e => busy(e.currentTarget, () => Store.sync().then(() => toast(Store.status.state === "ok" ? "Sincronizat" : "Nu s-a putut sincroniza")));
  $("#s-ok", b).onclick = e => busy(e.currentTarget, async () => {
    const type = val(b, "s-t");
    if (type === "none") { await Store.disconnect(); toast("Sincronizarea e oprită"); return; }
    const n = { type, secret: val(b, "s-sec") };
    if (type === "webdav") Object.assign(n, { url: val(b, "s-u"), user: val(b, "s-us"), pass: val(b, "s-pw") });
    try { await Store.connect(n); toast("Conectat · " + names[type]); location.hash = "settings/sync"; } catch (er) { console.error(er); toast(er.message, 6000); }
  });
}

async function backup(b) {
  const dir = folderSupported() ? await getFolder() : null, last = +localStorage.getItem("cp3_lastbackup") || 0;
  b.innerHTML = `<div class="card"><h2>Backup</h2><div class="hint">Un fișier cu toate datele și pozele. Ultimul backup: ${last ? new Date(last).toLocaleString("de-DE") : "niciodată"}.</div>
    <div class="row"><button class="btn primary" id="b-dl">${icon("dl")} Descarcă backup</button><button class="btn" id="b-up">${icon("up")} Încarcă backup</button></div>
    ${folderSupported() ? `<div class="sec">Backup automat într-un dosar (ex. Synology Drive)</div><div class="hint">${dir ? `Dosar ales: <b>${esc(dir.name)}</b>. Se face singur la ${S.settings.backup?.every || 7} zile, când aplicația e deschisă pe acest PC.` : "Alege un dosar de pe PC; aplicația pune acolo backup-ul și păstrează ultimele 8."}</div>
      <div class="row"><button class="btn" id="b-dir">${dir ? "Schimbă dosarul" : "Alege dosarul"}</button>${dir ? `<button class="btn" id="b-now">Fă backup acum</button><button class="btn ghost" id="b-forget">Oprește</button>` : ""}${fld("La câte zile", sel("b-ev", [[1, "zilnic"], [7, "săptămânal"], [30, "lunar"]], S.settings.backup?.every || 7))}</div>` : ""}</div>
    <div class="card"><h2>Datele din aplicația veche</h2><div class="hint">Copiază facturile, clienții, casa și cheltuielile din app.sidor-digital.de (din acest browser sau dintr-un fișier backup). Ce există deja aici nu se dublează.</div>
      <button class="btn" id="b-mig">Mută datele din aplicația veche</button></div>`;
  $("#b-dl", b).onclick = e => busy(e.currentTarget, downloadBackup);
  $("#b-up", b).onclick = async () => { const [f] = await pickFiles({ accept: ".json,application/json", multiple: false }); if (!f) return;
    let d; try { d = JSON.parse(await f.text()); } catch (er) { return toast("Fișierul nu e un backup valid."); }
    if (d.app === "facturare") return (await import("../migrate.js")).runMigration((await import("../migrate.js")).fromBackupFile(d), { keepSettings: true }).then(c => toast(`Copiat: ${c.invoices} facturi, ${c.contacts} contacte`, 5000));
    const replace = await confirmBox("Înlocuiesc tot ce e aici cu backup-ul?", { ok: "Înlocuiește tot", detail: "„Renunță” = adaug doar ce lipsește / suprascriu documentele cu același ID." });
    try { await Store.importAll(d, { replace }); toast("Backup încărcat"); } catch (er) { toast(er.message, 5000); } };
  $("#b-dir", b) && ($("#b-dir", b).onclick = async () => { try { await chooseFolder(); await backupToFolder(true); toast("Backup făcut în dosar"); backup(b); } catch (er) { if (er.name !== "AbortError") toast(er.message); } });
  $("#b-now", b) && ($("#b-now", b).onclick = e => busy(e.currentTarget, async () => { const r = await backupToFolder(true); toast(r === true ? "Backup făcut" : "Fără acces la dosar"); }));
  $("#b-forget", b) && ($("#b-forget", b).onclick = async () => { await forgetFolder(); backup(b); });
  $("#b-ev", b) && ($("#b-ev", b).onchange = async e => { S.settings.backup = { ...(S.settings.backup || {}), every: +e.target.value }; await Store.saveSettings(); });
  $("#b-mig", b).onclick = () => import("../migrate.js").then(m => m.offerMigration(true));
}
