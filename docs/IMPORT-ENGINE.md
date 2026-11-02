# Import engine

## Upotreba

U report builderu odabrati datoteku ili zalijepiti CSV/TXT. Za Excel s više listova odabrati list i ponovno otvoriti pregled. Red zaglavlja je podesiv 1–50. Za XML s više mogućih skupova odabrati putanju zapisa. Pregledati mapiranje, decimalni format, državu, godinu i upozorenja, pa potvrditi unos. Potvrđeni profil automatski se učitava samo za isti tenant, godinu, državu i identičnu strukturu. Promijenjena zaglavlja, list ili XML namespace daju novi profil.

Podržani sadržaj: XLSX, OLE/BIFF XLS, XML s tabelarnim zapisima, delimited CSV/TXT/TSV. Ekstenzija ne određuje parser. Generički ZIP, ODS, PDF, proizvoljni binarni vendor formati i mjesečne transakcije nisu podržani ovim paketom. Nema tvrdnje kompatibilnosti s DATEV/BMD/PANTHEON bez stvarnih testnih izvoza.

## API

Sve rute zahtijevaju tenant sesiju; POST zahtijeva dozvoljeni Origin.

`POST /api/import/preview`

```json
{
  "file": {"name": "payroll.xlsx", "base64": "..."},
  "year": 2026,
  "sheet": "Payroll",
  "headerRow": 1,
  "recordPath": "payroll/employee",
  "encoding": "utf-8"
}
```

Umjesto `file`, može se poslati `csv` kao string. `sheet`, `headerRow`, `recordPath` i `encoding` su opcionalni. Kodiranje teksta: UTF-8, UTF-16 LE/BE s BOM; Windows-1250 i Windows-1252 isključivo eksplicitnim izborom. Decimalni format se ne izvodi iz države.

Pregled vraća `format`, `headers`, do 30 `rows`, ukupan `count`, `mapping`, `suggestions`, `context`, `contextErrors`, `fileHash` i eventualno `savedProfile`. Ako je potreban izbor, vraća `selectionRequired:true` uz `sheets` ili `recordPaths`; poslati ponovo s odabranom opcijom. Namespace ostaje dio putanje i strukturnog hasha. Lokalni nazivi polja koriste se samo za jednoznačne prijedloge.

`POST /api/import` prima isti payload uz `mapping`, `decimalSeparator` (`.` ili `,`) i `contextConfirmed:true`. Upload datoteke bez potvrde se odbija. Stariji tekstualni CSV API ostaje kompatibilan: eksplicitan import predstavlja potvrdu. Izvor se ponovo parsira i validira na backendu, bez povjerenja u raniji pregled.

Uspjeh: 201 uz `{snapshot:{id,count,year},replayed:false}`. Isti normalizovani podaci i odobrena konfiguracija na aktivnom snimku: 200 i `replayed:true`. Novi podaci kreiraju novi snimak; aktivni workflow mora proći ponovnu provjeru.

`GET /api/import/history?year=2026` vraća zadnjih 50 batchova samo te firme i godine. Ne vraća sirove datoteke ili izvorne identifikatore zaposlenih.

## Pohrana i migracija

Pokrenuti `npm run db:migrate`; migracija 005 dodaje `import_profiles` i `import_batches`. Profil sadrži kanonsko mapiranje, decimalnu konvenciju, kodiranje, potvrdu i aktera. Batch zadržava odobrenu verziju profila, checksum, fingerprint normalizovanih podataka i referencu na snimak. Prethodne odobrene mape ostaju u historiji batchova; UI za njihovo vraćanje nije implementiran.

PostgreSQL transakcija zajedno upisuje snimak, zaposlene, profil, batch i audit. Advisory lock serijalizuje konkurentne uvoze iste firme/godine. Greška vraća sve promjene. Memorijski razvojni store gubi podatke restartom. Izvorna datoteka se trenutno ne zadržava; njena šifrirana pohrana i retention ostaju zaseban zahtjev.

## Sigurnosne granice

- Najviše 4 MiB ulaznog fajla, 10.000 zapisa i 200 kolona.
- Do tri paralelna parser workera po procesu; 10 sekundi i V8 heap do 192 MiB po workeru. Native memorija biblioteka nije potpuno obuhvaćena V8 limitom; operativni limit procesa ostaje dio deploymenta.
- XLSX ZIP se pregleda prije SheetJS parsiranja: najviše 1.000 stavki i 32 MiB stvarno raspakovanih podataka. Bez ekstrakcije na filesystem. Odbijaju se šifrirane arhive, neispravne putanje, symlinkovi, VBA, vanjske workbook veze i embedded objekti.
- Formule, array formule i linkovi u učitanim ćelijama se odbijaju; formule se nikada ne izvršavaju. Za Excel tražiti values-only izvoz.
- XML: Saxes parser bez učitavanja mrežnih izvora; DTD/ENTITY zabranjeni, dubina do 24, do 200.000 elemenata. Nema tvrdnje XSD verifikacije.
- Učitani sadržaj se ne šalje vanjskom AI-u. Logovi ne trebaju sadržavati payroll vrijednosti.
- Država dolazi iz tenant sesije. Jezik kolona ne mijenja jurisdikciju. Neprepoznate kolone i platne šifre još zahtijevaju dodatnu obradu, a ne automatsku klasifikaciju.

## Provjera

`npm test` uključuje stvarno generisane XLSX/XLS fajlove, XML s namespaceovima/atributima, stare kodne stranice, zabranu formula/makroa/XXE i DE/AT/SI API tok do XLSX/JSON izvještaja. PGlite test izvršava migracije i PostgresStore SQL na PostgreSQL WASM motoru, provjerava rollback i ponovno otvaranje trajne baze. To ne zamjenjuje test native PostgreSQL veze: za njega podesiti `POSTGRES_TEST_URL`.

Biblioteke: [SheetJS službena Node distribucija](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) i [Saxes dokumentacija](https://github.com/lddubeau/saxes). Verzije su zaključane u package-lock.json.
