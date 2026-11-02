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

## Zapošljavanje i kriteriji plata (čl. 5 i 6)

Stranica "Entgeltspannen & Kriterien":

- po kategoriji bilježi **raspon početne plate** (i kolektivni ugovor, ako postoji) i nudi prijedlog iz vaših podataka (10.–90. percentil osnovne plaće), s upozorenjem kad se medijan žena i muškaraca razlikuje za 5 % ili više;
- generiše **tekst za oglas** na jeziku države firme s rasponom i listom provjere: plata ili raspon prije razgovora (čl. 5(1)), rodno neutralan naziv (čl. 5(3)), bez pitanja o dosadašnjoj plati (čl. 5(2));
- generiše **list kriterija** za sve zaposlene (čl. 6): četiri kriterija po kategoriji iz koraka o jednakovrijednom radu, raspon i pravila napredovanja u plati.

Raspon određuje poslodavac po objektivnim, rodno neutralnim kriterijima; prijedlog je samo orijentacija. Testovi: `tests/pay-criteria.test.js`.

## Direktiva 2023/970 član po član: šta obavezuje poslodavca i šta radi Equitensa

Provjereno prema punom tekstu direktive na EUR-Lexu, 2.11.2026. (svih 37 članova). Članovi 14–17 i 19–29, 31–35 obavezuju **države**, ne poslodavce.

| Član | Obaveza poslodavca | Equitensa |
| --- | --- | --- |
| 3 | Definicije: nivo plate = bruto godišnje i bruto po satu; jaz = (M − Ž) / M; medijan; kvartili kao četiri jednake grupe; kategorija radnika | Primijenjeno u `server/pay.js`. Kvartili su "jednake" grupe koliko dozvoljava broj radnika (raspodjela po `floor`) |
| 4(4) | Kriteriji za jednakovrijedan rad (vještine, napor, odgovornost, uslovi) dogovoreni s predstavnicima radnika, ako postoje | Korak "Gleichwertige Arbeit" bilježi četiri kriterija po kategoriji i **status dogovora s predstavnicima** (nije blokirajuće). Nema alata za vrednovanje poslova |
| 5 | Plata ili raspon prije zaposlenja, zabrana pitanja o dosadašnjoj plati, rodno neutralni oglasi | Stranica "Entgeltspannen & Kriterien": raspon po kategoriji, tekst oglasa s listom provjere |
| 6 | Kriteriji za određivanje plata i napredovanje lako dostupni radnicima | List kriterija (PDF, TXT, HTML) |
| 7(1)–(2), (4) | Radnik na zahtjev dobija svoj nivo plate i prosjeke po spolu za svoju kategoriju, pismeno, u roku 2 mjeseca; može preko predstavnika ili tijela za jednakost; dodatna pojašnjenja uz obrazložen odgovor | Evidencija zahtjeva s rokom, generator odgovora iz podataka. Kanali: radnik, predstavnici, tijelo za jednakost, **inspekcija rada**. Vrste: informacija i **dodatno pojašnjenje** |
| 7(3) | Godišnja obavijest svim radnicima o ovom pravu | Generator teksta i evidencija datuma slanja |
| 7(5)–(6) | Radnik smije otkriti svoju platu; poslodavac smije ograničiti upotrebu tuđih podataka | Napomene u odgovoru radniku |
| **8** | **Informacije iz čl. 5, 6 i 7 moraju biti u formatu dostupnom osobama s invaliditetom** | Svaki takav dokument ima **pristupačni HTML** (jezik, naslovi, označene tabele, kontrast, bez slika) i običan tekst. PDF nije označen (tagged) |
| 9(1) | 7 pokazatelja a–g | `server/article9.js`, svi formati |
| 9(2)–(5) | Rokovi i učestalost po veličini | `shared/plans.js` |
| 9(6) | Potvrda uprave nakon savjetovanja s predstavnicima; predstavnici imaju pristup metodologiji | Potvrda u svim paketima, odjeljak "Methodik und Hinweise" |
| 9(7), (9) | Tijelu a–g; javnost a–f; radnicima i predstavnicima g; ranije četiri godine na zahtjev | Paketi po primaocu, historija u paketima |
| 9(10) | Dodatna pojašnjenja o podacima i razlikama za radnike, predstavnike, inspekciju rada i tijela za jednakost; obrazložen odgovor; otklanjanje neopravdanih razlika | Evidencija zahtjeva (vrsta "pojašnjenje", kanal "inspekcija rada"), korak "Erklären & handeln" |
| 10 | Zajednička procjena plata pri jazu od 5 % ili više, bez opravdanja i bez otklanjanja u 6 mjeseci; sadržaj (a)–(g) | Alarm, dokument s (a)–(g), rok od 6 mjeseci. (e) i (g) unosi poslodavac |
| 12 | GDPR; podaci samo za jednaku plaću; zaštita identiteta | Pseudonimizacija, zaštita malih grupa samo za radnike i javnost. **Politika brisanja i čuvanja podataka još nije napravljena** |
| 18(2) | Ako poslodavac nije proveo obaveze iz čl. 5, 6, 7, 9 i 10, on mora dokazati da nije bilo diskriminacije | **Nachweisübersicht**: datiran pregled onoga što je firma stvarno evidentirala po članovima (HTML, PDF, TXT, JSON) |
| 24 | Javne nabavke: država može isključiti ponuđača s neopravdanim jazom većim od 5 % ili nepoštovanjem obaveza | Alarm od 5 % i evidencija opravdanja pokrivaju ovo; nema posebne funkcije |

