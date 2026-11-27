// E-Rechnung: XRechnung 3.0 (sintaxa CII) pentru facturile scrise + citirea facturilor electronice primite (CII / UBL)
import { S, prof, pidOf } from "./state.js";
import { calcInvoice, lineNet } from "./model.js";
import { r2, num, fmtDate, parseDate } from "./util.js";

const x = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const a2 = n => r2(n).toFixed(2);
const a4 = n => (Math.round((Number(n) || 0) * 10000) / 10000).toString();
const d102 = iso => String(iso || "").replace(/-/g, "");
const UNIT = { kg: "KGM", "Stk.": "H87", l: "LTR", Kiste: "XBX", Schale: "XPU", Bund: "XBH", Glas: "XGR", Palette: "XPX", g: "GRM", t: "TNE", h: "HUR" };
const cat = (rate, small) => small ? "E" : rate > 0 ? "S" : "Z";

/** Ce lipsește ca factura să poată fi E-Rechnung validă */
export function eInvoiceProblems(inv) {
  const st = S.settings, P = prof(pidOf(inv)), to = inv.to || {}, p = [];
  if (!st.company.name) p.push("numele firmei tale (Setări)");
  if (!st.company.street || !st.company.zip || !st.company.city) p.push("adresa firmei tale completă");
  if (!st.company.email) p.push("e-mailul firmei tale");
  if (!st.company.phone) p.push("telefonul firmei tale");
  if (!P.vatId && !P.taxNo) p.push(`Steuernummer sau USt-IdNr. la profilul ${P.label}`);
  if (!st.bank.iban) p.push("IBAN-ul tău (Setări → Bancă)");
  if (!to.name) p.push("numele clientului");
  if (!to.zip || !to.city) p.push("codul poștal și orașul clientului");
  if (!to.email) p.push("e-mailul clientului");
  return p;
}

