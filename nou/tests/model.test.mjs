// Teste: node --test nou/tests/   (fără browser)
import test from "node:test";
import assert from "node:assert/strict";
import { S, resetState } from "../js/state.js";
import * as M from "../js/model.js";
import { datevCsv, COLS } from "../js/datev.js";
import { xrechnung } from "../js/erechnung.js";
import { convert, splitAddress } from "../js/migrate.js";
import { num, r2 } from "../js/util.js";

function seed() {
  resetState();
  S.settings.company = { name: "Hof", street: "Str 1", zip: "88099", city: "Neukirch", email: "a@b.de", phone: "1", country: "DE" };
  S.settings.bank.iban = "DE89370400440532013000"; S.settings.profiles.de.taxNo = "12/345/67890";
  S.invoices.i1 = { id: "i1", pid: "de", no: "RE-2026-001", date: "2026-11-02", due: "2026-11-16", status: "final", to: { name: "Kunde", zip: "1", city: "X", email: "k@x.de" },
    items: [{ name: "Himbeeren", qty: 10, unit: "kg", price: 8.5, vat: 7 }, { name: "Kiste", qty: 2, unit: "Stk.", price: 1.25, vat: 19 }], payments: [{ date: "2026-11-20", amount: 93.93, method: "bank" }] };
  S.purchases.p1 = { id: "p1", pid: "de", supplier: "Telekom", date: "2026-11-05", cat: "office", splits: [{ rate: 19, gross: 59.5 }], payments: [{ date: "2026-11-07", amount: 59.5, method: "bank" }] };
  S.cashdays.d1 = { id: "d1", pid: "at", date: "2026-11-03", place: "Bregenz", cash: 800, card: 200 };
  S.cashmonths["at-2026-11"] = { id: "at-2026-11", pid: "at", month: "2026-11", split: { 10: 900, 20: 100 } };
}

test("numere scrise ca în Germania", () => {
  assert.equal(num("1.234,56"), 1234.56); assert.equal(num("12,5"), 12.5); assert.equal(num("1.000"), 1000); assert.equal(num("-3,20 €"), -3.2);
  assert.equal(r2(1.005), 1.01); assert.equal(r2(-1.005), -1.01);
});
test("factura: totaluri pe cote și stare", () => {
  seed(); const c = M.calcInvoice(S.invoices.i1);
  assert.equal(c.net, 87.5); assert.equal(c.vat, 6.43); assert.equal(c.gross, 93.93); assert.equal(M.invState(S.invoices.i1), "paid");
});
test("numerotare continuă", () => { seed(); assert.equal(M.nextInvoiceNo("2026-12-01", "de"), "RE-2026-002"); });
test("casa: împărțire pe cote după raportul lunar și scoaterea până la fond", () => {
  seed(); const sp = M.daySplit(S.cashdays.d1); assert.deepEqual(sp.parts, [{ rate: 10, gross: 900 }, { rate: 20, gross: 100 }]);
  const b = M.cashBook("at", "2026-11-01", "2026-11-30"); assert.equal(b.end, 362.9); assert.equal(b.rows.find(r => r.auto).amount, -800);
});
test("TVA DE (UStVA)", () => {
  seed(); const v = M.vatReport("de", "2026-11-01", "2026-11-30"), kz = Object.fromEntries(v.kz.filter(k => k[0]).map(k => [k[0], k[2]]));
  assert.equal(kz["86"], 85); assert.equal(kz["81"], 2.5); assert.equal(kz["66"], 9.5); assert.equal(kz["83"], r2(6.43 - 9.5));
});
test("DATEV: antet EXTF, 125 coloane, conturi automate fără cheie BU", () => {
  seed(); assert.equal(COLS.length, 125);
  const r = datevCsv({ pid: "de", from: "2026-11-01", to: "2026-11-30" }), txt = new TextDecoder("latin1").decode(r.bytes).split("\r\n");
  assert.match(txt[0], /^"EXTF";700;21;"Buchungsstapel";13;/); assert.equal(txt[1].split(";").length, 125); assert.equal(txt[2].split(";").length, 125);
  const rows = r.rows.map(x => [x.konto, x.gegen, x.bu, x.sh, x.amt].join("|"));
  assert.ok(rows.includes("1200|8300||S|90.95")); assert.ok(rows.includes("1200|4920|9|H|59.5"));
});
test("XRechnung: sume și elemente obligatorii", () => {
  seed(); const x = xrechnung(S.invoices.i1);
  assert.match(x, /xrechnung_3\.0/); assert.match(x, /<ram:GrandTotalAmount>93\.93</); assert.match(x, /<ram:DuePayableAmount>0\.00</); assert.match(x, /schemeID="FC">12\/345\/67890/);
  assert.match(x, /<ram:BasisAmount>85\.00<\/ram:BasisAmount><ram:CategoryCode>S<\/ram:CategoryCode><ram:RateApplicablePercent>7\.00/);
});
test("mutarea datelor vechi", () => {
  assert.deepEqual(splitAddress("Seestraße 5\n88045 Friedrichshafen\nDeutschland"), { street: "Seestraße 5", zip: "88045", city: "Friedrichshafen", country: "DE", name2: "" });
  const { data } = convert({ settings: { name: "Hof", profiles: { de: { vatRates: "7; 19; 0", prefix: "RE" } } },
    invoices: { a: { id: "a", number: "RE-2026-001", date: "2026-10-01", status: "paid", paidDate: "2026-10-05", customer: { name: "K" }, items: [{ desc: "X", qty: "2,5", price: "4", vat: "7" }] } },
    cash: { k: { id: "k", date: "2026-10-02", cash: "100,50", profileId: "at" } }, deposits: { d: { id: "d", date: "2026-10-03", amount: "50" } } });
  assert.equal(data.invoices.a.payments[0].amount, 10.7); assert.equal(data.cashdays.k.cash, 100.5); assert.equal(data.cashmoves.d.type, "tobank"); assert.equal(data.settings.cash.skim, "none");
});
