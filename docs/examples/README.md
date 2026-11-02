# Sintetički primjeri importa

Ovi primjeri ne sadrže stvarne radnike niti provjeravaju vendor kompatibilnost.

1. Otvoriti firmu odgovarajuće države DE, AT ili SI.
2. U report builderu odabrati 2026 i uploadati odgovarajući XLSX, XLS ili XML.
3. Otvoriti pregled. Lokalizovana zaglavlja se predlažu automatski; pregledati i potvrditi mapiranje.
4. Potvrditi EUR, godišnje iznose i sate, pa uvesti 12 sintetičkih zaposlenih.
5. Ponovni identični unos vraća isti snimak; historija ostaje na jednom batchu.
6. Preuzeti nacrt XLSX/JSON/PDF izvještaja. Za pripremljeni plaćeni paket treba dovršiti postojeći workflow i imati aktivan paket.

Njemačka i Austrija imaju njemačka zaglavlja, ali različit `reporting_country`; slovenski XLSX ima slovenska zaglavlja. Fajl druge države treba biti blokiran. XML koristi kanonske nazive za jednostavno provjeravanje. Excel brojevi su numeričke ćelije s decimalnom tačkom u kanonskom pregledu.

Ponovno generisanje: `node scripts/generate-import-examples.mjs`.
