// Rapoarte: rezultat (EÜR), TVA (UStVA / UVA), Excel „Wochenmarktumsätze”
import { S, list, prof, PIDS, defPid } from "../state.js";
import { summary, vatReport, CATS, CAT_OUT, CAT_IN, dayTotal, monthSplit, cashProfile, allPlaces } from "../model.js";
import { esc, money, fmtDate, today, lastDay, monthLabel, MONTHS, MONTHS_AT, WD, r2, num, pad, year, dec2 } from "../util.js";
import { $, $$, icon, toast, sel, kpi, seg, segVal, opts, saveFile, busy } from "../ui.js";
import { profOpts } from "./common.js";

let R = { tab: "res", pid: "", y: String(new Date().getFullYear()), m: "", q: "" };
export default {
  id: "reports", title: "Rapoarte", icon: "chart",
  render(el, arg, { acts }) {
    if (!R.pid) R.pid = defPid();
    const ys = [...new Set([String(new Date().getFullYear()), ...list("invoices").map(i => year(i.date)), ...list("cashdays").map(d => year(d.date)), ...list("purchases").map(p => year(p.date))])].filter(Boolean).sort().reverse();
    el.innerHTML = `<div class="toolbar">${seg("r-tab", [["res", "Rezultat"], ["vat", "TVA"], ["wm", "Piețe (Excel)"]], R.tab)}</div>
      <div class="toolbar">${R.tab !== "wm" ? `<select id="r-pid">${opts(profOpts(), R.pid)}</select>` : ""}<select id="r-y">${opts(ys.map(y => [y, y]), R.y)}</select>
        ${R.tab === "res" ? `<select id="r-m">${opts([["", "Tot anul"], ...MONTHS.map((m, i) => [pad(i + 1), m])], R.m)}</select>` : ""}
        ${R.tab === "vat" ? `<select id="r-q">${opts([["", "Alege perioada"], ...MONTHS.map((m, i) => ["m" + pad(i + 1), m]), ...[1, 2, 3, 4].map(q => ["q" + q, "Trimestrul " + q]), ["y", "Tot anul"]], R.q || "m" + pad(Math.max(1, new Date().getMonth())))}</select>` : ""}</div>
      <div id="r-body"></div>`;
    const body = $("#r-body", el);
    if (R.tab === "res") resView(body); else if (R.tab === "vat") vatView(body); else wmView(body);
    const re = () => this.render(el, "", { acts });
    segVal(el, "r-tab", v => { R.tab = v; re(); });
    [["r-pid", "pid"], ["r-y", "y"], ["r-m", "m"], ["r-q", "q"]].forEach(([id, k]) => { const s = $("#" + id, el); if (s) s.onchange = e => { R[k] = e.target.value; re(); }; });
  }
};

function resView(body) {
  const from = R.m ? `${R.y}-${R.m}-01` : `${R.y}-01-01`, to = R.m ? lastDay(`${R.y}-${R.m}`) : `${R.y}-12-31`;
  const s = summary({ pid: R.pid, from, to });
  const months = MONTHS.map((m, i) => { const x = summary({ pid: R.pid, from: `${R.y}-${pad(i + 1)}-01`, to: lastDay(`${R.y}-${pad(i + 1)}`) }); return { m, i: x.inNet, o: x.outNet }; });
  const max = Math.max(1, ...months.map(x => Math.max(x.i, x.o)));
  const catRows = (t, l) => l.map(([k, ro]) => [ro, s.cats[t + ":" + k] || 0]).filter(x => x[1]);
  body.innerHTML = `<div class="grid g4" style="margin-bottom:14px">${kpi("Venituri (net)", money(s.inNet), "", "var(--ok)")}${kpi("Cheltuieli (net)", money(s.outNet), "", "var(--bad)")}${kpi("Rezultat", money(s.result), R.m ? monthLabel(`${R.y}-${R.m}`) : R.y, s.result < 0 ? "var(--bad)" : "var(--brand)")}${kpi("TVA de plată", money(r2(s.inVat - s.outVat)), `încasată ${money(s.inVat)} · dedusă ${money(s.outVat)}`, "var(--info)")}</div>
    ${!R.m ? `<div class="card"><h2>Pe luni</h2><div class="tw"><table class="t"><tr><th>Luna</th><th class="n">Venituri</th><th class="n">Cheltuieli</th><th class="n">Rezultat</th><th style="width:40%"></th></tr>
      ${months.map(x => `<tr><td>${x.m}</td><td class="n">${x.i ? money(x.i) : ""}</td><td class="n">${x.o ? money(x.o) : ""}</td><td class="n" style="${x.i - x.o < 0 ? "color:var(--bad)" : ""}">${x.i || x.o ? money(r2(x.i - x.o)) : ""}</td>
        <td><div class="bar" style="margin-bottom:2px"><i style="width:${x.i / max * 100}%;background:var(--ok)"></i></div><div class="bar"><i style="width:${x.o / max * 100}%;background:var(--bad)"></i></div></td></tr>`).join("")}
      <tr class="sum"><td>Total</td><td class="n">${money(s.inNet)}</td><td class="n">${money(s.outNet)}</td><td class="n">${money(s.result)}</td><td></td></tr></table></div></div>` : ""}
    <div class="grid g2 st"><div class="card"><h2>Venituri</h2><table class="t">${catRows("in", CAT_IN).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${money(v)}</td></tr>`).join("") || "<tr><td>Nimic</td></tr>"}</table></div>
      <div class="card"><h2>Cheltuieli</h2><table class="t">${catRows("out", CAT_OUT).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${money(v)}</td></tr>`).join("") || "<tr><td>Nimic</td></tr>"}</table></div></div>
    <div class="hint">Principiul încasării (EÜR): veniturile și cheltuielile contează la data plății. Facturile neîncasate și cele primite neplătite nu apar încă. Aceasta e o imagine de ansamblu, nu declarația oficială.</div>
    <button class="btn small" id="r-csv">${icon("dl")} Registrul ca CSV (Excel)</button>`;
  $("#r-csv", body).onclick = () => {
    const l = ["Datum;Art;Beleg;Partner;Text;Kategorie;Zahlung;Steuersatz;Netto;USt;Brutto", ...s.rows.map(r => [fmtDate(r.date), r.type === "in" ? "Einnahme" : "Ausgabe", r.doc, r.party, r.text, CATS[r.cat]?.de || r.cat, r.method, String(r.rate).replace(".", ","), dec2(r.net), dec2(r.vat), dec2(r.gross)].map(v => String(v ?? "").replace(/;/g, ",")).join(";"))];
    saveFile(`Journal_${R.pid.toUpperCase()}_${from}_${to}.csv`, new Blob(["﻿" + l.join("\r\n")], { type: "text/csv" }));
  };
}

