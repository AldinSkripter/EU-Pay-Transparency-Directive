# Import engine

## Upotreba

U report builderu odabrati datoteku ili zalijepiti CSV/TXT. Za Excel s više listova odabrati list i ponovno otvoriti pregled. Red zaglavlja je podesiv 1–50. Za XML s više mogućih skupova odabrati putanju zapisa. Pregledati mapiranje, decimalni format, državu, godinu i upozorenja, pa potvrditi unos. Potvrđeni profil automatski se učitava samo za isti tenant, godinu, državu i identičnu strukturu. Promijenjena zaglavlja, list ili XML namespace daju novi profil.

Podržani sadržaj (ponovo provjereno 3.11.2026.): XLSX, OLE/BIFF XLS, ODS, Excel 2003 XML, XML s tabelarnim zapisima, JSON, HTML tabele, razdvojeni CSV/TXT/TSV i prepoznatljive tekstualne tabele fiksne širine (npr. ASC/DAT/LST/PRN). Podržan je ZIP kao kontejner podržanih datoteka uz izbor datoteke kada ih ima više. Ekstenzija ne određuje parser i proizvoljna datoteka s tim nastavkom nije automatski podržana. XLSB, PDF, skenirani dokumenti, proizvoljni binarni vendor formati i mjesečne transakcije kroz ovaj godišnji importer nisu podržani. Poseban payroll ledger postoji odvojeno. Nema tvrdnje pune kompatibilnosti s DATEV/BMD/PANTHEON bez stvarnih testnih izvoza.

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

## Current upload architecture (15 November 2026)

The Pay annual-file and monthly-payroll screens use authenticated chunk uploads, not base64. Maximum source size: **1 GiB (1,073,741,824 bytes)**, in 4 MiB chunks with SHA-256 validation and idempotent retries. Filename/size do not establish resume identity: previous chunks are checked again against the selected file. Source chunks, job metadata and parsed results are AES-256-GCM encrypted with company/job-bound associated data. Tenant access is enforced before reading, processing or deleting.

A single background worker per server process parses queued uploads. It has a ten-minute deadline and a 768 MiB V8 old-generation limit (not a total process memory guarantee). CSV, tabular UTF-8 JSON/XML, XLSX and ODS have streaming/file-backed readers; spreadsheet values must be formula-free. Monthly transactions are emitted into encrypted pages of at most 1,000 records / about 1 MiB (a single record may be up to 2 MiB). The result manifest contains a 30-record preview, total count and authenticated page references; it never contains the entire large transaction table. CSV text encoding is selectable. Legacy XLS, HTML, fixed-width text and SpreadsheetML retain the bounded 20 MiB / 10,000-record reader and require CSV/XLSX conversion for larger imports. The same fallback applies to small workbooks inside a generic ZIP container; upload the XLSX/ODS itself for the scalable path. PDF, scans, XLSB and arbitrary vendor binary backups are not Pay inputs. ZIP containers require explicit entry selection when ambiguous; nested ZIP containers are not supported. ZIP metadata limits: 1,000 entries and 4 GiB declared expanded size. Shared strings remain bounded to 64 MiB, with 200 columns and 1 MiB per structured cell. The 128 MiB materialized-result guard remains for non-paged/legacy paths; it does not cap the paged monthly transaction result.

Annual/HR files: up to 10,000 data records, with employee subscription limits still enforced. The scalable monthly transaction path and normalized annual ledger have **no fixed software limit on the number of transaction rows**. Values-only CSV/JSON/XML/XLSX/ODS use this path. XLSX's own worksheet dimensions still apply. File size, disk, worker time/memory and structural guards still apply; this is not unlimited physical capacity. No truncation is allowed. A malformed final record blocks the entire selected file. An archive is a container, not an automatic merge of every entry.

## PostgreSQL records and annual calculation

Run `npm run db:migrate` before deploying: migration 012 adds `payroll_records`, keyed by company, year, record kind and pseudonymous key, with a cascading foreign key to the yearly ledger. Transactions are inserted and read in batches of 1,000. Existing JSON ledgers migrate transactionally on the next staging/approval operation. The ledger JSON becomes a small manifest containing classifications and a chained revision digest, not every salary entry.

Staging holds the yearly ledger lock and the same advisory lock as retention deletion, validates every page and commits rows, revision and audit together. Any invalid row, conflicting duplicate, missing/corrupted page or changed ledger version rolls back the selected file completely. Existing successful files in a multi-file batch remain committed. Repeated identical imports do not create another revision. Explicit edits are logged by count/hash within this transaction. Finalization retains optimistic version checks and the existing atomic snapshot creation.

