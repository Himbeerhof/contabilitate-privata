// Date de test: o firmă, un client și facturi tipice
const SETTINGS = { name: "Himbeerhof Test", owner: "Ion Test", street: "Hauptstr. 1", zip: "88099", city: "Neukirch", country: "Deutschland",
  phone: "+49 7528 1234", email: "hof@example.de", iban: "DE02120300000000202051", bic: "BYLADEM1001", holder: "Ion Test", bank: "Testbank",
  profiles: { de: { taxNo: "12/345/67890", vatId: "DE123456789", vatRates: "7; 19; 0", defaultVat: 7, prefix: "RE", reStart: 1 },
              at: { taxNo: "", vatId: "ATU12345678", vatRates: "10; 13; 20; 0", defaultVat: 10, prefix: "RE-AT", reStart: 1 } } };
const CUSTOMER = { id: "c1", name: "Obst Großhandel GmbH", address: "Marktplatz 5\n88212 Ravensburg", number: "K-1001", vatId: "DE987654321", email: "rechnung@obst.example", buyerRef: "04011000-12345-34", profileId: "de" };
const inv = (o = {}) => ({ id: "i" + Math.random().toString(36).slice(2), profileId: "de", number: "RE-2026-001", date: "2026-07-15", serviceDate: "", dueDate: "2026-07-29", paidDate: "",
  status: "open", lang: "de", kleinunternehmer: false, currency: "EUR", customerId: "c1",
  customer: { name: CUSTOMER.name, address: CUSTOMER.address, number: CUSTOMER.number, vatId: CUSTOMER.vatId, email: CUSTOMER.email, buyerRef: CUSTOMER.buyerRef },
  items: [{ date: "2026-07-10", desc: "Himbeeren", count: "40", per: "2,5", qty: "100", unit: "kg", price: "6,45", vat: "7", ls: "2026-12" },
          { date: "2026-07-12", desc: "Holzkisten", qty: "3", unit: "Stk.", price: "4,20", vat: "19" }],
  intro: "", notes: "", ...o });
module.exports = { SETTINGS, CUSTOMER, inv };
