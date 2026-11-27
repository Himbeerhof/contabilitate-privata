// Arhiva de documente: ce s-a trimis la contabil (DATEV), ce lipsește, ce mai trebuie trimis
import { S, list, prof, pidOf, defPid } from "../state.js";
import { Store } from "../store.js";
import { belege, belegFiles, sendSmart, markSent, unmark, monthCheck, TYPES, addressFor } from "../belege.js";
import { esc, money, fmtDate, today, newId, ym, lastDay, monthLabel, MONTHS } from "../util.js";
import { $, $$, icon, sheet, toast, confirmBox, fld, inp, dt, sel, val, pill, flag, empty, busy, opts, saveFile, seg, segVal } from "../ui.js";
import { filesWidget, profOpts } from "./common.js";
import { gmailReady } from "../mail.js";

const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (d.getDate() < 15 ? 1 : 0)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
let F = { m: today().slice(0, 7), type: "", st: "", pid: "" };
const sel_ = new Set();
export default {
  id: "docs", title: "Documente", icon: "docs",
  render(el, arg, { acts }) {
    acts.innerHTML = `<button class="btn" id="d-add">${icon("plus")}<span class="hide-m">Alt document</span></button>`;
    $("#d-add").onclick = () => extraForm(null);
    const from = F.m === "all" ? "" : F.m + "-01", to = F.m === "all" ? "" : lastDay(F.m);
    const all = belege({ pid: F.pid, from, to });
    const rows = all.filter(b => (!F.type || b.type === F.type) && (!F.st || (F.st === "unsent" ? !b.sent && !b.cancelled && (b.gen || b.files) : F.st === "missing" ? b.missing : F.st === "sent" ? !!b.sent : true)));
    const ms = [...new Set([today().slice(0, 7), ...all.map(b => ym(b.date)), ...belege().map(b => ym(b.date))])].sort().reverse().slice(0, 36);
    const pid = F.pid || defPid(), chk = F.m !== "all" ? monthCheck(pid, F.m) : null;
    const unsent = rows.filter(b => !b.sent && !b.cancelled && (b.gen || b.files));
    el.innerHTML = `
      ${!addressFor("out") && !addressFor("in") ? `<div class="banner info">Ca să trimiți documentele la contabil, pune adresele DATEV Upload Mail în <a href="#datev">DATEV</a>.</div>` : ""}
      <div class="toolbar"><select id="d-m">${opts([...ms.map(m => [m, monthLabel(m)]), ["all", "Toate lunile"]], F.m)}</select>
        <select id="d-pid">${opts([["", "DE + AT"], ...profOpts()], F.pid)}</select>
        <select id="d-t">${opts([["", "Toate tipurile"], ...Object.entries(TYPES).map(([k, v]) => [k, v[0]])], F.type)}</select>
        <select id="d-st">${opts([["", "Toate"], ["unsent", "Netrimise"], ["missing", "Fără document"], ["sent", "Trimise"]], F.st)}</select></div>
      ${chk ? `<div class="card"><h2>${icon("check")} Luna ${esc(monthLabel(F.m))} pentru contabil (${esc(prof(pid).label)})</h2>
        ${chk.items.map(i => `<div class="check"><span class="ico ${i.ok ? "ok" : i.warn ? "warn" : "bad"}">${i.ok ? "✓" : "!"}</span><div><b>${esc(i.txt)}</b><div class="hint" style="margin:0">${esc(i.sub || "")}</div></div></div>`).join("")}
        ${S.closings[pid + "-" + F.m] ? `<div class="banner ok" style="margin:10px 0 0">${icon("lock")} Luna e închisă (${fmtDate(new Date(S.closings[pid + "-" + F.m].at).toISOString().slice(0, 10))}).</div>` : ""}</div>` : ""}
      <div class="row sb" style="margin:0 0 8px"><span class="hint" style="margin:0">${rows.length} documente · ${unsent.length} netrimise</span>
        <div class="row"><button class="btn small" id="d-selall">Selectează netrimisele</button><button class="btn small primary" id="d-send" ${sel_.size ? "" : "disabled"}>${icon("send")} Trimite (${sel_.size})</button><button class="btn small" id="d-mark" ${sel_.size ? "" : "disabled"}>Marchează trimise</button><button class="btn small" id="d-dl" ${sel_.size ? "" : "disabled"}>${icon("dl")} Descarcă</button></div></div>
      <div class="list">${rows.length ? rows.map(b => { const k = b.kind + ":" + b.id; return `<div class="item" data-k="${esc(k)}">
        <input type="checkbox" data-sel="${esc(k)}" ${sel_.has(k) ? "checked" : ""} style="width:18px;height:18px;accent-color:var(--brand);flex:none" ${b.cancelled || (!b.gen && !b.files) ? "disabled" : ""}>
        <div class="grow"><div class="t">${esc(b.party || b.no || "–")}</div><div class="s">${flag(b.pid)}${esc(TYPES[b.type][0])} · ${esc(b.no || "")} · ${esc(fmtDate(b.date))}</div></div>
        <div style="text-align:right">${b.amount ? `<div class="a">${money(b.amount)}</div>` : ""}<div>${b.cancelled ? pill("cancelled", "anulat") : b.sent ? pill("ok", "✓ " + fmtDate(new Date(b.sent.at).toISOString().slice(0, 10)).slice(0, 5)) : b.missing ? pill("bad", "fără document") : (b.gen || b.files) ? pill("warn", "netrimis") : pill("", "fără fișier")}</div></div></div>`; }).join("") : empty("Niciun document în perioada aleasă.")}</div>`;
    const re = () => this.render(el, "", { acts });
    [["d-m", "m"], ["d-pid", "pid"], ["d-t", "type"], ["d-st", "st"]].forEach(([id, k]) => $("#" + id, el).onchange = e => { F[k] = e.target.value; sel_.clear(); re(); });
    $("#d-selall", el).onclick = () => { unsent.forEach(b => sel_.add(b.kind + ":" + b.id)); re(); };
    const chosen = () => rows.filter(b => sel_.has(b.kind + ":" + b.id));
    $("#d-send", el).onclick = e => busy(e.currentTarget, async () => {
      const c = chosen(); if (!c.length) return;
      try { const r = await sendSmart(c, { onProgress: t => toast(t, 1500) }); sel_.clear();
        if (r.manual) { re(); return; }
        if (r.manualDone) { toast(`${r.sent} documente marcate ca trimise`); re(); return; }
        toast(r.errors.length ? `${r.sent} trimise · ${r.errors[0]}` : `${r.sent} documente trimise în ${r.mails} e-mail(uri)`, 5000); re(); }
      catch (er) { toast(er.message, 6000); }
    });
    $("#d-mark", el).onclick = async () => { await markSent(chosen()); sel_.clear(); toast("Marcate ca trimise"); re(); };
    $("#d-dl", el).onclick = e => busy(e.currentTarget, async () => { for (const b of chosen()) for (const f of await belegFiles(b)) { saveFile(f.name, f.blob); await new Promise(r => setTimeout(r, 400)); } });
    el.querySelector(".list").addEventListener("click", async e => {
      const cb = e.target.closest("[data-sel]"); if (cb) { cb.checked ? sel_.add(cb.dataset.sel) : sel_.delete(cb.dataset.sel); e.stopPropagation(); const n = sel_.size; ["#d-send", "#d-mark", "#d-dl"].forEach(s => $(s, el).disabled = !n); $("#d-send", el).innerHTML = `${icon("send")} Trimite (${n})`; return; }
      const it = e.target.closest("[data-k]"); if (!it) return; const [kind, id] = it.dataset.k.split(":"); openSource(kind, id, rows.find(b => b.kind === kind && b.id === id));
    });
  }
};

