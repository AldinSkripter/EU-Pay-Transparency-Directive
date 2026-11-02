# Figures → proizvod za DE, AT i SI

Istraživanje: 1.11.2026. Pregledane javne stranice; nije bilo pristupa Figures aplikaciji, korisničkom računu ni njihovom backendu. Jasno razlikujemo njihove javne tvrdnje, provjereni tekst direktive i naše preporuke.

## 1. Što Figures javno nudi

| Funkcionalnost | Javno opisano ponašanje | Naš prioritet |
| --- | --- | --- |
| HRIS povezivanje | Centralizacija podataka; naslovnica navodi 30+ HRIS/review integracija | CSV prvo, zatim stvarni konektori po potražnji |
| Benchmark | Tržišne plaće i filtri po lokaciji i organizaciji | Kasnija faza; treba vlastiti ili licencirani skup podataka |
| Salary Bands | Platni rasponi po ulozi, razini i lokaciji | Nakon kvalitetne klasifikacije rada |
| Compensation Review | Budžeti, managerska odobrenja, povijest odluka, godišnje/izvanredne korekcije | Druga faza za trajnu vrijednost i obnovu pretplate |
| Pay Transparency | Izvještaji, kategorije rada, prilagođena/neprilagođena analiza, scenariji korekcije, zahtjevi zaposlenika i pisma | Početni tržišni fokus |

Na pregledanoj stranici cijena postoje **Structure**, **Companion** i **Pay Transparency**. Posljednji se nudi samostalno ili kao dodatak. Pozivi na kupnju vode na demo; u pregledanom sadržaju nije objavljen numerički cjenik. FAQ na drugoj stranici koristi drukčije nazive paketa, stoga cjenovnu ponudu treba potvrditi kroz njihov službeni prodajni proces. Nismo poslali upit prodaji.

Na dva paginirana prikaza integracija vidljivi su, među ostalim, Personio, HiBob, Workday, BambooHR, Rippling, Sage HR, Zoho People, Deel, Gusto, PayFit, NMBRS i SAP SuccessFactors. Vidljivi su i Entra ID, Okta, Culture Amp i Ledgy: svi logotipi nisu nužno payroll izvori. Katalog ne potvrđuje dostupnost kompletnog payrolla za 2026. niti univerzalno povezivanje jednim API ključem.

**Ne znamo** koriste li Figures vlastite konektore, agregator poput Merge/Finch ili kombinaciju. Factory/registry je naš izbor arhitekture, ne nalaz o njihovom izvornom kodu. Nismo pronašli dokaz da Figures koristi točno zadanu FTE formulu s 173,33 sati.

Prodajna struktura vidljiva javno: demo, korisničke priče, vodiči/webinari i mreža HR platformi, savjetnika te investicijskih partnera. To podupire preporuku kombiniranja pretplate s kvalitetnim onboardingom i partnerskim kanalom. Nije dokaz o njihovim internim stopama konverzije ili prihodima.

Izvori:

