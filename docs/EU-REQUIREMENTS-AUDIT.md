# EU zahtjevi i provjera proizvoda — 9.11.2026.

Izvor: [Direktiva (EU) 2023/970, objavljeni tekst na EUR-Lexu](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32023L0970). EUR-Lex je izdavački portal; relevantni akt ovdje je direktiva o transparentnosti plata. Ovaj pregled se odnosi na taj akt, a ne na sve EU propise, GDPR certifikaciju ili nacionalnu provedbu.

**Zaključak:** numerički izvještaj i zajednička procjena imaju implementirane propisane grupe sadržaja. Proizvod ima i zasebne dokumente za obaveze izvan tog izvještaja. Potpuna usklađenost poslodavca nije automatski potvrđena: dostava, istinitost dokaza, jednakovrijednost rada, nacionalna pravila i stvarno otklanjanje diskriminacije traže provedbu i provjeru. Evidencija nekog člana nije njegova automatska provedba.

## Kako čitati rezultate

- **Implementirano / testirano**: konkretan izračun ili tok ima automatizovanu provjeru u navedenom testu.
- **Podržano uz unos/provedbu firme**: aplikacija prikuplja podatak ili pravi dokument, ali ne može potvrditi da je izjava istinita ili da je dokument stvarno dostavljen.
- **Van aplikacije / nacionalno**: odgovornost države, tijela ili suda; nije dodatni obavezni odjeljak privatnog izvještaja.
- Sadržaj se odnosi na skup dokumenata: izvještaj po članu 9, zajednička procjena po članu 10, informacije zaposlenom po članu 7, kriteriji po članu 6 i informacije kandidatu po članu 5. Ne postoji zahtjev da se tekst svih 37 članova prepiše u jedan PDF.

## Provjera svih 37 članova

