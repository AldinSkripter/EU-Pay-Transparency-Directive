# Lokalna provjera Pay i Finance — 15.11.2026.

## Zaključak i opseg

Postojeći automatizirani testovi i pregled implementacije potvrđuju pokrivenost sedam grupa pokazatelja člana 9(1), pripadajućeg toka potvrđivanja i zasebnog sadržaja zajedničke procjene člana 10. Nije pronađena nedostajuća grupa obaveznih pokazatelja glavnog EU izvještaja. To je zaključak o implementiranom sadržaju i testiranim slučajevima, ne potvrda svih zakona ili svake moguće korisničke datoteke.

Konačni nacionalni kanali, sheme predaje i sve nacionalne dopune nisu potvrđeni ovom provjerom. Oznaka `NATIONAL_CHANNEL_UNVERIFIED` ostaje. Nije uključen produkcijski hosting, stvarna naplata Financea ili native prijava.

## Dokazi izvršavanja

- `npm test`: 272 testa, 271 prošao, 0 neuspjelih, 1 preskočen. Preskočen je test zasebnog PostgreSQL servera jer nije zadat `POSTGRES_TEST_URL`; ugrađeni PGlite testovi pohrane su prošli.
- `npm run build`: uspješan; postojeće upozorenje na glavni JS paket preko 500 kB ostaje.
- Poslije ispravke potvrđivanja: 26 ciljanih testova prošlo u [report-completeness](../tests/report-completeness.test.js), [eu-report-contract](../tests/eu-report-contract.test.js) i [country-reports](../tests/country-reports.test.js).
- Preglednik: otvaranje svih 8 Pay i 13 Finance glavnih rubrika u lokalnom DE demu. Ovo je provjera navigacije/prikaza, ne ručni prolaz svakog obrasca i svake države.
- DE/AT/SI uvoz, izlazni jezici, primaoci, sedam izlaznih formata, nepotpuni/završni izvještaji i izolacija firmi provjereni su API testovima.

## Pay: provjereni dijelovi

| Dio | Nalaz i dokaz |
|---|---|
| Glavni pokazatelji | Prosječni i medijalni jaz ukupne/dodatne naknade, udjeli primalaca, kvartili i kategorije; odvojeni godišnji i satni podaci. [article9](../server/article9.js), [referentni testovi](../tests/eu-report-contract.test.js). |
| Izračuni | Nezavisni sintetički očekivani rezultati, različiti godišnji/satni kvartili, nulti nazivnici, odsutni spolovi i mali uzorci. [pay](../server/pay.js). |
| Potvrda | Potvrđivanje i konsultacije vezani za konkretan snimak podataka; materijalne promjene traže novu potvrdu. [workflow](../server/workflow.js). |
| Procjena člana 10 | Sadržaj a–g, obrazloženja, dopusti, mjere i učinkovitost ranijih mjera; nepotpuna završna procjena odbijena. [assessment](../server/assessment.js). |
| Prag i rok | Prag najmanje 5 %, neopravdanost, šest mjeseci od evidentirane predaje i raspored EU izvještavanja obrađuju se odvojeno. To nije automatsko utvrđivanje diskriminacije. [review-alarm testovi](../tests/review-alarm.test.js). |
| Primaoci | Javni paket a–f, kategorije u paketima za ovlaštene primaoce, zaštita malih grupa i dostupna historija. Prag 5 osoba je politika proizvoda, ne univerzalni zakonski minimum. [report-model](../server/report-model.js). |
| Ostale obaveze | Alati za prava radnika, kriterije i dokaze postoje; državne/sudske odredbe nisu dodatne tabele glavnog izvještaja. [ranija matrica svih članova](EU-REQUIREMENTS-AUDIT.md). |

Poslodavac i dalje mora osigurati potpune isplate/sate, ispravno vrednovanje rada, stvarne konsultacije i vjerodostojne razloge/mjere. Softver ne može iz same datoteke dokazati njihovo stvarno izvršenje.

## Ispravljeno u ovoj provjeri

Promjena odgovorne osobe ili teksta konsultacije mogla je zadržati staru potvrdu uprave. [validateWorkflow](../server/workflow.js) sada poništava potvrdu i konsultaciju pri takvoj promjeni već odobrenog dokumenta. Test potvrđuje blokadu spremnosti i mogućnost novog odobrenja. Nisu mijenjani izračuni plata niti izmišljena nacionalna pravila.

## Finance

Prošli su testovi izračuna u centima, popusta i stopa, ponuda, dokumentnih originala, ponovljenih zahtjeva, PDF/XML izvoza, QR kodova, OCR-a, uvoza, plaćanja i paketa. Validatori strukturiranih formata stvarno su izvršeni, nisu preskočeni.

Ovo ne uklanja postojeća ograničenja: Finance je i dalje razvojni/demo modul, produkcijska naplata i pozivi korisnicima nisu aktivni, nema povezane banke ni automatske državne dostave, a potpuni storno/ispravke izdanih računa i native auth ostaju zaseban posao. Porezne prijave ostaju uklonjene prema odluci vlasnika. Detalji: [produkcijska spremnost](FINANCE-PRODUCTION-READINESS.md).

## Izvori i nacionalna neizvjesnost

### Dodatna Finance provjera — DE / AT / SI

