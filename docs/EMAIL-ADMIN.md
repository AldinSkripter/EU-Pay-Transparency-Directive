# Upravljanje emailovima

U admin panelu otvoriti **E-Mail und Vorlagen / Email and templates**.

## Server za slanje

Odabrati **Custom SMTP server**, upisati host, port, TLS/STARTTLS, korisničko ime i SMTP lozinku. Zatim postaviti ime i adresu pošiljaoca te opcionalni Reply-To. Za provjeru veze, testno slanje i spremanje traži se trenutna administratorska lozinka. Postavke se primjenjuju na naredne poruke bez restarta.

SMTP lozinka čuva se u postojećem šifrovanom control storeu i ne vraća se browseru. Prazno polje zadržava postojeću lozinku. Za uklanjanje: prebaciti na fallback, označiti uklanjanje i spremiti. Izmjene su za owner ulogu; auditor ne može mijenjati server ili slati testove.

Port 465 uobičajeno koristi TLS; 587 STARTTLS. Vlastiti SMTP zahtijeva šifrovanu vezu i provjeru certifikata. Opcije i provjera koriste [Nodemailer SMTP transport](https://nodemailer.com/smtp). Provjera veze potvrđuje konekciju/autentikaciju; samo slanje testne poruke i provjera stvarnog inboxa mogu potvrditi dostavu. Za domenu treba kod mail providera postaviti SPF, DKIM i DMARC. Aplikacija ne uređuje DNS automatski.

Fallback koristi postojeći SMTP_URL/MAIL_FROM ako su konfigurisani. Bez njega, lokalni demo zadržava poruke u memorijskom testnom inboxu; produkcija ne šalje poruke i prikazuje grešku u evidenciji dok se SMTP ne podesi. Produkcijski server se sada može pokrenuti i bez SMTP_URL da bi owner prvo konfigurirao mail iz admina. To nije potvrda da je slanje uključeno.

## Dizajn i jezik

Tri odvojeno uređive tržišne varijante: DE i AT na njemačkom, SI na slovenskom. Ne postoji treći zaseban „austrijski” jezik; AT predlošci se mogu zasebno prilagoditi austrijskim korisnicima.

Uređuju se naziv brenda, akcentna boja, pozadina, footer, predmet, glavni naslov, tekst, dugme i napomena. Podržane su varijable `{company}`, `{email}`, `{brand}`. HTML se generiše iz tih polja uz escaping; ne učitava se proizvoljan skript. Poziv na akciju i sigurnosni link generiše aplikacija, a promjena izgleda ne uklanja obavezu potvrde. HTML ima inline stilove, tabelarni raspored za email klijente, jezičku oznaku i tekstualnu alternativu. Pregled je sandboxovan u adminu; stvarni prikaz treba provjeriti i u korištenim mail klijentima.

Poruke:

- `verify`: premium pozdrav pri registraciji i jednokratni link za potvrdu, 24 sata.
- `welcome`: dobrodošlica nakon uspješne potvrde ili nove verifikovane Google registracije; ne aktivira plaćeni paket.
- `reset`: jednokratni link za promjenu lozinke, jedan sat; ne otkriva postojanje naloga nepoznatim podnosiocima zahtjeva.
- `passwordChanged`: sigurnosna obavijest nakon promjene/resetovanja lozinke.

Firma određuje jezik emaila prema državi pri registraciji, čak i kad korisnik koristi domenu drugog tržišta. Već postojeća Google prijava ne šalje ponovo registracijsku dobrodošlicu.

## Registracija i demo

Prava registracija i dalje je blokirana za poslovne funkcije do potvrde adrese. Ponovno slanje mijenja link; stari više ne važi. Ako slanje zakaže, ponovno slanje vraća vidljivu grešku i nalog se ne označava kao potvrđen.

„Produkt selbst erkunden” je sintetički demo s izolovanim, već potvrđenim `@demo.invalid` identitetom. Ne traži potvrdu nepostojeće adrese. Realni probni nalog napravljen registracijom zahtijeva potvrdu emaila kao i svaki drugi nalog.

Lokalni testni inbox prikazuje HTML i tekst posljednjih 30 uspješnih poruka, uključujući link za provjeru toka. Dostupan je samo owneru u lokalnom demo režimu; nestaje nakon restarta. Auditor i produkcijski panel ne dobijaju sadržaj ili tokene. Spremni link se može kopirati iz tekstualne alternative i otvoriti u browseru.

Evidencija zadnjih 100 pokušaja čuva vrijeme, vrstu, državu, maskiranu adresu, status i ograničeni kod greške. Ne čuva tokene, lozinke, puni tekst ili HTML u produkcijskoj evidenciji. `accepted` označava prihvatanje transporta, a ne garantovan prijem u inbox; `local` znači da vanjski email nije poslan. Nema automatskog retry reda: provjeru korisnik može ponovo zatražiti.

## Testiranje i primjeri

Testovi pokrivaju SMTP opcije/maskiranje/šifrovanje, pravi Nodemailer MIME sadržaj, autentikaciju i ovlasti admina, promjene predložaka, tri tržišta, potvrdu registracije, dobrodošlicu, reset, obavijest o promjeni lozinke, pogrešan SMTP i odvojen sintetički demo.

Za obnovu primjera: `node scripts/generate-email-examples.mjs`. Primjer: [DE registracija](examples/emails/DE-verify.html), [DE dobrodošlica](examples/emails/DE-welcome.html), [AT dobrodošlica](examples/emails/AT-welcome.html), [SI dobrodošlica](examples/emails/SI-welcome.html). Linkovi u primjerima su ilustrativni, bez važećih tokena.

Stvarno slanje na vanjsku adresu nije provjereno bez korisničkog SMTP servera i pristupnih podataka. SMTP integracija je testirana kontrolisanim transportom; MIME generisanje stvarnim Nodemailerom. Nakon unosa vlastitog servera završna provjera je **Check SMTP connection → Send test → provjera inboxa i spama → prava registracija i potvrda**.

Browser provjera na izolovanom testnom serveru: owner je kroz novi ekran spremio SI predložak i otvorio HTML preview; nova SI registracija dobila je baš taj predložak, pristup prije potvrde bio je 403, a nakon otvaranja linka 200 i poslana je dobrodošlica. Ekran potvrde i radni prostor ostali su na slovenskom i nakon novog otvaranja linka na drugoj tržišnoj domeni. Ukupni automatski testovi: 203 prolazi, 0 pada, 1 vanjski PostgreSQL test preskočen.