| Član | Zahtjev i mjesto u proizvodu | Rezultat / granica |
| --- | --- | --- |
| 1 | Svrha: jednaka plata, transparentnost i provedba; cijeli tok | Pravni cilj; izvještaj sam ne dokazuje jednaku platu. |
| 2 | Javni/privatni poslodavci, radnici i kandidati; registracija pravne osobe, payroll i kandidatski dokument | Podržano uz provjeru obuhvata firme. Posebni javni/regionalni režimi nisu automatski potvrđeni izborom zemlje. |
| 3 | Plata uključuje osnovnu i sve dodatne novčane/naturalne naknade; bruto godišnje/satno, M/F razlika, medijan, kvartili, kategorije | `normalizeEmployee`/`analyze`, [pay.test.js](../tests/pay.test.js), [eu-report-contract.test.js](../tests/eu-report-contract.test.js). `bonuses_annual` je zbir svih dodatnih/varijabilnih naknada, ne samo bonusa; firma mora uključiti vrednovane beneficije, bez dupliranja. |
| 4 | Jednaka/jednakovrijedna djela; objektivni rodno neutralni kriteriji, četiri faktora i relevantne socijalne vještine; dogovor s predstavnicima gdje postoje | Dokumentovana ili bodovana metodologija, dokazi po kategoriji/poslu, dogovor i invalidacija odobrenja. [employer-obligations.test.js](../tests/employer-obligations.test.js). Bodovi ne dokazuju sami pravnu jednakovrijednost niti pokrivaju automatski rad kod druge firme. |
| 5 | Početna plata/raspon i primjenjive kolektivne odredbe; bez historije plate, neutralni oglasi i postupak | Kandidatski dokument, rasponi i kontrolna evidencija. [pay-criteria.test.js](../tests/pay-criteria.test.js). Stvarne oglase, pitanja na intervjuu i blagovremenu dostavu provodi firma. |
| 6 | Lako dostupni objektivni kriteriji plate, nivoa i napredovanja; moguća nacionalna iznimka za napredovanje ispod 50 | Dokument kriterija i napredovanja. [pay-criteria.test.js](../tests/pay-criteria.test.js). Nema automatske iznimke; dostupnost zaposlenima zahtijeva dostavu/objavu firme. |
| 7 | Individualna plata i prosjeci po spolu/kategoriji u pisanom obliku; zahtjev preko predstavnika/tijela; dopune; godišnja obavijest; najviše dva mjeseca; sloboda otkrivanja vlastite plate i ograničena upotreba tuđih podataka | Zahtjevi, rokovi, odgovori i godišnja obavijest; [worker-rights.test.js](../tests/worker-rights.test.js), [accessibility-requests.test.js](../tests/accessibility-requests.test.js). Dopune se evidentiraju; sadržajan odgovor, provjera ugovora i dostava ostaju radnje firme. |
| 8 | Pristupačnost informacija iz članova 5–7 prema konkretnim potrebama osoba s invaliditetom | HTML, tekst i semantičke tabele; [accessibility-requests.test.js](../tests/accessibility-requests.test.js). PDF nije potvrđen kao PDF/UA; stvarne prilagodbe i pristupačna dostava zahtijevaju provjeru. |
| 9 | Sedam pokazatelja, raspored, tačnost, konsultacije, primaoci, historija i pojašnjenja | Detaljna matrica ispod. Izvozi testirani, nacionalna predaja nije automatska. |
| 10 | Uslovna zajednička procjena, svih sedam grupa sadržaja, dostava i provedba mjera | Detaljna matrica ispod; sadržaj i zabrana nepotpunog pripremljenog izvoza testirani. Stvarna saradnja i otklanjanje zahtijevaju firmu. |
| 11 | Državna tehnička pomoć i obuka za poslodavce ispod 250 | Državna obaveza; pomoć i import u proizvodu nisu zamjena za državni program. |
| 12 | GDPR, ograničenje svrhe, zaštita identifikovanih radnika i nacionalne mogućnosti ograničenja pristupa | Pseudonimi, izolacija firmi, prikazi po primaocu, politika/brisanje i blokade čuvanja. [data-lifecycle.test.js](../tests/data-lifecycle.test.js), [reports.test.js](../tests/reports.test.js). Prag male grupe 5 je zaštitna postavka proizvoda, nije univerzalni EU zakonski prag. Nacionalni kontrolisani pristup i GDPR dokumentacija nisu potvrđeni testovima. |
| 13 | Socijalni dijalog i uloga socijalnih partnera | Evidencija saradnje, dogovor kriterija, konsultacije i procjena; stvarni dijalog izvan automatizacije. |
| 14 | Sudska zaštita i nakon prestanka rada | Evidencija dokaza i postupaka pomaže; sudsku dostupnost uređuje država. |
| 15 | Postupci predstavnika/udruženja/tijela uz saglasnost radnika | Evidencija i kanali zahtjeva; procesna ovlaštenja i saglasnost za sudski postupak uređuju se izvan izvještaja. |
| 16 | Puna naknada štete, zaostale plate, beneficije, prilike, nematerijalna šteta i kamate, bez gornjeg limita | Sudska/nacionalna provedba. Proizvod ne izračunava automatski pravno potpun odštetni zahtjev. |
| 17 | Nalozi za prestanak povrede i provedbu mjera, prinudne kazne | Evidencija mjera/dokaza podržana; nalog i kaznu određuje nadležno tijelo. |
| 18 | Teret dokazivanja, uključujući povrede transparentnosti | Evidencija, verzije, potvrde i dokazi; [accessibility-requests.test.js](../tests/accessibility-requests.test.js). Softver ne odlučuje sudski teret dokazivanja. |
| 19 | Dokazivanje kod jednog izvora plata, nesimultani komparatori, hipotetički/statistički dokazi | Historija i vanjska metodologija mogu biti dokaz. Automatski obračun je po jednoj pravnoj osobi/godini; nema pravne analize zajedničkog izvora više poslodavaca ili hipotetičkog komparatora. To nije dodatno polje člana 9. |
| 20 | Sudski pristup relevantnim, uključujući povjerljivim, dokazima | Izvozi i dokazi dostupni firmi; sudski nalog i zaštićeno procesno otkrivanje izvan proizvoda. |
| 21 | Nacionalna zastara i prekidi; minimalni zahtjevi direktive | Konfigurisana politika čuvanja i blokade; ne izmišlja se univerzalni rok čuvanja niti automatski računa pravna zastara. |
| 22 | Troškovi postupka | Odlučuje sud po nacionalnim pravilima. Nije sadržaj izvještaja o platama. |
| 23 | Djelotvorne, proporcionalne i odvraćajuće sankcije | Određuje država/tijelo. Nema automatskog obračuna kazne u izvještaju. |
| 24 | Jednakost plata pri javnim ugovorima/koncesijama i odgovarajuće mjere | Opciona evidencija ugovora i dokaza; uslove ugovora i sankcije procjenjuju firma i tijelo. |
| 25 | Zaštita radnika/predstavnika od odmazde | Evidencija postupka, kontakta i dokaza. Stvarno postupanje poslodavca ne može se potvrditi checkboxom. |
| 26 | Odnos s Direktivom 2006/54/EZ | Pravno tumačenje; bez posebne tabele u izvještaju. |
| 27 | Povoljnije nacionalne odredbe i zabrana smanjenja zaštite | Registar nacionalne provjere. Nacionalni sloj ne smije se proglasiti završenim samo na osnovu EU pokazatelja. |
| 28 | Tijela za jednakost, resursi i koordinacija | Nacionalna nadležnost; nema izmišljene automatske integracije. |
| 29 | Državni nadzor, objavljivanje, prikupljanje procjena i izvještavanje Komisiji | Izvozi po primaocima i historija pripremaju podatke; državni portal i njegove sheme nisu potvrđeni. |
| 30 | Kolektivno pregovaranje i kolektivne mjere | Evidencija kolektivnih odredbi i saradnje; stvarno kolektivno djelovanje izvan softvera. |
| 31 | Državna statistika i dostavljanje Eurostatu | Državna obaveza, nije dodatni odjeljak izvještaja firme. |
| 32 | Državno informisanje o provedbenim odredbama | Registar pravnih izvora; državnu objavu ne zamjenjuje proizvod. |
| 33 | Provedba i moguća uloga socijalnih partnera | Nacionalna nadležnost i stvarno ispunjenje; evidencija saradnje podržana. |
| 34 | Prenos u nacionalno pravo, rok i obavijest Komisiji | Državna obaveza. Rok nije dokaz da je nacionalni zakon donesen. |
| 35 | Državno/Komisijino izvještavanje i preispitivanje direktive | Institucionalna obaveza, nije izvještaj korisnika aplikacije. |
| 36 | Stupanje direktive na snagu | Pravni vremenski okvir; ne stvara dodatnu tabelu. |
| 37 | Države članice kao adresati | Institucionalna odredba; nije funkcija korisničkog izvještaja. |