- [Figures naslovnica](https://figures.hr/)
- [Figures Pay Equity / Pay Transparency](https://figures.hr/solutions/pay-equity)
- [Figures paketi](https://figures.hr/pricing)
- [Integracije, stranica 1](https://figures.hr/partners-integrations)
- [Integracije, stranica 2](https://figures.hr/partners-integrations?1d656508_page=2)

## 2. Ispravci izvornog projektnog zadatka

Primarni izvor je [Direktiva (EU) 2023/970](https://eur-lex.europa.eu/eli/dir/2023/970/oj/eng). Marketinška stranica konkurenta nije pravna osnova.

Direktiva je stupila na snagu 2023.; članak 34 postavlja **7.6.2026.** kao rok za nacionalni prijenos. **7.6.2027.** je prvi izvještajni rok za veće poslodavce prema članku 9, a nije jedinstveni datum kada zakon počinje vrijediti u sve tri države.

| Broj radnika | Prvo izvještavanje prema EU minimumu | Referentna godina | Učestalost |
| --- | --- | --- | --- |
| 250+ | 7.6.2027. | 2026. | Svake godine |
| 150–249 | 7.6.2027. | 2026. | Svake tri godine |
| 100–149 | 7.6.2031. | 2030. | Svake tri godine |
| <100 | Nema opće obvezne EU prijave po ovom pragu | — | Moguća nacionalna obveza / dobrovoljno |

Nacionalni propisi mogu tražiti dodatne obveze. Prava kandidata i zaposlenika nisu ograničena samo na poslodavce koji imaju obvezu izvještavanja; članak 7 uključuje pravo na informacije i najkasnije dva mjeseca za odgovor. Nacionalnu provedbu treba provjeriti za svaki proizvodni market.

Članak 9 uključuje sedam skupina pokazatelja: ukupni jaz, jaz varijabilnih dijelova, ukupni medijan, medijan varijabilnih dijelova, udjele primatelja varijabilnog plaćanja, udjele M/F po kvartilima te jaz po kategorijama odvojen na osnovno i varijabilno plaćanje. Potvrda uprave i konzultacija predstavnika radnika također su dio procesa.

Prema članku 10, zajednička procjena plaća nije automatska posljedica svakog jaza od 5 %. Uvjeti su kumulativni: razlika najmanje 5 % u kategoriji, bez objektivnog spolno neutralnog opravdanja i bez otklanjanja unutar šest mjeseci od predaje izvještaja. Dashboard daje **prag za provjeru**, a ne zaključak da postoji diskriminacija.

Članak 3 i uvodna izjava 22 govore o godišnjoj bruto naknadi i odgovarajućoj bruto satnici. Fiksni 40-satni FTE i 173,33 nisu propisani tom direktivom. Treba obuhvatiti stvarne isplate, broj mjeseci u radnom odnosu, promjene ugovora/sati, bonuse i relevantne pogodnosti. Konačni nazivnik za sate i tretman naknada mora slijediti validiranu lokalnu metodologiju.

Za Austriju je osobito važan tretman 13./14. isplate gdje su primjenjive i bez dvostrukog brojanja; kolektivni ugovor ne zamjenjuje evaluaciju rada jednake vrijednosti. Kod plaće od 3.000 EUR mjesečno uz 14 isplata godišnji osnovni iznos je 42.000 EUR, a ne 36.000 EUR.

SHA-256 zaposleničkog identifikatora nije automatska GDPR anonimizacija. U ovoj aplikaciji je uvedena tenant-specifična HMAC pseudonimizacija; podaci o plaći i dalje su osobni podaci. Potrebni su odgovarajući pravni temelj, ugovor o obradi i kontrola pristupa.

## 3. Status državnih formata

| Tržište | Tvrdnja iz zadatka | Rezultat ove provjere |
| --- | --- | --- |
| SI | AJPES XML prema službenom XSD-u | Nije potvrđena točna nadležnost, XSD verzija ni portal za novu obvezu |
| AT | Arbeitsinspektorat CSV/XML | Nije potvrđen obvezni kanal ni točna tehnička specifikacija |
| DE | Bundesanzeiger PDF/TXT | Nije potvrđen kanal i format za novu obvezu iz direktive |

U ovoj provjeri nije pronađen i verificiran službeni nacionalni implementacijski paket za sve tri države. Izostanak potvrde ne znači da format ili propis ne postoje. Postojeće nacionalne obveze i raniji izvještaji moraju se odvojiti od novog režima direktive. Generički XML koji AJPES koristi za druge izvještaje nije dokaz za ovaj proizvod.

Zato aplikacija izvozi **interne radne nacrte**. Za službeni adapter treba pribaviti zakon, nadležno tijelo, tehničku specifikaciju, XSD/pravila validacije, testni primjer i potvrdu uspješne probne predaje. Svaka verzija adaptera mora imati datum primjene i izvor. Prodaja ne smije tvrditi „100 % spremno za AJPES/Bundesanzeiger” prije tog dokaza.

## 4. Kako osvojiti tvrtke

Predložena vrijednosna poruka: **„Od podataka o plaćama do provjerljivog izvještaja i plana korekcije — uz lokalnu podršku za DE, AT i SI.”**

Prvi segment: poslodavci sa 150–500 zaposlenih, bez razvijene compensation funkcije, s dostupnim godišnjim payrollom i HR osobom koja ima mandat za projekt. Kupac: HR direktor / payroll voditelj; financijska i upravljačka odobrenja: CFO/uprava; predstavnici radnika uključeni u proces. Njemačka je početni prodajni fokus, uz AT/SI pilote koji daju stvarnu lokalnu validaciju. Njemački jezik sam nije prednost jer Figures već ima DACH prisutnost.

Ponuda za pilot:

1. Procjena spremnosti i kontrola dostupnih podataka.
2. Uvoz 2026., zajedničko mapiranje kategorija i zapis problema kvalitete.
3. Pregled svih pokazatelja i priprema internog izvještaja.
4. Radionica s HR-om: koje razlike zahtijevaju obrazloženje i koje korekciju.
5. Nakon validacije nacionalnog adaptera: priprema službenog izvoza.

Trajna pretplata mora nuditi vrijednost između predaja izvještaja: praćenje promjena, zahtjeve zaposlenika, platne raspone, budžetiranje korekcija i povijest odluka. Za tvrtke sa 150–249 ljudi obvezni EU ciklus je tri godine, pa prodaja isključivo jednog godišnjeg PDF-a slabo podupire obnovu.

Kanali koje treba testirati: payroll/računovodstveni uredi, HR konzultanti i savjetnici za radno pravo; lokalni vodiči i webinari; ciljane demonstracije na sintetičkim podacima. Partnerski demo ne smije otkrivati podatke drugih klijenata. Nisu prikupljeni kontakti niti poslane poruke tvrtkama.

Hipoteza cijena, **ne Figuresov cjenik i ne potvrđena tržišna cijena**:

| Paket | Testna cijena | Namjena |
| --- | --- | --- |
| Prepare | 199 EUR/mj. | Jedna pravna osoba, CSV, analiza i radni izvještaj |
| Connect | 399 EUR/mj. | Verificirani konektor, kontinuirana provjera i korisnički workflow |
| Group | Od 799 EUR/mj. | Više pravnih osoba, prava pristupa i grupno izvještavanje |
| Onboarding | 750–1.500 EUR jednokratno | Kontrola podataka i mapiranje, ovisno o složenosti |

Pakete Connect/Group ne nuditi kao raspoložive dok potrebne funkcije ne rade. Na primjer, 100 tvrtki × 399 EUR × 12 daje 478.800 EUR godišnje ponavljajućeg prihoda prije popusta, poreza, podrške, infrastrukturnih troškova i odljeva; to je scenarij, ne prognoza.

Prije zaključavanja cijena: 10 razgovora s kupcima, 5 pilot ponuda, najmanje 3 plaćena pilota. Mjeriti vrijeme do prvog validnog izvještaja, pogreške u podacima, sate onboardinga, trošak konektora po tvrtki, spremnost na plaćanje i razlog obnove. Veličinu tržišta potvrditi službenim brojem poslodavaca po razredu zaposlenosti; nisu izmišljene brojke za DE/AT/SI.

## 5. Do 31.12.2026.

Od datuma istraživanja ostaje oko osam tjedana. Realan cilj je usko definiran, verificiran proizvod za pilote, a ne paritet svih Figures modula i desetaka produkcijskih konektora.

- Tjedni 1–2: provjera lokalnih propisa; test PostgreSQL-a i tenanta; dogovor stvarnih payroll primjera; 10 razgovora s kupcima.
- Tjedni 3–4: prvi stvarni konektor prema potvrđenoj potražnji, povijesni payroll i provjera podataka s HR-om; potpuna metodologija izračuna.
- Tjedni 5–6: validirani državni adapteri gdje je specifikacija dostupna; workflow zahtjeva zaposlenika/odobrenja; plaćeni piloti.
- Tjedni 7–8: provjera cijelog procesa na IONOS-u, sigurnost, backup i obnova; završna zakonska provjera i dokumentirano prihvaćanje pilota.

Ako nema službene specifikacije ili dostupnog API-ja, taj dio ostaje označen kao „u pripremi”; razvojni rok ne pretvara nepoznanicu u potvrđenu funkciju.
