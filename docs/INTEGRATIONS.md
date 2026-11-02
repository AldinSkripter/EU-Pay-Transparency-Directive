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

## Datenqualitäts-Assistent beim Import

Nach der Vorschau prüft Equitensa die Daten, **bevor** etwas importiert wird, und bietet für jeden Befund eine Korrektur mit einem Klick an. Die Originaldatei wird nie verändert und nie gespeichert; Korrekturen werden erst beim Import angewendet (`fixes` bei `POST /api/import`).

**Automatische Prüfungen (immer aktiv, ohne externen Dienst), `server/data-quality.js`:**

| Befund | Korrektur |
| --- | --- |
| Zahlen nicht lesbar („55.000,00 €“, „52 000“) | Zahlen bereinigen, Dezimaltrennzeichen wechseln, Einzelwert bearbeiten |
| Tausenderpunkt als Dezimalpunkt gelesen („60.000“ = 60) | Dezimaltrennzeichen wechseln |
| Monatsbeträge statt Jahresbeträge | Beträge × 12 / 13 / 14 (Wahl der Nutzer:in, AT: 14) |
| Leere variable Vergütung | als 0 werten (nur auf Bestätigung) |
| Unbekannte Geschlechtsangaben | Zuordnung M / W / D je Angabe, mit Vorschlag; nie stillschweigend |
| Doppelte Personalnummern | identische Zeilen ausschließen; widersprüchliche nur melden |
| Summen- und Leerzeilen | ausschließen |
| Unplausible Stunden, Stundenentgelt, Bonus > Grundentgelt, Ausreißer je Kategorie | Hinweis, Einzelwert bearbeiten |
| Ähnliche Kategorien (Schreibweise, „-in“-Endung, Tippfehler) | zusammenführen; Stufen, Nummern und Römische Zahlen („L2/L3“, „I/II“) werden nie zusammengeführt |
| Alles in einer Kategorie, zu feine Kategorien, einseitige oder kleine Gruppen | Hinweis (Art. 4, Schutz kleiner Gruppen) |
| Pflichtspalte fehlt | Vorschlag nach Spalteninhalt, nur wenn genau eine Spalte passt |
| Spalten mit Namen, IBAN, Geburtsdatum usw. | Info: wird nicht übernommen |

Fehler blockieren den Import, Hinweise müssen ausdrücklich bestätigt werden. Im Audit-Protokoll stehen nur Anzahlen der Korrekturen, nie Werte.

**KI-Vorschläge (optional), `server/ai-assistant.js`:** erkennt Spalten nach Bedeutung (beliebige Bezeichnungen in DE/EN/SL) und Kategorien, die dasselbe in anderen Worten meinen. Aktiv nur mit `ANTHROPIC_API_KEY`, nur auf Klick und nur nach ausdrücklicher Zustimmung je Anfrage.

- Gesendet werden: Spaltenüberschriften, gerundete Spaltenstatistiken (Größenordnung, nicht Einzelwerte), Werte von Spalten mit höchstens 12 verschiedenen Einträgen, Bezeichnungen der Tätigkeiten und Kategorien mit Häufigkeit.
- Nie gesendet werden: Personalnummern, einzelne Gehälter, Werte von Spalten, deren Überschrift persönlich wirkt (Name, IBAN, Geburtsdatum, Adresse …).
- Die KI entscheidet nichts: jede Antwort wird gegen die Datei geprüft (nur vorhandene Spalten und Bezeichnungen, keine persönlichen Spalten, keine Gruppen, die sich in Stufe oder Seniorität unterscheiden), und Nutzer:innen übernehmen jeden Vorschlag einzeln. Ob Tätigkeiten gleich oder gleichwertig sind, bleibt eine menschliche Entscheidung nach Art. 4.
- Modell `claude-opus-5-5` (änderbar mit `AI_ASSISTANT_MODEL`), Limit 15 Anfragen pro Stunde und Firma. Fehler (ausgelastet, nicht erreichbar, abgelehnt) lassen die automatischen Prüfungen unberührt.
- Datenschutz: Anthropic wird dadurch Auftragsverarbeiter. Vor Aktivierung in Datenschutzhinweis und AV-Vertrag aufnehmen; mit `AI_ASSISTANT=off` bleibt die Funktion abgeschaltet.

Tests: `tests/data-quality.test.js`, `tests/import-assistant.test.js`.
