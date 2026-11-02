# EU izvještaj: sadržaj, primaoci i automatizacija

Provjereno 01.11.2026. Izvor: [Direktiva (EU) 2023/970](https://eur-lex.europa.eu/eli/dir/2023/970/oj/eng), posebno članci 3, 4, 7, 9, 10, 12, 29 i 34. Ovo je tehnička specifikacija za razvoj i provjeru proizvoda; nacionalni zahtjevi moraju imati zaseban dokaz.

## Šta je izvještaj i kome se predaje

EU ne izdaje jednu univerzalnu datoteku niti nalaže svim firmama slanje u Bruxelles. Država određuje tijelo koje prikuplja podatke. Članak 9(7) zahtijeva slanje **a–g** tom tijelu; to nije samo a–f. Država može sama prikupiti a–f iz administrativnih izvora prema članku 9(8). To ne znači da smijemo pretpostaviti da je obaveza konkretnog poslodavca automatski ispunjena.

| Paket | Sadržaj | Primaoci / pravni osnov |
|---|---|---|
| Nacionalno tijelo | Svih a–g | Tijelo određeno nacionalnim pravom; 9(7), 29(3)(c) |
| Zaposleni i predstavnici | g obavezno; naš radni paket dodatno sadrži a–f | Svi zaposlenici i njihovi predstavnici; 9(9) |
| Inspekcija rada / tijelo za jednakost | Podaci iz 9(9), na zahtjev; prethodne četiri godine ako postoje | 9(9) i dodatna pojašnjenja prema 9(10) |
| Javni sažetak poslodavca | a–f | Poslodavac može objaviti; 9(7) |
| Interna provjera | a–g, metodologija, klasifikacija, objašnjenja, mjere, potvrda | Uprava i predstavnici; 9(6), 9(10) |
| Zajednička procjena | Zaseban sadržaj 10(2)(a–g) | Zaposleni/predstavnici, monitoring tijelo; inspekcija/tijelo za jednakost na zahtjev; 10(3) |

Javni paket zato isključuje pojedinačne kategorije i interne bilješke. Paket za tijelo sadrži kategorije, ali ne automatski interne personalne bilješke ili potpis uprave. Slanje u ovoj verziji obavlja korisnik; aplikacija ne tvrdi da je izvještaj predat niti izmišlja potvrdu prijema.

## Sedam obaveznih grupa pokazatelja

| Članak 9(1) | Pokazatelj | Ulaz / obrada u aplikaciji |
|---|---|---|
| a | Rodni jaz u ukupnom plaćanju | Stvarna osnovna godišnja naknada + komplementarni/varijabilni dijelovi; prosjek M/F |
| b | Jaz u komplementarnim/varijabilnim dijelovima | Poseban komponentni iznos; prosjek M/F |
| c | Medijalni ukupni rodni jaz | Medijani ukupne naknade M/F |
| d | Medijalni jaz u komplementarnim/varijabilnim dijelovima | Medijani varijabilne naknade M/F |
| e | Udjeli žena i muškaraca koji primaju te dijelove | Primatelji / sva lica odgovarajućeg spola u obuhvatu |
| f | Udjeli M/F u svakom platnom kvartilu | Sortiranje po ukupnoj satnici, četiri grupe, reproducibilne granice |
| g | Jaz po kategorijama jednakog ili jednako vrijednog rada | Osnovni i komplementarni/varijabilni dio zasebno; godišnje i po satu |

Članak 3 definiše nivo plaćanja kao bruto godišnji i odgovarajući bruto satni iznos. Formula jaza: `(prosjek M − prosjek F) / prosjek M × 100`. Medijalni jaz koristi medijane. Nula u nazivniku znači neodrediv rezultat, a ne 0%. Trenutna metoda kvartila koristi satnu naknadu; konačni nacionalni adapter mora potvrditi osnovu i granice.

Izvorna formula `40 / 173.33` nije univerzalna službena formula Direktive niti dokaz Figures interne metode. U kodu je samo dopunski FTE pokazatelj. Zakonski radni pokazatelji koriste stvarne godišnje iznose i potvrđene godišnje plaćene sate.

## Podaci i klasifikacija prije računanja

- Jedan red godišnjeg sažetka po osobi, s provjerenim iznosima i godišnjim satima. Trenutni godišnji model zahtijeva pripremu izvornih promjena ugovora, dolazaka/odlazaka i odsustava prije uvoza.
- Obuhvatiti sva relevantna plaćanja i pogodnosti u novcu/naturi. Austrijske dodatne isplate, gdje važe, uračunati jednom u odgovarajuću komponentu. Negativne payroll korekcije i višestruke valute trenutno se ne obrađuju automatski; izvor mora dati provjeren godišnji EUR sažetak.
- Članak 4 zahtijeva objektivne, rodno neutralne kriterije: vještine, napor, odgovornost i uslovi rada, te druge relevantne faktore. Naziv posla ili KV razred sami ne dokazuju jednaku vrijednost.
- Interna politika skriva pokazatelje kada je u podgrupi manje od 5 M ili 5 F. To nije univerzalni zakonski prag. Članak 12(3) razlikuje pristup osjetljivim podacima; monitoring tijelo može zahtijevati podatke bez ograničenja. Dok se nacionalni režim ne potvrdi, naši izvozi su radni i zaštićeni, ne dokaz spremnosti za državni portal.
- HMAC identifikatori su pseudonimi i ostaju lični podaci pod GDPR-om. Izvorni ID i CSV ne zadržavaju se; polja za naziv posla i bilješke ipak ne smiju sadržavati nepotrebne lične podatke.

## Rokovi

- Direktiva je stupila na snagu 2023; rok nacionalnog prenosa bio je **07.06.2026**, ne 2027.
- 250+ zaposlenih: prvi izvještaj **07.06.2027**, zatim godišnje, prethodna kalendarska godina.
- 150–249: prvi **07.06.2027**, zatim svake tri godine, prethodna godina.
- 100–149: prvi **07.06.2031**, zatim svake tri godine.
- Manje firme mogu izvještavati dobrovoljno; država može propisati dodatne obaveze. Broj zaposlenih za pravni obuhvat korisnik potvrđuje zasebno od broja importovanih redova.
- Prvi izvještaj 2027 zato obuhvata 2026. januarska prodaja nije januar kao EU rok predaje.

## Potvrda i mjere

Uprava prema 9(6) potvrđuje tačnost nakon konsultovanja predstavnika zaposlenih, koji imaju pristup metodologiji. Aplikacija čuva potvrdu vezanu za snimak podataka; novi snimak ili materijalna promjena klasifikacije/provjere poništava potvrde. Ovo nije kvalifikovani elektronski potpis niti dokaz stvarno izvršene konsultacije.

Članak 10 zajedničku procjenu traži za poslodavce obuhvaćene izvještavanjem, uz **sva tri** uslova: kategorijski prosječni jaz najmanje 5%, bez objektivne rodno neutralne opravdanosti, bez otklanjanja u šest mjeseci od predaje izvještaja. Alarm sam ne potvrđuje diskriminaciju. Naš tracker pokazuje rok i zadatak za procjenu prema unesenom datumu; nacionalni obuhvat i dokaze potvrđuje HR/pravno lice.

Kompletna zajednička procjena prema 10(2) dodatno treba prosječne nivoe plaće po spolu/kategoriji, zajednički utvrđene razloge, podatke o poboljšanjima po povratku s roditeljskih/negovateljskih odsustava i evaluaciju ranijih mjera. Trenutni Article 9 radni izvještaj i tracker **nisu** taj kompletni dodatni izvještaj.

Članak 7 je zasebno pravo: pisani odgovor o vlastitoj naknadi i prosjecima M/F za jednaki/jednako vrijedni rad, najkasnije dva mjeseca od zahtjeva, te godišnje obavještavanje zaposlenih o pravu. Prag 150+ nije izuzeće od tih prava. Ovaj zahtjev se ne zamjenjuje grupnim Article 9 PDF-om. Članci 5–6 pokrivaju početni raspon plaće, zabranu pitanja o ranijoj plaći i transparentne kriterije određivanja/napredovanja plaće; to su dodatni produktni moduli.

## Dokazi za DE, AT i SI

Provjeren [EUR-Lex registar nacionalnog prenosa](https://eur-lex.europa.eu/legal-content/EN/NIM/?uri=CELEX:32023L0970), koji se ažurira sedmično. Pri pregledu: DE 0 prijavljenih mjera, AT 42, SI 16. To su prijave država, **ne potvrda Komisije da je prenos potpun i pravilan**. Brojevi nisu dokaz operativnog portala, XSD-a ili CSV specifikacije.

- AT: lista uključuje mnoge ranije i pokrajinske propise, npr. [Steiermärkisches Landes-Gleichbehandlungsgesetz 2023, izmjena 2026](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=NIM:202605855) i [Burgenländisches Gleichbehandlungs- und Antidiskriminierungsgesetz 2026](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=NIM:202607784). To nije potvrda univerzalne B2B predaje Arbeitsinspektoratu. [Arbeiterkammer članak od 10.07.2026](https://www.arbeiterkammer.at/interessenvertretung/arbeitundsoziales/frauen/Lohntransparenz-Was-jetzt-gilt.html) upozorava na tadašnji propušten rok prenosa; ne tretiramo ga kao dokaz kompletnog statusa u novembru.
- SI: lista uključuje [Zakon o delovnih razmerjih](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=NIM:215745), [Zakon o varstvu pred diskriminacijo](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=NIM:239402) i [ZSTSPJS](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=NIM:202603913), uz druge propise. U provjerenim dokazima nema potvrde AJPES XSD-a za ovu obavezu.
- DE: registar nije prikazao prijavljene mjere. Iz toga ne zaključujemo da nema relevantnog važećeg nacionalnog zakona. Ranije obaveze prema Entgelttransparenzgesetz/Bundesanzeigeru ne smiju se automatski izjednačiti s novom Article 9 predajom.

## Kako se aktivira nacionalni adapter

Za svaki adapter treba čuvati: službeni pravni izvor i njegovu verziju, datum primjene, nadležno tijelo, portal/API, upute za potpis/predaju, službenu shemu i kontrolni hash, specifikaciju metrike, obavezna polja, autentikaciju, validaciju i dokaz prijema. XSD se provjerava protiv službenog izdanja; uspjeh HTTP zahtjeva nije dovoljan dokaz prihvaćene predaje.

Trenutni [registar pravila](../server/regulatory.js) vraća `NATIONAL_CHANNEL_UNVERIFIED` i `automaticSubmission: false` za DE/AT/SI. [Generator](../server/reports.js) stvara lokalizovani PDF/TXT i radni CSV/XML iz istog snimka. XML namespace je `urn:equitensa:internal:draft:v1`. Gating provjerava paket, snimak i potvrde; audit zadržava kontekst izvoza. Budući službeni adapter mora radni model transformisati i validirati, bez promjene izvornog snimka ili lažne oznake „predato“.

Tok: **HR/payroll → godišnja normalizacija → pseudonimizovan snimak → svih a–g → klasifikacija i provjere → potvrda → odabrani primalac → radni izvoz → potvrđeni nacionalni adapter → stvarni dokaz prijema**. Posljednja dva koraka trenutno nisu aktivirana.

`GET /api/reporting-plan?year=2026&audience=authority` povezuje državu iz autentificirane firme, potvrđeni headcount, referentnu godinu, periodiku i primaoca. Za 150–249 rok postoji za referentne godine 2026, 2029 itd., a za 250+ svake godine od 2026. Nepotvrđen headcount ne stvara rok. Nacionalni kanal, službena shema i potvrda prijema ostaju eksplicitno nepotvrđeni. Završni frontend ekran čita ovaj API. Svaki izvoz nosi `X-Report-Rules`, `X-Report-Recipient` i `X-Report-Status`; njegova oznaka ne mijenja izvorni snimak niti kasniji nacrt.
