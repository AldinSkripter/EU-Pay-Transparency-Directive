# Pay: pregled uvoza DE / AT / SI

Provjereno 15.11.2026. **Ne postoji potvrda da prihvatamo sve izvoze svih programa.** Prepoznavanje CSV/Excel formata ne dokazuje da izvoz sadrži sva potrebna polja, ispravno razdoblje ili značenje platnih šifri. Direktni vendor konektori nisu implementirani ovom izmjenom.

| Program | Šta potvrđuje službena dokumentacija | Status kod nas |
|---|---|---|
| Personio | [Preliminarni payroll Excel](https://support.personio.de/hc/en-us/articles/115003457605-The-monthly-payroll-process-in-Personio), [izvještaji Excel/CSV](https://support.personio.de/hc/en-us/articles/15718133638685-Create-a-report) | Generički parser i ručno mapiranje; stvarni vendor izvoz nije end-to-end potvrđen. Preliminarni obračun nije dokaz konačno isplaćene godišnje plate. |
| Lexware lohn+gehalt | [ASCII i Excel interfejsi](https://shop.lexware.de/unternehmen/lohn-und-gehalt-abrechnen/lexware-lohn-gehalt) | Strukturirana tabela uz provjeru kolona; vendor-specifični rasporedi zahtijevaju uzorke. |
| DATEV Lohn und Gehalt | [Izvoz za poreznu provjeru uključuje DLS](https://www.datev.de/students/mod/resource/view.php?id=6309) | Pojedinačne tabele mogu se mapirati. Kompletan DLS paket sa povezanim datotekama nema poseban adapter i ne smije se oglašavati kao potpuno podržan. |
| SAP SuccessFactors | [CSV/TXT/XML i EDI/Stacked izlazi](https://help.sap.com/docs/successfactors-platform/using-integration-center) | CSV i tabelarni XML uz mapiranje. EDI/Stacked nije podržan. |
| RZL Lohn | [ASCII izlazi](https://hilfe.rzlsoftware.at/LOHN/Ausdrucke/Allgemeine_Informationen/), [opis izvoza](https://rzlsoftware.at/fileadmin/user_upload/PDF_Schnittstelle/RZL_LOHN_Import_Schnittstelle.pdf) | Delimited/fixed-width uz odgovarajuće zaglavlje i kodiranje; nije svaki raspored automatski prepoznat. |
| BMD NTCS | [Payroll izvještaji](https://www.bmd.com/at/das-ist-bmd/neuigkeiten/d/so-erstellen-sie-auswertungen-im-bmd-ntcs-lohn) | Tačan izvozni raspored i svi navedeni formati još nisu potvrđeni. Potreban stvarni izvoz za test. |
| PANTHEON | [Zaposleni i obračuni, Excel izvoz](https://www.datalab.si/katalog/zdruzen-izpis-o-zaposlenih-in-obracunu-plac/) | Excel uz mapiranje i provjeru kompletnosti. |
| Minimax | [Pregledi i izvozi plaća](https://help.minimax.si/help/place-pregledi-izpisi-in-izvozi), [Excel po redovima obračuna](https://help.minimax.si/help/dohodnina) | Excel uz mapiranje; porezni podaci po datumu isplate nisu automatski isto što i traženo referentno razdoblje. |
| Saop / iCenter | [Analiza obračuna s redovima u Excel](https://help.saop.si/help/nova-analiza-analiza-obracunov-z-obracunskimi-vrsticami) | Dodan vodič; Excel uz mapiranje i provjeru. |
| VASCO Plače | [DU izvoz u Excel](https://www.vasco.si/podpora/place/delovna-uspesnost-v-js-po-novem-modul-du-2026/) | Dodan vodič, ali dokumentovani djelimični izvještaj nije cijeli godišnji payroll. |
| HiBob, Workday, Sage, Birokrat, Factorial, rexx, PayFit | Postojeći generički vodiči nisu dokaz za svaki raspored/verziju izvoza. | Označeno kao nepotvrđen raspored; ne obećavati gotov konektor. |
| Drugi programi | Nema iscrpne liste svih postojećih proizvoda/verzija i njihovih privatnih formata. | Standardizovani CSV/XLSX predložak je zajednički ulaz; nestandardne datoteke trebaju uzorak i zaseban adapter. |

Nijedan vendor uzorak u ovoj provjeri nije označen kao end-to-end certificiran. Generisani testni fajlovi provjeravaju parser, sigurnosna ograničenja i tačne izračune; nisu zamjena za izvoz iz konkretnog programa.

## Stvarne granice

- Novi godišnji i mjesečni Pay upload: do **1 GiB** po datoteci, u provjerenim dijelovima od 4 MiB.
- Godišnji/HR ulaz: 10.000 zapisa i zasebna granica zaposlenih kupljenog paketa.
- Novi mjesečni uvoz CSV/JSON/XML/XLSX/ODS nema fiksnu softversku granicu od 500.000 redova ni raniju granicu od 128 MiB cijele parsirane tabele. Podaci se čuvaju u šifriranim blokovima, a produkcijski registar u pojedinačnim PostgreSQL zapisima. Ostaju granice datoteke, strukture, resursa servera i kupljenog broja zaposlenih.
- Veliki CSV, tabelarni UTF-8 JSON/XML, values-only XLSX/ODS koriste novi put. Stari XLS/HTML/fixed-width/SpreadsheetML iznad 20 MiB zahtijevaju konverziju. ZIP je odabir tabele, ne automatsko spajanje kompletnog DLS paketa.
- PDF platne liste, skenovi, slike, XLSB, EDI i proizvoljne binarne sigurnosne kopije nisu podržani Pay ulazi.
- API-key isporuke, austrijski dopunski CSV i Finance prilozi imaju posebne limite. Nisu svi podignuti na 1 GiB.

Ugrađeni su pojedinačni zapisi u bazi, obrada po blokovima i obračun bez učitavanja cijelog produkcijskog registra u memoriju. Prije produkcijskog pokretanja treba izvršiti migraciju baze 012. Lokalni MemoryStore je sintetički demo i svoje zapise zadržava u memoriji. **Ovo ne znači neograničen disk, memoriju ili podršku svakom privatnom formatu.** Legacy čitači i dalje imaju 20 MiB / 10.000 redova; za veće izvoze koristiti CSV ili direktni XLSX/ODS, a ne radnu svesku unutar generičkog ZIP-a. Prekoračenje resursa zaustavlja obradu, bez skraćivanja podataka.

Provjeren stvarni 1 GiB transport/parser test te **1.000.001 stavka za 1.000 zaposlenih**, iz datoteke od 197.782.162 bajta, kroz blokove, staging, klasifikaciju i tačne godišnje iznose/sate. Test obima koristi sintetički MemoryStore; zasebni PostgreSQL-engine testovi provjeravaju više blokova, rollback, izolaciju i kaskadno brisanje. HTTP testovi za DE/AT/SI porede svih sedam grupa EU pokazatelja s nezavisno pripremljenim godišnjim podacima i zadržavaju blokadu nepotvrđenog izvještaja. Vidi [arhitekturu](IMPORT-ENGINE.md) i [Flutter ugovor](app-dev/PAY-LARGE-UPLOADS.md).
