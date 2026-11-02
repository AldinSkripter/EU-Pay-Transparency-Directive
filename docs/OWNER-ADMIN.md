# Equitensa vlasnički panel

Panel se otvara na `/admin`. Vlasnički računi, sesije i ovlaštenja odvojeni su od HR računa firmi. Klijentska registracija nikada ne daje vlasnički pristup.

**Google prijava** omogućava vlasniku uključivanje Google registracije/prijave i unos OAuth Client ID-ja, šifrirane tajne i povratnih adresa. Detaljne upute: [Google registracija i prijava](./GOOGLE-AUTH.md).

## Prvi vlasnik

U korijenu projekta pokrenuti:

```sh
npm run admin:setup
```

Naredba kreira jednokratni link koji vrijedi 30 minuta. Otvorite ga i sami odaberite e-mail i lozinku od najmanje 14 znakova. Token je u URL fragmentu, ne šalje se kao URL serveru, i panel ga uklanja iz adresne trake. Sljedeće pokretanje naredbe poništava prethodni neiskorišteni link. Nakon kreiranja vlasnika javno postavljanje više nije moguće.

U produkciji je prije pregleda platforme i naplate obavezno uključiti TOTP dvofaktorsku prijavu. Panel prikaže ključ za autentifikator, provjeri kod i jednom prikaže osam kodova za oporavak. Svaki kod radi jednom. Uključivanje MFA i promjena lozinke poništavaju postojeće sesije. Sesija traje najviše jedan sat.

Za oporavak ovlašteni administrator servera može interaktivno kreirati dodatnog vlasnika:

```sh
npm run admin:create
```

Lozinka se unosi skriveno; ne stavlja se u argumente naredbe, logove niti Git. Stari vlasnički račun potom isključiti iz panela. MFA se ne isključuje javnim endpointom.

## Spremanje

- Lokalno se vlasnički podaci i postavke čuvaju šifrirano u `var/admin.enc`. Razvojni ključ se generira u `var/admin.key`; oba su izvan Gita. Klijentska demo baza i dalje je privremena.
- S PostgreSQL-om koristi se tablica `platform_control`, uvedena [migracijom 003](../db/003_platform_control.sql). Cijeli kontrolni dokument šifrira se AES-256-GCM, uključujući Stripe tajne i MFA podatke. Lozinke i kodovi za oporavak spremaju se kao hash vrijednosti.
- Za PostgreSQL i produkciju obavezan je zaseban `ADMIN_ENCRYPTION_KEY`: 32 nasumična bajta, zapisana kao 64 hex znaka u serverskoj okolini. Ne koristiti `PSEUDONYM_SECRET` kao ovaj ključ. Ključ ostaje izvan baze i Gita; backup baze bez njega ne može vratiti vlasničke postavke.
- Zamjena ključa šifriranja nije obična izmjena env vrijednosti: postojeći kontrolni dokument najprije treba sigurno prešifrirati. Pogrešan ključ ili izmijenjen ciphertext zaustavljaju čitanje umjesto otvaranja pristupa.
- Spremanje koristi atomski zapis s lokalnom bravom ili PostgreSQL transakciju i zaključavanje retka. Revizija postavki odbija zastarjeli unos drugog vlasnika. Prekinuti lokalni proces može ostaviti `var/admin.enc.lock`; ukloniti ga samo nakon potvrde da nijedan proces ne zapisuje datoteku.

## Naplata

U **Stripe i naplata** odabrati `stripe_test` ili, u produkciji, `stripe_live`. Lokalna simulacija dostupna je samo u demo okolini. `disabled` zaustavlja nove checkoute, a postojeći Stripe webhookovi i Customer Portal ostaju aktivni.

Unijeti odgovarajući `sk_test_…` ili `sk_live_…`, `whsec_…` i šest aktivnih EUR cijena:

| Paket | Mjesečno | Godišnje |
| --- | ---: | ---: |
| Prepare | €99 | €899 |
| Growth | €199 | €1.799 |
| Scale | €399 | €3.599 |

Cijene trebaju biti recurring/per-unit/licensed, s periodom od jednog mjeseca ili godine i iznosom bez uključenog poreza. Stripe Tax obračun se mora konfigurirati u Stripe računu. Brojevi kartica obrađuju se kroz Stripe Checkout.

**Provjeri vezu** čita Stripe račun i šest cijena; ne naplaćuje ništa i ne sprema unos. **Spremi i primijeni** ponavlja provjeru, šifrira postavke i odmah ih koristi za nove zahtjeve, bez restarta servera. Nakon spremanja API vraća samo oznake da tajne postoje; prazno polje zadržava postojeću tajnu. Env postavke koriste se kao početne vrijednosti dok panel ne spremi konfiguraciju.

U Stripeu kreirati webhook:

```text
https://equitensa.de/api/billing/webhook
```

Događaji:

```text
checkout.session.completed
customer.subscription.updated
customer.subscription.deleted
```

Spremanje `whsec_…` nije dokaz povezivanja webhooka. Panel pokazuje posljednji prihvaćeni potpisani događaj. Nepovezana narudžba vraća 409 radi ponovnog pokušaja. Aktivacija paketa slijedi plaćeni checkout događaj; promjene/cancel pretplate slijede potpisane lifecycle događaje. Testne i stvarne narudžbe imaju zasebnu oznaku okoline; procjena mjesečnog iznosa isključuje testne pretplate.

Povratak iz checkouta i Customer Portala koristi tržište stvarne ulazne domene, uključujući izričito dopušteni `www`. `.at` i `.si` korisnici se ne prebacuju na `.de` pri povratku. U testu na localhostu Stripe povratne domene ostaju HTTPS Equitensa domene; za puni vanjski test treba dostupan testni server i webhook, ili Stripe CLI za webhook forwarding.

Mapiranje cijena, okolina i Stripe račun zaključani su dok postoje nezavršene Stripe narudžbe. Prije prelaska iz testnog rada vlasnik može **arhivirati testne narudžbe**, čime prestaju davati plaćeni pristup u ovoj aplikaciji. To ne otkazuje testne pretplate unutar Stripea; njih administrirajte u testnom Dashboardu. Stvarne narudžbe se ne mogu arhivirati ovom radnjom. Rotacija tajni zahtijeva potvrdu; prethodna webhook tajna prihvaća se još 24 sata.

## Operativne mogućnosti

- Pregled firmi po tržištu, klijentskih korisnika, snimaka i pretplata; mjesečni ekvivalent aktivnih live pretplata je procjena, ne računovodstveni prihod.
- Pretraga i paginacija firmi. Panel ne otvara pojedinačne plaće zaposlenih.
- Privremena blokada ili vraćanje pristupa firmi, uz vlasničku lozinku i razlog. Blokada ne briše podatke niti otkazuje Stripe pretplatu.
- Dodavanje vlasnika ili revizora. Revizor čita preglede, maskirane postavke i evidenciju, bez izmjena. Isključivanje računa poništava njegove sesije; posljednji aktivni vlasnik ne može se isključiti.
- Evidencija prijava i administrativnih promjena s akterom i vremenom. Tajne, plaće, lozinke i recovery kodovi ne ulaze u evidenciju. Evidencija je aplikacijska, nije vanjski neizmjenjivi audit arhiv.

Produkcijsko prihvaćanje uključuje stvarni Stripe test/live račun, PostgreSQL, HTTPS, webhook isporuku i backup/restore na VPS-u. Lokalni automatizirani testovi koriste simulirane Stripe odgovore i ne potvrđuju stvarnu naplatu.