function vatView(body) {
  const q = R.q || "m" + pad(Math.max(1, new Date().getMonth())), y = R.y;
  let from, to, label;
  if (q.startsWith("m")) { from = `${y}-${q.slice(1)}-01`; to = lastDay(`${y}-${q.slice(1)}`); label = monthLabel(`${y}-${q.slice(1)}`); }
  else if (q.startsWith("q")) { const a = (+q.slice(1) - 1) * 3 + 1; from = `${y}-${pad(a)}-01`; to = lastDay(`${y}-${pad(a + 2)}`); label = `Trimestrul ${q.slice(1)} ${y}`; }
  else { from = `${y}-01-01`; to = `${y}-12-31`; label = y; }
  const v = vatReport(R.pid, from, to), P = prof(R.pid);
  body.innerHTML = `<div class="card"><h2>${R.pid === "at" ? "Umsatzsteuervoranmeldung (UVA)" : "Umsatzsteuer-Voranmeldung (UStVA)"} · ${esc(label)}</h2>
    <div class="hint">${P.label} · ${v.mode === "soll" ? "după data facturii (Soll)" : "după data încasării (Ist)"}${P.taxNo ? " · Steuernr. " + esc(P.taxNo) : ""}. Cifrele sunt pentru verificare – declarația o trimite contabilul (sau tu prin ELSTER / FinanzOnline).</div>
    <table class="t"><tr><th>Kz</th><th>Rând</th><th class="n">Suma</th></tr>${v.kz.map(([k, t, a]) => `<tr ${["83", "095"].includes(k) ? 'class="sum"' : ""}><td>${esc(k)}</td><td>${esc(t)}</td><td class="n">${a === "" ? "" : money(a)}</td></tr>`).join("")}</table>
    ${v.est ? `<div class="banner" style="margin-top:10px">Pentru unele zile de casă lipsește raportul lunar al casei: cotele sunt estimate la ${String(P.defRate).replace(".", ",")} %.</div>` : ""}
    ${v.foreign ? `<div class="hint">TVA străină plătită (nedeductibilă aici): ${money(v.foreign)}</div>` : ""}</div>
    <div class="card"><h2>Pe cote</h2><table class="t"><tr><th>Cota</th><th class="n">Bază (vânzări)</th><th class="n">TVA încasată</th><th class="n">Bază (cumpărări)</th><th class="n">TVA dedusă</th></tr>
      ${[...new Set([...Object.keys(v.out), ...Object.keys(v.inp)])].map(Number).sort((a, b) => b - a).map(r => `<tr><td>${String(r).replace(".", ",")} %</td><td class="n">${money(v.out[r]?.base || 0)}</td><td class="n">${money(v.out[r]?.tax || 0)}</td><td class="n">${money(v.inp[r]?.base || 0)}</td><td class="n">${money(v.inp[r]?.tax || 0)}</td></tr>`).join("")}
      <tr class="sum"><td>Total</td><td></td><td class="n">${money(v.outTax)}</td><td></td><td class="n">${money(v.inTax)}</td></tr></table></div>`;
}