## Obavezni sadržaj i tok člana 9

| Odredba | Implementacija i dokaz |
| --- | --- |
| 9(1)(a) | Prosječna razlika ukupne plate M/F, godišnje i satno. |
| 9(1)(b) | Prosječna razlika dodatnih/varijabilnih naknada, uključujući nulte iznose. |
| 9(1)(c) | Medijalna razlika ukupne plate. |
| 9(1)(d) | Medijalna razlika dodatnih/varijabilnih naknada. |
| 9(1)(e) | Udjeli žena i muškaraca koji primaju dodatne/varijabilne naknade. |
| 9(1)(f) | Udjeli po četiri platna kvartila; odvojeno godišnje/satno. Svaki radnik uključen u populaciju, O se ne pretvara u F. |
| 9(1)(g) | Razlike po kategoriji rada, odvojeno osnovne i dodatne naknade. |
| 9(2)–(5) | Pragovi 250/150/100, prva predaja 2027/2031 i ritam; niže nacionalne pragove treba posebno provjeriti. |
| 9(6) | Potvrda uprave, konsultacija predstavnika i metodologija u internom dokumentu; promjene poništavaju potvrdu. Stvaran pristup predstavnika ostvaruje firma. |
| 9(7) | Paket za tijelo a–g; opcioni javni paket a–f. Preuzimanje nije predaja tijelu. |
| 9(8) | Mogućnost državnog prikupljanja iz administrativnih podataka; nije implementirana državna integracija. |
| 9(9) | Paket zaposlenima/predstavnicima, dostupna četiri prethodna izvještajna razdoblja/godine; može se izvesti i tijelu. Nedostajuće historijske podatke softver ne izmišlja. |
| 9(10) | Evidencija dodatnih pojašnjenja i odgovora; objašnjenje i plan neopravdanih razlika ne zavise od praga 5%. Provjera pripreme zahtijeva razlog ili mjere za utvrđene razlike osnovnih/dodatnih komponenti. Stvarna ispravka i razuman rok zahtijevaju poslodavca. |

Numerički i izvozni dokazi: [article9.test.js](../tests/article9.test.js), [eu-report-contract.test.js](../tests/eu-report-contract.test.js), [country-reports.test.js](../tests/country-reports.test.js), [report-completeness.test.js](../tests/report-completeness.test.js), [plans.test.js](../tests/plans.test.js).

## Obavezni sadržaj i tok člana 10