export function xrechnung(inv) {
  const st = S.settings, pid = pidOf(inv), P = prof(pid), c = calcInvoice(inv), to = inv.to || {}, co = st.company;
  const credit = inv.type === "storno" || inv.type === "credit" || c.gross < 0, sg = credit ? -1 : 1;
  const items = (inv.items || []).filter(i => num(i.qty) || num(i.price));
  const dates = items.map(i => i.date).filter(Boolean).sort();
  const lines = items.map((it, k) => {
    const rate = inv.small ? 0 : num(it.vat), q = num(it.qty) * sg, pr = num(it.price);
    const bq = pr < 0 ? -q : q, price = Math.abs(pr), tot = r2(lineNet(it) * sg);
    return `<ram:IncludedSupplyChainTradeLineItem>
<ram:AssociatedDocumentLineDocument><ram:LineID>${k + 1}</ram:LineID>${it.ls ? `<ram:IncludedNote><ram:Content>Lieferschein ${x(it.ls)}${it.date ? " vom " + fmtDate(it.date) : ""}</ram:Content></ram:IncludedNote>` : it.date ? `<ram:IncludedNote><ram:Content>Lieferung ${fmtDate(it.date)}</ram:Content></ram:IncludedNote>` : ""}</ram:AssociatedDocumentLineDocument>
<ram:SpecifiedTradeProduct><ram:Name>${x([it.name, it.hkl ? "Kl. " + it.hkl : ""].filter(Boolean).join(" "))}</ram:Name></ram:SpecifiedTradeProduct>
<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${a4(price)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${UNIT[it.unit] || "H87"}">${a4(bq)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
<ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat(rate, inv.small)}</ram:CategoryCode><ram:RateApplicablePercent>${a2(rate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${a2(tot)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement>
</ram:IncludedSupplyChainTradeLineItem>`;
  }).join("\n");
  const addr = (o, country) => `<ram:PostalTradeAddress><ram:PostcodeCode>${x(o.zip)}</ram:PostcodeCode>${o.street ? `<ram:LineOne>${x(o.street)}</ram:LineOne>` : ""}<ram:CityName>${x(o.city)}</ram:CityName><ram:CountryID>${x(country || "DE")}</ram:CountryID></ram:PostalTradeAddress>`;
  const taxes = c.vats.map(v => `<ram:ApplicableTradeTax><ram:CalculatedAmount>${a2(v.tax * sg)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${inv.small ? `<ram:ExemptionReason>${pid === "at" ? "Kleinunternehmer gemäß § 6 Abs. 1 Z 27 UStG" : "Kleinunternehmer gemäß § 19 UStG"}</ram:ExemptionReason>` : ""}<ram:BasisAmount>${a2(v.base * sg)}</ram:BasisAmount><ram:CategoryCode>${cat(v.rate, inv.small)}</ram:CategoryCode><ram:RateApplicablePercent>${a2(inv.small ? 0 : v.rate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`).join("");
  const paidAmt = r2((inv.payments || []).reduce((s, p) => s + num(p.amount), 0) * sg), due = r2(c.gross * sg - (credit ? 0 : paidAmt));
  const notes = [];
  if (inv.small) notes.push(pid === "at" ? "Umsatzsteuerbefreit – Kleinunternehmer gemäß § 6 Abs. 1 Z 27 UStG." : "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.");
  if (P.p24 && pid === "de" && !inv.small) notes.push("Durchschnittssatz gemäß § 24 UStG.");
  if (inv.note) notes.push(inv.note);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocumentContext>
<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>
<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
</rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument><ram:ID>${x(inv.no)}</ram:ID><ram:TypeCode>${credit ? 381 : 380}</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">${d102(inv.date)}</udt:DateTimeString></ram:IssueDateTime>${notes.map(n => `<ram:IncludedNote><ram:Content>${x(n)}</ram:Content></ram:IncludedNote>`).join("")}</rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
${lines}
<ram:ApplicableHeaderTradeAgreement>
<ram:BuyerReference>${x(to.leitweg || inv.orderRef || to.no || inv.no)}</ram:BuyerReference>
<ram:SellerTradeParty><ram:Name>${x(co.name)}</ram:Name><ram:DefinedTradeContact><ram:PersonName>${x(co.owner || co.name)}</ram:PersonName><ram:TelephoneUniversalCommunication><ram:CompleteNumber>${x(co.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication><ram:EmailURIUniversalCommunication><ram:URIID>${x(co.email)}</ram:URIID></ram:EmailURIUniversalCommunication></ram:DefinedTradeContact>
${addr(co, co.country || P.country)}<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${x(co.email)}</ram:URIID></ram:URIUniversalCommunication>${P.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${x(P.vatId.replace(/\s/g, ""))}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}${P.taxNo ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${x(P.taxNo)}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}</ram:SellerTradeParty>
<ram:BuyerTradeParty>${to.no ? `<ram:ID>${x(to.no)}</ram:ID>` : ""}<ram:Name>${x(to.name)}</ram:Name>${addr(to, to.country || P.country)}${to.email ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${x(to.email)}</ram:URIID></ram:URIUniversalCommunication>` : ""}${to.vatId ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${x(to.vatId.replace(/\s/g, ""))}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}</ram:BuyerTradeParty>
</ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery><ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${d102(inv.serviceTo || dates[dates.length - 1] || inv.date)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent></ram:ApplicableHeaderTradeDelivery>
<ram:ApplicableHeaderTradeSettlement>
${inv.no ? `<ram:PaymentReference>${x(inv.no)}</ram:PaymentReference>` : ""}<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${x((st.bank.iban || "").replace(/\s/g, ""))}</ram:IBANID>${st.bank.holder ? `<ram:AccountName>${x(st.bank.holder)}</ram:AccountName>` : ""}</ram:PayeePartyCreditorFinancialAccount>${st.bank.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${x(st.bank.bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}</ram:SpecifiedTradeSettlementPaymentMeans>
${taxes}
${dates.length > 1 || inv.serviceFrom ? `<ram:BillingSpecifiedPeriod><ram:StartDateTime><udt:DateTimeString format="102">${d102(inv.serviceFrom || dates[0])}</udt:DateTimeString></ram:StartDateTime><ram:EndDateTime><udt:DateTimeString format="102">${d102(inv.serviceTo || dates[dates.length - 1])}</udt:DateTimeString></ram:EndDateTime></ram:BillingSpecifiedPeriod>` : ""}
<ram:SpecifiedTradePaymentTerms><ram:Description>${x(inv.due ? `Zahlbar bis ${fmtDate(inv.due)} ohne Abzug.` : "Zahlbar sofort ohne Abzug.")}</ram:Description>${inv.due && !credit ? `<ram:DueDateDateTime><udt:DateTimeString format="102">${d102(inv.due)}</udt:DateTimeString></ram:DueDateDateTime>` : ""}</ram:SpecifiedTradePaymentTerms>
<ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>${a2(c.net * sg)}</ram:LineTotalAmount><ram:TaxBasisTotalAmount>${a2(c.net * sg)}</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">${a2(c.vat * sg)}</ram:TaxTotalAmount><ram:GrandTotalAmount>${a2(c.gross * sg)}</ram:GrandTotalAmount>${!credit && paidAmt ? `<ram:TotalPrepaidAmount>${a2(paidAmt)}</ram:TotalPrepaidAmount>` : ""}<ram:DuePayableAmount>${a2(due)}</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
${inv.refNo ? `<ram:InvoiceReferencedDocument><ram:IssuerAssignedID>${x(inv.refNo)}</ram:IssuerAssignedID>${inv.refDate ? `<ram:FormattedIssueDateTime><qdt:DateTimeString format="102">${d102(inv.refDate)}</qdt:DateTimeString></ram:FormattedIssueDateTime>` : ""}</ram:InvoiceReferencedDocument>` : ""}
</ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

/* ---------- facturi electronice primite ---------- */
/** Citește XRechnung / ZUGFeRD (CII) sau UBL. Returnează datele pentru „factură primită”. */
export function parseEInvoice(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Fișierul XML nu poate fi citit.");
  const L = n => n?.localName;
  const all = (root, name) => [...root.getElementsByTagNameNS("*", name)];
  const one = (root, path) => { let cur = [root]; for (const p of path.split("/")) { cur = cur.flatMap(c => [...c.children].filter(k => L(k) === p)); if (!cur.length) return null; } return cur[0]; };
  const txt = (root, path) => one(root, path)?.textContent.trim() || "";
  const dt = s => { s = String(s || "").trim(); return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : parseDate(s); };
  const root = doc.documentElement;
  if (L(root) === "CrossIndustryInvoice") {
    const tr = one(root, "SupplyChainTradeTransaction"), ag = one(tr, "ApplicableHeaderTradeAgreement"), se = one(tr, "ApplicableHeaderTradeSettlement");
    const seller = one(ag, "SellerTradeParty"), sum = one(se, "SpecifiedTradeSettlementHeaderMonetarySummation");
    const splits = all(se, "ApplicableTradeTax").filter(t => t.parentElement === se).map(t => ({ rate: num(txt(t, "RateApplicablePercent")), gross: r2(num(txt(t, "BasisAmount")) + num(txt(t, "CalculatedAmount"))) }));
    const items = all(tr, "IncludedSupplyChainTradeLineItem").map(li => ({ name: txt(li, "SpecifiedTradeProduct/Name"), qty: num(txt(li, "SpecifiedLineTradeDelivery/BilledQuantity")), unit: ({ KGM: "kg", H87: "Stk.", C62: "Stk.", LTR: "l", XBX: "Kiste" })[one(li, "SpecifiedLineTradeDelivery/BilledQuantity")?.getAttribute("unitCode")] || "Stk.",
      price: num(txt(li, "SpecifiedLineTradeAgreement/NetPriceProductTradePrice/ChargeAmount")), total: num(txt(li, "SpecifiedLineTradeSettlement/SpecifiedTradeSettlementLineMonetarySummation/LineTotalAmount")), vat: num(txt(li, "SpecifiedLineTradeSettlement/ApplicableTradeTax/RateApplicablePercent")) }));
    return { format: "CII", supplier: txt(seller, "Name"), vatId: all(seller, "ID").find(i => i.getAttribute("schemeID") === "VA")?.textContent.trim() || "",
      docNo: txt(root, "ExchangedDocument/ID"), date: dt(txt(root, "ExchangedDocument/IssueDateTime/DateTimeString")), due: dt(txt(se, "SpecifiedTradePaymentTerms/DueDateDateTime/DateTimeString")),
      iban: all(se, "IBANID")[0]?.textContent.trim() || "", gross: num(txt(sum, "GrandTotalAmount")), due_amount: num(txt(sum, "DuePayableAmount")), splits, items, credit: txt(root, "ExchangedDocument/TypeCode") === "381" };
  }
  if (L(root) === "Invoice" || L(root) === "CreditNote") {
    const sp = one(root, "AccountingSupplierParty/Party"), lm = one(root, "LegalMonetaryTotal");
    const splits = all(one(root, "TaxTotal") || root, "TaxSubtotal").map(t => ({ rate: num(txt(t, "TaxCategory/Percent")), gross: r2(num(txt(t, "TaxableAmount")) + num(txt(t, "TaxAmount"))) }));
    const items = all(root, L(root) === "Invoice" ? "InvoiceLine" : "CreditNoteLine").map(li => ({ name: txt(li, "Item/Name"), qty: num(txt(li, L(root) === "Invoice" ? "InvoicedQuantity" : "CreditedQuantity")), unit: "Stk.", price: num(txt(li, "Price/PriceAmount")), total: num(txt(li, "LineExtensionAmount")), vat: num(txt(li, "Item/ClassifiedTaxCategory/Percent")) }));
    return { format: "UBL", supplier: txt(sp, "PartyLegalEntity/RegistrationName") || txt(sp, "PartyName/Name"), vatId: txt(sp, "PartyTaxScheme/CompanyID"),
      docNo: txt(root, "ID"), date: dt(txt(root, "IssueDate")), due: dt(txt(root, "DueDate") || txt(root, "PaymentMeans/PaymentDueDate")), iban: txt(root, "PaymentMeans/PayeeFinancialAccount/ID"),
      gross: num(txt(lm, "TaxInclusiveAmount")), due_amount: num(txt(lm, "PayableAmount")), splits, items, credit: L(root) === "CreditNote" };
  }
  throw new Error("Nu e o factură electronică (XRechnung / ZUGFeRD / UBL).");
}

/** Caută XML-ul ZUGFeRD/Factur-X atașat într-un PDF (fișiere încorporate necomprimate sau FlateDecode) */
export async function xmlFromPdf(blob) {
  const u8 = new Uint8Array(await blob.arrayBuffer()), s = new TextDecoder("latin1").decode(u8);
  const direct = s.match(/<\?xml[\s\S]*?<\/(rsm:)?CrossIndustryInvoice>/); if (direct) return direct[0];
  if (!/EmbeddedFile/.test(s) || typeof DecompressionStream === "undefined") return null;
  const re = /\/Type\s*\/EmbeddedFile[\s\S]*?stream\r?\n/g; let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length, end = s.indexOf("endstream", start); if (end < 0) continue;
    const dict = s.slice(m.index, start);
    const bytes = u8.slice(start, end);
    try {
      let out = bytes;
      if (/FlateDecode/.test(dict)) out = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
      const t = new TextDecoder("utf-8").decode(out); if (/CrossIndustryInvoice|<Invoice/.test(t)) return t.slice(t.indexOf("<"));
    } catch (e) { /* încearcă următorul */ }
  }
  return null;
}