let XL = null;
const loadXL = () => window.ExcelJS ? Promise.resolve(window.ExcelJS) : (XL ||= new Promise((res, rej) => { const s = document.createElement("script"); s.src = "../vendor/exceljs.min.js"; s.onload = () => res(window.ExcelJS); s.onerror = () => { XL = null; rej(new Error("Excel nu s-a încărcat")); }; document.head.appendChild(s); }));
function wmView(body) {
  const pid = cashProfile(), days = list("cashdays").filter(d => year(d.date) === R.y && (d.pid || "de") === pid);
  const places = [...new Set([...(S.settings.cash.markets || []), ...(S.settings.cash.firms || []), ...days.map(d => d.place).filter(Boolean)])];
  const by = {}; days.forEach(d => { const m = d.date.slice(5, 7); (by[m] ||= {}); by[m][d.place || "–"] = r2((by[m][d.place || "–"] || 0) + dayTotal(d)); });
  body.innerHTML = `<div class="card"><h2>Încasări pe piețe · ${R.y}</h2><div class="tw"><table class="t"><tr><th>Luna</th>${places.map(p => `<th class="n">${esc(p)}</th>`).join("")}<th class="n">Total</th></tr>
    ${MONTHS.map((m, i) => { const x = by[pad(i + 1)] || {}, t = r2(Object.values(x).reduce((s, v) => s + v, 0)); return t ? `<tr><td>${m}</td>${places.map(p => `<td class="n">${x[p] ? dec2(x[p]) : ""}</td>`).join("")}<td class="n"><b>${dec2(t)}</b></td></tr>` : ""; }).join("")}
    </table></div><div class="hint">Sumele numărate (inclusiv bacșiș), ca în lista ta „Wochenmarktumsätze”. Împărțirea TVA vine din raportul lunar al casei.</div>
    <button class="btn primary" id="wm-x">${icon("dl")} Descarcă Excel Wochenmarktumsätze ${R.y}</button></div>`;
  $("#wm-x", body).onclick = e => busy(e.currentTarget, async () => {
    let X; try { X = await loadXL(); } catch (er) { return toast(er.message); }
    const wb = new X.Workbook(); wb.creator = "Contabilitate privată";
    const bold = { bold: true }, eur = '#,##0.00 "€"';
    const sumSheet = wb.addWorksheet("Übersicht " + R.y);
    sumSheet.addRow(["Wochenmarktumsätze " + R.y, S.settings.company.name]).font = { bold: true, size: 13 };
    sumSheet.addRow([]); sumSheet.addRow(["Monat", ...places, "Gesamt", ...prof(pid).rates.map(r => `USt ${r} % brutto`)]).font = bold;
    MONTHS_AT.forEach((mn, i) => {
      const m = pad(i + 1), md = days.filter(d => d.date.slice(5, 7) === m); if (!md.length) return;
      const ws = wb.addWorksheet(mn);
      ws.addRow([mn + " " + R.y]).font = { bold: true, size: 13 }; ws.addRow([]);
      ws.addRow(["Datum", "Tag", ...places, "Gesamt", "davon Karte"]).font = bold;
      const ds = [...new Set(md.map(d => d.date))].sort();
      ds.forEach(dd => { const x = md.filter(d => d.date === dd); ws.addRow([new Date(dd + "T12:00:00"), ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"][new Date(dd + "T12:00:00").getDay()], ...places.map(p => r2(x.filter(d => d.place === p).reduce((s, d) => s + dayTotal(d), 0)) || null), r2(x.reduce((s, d) => s + dayTotal(d), 0)), r2(x.reduce((s, d) => s + num(d.card), 0)) || null]); });
      const tot = ws.addRow(["Summe", "", ...places.map(p => r2(md.filter(d => d.place === p).reduce((s, d) => s + dayTotal(d), 0))), r2(md.reduce((s, d) => s + dayTotal(d), 0)), r2(md.reduce((s, d) => s + num(d.card), 0))]); tot.font = bold;
      const sp = monthSplit(pid, `${R.y}-${m}`);
      ws.addRow([]); ws.addRow(["USt laut Monatsbericht der Kasse"]).font = bold;
      sp.forEach(x => ws.addRow([`${x.rate} %`, "", r2(x.gross), "brutto", r2(x.gross / (1 + x.rate / 100)), "netto"]));
      ws.columns.forEach((c, k) => { c.width = k === 0 ? 12 : k === 1 ? 6 : 13; if (k >= 2) c.numFmt = eur; }); ws.getColumn(1).numFmt = "dd.mm.yyyy";
      sumSheet.addRow([mn, ...places.map(p => r2(md.filter(d => d.place === p).reduce((s, d) => s + dayTotal(d), 0))), r2(md.reduce((s, d) => s + dayTotal(d), 0)), ...prof(pid).rates.map(r => sp.find(x => x.rate === r)?.gross || null)]);
    });
    sumSheet.columns.forEach((c, k) => { c.width = k === 0 ? 12 : 14; if (k) c.numFmt = eur; });
    const buf = await wb.xlsx.writeBuffer();
    saveFile(`Wochenmarktumsaetze_${R.y}.xlsx`, new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  });
}