async function openSource(kind, id, b) {
  if (kind === "invoices") return (location.hash = "invoices/" + id);
  if (kind === "purchases") return (await import("./purchases.js")).purchaseForm(S.purchases[id]);
  if (kind === "incomes") return (await import("./purchases.js")).incomeForm(S.incomes[id]);
  if (kind === "cashdays") return (await import("./cash.js")).dayForm(S.cashdays[id]);
  if (kind === "extradocs") return extraForm(S.extradocs[id], b);
}

function extraForm(e0, b) {
  const isNew = !e0, e = e0 ? { ...e0 } : { id: newId(), pid: defPid(), date: today(), type: "other", title: "", fileIds: [] };
  const o = sheet(`<h3>${isNew ? "Alt document pentru contabil" : esc(e.title)}</h3><div class="hint">Extrase de cont, contracte, scrisori de la Finanzamt, documente de casă – orice trebuie să ajungă la contabil.</div>
    <div class="grid g2">${fld("Ce document", inp("x-t", e.title, 'placeholder="ex. Kontoauszug November"'))}${fld("Data", dt("x-d", e.date))}</div>
    <div class="grid g2">${fld("Tip la DATEV", sel("x-ty", Object.entries(TYPES).map(([k, v]) => [k, v[0]]), e.type))}${fld("Profil", sel("x-p", profOpts(), pidOf(e)))}</div>
    <div id="x-f"></div>
    <div class="foot">${isNew ? "" : `<button class="btn danger" id="x-del" style="margin-right:auto">${icon("trash")}</button>${b?.sent ? `<button class="btn" id="x-un">Marchează netrimis</button>` : ""}`}<button class="btn" data-close>Renunță</button><button class="btn primary" id="x-ok">Salvează</button></div>`);
  const fw = filesWidget(o.q("#x-f"), e.fileIds);
  o.q("#x-ok").onclick = async () => { const n = { ...e, title: val(o, "x-t") || "Dokument", date: val(o, "x-d"), type: val(o, "x-ty"), pid: val(o, "x-p"), fileIds: fw.get() };
    if (!n.fileIds.length) return toast("Adaugă documentul (poză sau PDF).");
    await Store.put("extradocs", n); o.close(); toast("Salvat"); };
  o.q("#x-del") && (o.q("#x-del").onclick = async () => { if (await confirmBox("Ștergi documentul?", { ok: "Șterge" })) { for (const f of e.fileIds || []) await Store.delFile(f); await Store.del("extradocs", e.id); o.close(); } });
  o.q("#x-un") && (o.q("#x-un").onclick = async () => { await unmark(b); o.close(); });
}