Najnovija provjera: implementirano sedam poreznih tretmana s istim obračunom za web i Flutter; [objedinjena specifikacija](app-dev/INVOICE-SYSTEM.md) zamjenjuje ranije uži opseg u nastavku. Domaći B2C/PDF, strani kupac s potvrđenim domaćim mjestom oporezivanja, EU roba K, izvoz G, treće zemlje usluge O i domaći mali poduzetnik E sada imaju zasebne tokove uz postojeći EU reverse charge AE. API tax-options vraća dopuštene izbore i potrebne podatke po kupcu. Dokazi su izjave/reference korisnika, ne automatska provjera poreznog statusa, VIES-a ili carine.

61 Finance/handoff test prošao, bez grešaka ili preskakanja, uz još jedan zaseban test koji provjerava svih sedam tretmana u DE/AT/SI i blokade bez dokaza. Svi novi porezni tretmani prošli su stvarne validatore za šest izlaznih formata. Build prošao s postojećim upozorenjem veličine glavnog bundlea. OSS, posebni poslovi, storno i produkcijsko izdavanje nisu dovršeni ovim proširenjem.

Naknadna implementacija: kontakti sada prihvataju sve ISO zemlje; izdavatelj ostaje DE/AT/SI. Dodan je `eu_b2b_services` za usluge po općem EU B2B pravilu (čl. 44/196), uz oba PDV broja, izričitu potvrdu općeg pravila i evidenciju vanjske provjere PDV broja. Web editor, server, PDF, XML AE kategorija, CSV i Flutter ugovor koriste isti tretman. To nije automatska VIES provjera. Roba, B2C, treće zemlje i posebni slučajevi ostaju izvan podržanog izdavanja. Ovaj odlomak zamjenjuje raniju opću tvrdnju da je svako prekogranično izdavanje blokirano.

Provjera nakon proširenja: 57 Finance/handoff testova prošlo bez preskakanja, uključujući sve stvarne reverse-charge XML/PDF validatore; dodatni API regresijski test za DE/AT/SI također prošao. Build prošao. Detaljan ugovor i izvori: [Flutter promjena](app-dev/FINANCE-CROSS-BORDER.md).

- `node --test tests/finance*.test.js tests/invoice-enhancements.test.js`: 54 prošla, 0 neuspjelih, 0 preskočenih. Izvršeni su stvarni OCR, PDF/A, XML i QR validatori. `npm run build` prošao; ostaje upozorenje veličine glavnog bundlea.
- Ispravljeno: ponavljajući nacrti sada prenose referencu kupca i kontakt za e-račun. Regresijski test potvrđuje očuvanje podataka.
- Ispravljeno: uneseni domaći PDV broj kupca provjerava se dosljedno pri izdavanju i strukturiranom izvozu za sve tri zemlje. Provjera sintakse nije VIES provjera registracije.
- Preglednik: potvrđene austrijske informacije o paketima te automatski slovenski jezik, navigacija i slovenski formati paketa. To nije ručno testiranje svakog poslovnog slučaja.
- DE: XRechnung i ZUGFeRD — [BMF FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html), korišten indeksirani službeni sadržaj jer direktni pristup vraća 503.
- AT: ebInterface 6.1 i UBL 2.1 — [službeni podržani formati](https://www.erechnung.gv.at/erb/de_DE/tec_formats). Peppol koristi UBL, ne ebInterface.
- SI: e-SLOG 2.0 i UBL 2.1 — [UJP / GOV.SI](https://www.gov.si/teme/izmenjava-e-racunov-s-proracunskimi-uporabniki/). Sama XML datoteka nije integracija dostave UJP-u.
- AT stopa 4,9 % odnosi se na određene prehrambene proizvode od 1.7.2026., ne na svu robu: [USP](https://www.usp.gv.at/aktuelles/newsliste/neuer_ustsatz.html). Postojeća kontrola datuma usluge ostaje aktivna; korisnik mora pravilno klasificirati proizvod.

Zaključak: testovi potvrđuju implementirane domaće B2B slučajeve u EUR s podržanim pozitivnim stopama PDV-a. Produkcijska blokada ostaje. Nisu potvrđeni svi porezni slučajevi, storno/odobrenja, prekogranično poslovanje ni isporuka javnim naručiteljima. Nacionalni XSD i zajednički EN16931 validator nisu dokaz svih nacionalnih poslovnih pravila. Porezne prijave ostaju izvan proizvoda.

- [EUR-Lex, Direktiva (EU) 2023/970](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32023L0970): korišteni indeksirani službeni tekstovi; direktno otvaranje u ovoj sesiji vraćalo je anti-bot provjeru. Nije predstavljeno kao provjera nove konsolidirane verzije u cijelosti.
- [Njemački Bundestag, 9.9.2026.](https://www.bundestag.de/presse/hib/kurzmeldungen-1211074): zahtjev za prijedlog provedbenog zakona; nije dokaz stanja svih propisa na današnji dan.
- [Austrijski parlament, odgovor 6135/AB od 30.9.2026.](https://www.parlament.gv.at/dokument/XXVIII/AB/6135/imfname_1781085.pdf): prijedlog u vladinoj koordinaciji, potom predviđeno javno razmatranje.
- [OZS, slovenska komora](https://www.ozs.si/novice/novice/kaj-nam-prinasa-direktiva-o-preglednosti-placil-6a8da20c2a3aee0060ed3e3c): objavljena očekivanja prijenosa do kraja 2026.; nije usvojeni zakon.

U ovoj provjeri nije potvrđena konačna službena nacionalna shema za sve tri zemlje. Ne tvrditi da nacionalni propisi sigurno ne postoje samo zato što nisu nađeni. Postojeće nacionalne obaveze ne nestaju čekanjem prijenosa direktive; nacionalne dodatke tretirati prema [opisu nacionalnih izvještaja](NATIONAL-REPORTS.md).
