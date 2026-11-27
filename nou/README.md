# Contabilitate privată – versiunea nouă

Adresa: https://app.sidor-digital.de/nou/ (aplicația veche de la https://app.sidor-digital.de rămâne neschimbată)

Scrisă de la zero, fără pas de construire (module JavaScript simple). Refolosește din aplicația veche doar motoarele
`../cp-core.js` (sincronizare criptată Google Drive / OneDrive / WebDAV, citirea jurnalului Bizerba) și `../cp-scan.js`
(citirea pozelor pe dispozitiv, fără internet), plus `../vendor/` (jsPDF, ExcelJS).

## Ce face
- Facturi (DE / AT cu numere fiscale separate), Storno conform GoBD, plăți parțiale, PDF, E-Rechnung XRechnung 3.0 (CII), trimitere la client
- Lieferscheine → factură
- Facturi primite și cheltuieli: scanare din poză, citirea facturilor electronice (XRechnung / ZUGFeRD / UBL), „De plătit”, mai multe cote TVA
- Casă și piețe: zile de casă (Z, numărat, fond de casă, bacșiș), raport lunar TVA, import Bizerba, registru de casă (Kassenbuch) cu sold
- Inventar: stoc din facturi de marfă, Z-uri, facturi, Lieferscheine; inventariere; producție proprie
- DATEV: Upload Mail (Gmail automat / aplicația de e-mail / descărcare), export Buchungsstapel EXTF 700 (SKR03 / SKR04, Ist sau OPOS), casa separat, închiderea lunii
- Documente: arhivă cu starea fiecărui document (trimis / netrimis / fără fișier), verificarea lunii pentru contabil
- Rapoarte: rezultat (EÜR), UStVA / UVA, Excel „Wochenmarktumsätze”
- Mutarea datelor din aplicația veche (din același browser sau din backup)

## Fișiere
- `index.html`, `app.css`, `sw.js`, `manifest.webmanifest`
- `js/state.js` date · `js/store.js` salvare + sincronizare · `js/model.js` calcule · `js/datev.js` · `js/erechnung.js` · `js/pdf.js` · `js/mail.js` · `js/belege.js` · `js/migrate.js` · `js/backup.js` · `js/scan.js`
- `js/views/*.js` ecranele
- `tests/` teste: `node --test nou/tests/model.test.mjs`

## Gmail pentru DATEV Upload Mail
În proiectul Google Cloud „Contabilitate privata” trebuie pornit o dată **Gmail API** și adăugat scope-ul `gmail.send` la ecranul de consimțământ OAuth.
