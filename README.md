# Equitensa · EU Pay Transparency

Pregled zahtjeva iz razvojne specifikacije v2 i backlog: [Development v2](docs/DEVELOPMENT-V2.md). Uvoz podržava XLSX/XLS/XML/CSV/TXT/TSV, izbor lista i zaglavlja, DE/SL/EN prijedloge mapiranja, tenant profile i historiju importa. Izvoz: PDF/XLSX/CSV/JSON/XML/TXT. [API i sigurnosne granice importa](docs/IMPORT-ENGINE.md). Za postojeću bazu pokrenuti `npm run db:migrate` radi novih migracija 005 (import batchevi) i 006 (mjesečni payroll ledger).

Samostalna B2B aplikacija za Njemačku, Austriju i Sloveniju, u ovom repozitoriju. Cilj: jedan IONOS VPS, Ubuntu 24.04 i Plesk.

Brend je **Equitensa**, s kupljenim domenama `equitensa.de`, `equitensa.at` i `equitensa.si`. Točne domene i `www` aliasi postavljeni su u tržišnom middlewareu i [env predlošku](.env.example). Njemačka i Austrija koriste njemački, Slovenija slovenski. Za DNS, TLS i Plesk povezivanje slijediti [upute za VPS](docs/IONOS-PLESK.md).

## Implementirano

- Premium javna stranica, vidljive cijene, mjesečni/godišnji paketi, registracija i checkout.
- Google registracija/prijava i povezivanje postojećeg računa uz potvrdu lozinke, uključivanje iz admin panela i šifrirani OAuth podaci. [Google postavljanje](docs/GOOGLE-AUTH.md).
- Vlasnički panel `/admin`: odvojene sesije, jednokratno postavljanje, MFA/recovery, vlasnici i revizori, pregled/pretraga firmi, blokada pristupa i evidencija promjena. [Postavljanje panela](docs/OWNER-ADMIN.md).
- Šifrirane Stripe postavke iz panela, provjera računa i šest cijena, trenutno učitavanje konfiguracije, povratak na domenu tržišta i oznaka posljednjeg webhooka. Procjena live pretplata odvaja testnu okolinu.
- Lokalna simulacija kupnje bez naplate; konfigurabilni Stripe Checkout, potpisani webhook, idempotentni lifecycle događaji i Customer Portal.
- Njemački/slovenski interfejs, jezik prema domeni, zasebna država firme.
- Vođeni proces: CSV sa mapiranjem i pregledom → obuhvat → četiri kriterija jednakovrijednog rada → svih sedam EU grupa pokazatelja → objašnjenja i mjere → potvrda → paket prema primaocu.
- Izvještaji sadrže pokazatelje označene prema članu 9(1) a–g (DE/SL), uz javni paket samo a–f ([server/article9.js](server/article9.js)).
- Godišnji/satni pokazatelji, osnovna/varijabilna naknada, kvartili, zaštićene male grupe i 5% tracker.
- PDF s naslovnicom, XLSX, CSV, JSON, XML i TXT. Nacionalni paket a–g, javni a–f, zasebne interne bilješke; plaćeni završni izvoz zahtijeva potvrđene radne korake.
- Potvrde vezane za snimak; novi podaci i materijalne promjene traže novu potvrdu. Export audit zadržava user, snimak, verziju pravila i provjeru.
- Express sesije, provjera Origin zaglavlja, tenant filtriranje i PostgreSQL migracije za podatke, workflow i billing.
- Katalog 18 HRIS/payroll sistema; direktni API konektori su označeni kao planirani. XLSX/XLS/XML/CSV/TXT/TSV importer je aktivan.

**Ovo je implementiran tok pripreme radnog Article 9 izvještaja. Nije potvrđena produkcijska zakonska predaja.** Službeni nacionalni adapteri, direktni HRIS konektori, kompletni Article 7 zahtjevi i Article 10 zajedničke procjene nisu dovršeni. Stripe i PostgreSQL zahtijevaju konfiguraciju i provjeru na stvarnim servisima. Nije objavljeno na VPS ili poslano na GitHub.

[Obračun, nacionalne obaveze i arhitektura izvoza](docs/REPORTING-ARCHITECTURE.md) objašnjavaju zašto postojeći ISPAP, njemački Lagebericht i austrijski Einkommensbericht ne potvrđuju automatski format novog Article 9 izvještaja.

