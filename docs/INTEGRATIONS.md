# Integracije: kako podatke iz HR i payroll sistema dovesti u Equitensa

Tri puta, od najjednostavnijeg: **datoteka**, **API za slanje podataka** i (kasnije) **direktni konektori**. Ništa se ne uvozi bez pregleda i potvrde korisnika.

## Šta radi danas

| Put | Za koga | Kako |
| --- | --- | --- |
| **Datoteka** | svaki sistem koji izvozi tabelu | XLSX, XLS, ODS, CSV/TXT (i fiksna širina), XML, JSON, HTML-tabele, ZIP; format se prepoznaje po sadržaju, kodiranje (Windows-1250/1252, ISO-8859-1/2/15, DOS 850/852) se bira. |
| **API za slanje** | sistem, Zapier, Make, n8n, skripta ili računovodstvo koji mogu poslati HTTPS zahtjev | Ključ po firmi; isporuka čeka u "Eingegangene Lieferungen" dok je korisnik ne pregleda i potvrdi jednim klikom. |
| **Direktni konektori** | – | Nema ih. Vidi ispod zašto. |

## Zašto nema "uvoza jednim klikom" iz Personia, DATEV-a i ostalih

Provjereno 2.11.2026.:

- **Personio:** po vlastitoj dokumentaciji API za zaposlene ne daje podatke o plati osim fiksne plate i satnice, i to samo za polja koja kupac odobri; **varijabilne dijelove ne daje uopće**. Direktno preuzimanje bi izvještaj tiho učinilo nepotpunim (varijabilni dio bi izgledao kao nula). Zato: izvještaj iz Personia kao datoteka ili slanje preko našeg API-ja.
- **DATEV:** programski interfejsi idu preko DATEV Developer Portala uz prijavu i odobrenje od DATEV-a. Besplatan otvoren pristup nismo mogli potvrditi.
- **Lexware Office i sevDesk:** računovodstveni i fakturni programi, u pravilu bez plata i spola po zaposlenom, pa nisu pogodan izvor. Za Lexware koristi se izvoz iz Lexware Lohn+Gehalt.
- **BMD, RZL, PANTHEON, Minimax, Birokrat:** za njih nemamo potvrđen javni API; koristi se izvoz datoteke.

Konektor se dodaje tek kad ga možemo isprobati na stvarnom sistemu. Do tada je lažno obećanje gore od vodiča.

## API za slanje podataka

Ključ se pravi u aplikaciji (Daten & Integrationen), prikazuje se **jednom**, vrijedi samo za tu firmu, može se blokirati. U bazi je samo njegov hash.

```sh
curl -X POST "https://equitensa.de/api/ingest/v1/employees" \
  -H "Authorization: Bearer eqt_…" -H "Content-Type: application/json" \
  -d '{"year":2026,"source":"Personio","records":[{"internal_id":"1001","gender":"female","job_title":"Engineer","worker_category":"Engineering L3","base_annual":60000,"bonuses_annual":3000,"paid_hours_annual":2080,"hours_per_week":40}]}'
```

CSV direktno: `POST …/employees?year=2026&source=DATEV` s `Content-Type: text/csv`. Provjera ključa: `GET …/api/ingest/v1/ping`.

| Odgovor | Značenje |
| --- | --- |
| `202` | primljeno; čeka pregled u aplikaciji |
| `400` | neispravna godina ili izvor |
| `401` | ključ nedostaje, nije ispravan ili je blokiran |
| `403` | firma je blokirana |
| `413` / `422` | prevelika isporuka ili neispravni zapisi (ugniježđene vrijednosti, nedozvoljeni nazivi polja) |
| `429` | previše zahtjeva ili 20 neobrađenih isporuka |

Granice: do 10.000 zapisa i 4 MB po isporuci, 30 zahtjeva u minuti po ključu, najviše 5 aktivnih ključeva, neobrađene isporuke zastarijevaju nakon 30 dana. Nazivi polja kao u predlošku mapiraju se sami, ostale korisnik mapira u pregledu.

Sigurnost: isporuka nikad ne zamjenjuje odobrene podatke, ID-ovi se pseudonimiziraju, a sirovi podaci se brišu nakon uvoza. U dnevniku su samo brojevi, ne podaci.

Testovi: `tests/ingest.test.js`, `tests/import-formats.test.js`, `tests/worker-rights-postgres.test.js`.
