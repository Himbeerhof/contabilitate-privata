// DATEV: configurare Upload Mail + Gmail, export Buchungsstapel, închiderea lunii, conturi
import { S, list, prof, PIDS, defPid } from "../state.js";
import { Store } from "../store.js";
import { cfg, DEF, ACC_LABELS, datevCsv, datevCashCsv } from "../datev.js";
import { TYPES, pendingAuto, runAuto, monthCheck } from "../belege.js";
import { gmailToken, gmailSend, gmailAccount, gmailForget, gmailReady } from "../mail.js";
import { esc, money, fmtDate, today, lastDay, monthLabel, MONTHS, dec2, pad } from "../util.js";
import { $, $$, icon, sheet, toast, confirmBox, fld, inp, sel, chk, val, pill, empty, busy, opts, saveFile, seg, segVal, dt } from "../ui.js";
import { profOpts } from "./common.js";

let P = { pid: "", kind: "m", m: "", q: "", y: String(new Date().getFullYear()) };
export default {
  id: "datev", title: "DATEV", icon: "datev",
  render(el, arg, { acts }) {
    const st = S.settings, D = st.datev, C = cfg();
    if (!P.pid) P.pid = defPid();
    if (!P.m) { const d = new Date(); d.setMonth(d.getMonth() - 1); P.m = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
    const up = D.upload || {}, nAddr = Object.values(up).filter(Boolean).length, pend = pendingAuto();
    const step = (ok, title, body) => `<div class="check"><span class="ico ${ok ? "ok" : "warn"}">${ok ? "✓" : "!"}</span><div class="grow"><b>${title}</b><div>${body}</div></div></div>`;
    el.innerHTML = `
      <div class="card"><h2>1. Trimiterea documentelor (DATEV Upload Mail)</h2>
        ${step(nAddr > 0, "Adresele DATEV", `<div class="hint" style="margin:2px 0 8px">Le primești din DATEV Unternehmen online: Belege → Einstellungen (sus dreapta) → Upload Mail → Konfigurieren → Jetzt einrichten. Acolo confirmi adresa de pe care trimiți (${esc(gmailAccount() || st.company.email || "e-mailul firmei")}) și primești adresele de primire. Poți avea câte una pe tip de document.</div>
          <div class="grid g2">${Object.entries(TYPES).map(([k, v]) => fld(v[0] + " (" + v[1] + ")", `<input type="email" id="u-${k}" value="${esc(up[k] || "")}" placeholder="...@uploadmail.datev.de">`)).join("")}</div>
          <button class="btn small" id="u-save">Salvează adresele</button>`)}
        ${step(D.gmail && gmailAccount(), "Trimiterea din Gmail", D.gmail ? `<div class="hint" style="margin:2px 0 8px">Se trimite din contul ${esc(gmailAccount() || "Google")}. ${gmailReady() ? "Conectat." : "Se reconectează la prima trimitere."}</div><div class="row"><button class="btn small" id="g-test">Trimite un test la adresa „facturi primite”</button><button class="btn small ghost" id="g-off">Oprește Gmail</button></div>`
          : `<div class="hint" style="margin:2px 0 8px">Cu Gmail (contul Google al firmei) aplicația trimite singură, inclusiv automat. Fără Gmail, la fiecare trimitere se deschide aplicația de e-mail a telefonului cu documentele atașate.</div><button class="btn small primary" id="g-on">${icon("mail")} Conectează Gmail</button>`)}
        ${step(true, "Limite DATEV", `<div class="hint" style="margin:2px 0 0">Doar PDF / TIFF, cel mult 10 documente și 20 MB pe e-mail. Aplicația transformă pozele în PDF și împarte singură în mai multe e-mailuri.</div>`)}
        <div class="sec">Trimitere automată</div>
        ${chk("a-out", "Facturile scrise pleacă singure la emitere", D.auto?.out)}${chk("a-in", "Facturile primite pleacă singure când au poză / PDF", D.auto?.in)}${chk("a-cash", "Pozele Z-urilor pleacă singure", D.auto?.cash)}
        <div class="row">${fld("Doar documentele de la data", dt("a-since", D.autoSince || today()))}</div>
        <div class="hint">Automat merge doar cu Gmail conectat și când aplicația e deschisă (pe orice dispozitiv). ${pend.length ? `<b>${pend.length} documente așteaptă.</b> <button class="btn small" id="a-run">Trimite acum</button>` : "Nimic în așteptare."}</div>
        <button class="btn small" id="a-save">Salvează</button></div>

      <div class="card"><h2>2. Export pentru contabil (Buchungsstapel)</h2>
        <div class="hint">Fișier CSV în format DATEV (EXTF 700) cu toate încasările și plățile: facturi, facturi primite, casa pe zile, depuneri. Contabilul îl importă direct în DATEV.</div>
        <div class="row">${seg("x-pid", profOpts(), P.pid)}${seg("x-k", [["m", "Lună"], ["q", "Trimestru"], ["y", "An"]], P.kind)}</div>
        <div class="row" style="margin-top:10px" id="x-per"></div>
        <div id="x-res" style="margin-top:10px"></div>
        <div class="row" style="margin-top:8px"><button class="btn primary" id="x-dl">${icon("dl")} Descarcă Buchungsstapel</button><button class="btn" id="x-kasse">${icon("dl")} Doar casa (Kasse)</button><button class="btn" id="x-close">${icon("lock")} Închide perioada</button></div></div>

      <div class="card"><h2>3. Date de la contabil</h2>
        <div class="grid g3">${fld("Cadru de conturi", sel("c-skr", [["03", "SKR03"], ["04", "SKR04"]], C.skr))}${fld("Mod de contare", sel("c-mode", [["ist", "Simplu: la plată (EÜR, Ist)"], ["opos", "Cu debitori / creditori (OPOS)"]], C.mode || "ist"))}${fld("Început an fiscal (luna)", sel("c-wj", MONTHS.map((m, i) => [String(i + 1), m]), String(+C.wjBegin || 1)))}</div>
        ${PIDS.map(p => `<div class="grid g2">${fld(`Beraternummer – ${prof(p).label}`, inp("c-b-" + p, (D.berater || {})[p] || "", 'inputmode="numeric"'))}${fld(`Mandantennummer – ${prof(p).label}`, inp("c-m-" + p, (D.mandant || {})[p] || "", 'inputmode="numeric"'))}</div>`).join("")}
        <details><summary style="cursor:pointer;font-weight:650;margin:6px 0 10px">Conturile (propuneri ${C.skr === "04" ? "SKR04" : "SKR03"} – se stabilesc o dată cu contabilul)</summary>
          ${ACC_LABELS.map(([g, l]) => `<div class="sec">${esc(g)}</div><div class="grid g3">${l.map(([k, t]) => fld(t, inp("acc-" + k, C.acc[k] || "", `inputmode="numeric" placeholder="${esc(DEF[C.skr][k] || "")}"`))).join("")}</div>`).join("")}
          <div class="hint">Pentru o fermă contabilul poate folosi SKR14 – atunci scrie aici conturile lui.</div></details>
        <button class="btn" id="c-save">Salvează</button></div>

      <div class="card"><h2>Istoric trimiteri</h2>${logHTML()}</div>`;

    // ----- 1 -----
    $("#u-save", el).onclick = async () => { D.upload = Object.fromEntries(Object.keys(TYPES).map(k => [k, val(el, "u-" + k)]));
      if (Object.values(D.upload).some(a => a && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a))) return toast("O adresă nu pare corectă.");
      await Store.saveSettings(); toast("Adresele au fost salvate"); };
    $("#g-on", el) && ($("#g-on", el).onclick = e => busy(e.currentTarget, async () => { try { await gmailToken(true); D.gmail = true; await Store.saveSettings(); toast("Gmail conectat"); } catch (er) { toast(er.message, 5000); } }));
    $("#g-off", el) && ($("#g-off", el).onclick = async () => { gmailForget(); D.gmail = false; await Store.saveSettings(); });
    $("#g-test", el) && ($("#g-test", el).onclick = e => busy(e.currentTarget, async () => {
      const to = up.in || up.out || up.cash || up.other; if (!to) return toast("Pune întâi o adresă DATEV.");
      const { loadPdf } = await import("../pdf.js"), jsPDF = await loadPdf(), doc = new jsPDF(); doc.text("Testdokument - Contabilitate privata", 20, 30); doc.text(new Date().toLocaleString("de-DE"), 20, 40);
      try { await gmailSend({ to, subject: "Test Upload Mail", text: "Test", files: [{ name: "Test.pdf", blob: doc.output("blob") }] }); toast("Test trimis. Verifică în DATEV Unternehmen online peste câteva minute.", 6000); } catch (er) { toast(er.message, 7000); }
    }));
    $("#a-save", el).onclick = async () => { D.auto = { out: val(el, "a-out"), in: val(el, "a-in"), cash: val(el, "a-cash") }; D.autoSince = val(el, "a-since"); await Store.saveSettings(); toast("Salvat"); };
    $("#a-run", el) && ($("#a-run", el).onclick = e => busy(e.currentTarget, async () => { if (!gmailReady()) try { await gmailToken(true); } catch (er) { return toast(er.message); } const r = await runAuto(); toast(r?.error ? r.error.message : r ? `${r.sent} documente trimise${r.errors.length ? " · " + r.errors[0] : ""}` : "Nimic de trimis", 5000); }));

    // ----- 2 -----
    const per = () => { const y = P.y; if (P.kind === "m") return [P.m + "-01", lastDay(P.m), monthLabel(P.m)]; if (P.kind === "q") { const q = +P.q || Math.ceil((new Date().getMonth() + 1) / 3); const a = (q - 1) * 3 + 1; return [`${y}-${pad(a)}-01`, lastDay(`${y}-${pad(a + 2)}`), `T${q} ${y}`]; } return [`${y}-01-01`, `${y}-12-31`, y]; };
    const drawPer = () => {
      const ys = [...new Set([String(new Date().getFullYear()), String(new Date().getFullYear() - 1), String(new Date().getFullYear() - 2)])];
      const ms = []; for (let i = 0; i < 24; i++) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); ms.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }
      $("#x-per", el).innerHTML = P.kind === "m" ? sel("x-m", ms.map(m => [m, monthLabel(m)]), P.m) : P.kind === "q" ? sel("x-y", ys.map(y => [y, y]), P.y) + sel("x-q", [1, 2, 3, 4].map(q => [q, "Trimestrul " + q]), P.q || Math.ceil((new Date().getMonth() + 1) / 3)) : sel("x-y", ys.map(y => [y, y]), P.y);
      $$("#x-per select", el).forEach(s => { s.style.width = "auto"; s.onchange = () => { P[s.id.slice(2)] = s.value; drawPer(); }; });
      const [from, to] = per();
      try {
        const r = datevCsv({ pid: P.pid, from, to }), lock = isClosed(P.pid, from, to);
        const sIn = r.rows.filter(x => x.sh === "S").reduce((s, x) => s + x.amt, 0), sOut = r.rows.filter(x => x.sh === "H").reduce((s, x) => s + x.amt, 0);
        $("#x-res", el).innerHTML = `<div class="hint" style="margin:0 0 6px">${r.n} rânduri · Soll ${money(sIn)} · Haben ${money(sOut)}${lock ? " · " + icon("lock", "ic") + " închisă" : ""}</div>
          ${r.missing.length ? `<div class="banner">Lipsește ${esc(r.missing.join(" și "))} (de la contabil) – fișierul merge, dar contabilul trebuie să le schimbe la import.</div>` : ""}
          ${r.warn.map(w => `<div class="banner">${esc(w)}</div>`).join("")}
          ${r.n ? `<details><summary style="cursor:pointer">Vezi rândurile</summary><div class="tw"><table class="t"><tr><th>Data</th><th class="n">Suma</th><th>S/H</th><th>Cont</th><th>Contrapartidă</th><th>BU</th><th>Document</th><th>Text</th></tr>
            ${r.rows.slice(0, 300).map(x => `<tr><td>${esc(fmtDate(x.date).slice(0, 5))}</td><td class="n">${dec2(x.amt)}</td><td>${x.sh}</td><td>${esc(x.konto)}</td><td>${esc(x.gegen)}</td><td>${esc(x.bu)}</td><td>${esc(x.doc || "")}</td><td>${esc(x.text || "")}</td></tr>`).join("")}</table></div></details>` : ""}`;
      } catch (er) { $("#x-res", el).innerHTML = `<div class="banner bad">${esc(er.message)}</div>`; }
    };
    segVal(el, "x-pid", v => { P.pid = v; drawPer(); }); segVal(el, "x-k", v => { P.kind = v; drawPer(); }); drawPer();
    $("#x-dl", el).onclick = () => { const [from, to] = per(); try { const r = datevCsv({ pid: P.pid, from, to }); saveFile(r.name, new Blob([r.bytes], { type: "text/csv" })); } catch (er) { toast(er.message); } };
    $("#x-kasse", el).onclick = () => { const [from, to] = per(); try { const r = datevCashCsv({ pid: P.pid, from, to }); saveFile(r.name, new Blob([r.bytes], { type: "text/csv" })); } catch (er) { toast(er.message); } };
    $("#x-close", el).onclick = async () => {
      const [from, to, label] = per(), ms = monthsIn(from, to), pid = P.pid;
      const already = ms.every(m => S.closings[pid + "-" + m]);
      if (already) { if (await confirmBox(`Redeschid ${label}?`, { ok: "Redeschide", detail: "Doar dacă știi că trebuie corectat ceva. Contabilul trebuie anunțat dacă a importat deja datele." })) { for (const m of ms) await Store.del("closings", pid + "-" + m); toast("Redeschisă"); } return; }
      const probs = ms.flatMap(m => monthCheck(pid, m).items.filter(i => !i.ok).map(i => monthLabel(m) + ": " + i.txt + " – " + (i.sub || "")));
      if (!(await confirmBox(`Închid ${label} (${prof(pid).label})?`, { ok: "Închide", danger: false, detail: (probs.length ? "<b>De verificat:</b><br>" + probs.map(esc).join("<br>") + "<br><br>" : "") + "După închidere documentele din această perioadă nu se mai pot modifica (GoBD). Plățile la facturi se pot înregistra în continuare." }))) return;
      for (const m of ms) await Store.put("closings", { id: pid + "-" + m, pid, month: m, at: Date.now() });
      toast("Perioada a fost închisă");
    };

    // ----- 3 -----
    $("#c-save", el).onclick = async () => {
      const skr = val(el, "c-skr"), acc = {};
      ACC_LABELS.forEach(([, l]) => l.forEach(([k]) => { const v = val(el, "acc-" + k); if (v && v !== DEF[skr][k]) acc[k] = v; }));
      D.skr = skr; D.mode = val(el, "c-mode"); D.wjBegin = val(el, "c-wj"); D.acc = { ...(D.acc || {}), [skr]: acc };
      D.berater = Object.fromEntries(PIDS.map(p => [p, val(el, "c-b-" + p)])); D.mandant = Object.fromEntries(PIDS.map(p => [p, val(el, "c-m-" + p)]));
      await Store.saveSettings(); toast("Salvat");
    };
    $("#c-skr", el).onchange = () => { D.skr = val(el, "c-skr"); Store.saveSettings(); };
  }
};
const monthsIn = (from, to) => { const out = []; let [y, m] = from.slice(0, 7).split("-").map(Number); const end = to.slice(0, 7); while (`${y}-${pad(m)}` <= end) { out.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++; } } return out; };
const isClosed = (pid, from, to) => monthsIn(from, to).every(m => S.closings[pid + "-" + m]);
function logHTML() {
  const l = list("datevlog").sort((a, b) => b.at - a.at), byDay = {};
  l.forEach(x => { const k = new Date(x.at).toISOString().slice(0, 10) + "|" + (x.to || ""); (byDay[k] ||= []).push(x); });
  const e = Object.entries(byDay).slice(0, 30);
  return e.length ? `<div class="tw"><table class="t"><tr><th>Data</th><th>Către</th><th class="n">Documente</th><th>Cum</th></tr>${e.map(([k, xs]) => { const [d, to] = k.split("|"); return `<tr><td>${esc(fmtDate(d))}</td><td>${esc(to || "–")}</td><td class="n">${xs.length}</td><td>${esc({ gmail: "Gmail", share: "aplicația de e-mail", manual: "marcat manual" }[xs[0].via] || xs[0].via)}</td></tr>`; }).join("")}</table></div>` : `<div class="hint">Nimic trimis încă.</div>`;
}
