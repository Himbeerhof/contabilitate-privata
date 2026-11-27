// Citirea pozelor (Z-uri, facturi, Lieferscheine) direct pe dispozitiv, fără internet – motorul din ../cp-scan.js
import { S, list } from "./state.js";
import { productMatch, productByName } from "./model.js";
import { shrink } from "./views/common.js";

let mod = null;
const load = () => (mod ||= import("../../cp-scan.js"));
export const scanReady = () => load().then(m => m.ready ? m.ready() : true).catch(() => false);

/** kind: "z" (raport Z), "in" (factură furnizor), "ls" (Lieferschein), "old" (factură scrisă veche) */
export async function scan(kind, files, onStatus = () => {}) {
  const imgs = [];
  for (const f of files.filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name || "")).slice(0, 4)) imgs.push(await shrink(f, 2400, 0.9));
  if (!imgs.length) throw new Error("Alege o poză (JPG / PNG). Pentru PDF-uri cu factură electronică folosește „E-Rechnung”.");
  onStatus("Încarc cititorul (prima dată durează puțin)…");
  const m = await load();
  onStatus("Citesc documentul…");
  const productByArt = (art, name) => list("products").find(p => p.plu && String(p.plu) === String(art)) || productMatch(name);
  return m.extract(kind, imgs, {
    productByArt, productMatch: n => productMatch(n),
    customers: list("contacts").map(c => c.name).filter(Boolean),
    products: list("products").map(p => ({ name: p.name, unit: p.unit, alias: p.alias })),
    self: { name: S.settings.company.name, street: S.settings.company.street }
  });
}
export { productByName };
