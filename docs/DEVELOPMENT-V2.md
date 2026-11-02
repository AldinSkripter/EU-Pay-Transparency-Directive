# Development v2 — pregled implementacije

Osnova: korisnikova glavna specifikacija v2 i PDF `EU_Pay_Transparency_KOMPLETAN_Plan_Development_v2.pdf` (11 stranica, uključujući dodatke A–E). Pregled 02.11.2026. Dokumenti su zahtjevi proizvoda; pravni navodi iz njih nisu nezavisno potvrđeni ovim pregledom.

## Postojeća arhitektura

Zadržati React/Vite, modularni Express backend i PostgreSQL. Postoje javna stranica, tenant registracija i sesije, Google autentifikacija, zaseban vlasnički panel s MFA, Stripe checkout/webhook/portal, godišnji snimci podataka, kategorije s četiri kriterija, sedam grupa pokazatelja, pregled i potvrda snimka te PDF/CSV/XML/TXT izvoz. Memorijski način služi razvoju i gubi podatke restartom. Produkcijski servisi nisu potvrđeni ovim pregledom.

## Isporučeni korak: tekstualni importer

- Zaseban modul `server/importer.js`, zajednički za pregled i konačni unos.
- CSV/TXT/TSV: separator comma, semicolon, tab ili pipe, UTF-8 BOM, citirana polja i višeredne vrijednosti.
- Stroge kolone; prazna ili duplirana zaglavlja, nepravilan broj polja, binarni sadržaj, više od 10.000 redova ili 4 MB odbijaju se.
- DE/SL/EN prijedlozi polja; dvosmislene kolone i generičke bruto plate ne mapiraju se automatski u godišnju osnovnu naknadu. Potvrda kroz pregled ostaje korisnička odgovornost.
- Korisnik bira decimalni zarez ili tačku za cijeli unos. Hiljadarski separatori, miješani formati i naučna notacija blokiraju se umjesto nagađanja iznosa.
- Pregled do 30 redova, obavezno i jednoznačno mapiranje; neuspješan unos zadržava prethodni snimak.
- UTF-8, UTF-16 LE/BE uz BOM; eksplicitan izbor Windows-1250/1252 za stare izvoze. Kodiranje bez sigurnog signala ne nagađa se.
- XLSX/XLS: stvarni parser, izbor lista i reda zaglavlja, numeričke ćelije, odbijanje formula/makroa/linkova i ograničena dekompresija.
- XML: namespaces, atributi, ugniježđena polja i izbor putanje zapisa; zabrana DTD/XXE, ograničena dubina i broj elemenata.
- ImportBatch s checksumom datoteke, akterom, verzijom i potvrdom mapiranja; ponovno korištenje profila samo za istu firmu, godinu, državu i strukturu.
- Atomski upis snimka, profila, batcha i audita u PostgreSQL. Identičan ponovni import ne mijenja aktivni snimak ili potvrde.
- XLSX/JSON izvještaji uz postojeće formate, ograničeni prema primaocu; XLSX piše korisnički tekst kao string, bez formula.

### Odvajanje DE / AT / SI podataka

Importer prepoznaje DE/SL jezičke signale kao pomoć pri mapiranju. Njemački jezik nije dokaz da je datoteka iz Njemačke: isti jezik se koristi i u Austriji. Država izvještavanja ostaje država autentificirane firme, nezavisno od domene ili jezika kolona.

Prepoznate kolone za državu, valutu, godinu i period provjeravaju se za svaki red, na backendu i u pregledu. Eksplicitna država različita od firme, valuta različita od EUR, druga godina ili mjesečni period blokiraju godišnji unos. Neispravni unosi ne zamjenjuju prethodni snimak. Ovo nije provjera svih mogućih naziva metapodataka: nepoznate kolone još zahtijevaju pregled.

Kada period i valuta nisu u datoteci, UI prikazuje upozorenja i traži korisničku potvrdu mapiranja, EUR, godišnjih iznosa i sati. Potvrda se resetuje promjenom mapiranja ili decimalnog separatora. Upload datoteke zahtijeva backend potvrdu; akter i odobreno mapiranje čuvaju se uz ImportBatch. Stariji CSV API prihvata import akciju kao potvrdu radi kompatibilnosti.

Za numeričke kolone pregled predlaže decimalni separator prema vrijednostima. Miješani i nejasni formati prikazuju upozorenje; konačni parser prihvata samo izabrani format bez separatora hiljada. Oznake `weiblich/W`, `männlich`, `ženska/Ž` i `moški` normalizuju se bez zaključivanja iz imena. Generički bruto iznosi ostaju predmet pregleda osnovice i perioda.

