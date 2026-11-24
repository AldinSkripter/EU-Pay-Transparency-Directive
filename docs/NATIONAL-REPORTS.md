# Izvještaji po državama

Implementacija 3.11.2026. Ovo opisuje stvarni obuhvat proizvoda, ne certifikat pravne usklađenosti.

## Šta firma preuzima

U koraku **Berichtspaket / Paket poročil** postoje dva različita tipa izvještaja:

- **EU Article 9 / Article 10:** DE i AT na njemačkom, SI na slovenskom, prema državi autentificirane firme. Godišnji i satni pokazatelji, podjela prema primaocu, dostupna historija i zajednička procjena.
- **Nacionalni dodatni izvještaj:** DE §§21–22 EntgTranspG i AT §11a GlBG. Firma dopunjava potrebne podatke, potvrđuje ih i preuzima PDF/HTML/TXT. Ovi dokumenti nisu novi državni Article 9 XML adapteri. Za Sloveniju takav adapter nije potvrđen; EU dokument ostaje na slovenskom.

Promjena jezika ili domene ne mijenja jurisdikciju firme. API ne prihvata izbor druge države u zahtjevu za nacionalni dokument. Dokumenti se ne šalju automatski.

## Njemačka: §§21–22 EntgTranspG

[§21](https://www.gesetze-im-internet.de/entgtranspg/__21.html), [§22](https://www.gesetze-im-internet.de/entgtranspg/__22.html).

Poslodavac provjerava obuhvat: više od 500 zaposlenih i obaveza Lagebericht-a prema navedenim odredbama HGB. Aplikacija ne utvrđuje tu obavezu iz broja uvezenih redova.

Obrazac traži mjere jednakosti i njihove učinke, mjere jednakosti plata ili obrazloženje izostanka mjera. Traži prosječan broj zaposlenih žena i muškaraca za posljednju kalendarsku godinu perioda, odvojeno puno/nepuno radno vrijeme. Ti prosjeci ne mogu se pouzdano izvesti iz jednog godišnjeg payroll reda i korisnik ih mora dostaviti.

Podržani su trogodišnji i petogodišnji period; korisnik potvrđuje pravo na odabrani ciklus. Za naredni izvještaj unose se prethodni prosjeci i godina, a promjene se računaju automatski. Dokument navodi način objave uz Lagebericht i u Unternehmensregisteru.

## Austrija: §11a GlBG

[Zakon](https://www.ris.bka.gv.at/eli/bgbl/i/2004/66/P11a/NOR40126105), [službeni vodič za preračunavanje](https://www.einkommensbericht.gv.at/2-erstellen/2-2-5-hochrechnung-teilzeit.html), [obuhvat](https://www.einkommensbericht.gv.at/2-erstellen.html).

Postojeći režim: više od 150 zaposlenih, dvogodišnji izvještaj. Potrebne su kolektivne/betriebliche Verwendungsgruppen ili funkcionalne grupe, uz raspoložive grupne godine. To se ne smije automatski izjednačiti s kategorijama jednakovrijednog rada iz čl. 4.

Uz godišnji uvoz koristi se dodatni CSV, semikolon i decimalna tačka:

```csv
internal_id;pay_group;group_year;time_dependent_annual;time_independent_annual;fte_fraction;year_fraction
001;KV IT;3;16850;200;0.5;1
```

Značenje: stvarni godišnji iznosi zavisni/nezavisni od vremena, udio punog radnog vremena i dio godine u zaposlenju. Jedan red za svaku uvezenu osobu; zbir dva iznosa mora odgovarati osnovnoj + varijabilnoj naknadi godišnjeg snimka. Grupna godina ostaje prazna samo ako nije raspoloživa. Uvoz mora obuhvatiti sve relevantne komponente, uključujući primjenjive 13./14. isplate i pogodnosti.

Obračun: `time_dependent_annual / fte_fraction / year_fraction + time_independent_annual`. Službeni primjer: `16850 / 0.5 / 1 + 200 = 33900`. Vremenski nezavisna isplata se ne množi automatski faktorom zaposlenja.

**Granica:** formula pokriva konstantno ili prethodno stručno pripremljeno zaposlenje. Promjene radnog vremena, grupa i posebne vrste naknada zahtijevaju prethodnu obradu; aplikacija trenutno ne radi periodno razlaganje ovih promjena. Tačnost faktora je potvrda poslodavca, ne rezultat rekonstrukcije iz payroll transakcija.

Čuvaju se agregati po grupama i grupnim godinama, ne izvorni CSV ili personalni brojevi. Prosjeci malih grupa se štite, uključujući nadređenu grupu kada bi omogućila izvođenje zaštićenih vrijednosti. Prag pet je interna kontrola i nije zakonska garancija anonimnosti. Poslodavac mora provjeriti mogućnost identifikacije uz vlastito dodatno znanje. Za druge spolove ne izmišlja se M/Ž klasifikacija; ulaze u broj, ne u M/Ž prosjek.

Dokument navodi dostavu nadležnom organu radnika u prvom kvartalu naredne godine odnosno omogućavanje uvida kada takav organ ne postoji. To nije automatska dostava državnom tijelu.

## Slovenija

[PAY DAY, službeni izvor](https://www.gov.si/zbirke/projekti-in-programi/projekt-pay-day/). Podržan je slovenski EU izvještaj, a nije potvrđena zasebna nacionalna državna shema. Nepotvrđen adapter se ne može preuzeti pod oznakom službenog slovenskog formata. Ovo ne znači da je dokazano nepostojanje svih slovenskih propisa.

## Kontrole i dokazi

- Dodatni podaci vezani su za firmu, godinu i ID snimka. Novi snimak zahtijeva nove potvrde; stari podaci se ne koriste za novi izvoz.
- Nove rute koriste postojeće sesije, provjeru e-pošte, Origin zaštitu, tenant store i `Cache-Control: no-store`.
- API: `GET/POST /api/national-report`, `POST /api/national-report/document`.
- Postojeća `company_documents` tabela čuva dokumente pod ključem `national_YEAR`; nova migracija nije potrebna ako je migracija 009 primijenjena.
- [Testovi nacionalnih izvještaja](../tests/national-reports.test.js) provjeravaju službeni austrijski numerički primjer, potpunost podataka, pogrešne identifikatore, odvajanje firmi, jezik, PDF/HTML odgovor i invalidaciju snimka.
- [Testovi potpunosti](../tests/report-completeness.test.js) provjeravaju godišnje/satne razlike, historiju, zaštitu malih grupa, komponente naknade i potvrde.

Browser provjera: njemački obrazac popunjen i spremljen; dugmad omogućena; PDF API vraća 200, `application/pdf`, naziv datoteke i `%PDF-` sadržaj. Integrisani preglednik nije emitovao download događaj za postojeći Blob način preuzimanja, pa pohrana fajla na korisnikov disk nije potvrđena.

## Šta ostaje prije tvrdnje „potpuno zakonski usklađeno“

Nije potvrđen iscrpan pregled svih važećih i novih nacionalnih/sektorskih režima, posebno javnog sektora. Potrebni su lokalni stručni pregled i stvarni payroll primjeri, obrada promjena zaposlenja, politika čuvanja/brisanja i operativni backup/restore. Ovaj paket ne završava te obaveze. Nema potvrde službene državne sheme ili prihvata datoteke.