Annual calculation streams indexed rows and accumulates only per-employee totals and monthly coverage/hours. It verifies correction references through indexed lookups. Amounts are integer cents, with explicit overflow rejection. Calculation semantics match the earlier reference implementation: ordinary/variable/excluded codes, paid hours counted once per employee/month, missing months and unresolved classifications block readiness. A small revision-keyed cache contains at most five calculations; retention deletion clears that company's year cache. MemoryStore is a synthetic demo/test implementation and retains its normalized records in memory; production uses PostgreSQL.

No report template, Article 9 indicator definition, Article 10 assessment or management/representative approval requirement is weakened by this storage change. A paged transaction manifest cannot be passed to the annual importer as though its preview were a complete annual table. Country-specific report language and existing export readiness checks remain in force.

After parsing, existing country/year/EUR checks, column mapping, explicit data-quality corrections and confirmation apply. Annual-import suggestions do not silently change salaries, hours or categories. Monthly payroll allows up to 500 explicit edits by parsed record number and mapped field, including records beyond the preview or first page. Original rows remain unchanged; corrected copies are revalidated. No row-removal operation is offered by the monthly editor. Successful explicit edits have transactional staging audit metadata containing count, source hash and edits hash, without logging salary values. Pay-code classifications and full monthly coverage remain required before creating annual report data.

Temporary uploads expire after 24 hours and are swept every 15 minutes while the process runs; expired uploads are inaccessible immediately. Users can cancel/delete uploads. A company may reserve at most 2 GiB across 25 temporary jobs, with disk-space checks at creation and on every chunk. Failed parsing never creates a report snapshot. Multi-file payroll staging commits each successful file separately and does not silently claim the whole batch succeeded.

Other flows retain their own limits: pasted/base64 import and API-key ingestion 20 MiB, scoped JSON transport 32 MiB, Austrian national supplemental CSV 20 MiB; Finance receipt attachments have separate limits. The 1 GiB Pay limit must not be advertised as a limit for every upload in the product.

Deployment: this queue is for one Node process with a persistent local upload volume and stable ACCOUNT_ENCRYPTION_KEY. Multiple application instances require shared object storage plus distributed job locking; do not run independent local queues over the same directory. OS/container memory, storage quotas, proxy request timeouts and backups remain deployment configuration. Demo keys are ephemeral; demo uploads cannot be resumed after a restart.

## Verification

Synthetic tests cover exactly 1 GiB of CSV source (1,024 padded records), full source digest and row count; this is a streaming/transport boundary test, not a benchmark of a 1 GiB vendor workbook. A 1,000-employee fixture with **1,000,001 transactions** and a **197,782,162-byte source** crosses both the removed 500,000-row and 128 MiB materialized-result boundaries. It checks all records through encrypted pages, staging, code approval and exact annual amounts/hours; that volume test uses the synthetic MemoryStore, not a native PostgreSQL production benchmark. PostgreSQL-engine tests use PGlite and verify multiple pages, rollback after the last page, duplicates, correction references, tenant isolation and deletion cascades. Native PostgreSQL load/concurrency testing is still deployment validation.

DE/AT/SI HTTP tests cover chunk upload, preview count versus 30-record sample, full staging, annual finalization, all seven Article 9 groups against a separately constructed annual reference, language selection, idempotency, and refusal to export an unapproved report as prepared. Existing report-content/assessment/approval tests remain part of the full suite.

The Scale boundary regression in `tests/payroll-scale-2500.test.js` exercises 2,500 employees per country (DE, AT and SI), 12 separate monthly uploads for 2026 and 60,000 payroll entries. It uses an active synthetic Scale subscription and checks exact normalized annual rows for every employee against an independently constructed reference, all seven Article 9 indicator groups, and JSON/CSV/XML/XLSX/PDF exports. It also verifies incomplete-year rejection, duplicate-month idempotency and repeated finalization. Upload status polling follows the application's two-second interval instead of bypassing API rate protection. These HTTP fixtures use MemoryStore; they do not replace production PostgreSQL load testing or management approval of the report.

Run the disk-heavy boundary test with `PAY_IMPORT_GB_TEST=1` and `node --test tests/pay-uploads.test.js`; run the million-row test with `PAY_IMPORT_STRESS_TEST=1` and `node --test tests/pay-upload-stress.test.js`. Default npm test skips these explicit heavy cases; native PostgreSQL tests also require `POSTGRES_TEST_URL`. These are engineering checks, not legal certification or proof that every vendor export is supported. Report accuracy still depends on complete source data, confirmed mappings/classifications and the applicable reporting requirements.
