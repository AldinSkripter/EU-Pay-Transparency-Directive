# Usklađenost s Direktivom (EU) 2023/970: šta je ispunjeno, a šta nije

Izvor: tekst direktive na EUR-Lexu (članovi 3, 4, 5, 6, 7, 9, 10, 12, 29 i 34), pročitan 2.11.2026. Austrijski stav o stanju prenošenja: [Arbeiterkammer, 10.7.2026](https://www.arbeiterkammer.at/interessenvertretung/arbeitundsoziales/frauen/Lohntransparenz-Was-jetzt-gilt.html). Ovo nije pravni savjet; svaka država traži vlastiti pravni pregled prije komercijalnih tvrdnji.

## Ko mora izvještavati i do kada (čl. 9(2)–(5), čl. 34)

| Zaposlenih | Učestalost | Prvi rok | Za godinu |
| --- | --- | --- | --- |
| 250+ | godišnje | 7.6.2027. | 2026. |
| 150–249 | svake tri godine | 7.6.2027. | 2026. |
| 100–149 | svake tri godine | 7.6.2031. | 2030. |
| do 99 | dobrovoljno; države mogu propisati obavezu | – | – |

Prenošenje u nacionalno pravo bilo je obavezno do 7.6.2026. Pravila su na jednom mjestu, [shared/plans.js](../shared/plans.js), i koriste ih izvještajni plan, stranica s cijenama i skala veličine firme. Test: `tests/plans.test.js`.

## Šta izvještaj mora sadržavati (čl. 9(1)) i gdje je to u sistemu

| Zahtjev | Gdje | Test |
| --- | --- | --- |
| (a) rodni jaz u plaći | `server/article9.js`, svi formati | `tests/article9.test.js` |
| (b) jaz u dopunskim/varijabilnim komponentama | isto | isto |
| (c), (d) medijani | isto | isto |
| (e) udio žena i muškaraca s varijabilnim dijelovima | isto | isto |
| (f) kvartili | isto | isto |
| (g) jaz po kategorijama, osnovno i varijabilno | isto, osim u javnom paketu | `tests/country-reports.test.js` |
| Nivo plate = bruto godišnje i bruto po satu (čl. 3(1)(b)) | svaki pokazatelj ima obje osnove | `tests/pay.test.js` |
| Potvrda uprave nakon konsultacije s predstavnicima (čl. 9(6)) | sekcija "Potvrda točnosti" u svim paketima; imena samo za nadležno tijelo i interno | `tests/country-reports.test.js` |
| Kategorije po vještinama, naporu, odgovornosti, uslovima (čl. 4(4)) | korak "Gleichwertige Arbeit", prikaz u internom paketu | `tests/self-service.test.js` |

## Ko šta dobija (čl. 9(7), 9(9), 12(3), 29)

| Primalac | Sadržaj | Zaštita malih grupa |
| --- | --- | --- |
| Nadležno tijelo | a–g, ranije godine | **ne**, podaci bez ograničenja (čl. 12(3), zadnja rečenica) |
| Radnici i predstavnici | a–g, ranije godine | da, manje od 5 osoba jednog spola |
| Javnost (poslodavac objavljuje) | samo a–f | da |
| Interno | sve, uključujući procjenu iz čl. 10 | ne |

Ranije godine (do četiri) ulaze u pakete kad su podaci uvezeni (čl. 9(9), čl. 29(3)(c)). Vrijednosti radne procjene čl. 10 ne napuštaju interni paket, jer bi otkrile zaštićene male grupe.

## Alarm od 5 % (čl. 10)

Zajednička procjena plata obavezna je kad su **sva tri** uslova ispunjena:

1. izvještaj pokazuje razliku u prosječnom nivou plate između žena i muškaraca od **najmanje 5 %** u bilo kojoj kategoriji radnika,
2. poslodavac razliku nije opravdao objektivnim, rodno neutralnim kriterijima,
3. nije otklonjena u roku od **šest mjeseci od predaje izvještaja**.

Kako to radi sistem:

- Provjera ide po svakoj kategoriji, na **ukupnoj plati** (bruto godišnje i bruto po satu), u oba smjera, na **nezaokruženoj** vrijednosti.
- Radi na stvarnim podacima, pa **kategorija zaštićena zbog male veličine ne može sakriti razliku**. To je bila greška u ranijoj verziji i ispravljena je.
- Kategorija s jednim spolom nema s čim da se poredi i ne aktivira alarm (označena je "nije moguće usporediti").
- Opravdanje i otklanjanje bilježe se po kategoriji; rok od šest mjeseci računa se od stvarnog datuma predaje koji upiše korisnik.
- Za slučaj obaveze postoji dokument **Zajednička procjena plata** sa sadržajem iz čl. 10(2)(a)–(g) i podjelom iz čl. 10(3). Dijelovi (e) i (g) ne mogu se izvesti iz podataka o platama, pa ih unosi poslodavac.

Testovi: `tests/review-alarm.test.js`, `tests/country-reports.test.js`.

## Pravo radnika na informacije (čl. 7), za firme svih veličina

U Austriji se prema Arbeiterkammeru već direktno primjenjuje. Stranica "Auskunftsrecht" u radnom prostoru:

- bilježi svaki zahtjev (radnik, predstavnici ili tijelo za jednakost) i računa rok od **dva kalendarska mjeseca** (čl. 7(4)), s oznakama "bald fällig" i "überfällig";
- iz podataka o platama izračunava **odgovor**: individualni nivo plate radnika (bruto godišnje i po satu, osnovno i varijabilno) i prosjeke žena i muškaraca u njegovoj kategoriji (čl. 7(1)), kao PDF ili tekst na jeziku države firme, uz uputu o pravima iz čl. 7(2), (5) i (6);
- **ne čuva** radnikovu internu šifru (poredi se samo pseudonim), a u dnevniku ostaju samo datum, korisnik i je li odgovor stigao na vrijeme;
- kad bi prosjeci otkrili platu pojedinca (manje od 5 osoba jednog spola), prosjeke ne daje (čl. 12(3)), a vlastitu platu daje;
- vodi **godišnju obavijest** radnicima o ovom pravu (čl. 7(3)), generiše tekst s kontaktom za zahtjeve i bilježi datum slanja.

Testovi: `tests/worker-rights.test.js`, `tests/worker-rights-postgres.test.js`.

## Šta još ne radi (prioritet P0)

1. **Čl. 5 i 6:** podatak o početnoj plati pri zapošljavanju i dostupnost kriterija plata nisu u proizvodu.
2. **Službena predaja državi.** Za DE, AT i SI nije potvrđen nijedan portal ni shema za novi izvještaj; Austrija nije prenijela direktivu. Izvoz je zato "pripremljen", ne "predan". Ne izmišljati shemu.
3. **Pravni pregled i nezavisan obračun** po državi.
4. **Operativa:** brisanje i čuvanje podataka (čl. 12(2) i GDPR), backup, SMTP, Stripe, DNS i TLS na stvarnim servisima.
5. **Direktni HRIS konektori** (DATEV, SAP, BMD, Pantheon) čekaju stvarne anonimne izvoze. Datotečni uvoz postoji.
6. **Procjena vrijednosti rada (čl. 4):** sistem bilježi kriterije po kategoriji, ali nema alat za vrednovanje poslova.
7. **Radnici drugih spolova** ulaze u broj zaposlenih, ali ne u M/Ž poređenje, jer direktiva govori o ženama i muškarcima.
