// Prima pagină: cifrele lunii și ce e de făcut
import { S, list, prof, PIDS } from "../state.js";
import { Store } from "../store.js";
import { summary, invState, purState, calcInvoice, calcPurchase, paid, isOpen, dayTotal, monthSplit, cashProfile, cashBook } from "../model.js";
import { belege, monthCheck } from "../belege.js";
import { esc, money, fmtDate, today, addDays, lastDay, monthLabel, r2, ym, pad } from "../util.js";
import { $, icon, kpi } from "../ui.js";

export default {
  id: "home", title: "Acasă", icon: "home",
  render(el, arg, { acts }) {
    const st = S.settings, m = today().slice(0, 7), from = m + "-01", to = lastDay(m);
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); const pm = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const s = summary({ from, to });
    const cashM = r2(list("cashdays").filter(x => ym(x.date) === m).reduce((a, x) => a + dayTotal(x), 0));
    const openInv = list("invoices").map(i => ({ i, st: invState(i) })).filter(x => isOpen(x.st));
    const overInv = openInv.filter(x => ["over", "partover"].includes(x.st));
    const openPur = list("purchases").map(p => ({ p, st: purState(p) })).filter(x => isOpen(x.st)).sort((a, b) => (a.p.due || "9").localeCompare(b.p.due || "9"));
    const duePur = openPur.filter(x => !x.p.due || x.p.due <= addDays(today(), 7));
    const lsOpen = list("notes").filter(n => !n.invoiceId);
    const todo = [];
    if (!st.company.name) todo.push(["bad", "Completează datele firmei", "Numele, adresa, Steuernummer și IBAN apar pe facturi.", "settings"]);
    if (overInv.length) todo.push(["bad", `${overInv.length} facturi restante`, money(r2(overInv.reduce((a, x) => a + calcInvoice(x.i).gross - paid(x.i), 0))) + " de încasat", "invoices"]);
    if (duePur.length) todo.push(["warn", `${duePur.length} facturi de plătit în 7 zile`, duePur.slice(0, 3).map(x => `${esc(x.p.supplier || "")} ${money(calcPurchase(x.p).gross - paid(x.p))}${x.p.due ? " (" + fmtDate(x.p.due).slice(0, 5) + ")" : ""}`).join(" · "), "purchases"]);
    if (lsOpen.length) todo.push(["info", `${lsOpen.length} Lieferscheine nefacturate`, [...new Set(lsOpen.map(n => n.to?.name || ""))].slice(0, 3).join(", "), "notes"]);
    PIDS.forEach(pid => {
      const c = monthCheck(pid, pm), bad = c.items.filter(i => !i.ok), uns = c.unsent.length;
      if (c.all.length && (bad.length || uns)) todo.push(["warn", `${monthLabel(pm)} pentru contabil (${prof(pid).label})`, [uns && `${uns} documente netrimise`, ...bad.map(i => i.txt + (i.sub ? " – " + i.sub : ""))].filter(Boolean).slice(0, 3).join(" · "), "docs"]);
    });
    const cp = cashProfile(), cb = cashBook(cp, from, to);
    if (cb.negative.length) todo.push(["bad", "Sold negativ în casă", `${cb.negative.length} zi(le) în ${monthLabel(m)}`, "cash"]);
    const bk = st.backup || {}, lastB = +localStorage.getItem("cp3_lastbackup") || 0;
    if (list("invoices").length + list("purchases").length > 3 && Store.cloudCfg().type === "none" && Date.now() - lastB > (bk.every || 7) * 864e5) todo.push(["warn", "Fă un backup", "Datele sunt doar pe acest dispozitiv. Fă backup sau pornește sincronizarea.", "settings/backup"]);
    acts.innerHTML = "";
    el.innerHTML = `<div class="hint" style="margin:0 0 10px">${esc(st.company.name || "Contabilitate privată")} · ${esc(monthLabel(m))}</div>
      <div class="grid g4" style="margin-bottom:16px">
        ${kpi("Încasat luna aceasta", money(s.inGross), "cu TVA", "var(--ok)", "reports")}
        ${kpi("Plătit luna aceasta", money(s.outGross), "cu TVA", "var(--bad)", "purchases")}
        ${kpi("Casă / piețe", money(cashM), list("cashdays").filter(x => ym(x.date) === m).length + " zile", "var(--brand)", "cash")}
        ${kpi("De încasat", money(r2(openInv.reduce((a, x) => a + calcInvoice(x.i).gross - paid(x.i), 0))), openInv.length + " facturi", "var(--warn)", "invoices")}</div>
      <div class="grid g4" style="margin-bottom:16px">
        <a class="btn" href="#invoices/new" style="min-height:56px">${icon("inv")} Factură</a>
        <button class="btn" id="h-scan" style="min-height:56px">${icon("cam")} Factură primită</button>
        <button class="btn" id="h-z" style="min-height:56px">${icon("cash")} Zi de casă</button>
        <button class="btn" id="h-ls" style="min-height:56px">${icon("ls")} Lieferschein</button></div>
      <div class="sec">De făcut</div>
      <div class="list">${todo.length ? todo.map(([c, t, sub, go]) => `<div class="item" data-go="${go}"><span style="width:10px;height:10px;border-radius:50%;flex:none;background:var(--${c === "info" ? "info" : c})"></span><div class="grow"><div class="t">${esc(t)}</div><div class="s">${sub}</div></div><span class="hint" style="margin:0">›</span></div>`).join("") : `<div class="empty">Totul e la zi. ✓</div>`}</div>`;
    $("#h-scan", el).onclick = () => import("./purchases.js").then(m => m.scanPurchase());
    $("#h-z", el).onclick = () => import("./cash.js").then(m => m.dayForm(null));
    $("#h-ls", el).onclick = () => import("./notes.js").then(m => m.noteForm(null));
  }
};