| Odredba | Implementacija i dokaz |
| --- | --- |
| 10(1)(a)–(c) | Zasebno: razlika najmanje 5%, nije opravdana, nije otklonjena šest mjeseci nakon stvarne predaje; obaveza zavisi od izvještajnog obuhvata. Nije automatska tvrdnja diskriminacije. |
| 10(2)(a) | Broj i udio žena i muškaraca po kategoriji; CSV/XLSX/XML sada izričito čuvaju oba udjela i ukupnu populaciju. |
| 10(2)(b) | Prosjeci ukupne, osnovne i dodatne naknade po spolu/kategoriji; godišnje i satno. |
| 10(2)(c) | Razlike godišnjih i satnih prosjeka po kategoriji. |
| 10(2)(d) | Razlozi i potvrda zajedničkog utvrđivanja s predstavnicima; uključuje razlike ispod 5%. |
| 10(2)(e) | Unos relevantnih povratnika i onih koji su dobili povećanje, po spolu/kategoriji; računa se njihov udio. Neprimjenjivost traži razlog. |
| 10(2)(f) | Mjere, odgovorna osoba i rok za neopravdane razlike. Oznaka otklanjanja traži datirane dokaze i verifikaciju aktuelnog snapshot-a. |
| 10(2)(g) | Ocjena djelotvornosti prethodnih mjera ili obrazloženje prve procjene. |
| 10(3) | Izvozi za radnike/predstavnike i nadzorno tijelo; upute o dostavi i evidencija. Dostava tijelu i tražiocima ostaje ručna. |
| 10(4) | Dokumentovana rodno neutralna procjena rada, mjere i saradnja; stvarno otklanjanje u razumnom roku nije moguće dokazati samo datotekom. |

Dokazi: [eu-report-contract.test.js](../tests/eu-report-contract.test.js), [country-reports.test.js](../tests/country-reports.test.js), [review-alarm.test.js](../tests/review-alarm.test.js), [employer-obligations.test.js](../tests/employer-obligations.test.js).

## Rezultat izvršene provjere

- `npm test`: 209 ukupno, 208 prolazi, 0 pada, 1 preskočen test vanjskog PostgreSQL-a bez konfigurisanog servera. Ugrađeni PostgreSQL/PGlite testovi se izvršavaju.
- `npm run build`: uspješan; ostaje postojeće upozorenje veličine glavnog JavaScript paketa.
- Aktivni lokalni Express/Vite server: 42 uspješna preuzimanja (DE/AT/SI × izvještaj/procjena × JSON/HTML/PDF/CSV/XML/XLSX/TXT), uz provjeru jezika, zemlje, sedam pokazatelja i PDF potpisa. To su demonstracijski nacrti; pripremljeni tokovi provjereni su integracionim testovima.
- Nove regresije: manje i međusobno poništene razlike komponenti, zadržavanje privatnosti dodatnog signala pregleda, samostalni metapodaci procjene, udjeli oba spola i početne/periodične izvještajne godine.
- Dopuna toka pripreme: readiness API vraća konkretne nedostajuće stavke sa korakom i članom. Isti podaci vraćaju se kod blokiranog pripremljenog izvoza. Njemački/slovenski panel u paketu izvještaja vodi direktno na relevantni korak. Browser provjera: otvoren demo, prikaz blokade prije spremanja, link otvorio profil, spremljen profil, prikaz pojedinačnih dopuna i onemogućeni pripremljeni izvozi.
- Tokom pune provjere otkriven je Windows `EPERM` pri konkurentnom otvaranju lock datoteke admin postavki. Dodano je ograničeno ponavljanje na Windows `EPERM/EACCES`, bez zaobilaženja ekskluzivnog zaključavanja. Postojeći test konkurentnih upisa potom prolazi u punom paketu.

## Šta nije zatvoreno ovim pregledom

1. Nacionalne i regionalne primjenjivosti, formalne sheme i potvrda prihvatanja od nadležnog tijela.
2. Stvarna dostava, konsultacije, rodna neutralnost konkretnih oglasa/kriterija i istinitost dokaza firme.
3. Nezavisna provjera kompletne naknade i kategorizacije stvarnog poslodavca; poređenje s njegovim izvornim payrollom.
4. Individualne prilagodbe pristupačnosti, GDPR uloge/ugovori, produkcijska infrastruktura i test vraćanja backup-a.
5. Pravno dokazivanje/odšteta, zajednički izvor plata kod više poslodavaca i hipotetički komparatori. Evidencija podržava, ali ne automatizuje sudski postupak.

Ovo su imenovane granice, a ne dodatni skriveni odjeljci numeričkog izvještaja. Proizvod se ne smije oglašavati kao automatski potvrđena potpuna usklađenost.
