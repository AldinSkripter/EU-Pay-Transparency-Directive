# Ugovor sadržaja EU izvještaja — provjera 3.11.2026.

Izvor: [Direktiva (EU) 2023/970](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A32023L0970), čl. 3, 4, 9, 10 i 12. Ovo je provjera sadržaja i ponašanja softvera, ne potvrda svih nacionalnih ili operativnih obaveza.

## Glavni izvještaj: član 9

| Stavka | Obavezan sadržaj | Implementacija |
| --- | --- | --- |
| 9(1)(a) | Prosječni rodni jaz | Godišnje i po satu |
| 9(1)(b) | Jaz dodatne/varijabilne naknade | Godišnje i po satu |
| 9(1)(c) | Medijan rodnog jaza | Godišnje i po satu |
| 9(1)(d) | Medijan jaza dodatne/varijabilne naknade | Godišnje i po satu |
| 9(1)(e) | Udjeli primalaca dodatne/varijabilne naknade po spolu | Odvojeni postoci M/Ž |
| 9(1)(f) | Udjeli M/Ž po kvartilima | Zasebno rangiranje po godišnjoj i satnoj naknadi |
| 9(1)(g) | Jaz po kategorijama, osnovno i dodatno/varijabilno odvojeno | Obje osnove, izostavljeno iz javnog paketa |
| 9(6) | Potvrda uprave i konsultacija | Workflow vezan za konkretan snimak |
| 9(7), 9(9) | Primaoci i dostupne prethodne četiri godine | Podjela paketa i historija |

Obračun radi iz stvarnih godišnjih iznosa i potvrđenih sati; kategorije i njihovu objektivnost utvrđuje poslodavac. Naknada mora obuhvatiti relevantne novčane i nenovčane komponente. Nepostojeći matematički nazivnik daje nedostupnu vrijednost, ne izmišljenu nulu.

## Zajednička procjena: član 10

| Stavka | Sadržaj | Izvor podataka |
| --- | --- | --- |
| 10(2)(a) | Udjeli M/Ž po kategorijama | Obračun |
| 10(2)(b) | Prosječne plate i dodatna/varijabilna naknada po kategorijama | Obračun |
| 10(2)(c) | Razlike prosječnih plata | Obračun |
| 10(2)(d) | Zajednički utvrđeni razlozi razlika | Poslodavac i predstavnici |
| 10(2)(e) | Udjeli poboljšanja plate nakon relevantnih dopusta | Potvrđeni brojevi i obračun postotaka |
| 10(2)(f) | Mjere za neopravdane razlike | Poslodavac i predstavnici |
| 10(2)(g) | Učinkovitost ranijih mjera | Potvrđeni tekst; navesti prvu procjenu ako ranijih nema |

Za obaveznost procjene prate se kumulativni uslovi iz 10(1). Za njen sadržaj razmatraju se i razlike ispod 5 %. Završni izvoz se odbija ako nedostaju tražena polja; nacrt ostaje dostupan za pripremu.

## Šta je promijenjeno u ovoj provjeri

- Dodani su godišnji kvartili u PDF/HTML/TXT, JSON, CSV, XLSX i XML, uključujući historiju. Originalna satna polja ostaju radi kompatibilnosti.
- U kvartile ulaze sve uvezene osobe. Drugi spol ne broji se kao žena; prosjeci M/Ž ostaju zasebni. Metodologija i nazivnici su opisani u dokumentu.
- Za povratak s dopusta unose se relevantne osobe i osobe s poboljšanjem, odvojeno po spolu. Softver računa udio; ne izvodi ga iz godišnje plate. Nula relevantnih osoba znači nedostupan postotak. Neprimjenjivost traži razlog.
- Osjetljivi brojevi o dopustima štite se u radničkom paketu. Interni prag pet je zaštitna politika, ne tvrdnja o univerzalnom zakonskom pragu.
- Procjena ima zasebnu provjeru potpunosti; član 9 nema pogrešno nametnuta dodatna polja člana 10.
- Obrazloženja i mjere za procjenu mogu se unijeti i za kategorije ispod 5 %.
- Izmjene sadržaja vraćaju potvrdu uprave na ponovnu provjeru. Pravila nose verziju `EU-2023-970-v2`.
- Prag 100–149 koristi referentnu godinu od 2030., umjesto proizvoljnog datuma predaje.

## Dokaz obračuna

[Referentni podaci](../tests/fixtures/eu-report-reference.js) su izmišljeni. Osam muškaraca: osnovno 60.000 + dodatno 6.000, 2.000 sati. Osam žena: osnovno 30.000, četiri s dodatnih 3.000 i četiri bez dodatka, 500 sati.

| Pokazatelj | Godišnje | Po satu |
| --- | --- | --- |
| a, c | 52,2727 % | −90,9091 % |
| b, d | 75 % | 0 % |
| g, osnovno | 50 % | −100 % |
| g, dodatno | 75 % | 0 % |

Primalaca dodatka: muškarci 100 %, žene 50 %. Prva dva satna kvartila sadrže samo muškarce, prva dva godišnja samo žene. Primjer dopusta: muškarci 4/8 = 50 %, žene 6/8 = 75 %.

[Test ugovora sadržaja](../tests/eu-report-contract.test.js) uspoređuje rezultate s ovim ručnim vrijednostima, provjerava izvozne prikaze, odsutne nazivnike i druge spolove. [API testovi po državama](../tests/country-reports.test.js) provjeravaju DE/AT/SI i svih sedam formata, odbijanje nepotpune plaćene procjene te ponovnu potvrdu i uspješan izvoz.

Browser provjera: novi unos za Engineering L3 je spremljen kroz obrazac; API izvještaja vraća 50 % muškaraca i 75 % žena prema unesenim 4/8 i 6/8. Integrisani preglednik još ne potvrđuje pohranu preuzetog fajla na korisnikov disk.

## Granice

Provjera ne dokazuje da je korisnik dostavio sve stvarne isplate, sate i objektivne kategorije ili da je sadržaj njegovog obrazloženja pravno valjan. Nacionalni dokumenti, posebni režimi i službene sheme ostaju zasebni: [opis po državama](NATIONAL-REPORTS.md). Pitanja čuvanja/brisanja, produkcijske infrastrukture i stručnog nacionalnog pregleda nisu završena ovim paketom.