Testovi: `tests/accessibility-requests.test.js`, `tests/article9.test.js`, `tests/review-alarm.test.js`, `tests/worker-rights.test.js`, `tests/pay-criteria.test.js`.

## Stanje prenošenja po državama (provjereno 2.11.2026.)

Istraživanje je rađeno bez prave tražilice, pa "nije pronađeno" znači "nije moguće provjeriti", ne "sigurno ne postoji". Ponoviti prije svake komercijalne tvrdnje.

| Država | Zakon | Šta je poznato o izvještaju | Kome i kako se predaje |
| --- | --- | --- | --- |
| **Njemačka** | Nije donesen, nema objavljenog nacrta. Ministarstvo (BMBFSFJ) priprema nacrt, izmjena postojećeg EntgTranspG. Bundestag, 16.7.2026. | Nije propisano. Stručna komisija (Abschlussbericht, nov. 2025) preporučuje stvarnu plaću za period, varijabilne dijelove definirane negativno, bez proširenja ispod 100 zaposlenih. To su preporuke, ne zakon. | Nije odlučeno. Komisija preporučuje online portal s provjerom podataka i postojeću prijavu (npr. ELSTER) te sučelja prema DATEV-u. |
| **Austrija** | Nije donesen. Nacrt ministrice Schumann u vladinoj koordinaciji od 6.6.2026., ÖVP i NEOS koče (izvori: ORF, Der Standard). Formalni Ministerialentwurf nije pronađen. | Nacrt: obaveza od 100 zaposlenih, svake 3 godine za 100–249, godišnje od 250; sadržaj kao današnji Einkommensbericht. Definicije (prosjek/medijan, varijabilni dio, 5 %) nisu pronađene. | Nije pronađeno. |
| **Slovenija** | Nije donesen, nacrt nije pronađen. Ministarstvo "priprema" poseban zakon o jednakom plaćanju i transparentnosti plata (projekt PAY DAY, gov.si). | Nije pronađeno. | Nije pronađeno. |

Zaključak za proizvod: dok države ne objave obrazac, izvještaj ostaje po direktivi (čl. 9(1) a–g, čl. 10, čl. 12(3)). Kad stigne nacionalni obrazac, dodaje se kao novi izlaz, a ako propiše drugačije izračunavanje (npr. varijabilni jaz samo među primaocima), mijenja se `server/pay.js`. Izvori: Bundestag hib 16.7.2026; Drucksache 21/7180; BMBFSFJ Abschlussbericht komisije; ORF 7.6.2026; Der Standard 12.6. i 15.9.2026; gov.si PAY DAY.

Mjesta za ponovnu provjeru: dip.bundestag.de, parlament.gv.at (Ministerialentwürfe), RIS, e-demokracija.gov.si, pisrs.si, dz-rs.si.

## Šta još ne radi (prioritet P0)

1. **Službena predaja državi.** Za DE, AT i SI nije potvrđen nijedan portal ni shema za novi izvještaj; Austrija nije prenijela direktivu. Izvoz je zato "pripremljen", ne "predan". Ne izmišljati shemu.
2. **Pravni pregled i nezavisan obračun** po državi.
3. **Operativa:** brisanje i čuvanje podataka (čl. 12(2) i GDPR), backup, SMTP, Stripe, DNS i TLS na stvarnim servisima.
4. **Direktni HRIS konektori** (DATEV, SAP, BMD, Pantheon) čekaju stvarne anonimne izvoze. Datotečni uvoz postoji.
5. **Procjena vrijednosti rada (čl. 4):** sistem bilježi kriterije po kategoriji, ali nema alat za vrednovanje poslova.
6. **Radnici drugih spolova** ulaze u broj zaposlenih, ali ne u M/Ž poređenje, jer direktiva govori o ženama i muškarcima.