## Lokalno

Node 22.12+; testirano Node 24.12. PowerShell: `npm.cmd` ako `.ps1` nije dozvoljen.

```sh
npm ci
npm run dev
```

Otvoriti http://127.0.0.1:3000. Bez `DATABASE_URL`, registracija, narudžbe i snimci su privremeni, u memoriji. Podaci se gube restartom. Koristiti sintetičke podatke; opcija istraživanja proizvoda kreira izolovan demo sa 180 zapisa. Testkupnja eksplicitno ne tereti karticu.

```sh
npm test
npm run build
```

69 testova prolazi lokalno (1 preskočen), uključujući PostgreSQL WASM test trajnosti i rollbacka. Native PostgreSQL test je preskočen bez testne baze. Browser tok provjeren: odabir paketa → registracija → testkupnja → CSV mapiranje → kriteriji → mjere → potvrda → dostupno pripremljeno izvješće. Browser okruženje nije potvrdilo preuzimanje fajla događajem download; PDF/CSV/XML/TXT generatori provjereni API testovima. [CI](.github/workflows/ci.yml) uključuje PostgreSQL 16 servis, ali nije izvršen u ovoj sesiji.

## PostgreSQL i naplata

Kopirati [.env.example](.env.example) u lokalnu `.env`. Postaviti `DATABASE_URL`, najmanje 32 random bajta u hex `PSEUDONYM_SECRET`, dozvoljene domene i `APP_ORIGINS`. Pokrenuti `npm run db:migrate`; [migracija 1](db/001_initial.sql) i [migracija 2](db/002_self_service.sql) su idempotentne.

Produkcija odbija memorijski demo. Stripe ostaje nedostupan dok se ne konfigurišu merchant key, webhook secret, šest Price ID-jeva i `BILLING_ORIGIN`. [Detaljan postupak naplate](docs/BILLING-AND-SELF-SERVICE.md).

## CSV

```csv
internal_id,gender,job_title,worker_category,job_category_kv,base_annual,bonuses_annual,paid_hours_annual,hours_per_week
001,F,Engineer,Engineering L3,,60000,3000,2080,40
002,M,Engineer,Engineering L3,,63000,3000,2080,40
```

Jedan provjeren godišnji sažetak po osobi, EUR. Separatori comma/semicolon/tab/pipe i decimalna tačka/zarez biraju se kroz importer. Podržani su UTF-8, UTF-16 s BOM i eksplicitni Windows-1250/1252. Drugi nazivi kolona mapiraju se u aplikaciji. Uključiti sve relevantne isplate i pogodnosti, a dodatne isplate ne brojati dvaput. Godišnji sati dolaze iz payrolla; ne nagađaju se iz trenutnog ugovora. Promjene tokom godine prethodno se sažimaju u izvoru. `hours_per_week` podržava decimalne vrijednosti.

Godišnja naknada / potvrđeni plaćeni godišnji sati je osnova radne analize. FTE 40/173.33 je samo dodatna usporedba. O polje ostaje u ukupnom broju; M/F usporedba je zasebna. Zaštita grupa <5 po spolu je interna politika, ne univerzalna zakonska shema. ID-jevi su HMAC pseudonimi; ostaju lični podaci. Izvorni ID i CSV se ne zadržavaju.

## Pravna i produktna dokumentacija

- [EU specifikacija: sadržaj, primaoci, rokovi i nacionalni dokazi](docs/EU-REPORTING-SPECIFICATION.md)
- [Samostalni tok i naplata](docs/BILLING-AND-SELF-SERVICE.md)
- [Figures istraživanje i strategija](docs/FIGURES-RESEARCH-AND-STRATEGY.md)
- [Početna arhitektura](docs/ARCHITECTURE.md) — dopunjena novom specifikacijom i billing dokumentom
- [IONOS/Plesk](docs/IONOS-PLESK.md)

Nacionalno nadležno tijelo dobija a–g prema članku 9(7); javna objava a–f. Nema potvrđenog jedinstvenog AJPES XSD-a, Arbeitsinspektorat CSV-a ili novog Bundesanzeiger formata. XML je interni `urn:equitensa:internal:draft:v1`. Prije produkcije još su potrebni operativna DB/Stripe provjera, nacionalni adapteri i metodologija, MFA/oporavak računa, proširene uloge, komercijalni dokumenti, backup/restore i sigurnosna provjera.