API test sa sintetičkim podacima registruje tri odvojene firme DE/AT/SI, uvozi lokalizovane podatke, provjerava neuspješne pokušaje s pogrešnom državom/valutom/godinom i očuvanje snimka. Dodatno potvrđuje da slovenske kolone mogu pripadati DE izvještaju bez promjene države. To ne potvrđuje vendor kompatibilnost ili produkcijsku nacionalnu usklađenost.

### API ugovor ovog koraka

`POST /api/import/preview` prima tekst ili base64 datoteku uz opcije parsiranja i vraća pregled, izbor lista/putanje, prijedloge i sačuvani tenant profil. Potpun ugovor u [IMPORT-ENGINE.md](IMPORT-ENGINE.md).

`POST /api/import` prima isti izvor, mapiranje, decimalni separator i potvrdu. Vraća 201 za novi snimak ili 200 i `replayed:true` za identične aktivne podatke. `GET /api/import/history?year=2026` vraća historiju samo autentificirane firme.

## Preostali prioriteti

| Prioritet | Zahtjev | Stanje i kriterij završetka |
| --- | --- | --- |
| P0 | XLSX/XLS/XML | Implementirano i testirano sintetičkim fajlovima; preostaju stvarni anonimni vendor izvozi i dodatni profili |
| P0 | Sačuvani mapping i ImportBatch | Implementirano s migracijom 005 i atomskim upisom; preostaju izbor prethodne verzije profila i sigurna pohrana izvornog fajla |
| P0 | Transakcijski model | Postoje samo godišnji sažeci; dodati HR/payroll spajanje, 12 mjeseci, korekcije, valute, periode i klasifikaciju nepoznatih šifri |
| P0 | Registracija i prava | Dodati verifikaciju e-maila, MFA krajnjih korisnika, oporavak i timske uloge; odvojiti sjedište od reporting jurisdiction |
| P0 | Izvještaji | XLSX/JSON dodani s pravima primaoca; preostaju zaključane istorijske verzije workflowa i dostupna arhiva starih izvještaja |
| P0 | Paketi | Postojeća ponuda se razlikuje od predloženih pet paketa; uskladiti katalog, admin promjene cijena, Stripe cijene i kvote zajedno |
| P0 | Pravila i obračun | Postojeća radna metodologija zahtijeva nezavisne referentne obračune i lokalni pravni pregled prije komercijalnih tvrdnji |
| P0 | Operativa i GDPR | Provjeriti stvarni PostgreSQL/Stripe, enkripciju pohrane, retention/brisanje, backup i restore, ugovore i sigurnost |
| P1 | Napredni importer | ODS/JSON/ZIP i provjereni vendor profili; CP1250/1252 i UTF16 dodani. ASC/DAT/EXP samo za prepoznate tekstualne strukture |
| P0 | Direktiva izvan člana 9 | Članovi 5–7 važe za poslodavce svih veličina i prema pregledu 2.11.2026. (EUR-Lex tekst; Arbeiterkammer 10.7.2026. navodi da Austrija nije prenijela direktivu i da se ti članovi već direktno primjenjuju): evidencija zahtjeva radnika za informacije s rokom od dva mjeseca (čl. 7(4)), godišnja obavijest radnicima (čl. 7(3)), kriteriji plata dostupni radnicima (čl. 6), podatak o plati pri zapošljavanju (čl. 5), te arhiva izvještaja iz prethodne četiri godine na zahtjev (čl. 9(9)). Čl. 7 (zahtjevi, rok, odgovor, godišnja obavijest) i zajednička procjena iz čl. 10 su implementirani; ostaju čl. 5 i 6 |
| P1 | Lokalizacija | Postoje DE/SL; dodati EN i provjeriti pristupačnost kritičnih tokova |
| P2 | Integracije | DATEV/SAP/BMD/PANTHEON tek po stvarnim izvoznim primjerima i potvrđenim pravima pristupa |

## Sljedeći implementacijski paket

Sljedeći veliki paket je transakcijski model i registar šifri: nepoznata šifra mora blokirati odobrenje. Zatim mjesečni izvozi, korekcije, HR spajanje i puna sljedivost izvornog reda do rezultata. Trenutni importer očekuje godišnje sažetke i blokira eksplicitne mjesečne periode.

Potrebni vanjski dokazi: stvarni anonimni izvozi za provjeru kompatibilnosti, nezavisno izračunate reference, pravni pregled svake države i operativni pristup produkcijskim servisima. To nisu završene funkcije samo zato što postoje u specifikaciji.
