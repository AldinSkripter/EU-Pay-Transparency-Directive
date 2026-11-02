# IONOS VPS · Ubuntu 24.04 + Plesk

Kupljene domene su `equitensa.de`, `equitensa.at` i `equitensa.si`. Ovo je pripremljen postupak; postavljanje na server još nije provedeno jer nisu dostavljeni SSH pristup i PostgreSQL instance.

## Priprema

- Node.js 22+ (preporučeno podržano LTS izdanje), PostgreSQL i Plesk TLS certifikat za svaku domenu.
- Zaseban neprivilegirani OS korisnik i direktorij aplikacije; baza dostupna samo lokalno.
- DNS zapise za `equitensa.de`, `equitensa.at` i `equitensa.si` usmjeriti na VPS; dodati `www` za svaku domenu. U Plesku glavna domena `equitensa.de` i aliasi `equitensa.at` i `equitensa.si` trebaju posluživati isti app. Isključiti preusmjeravanje aliasa na glavnu domenu kako bi se sačuvalo tržište i jezik prema hostu. `www` može preusmjeravati na apex iste države uz odgovarajući TLS certifikat.
- TLS, javni portovi 80/443; 3000 i PostgreSQL se ne otvaraju internetu.
- Certifikati i točne APP_ORIGINS vrijednosti za sve tri domene. Ne koristiti wildcard prihvaćanje origin-a.

Produkcijska env konfiguracija za kupljene domene; zamijeniti tajne:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DATABASE_URL=postgresql://pay_app:REPLACE_ME@127.0.0.1:5432/pay_transparency
PSEUDONYM_SECRET=REPLACE_WITH_RANDOM_64_HEX_CHARACTERS
ADMIN_ENCRYPTION_KEY=REPLACE_WITH_SEPARATE_RANDOM_64_HEX_CHARACTERS
# Third separate key: encrypts customers' 2FA secrets. Losing it locks 2FA users out, so back it up with the others.
ACCOUNT_ENCRYPTION_KEY=REPLACE_WITH_THIRD_RANDOM_64_HEX_CHARACTERS
# Verification and password reset emails. The server refuses to start in production without it.
SMTP_URL=smtps://USER:PASSWORD@smtp.example.com:465
MAIL_FROM=Equitensa <no-reply@equitensa.de>
# Owner panel 2FA is mandatory in production unless this is set to false (not recommended: the panel holds the Stripe keys).
# ADMIN_REQUIRE_MFA=true
MARKET_DE_HOSTS=equitensa.de,www.equitensa.de
MARKET_AT_HOSTS=equitensa.at,www.equitensa.at
MARKET_SI_HOSTS=equitensa.si,www.equitensa.si
APP_ORIGINS=https://equitensa.de,https://www.equitensa.de,https://equitensa.at,https://www.equitensa.at,https://equitensa.si,https://www.equitensa.si
BILLING_ORIGIN=https://equitensa.de
# Unicode font for PDF reports, install an appropriately licensed font on the VPS:
PDF_FONT_PATH=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
```

Env se čuva izvan Gita i čitljiv je samo aplikacijskom korisniku. Ne koristiti lozinku baze iz primjera. Za HMAC ključ generirati najmanje 32 nasumična bajta; držati sigurnu kopiju zajedno s planom obnove. Kod produkcijskog pokretanja odbija rad bez baze i ključa.

## Build i migracija

```sh
npm ci
npm test
npm run build
npm run db:migrate
npm run admin:setup
npm start
```

Migracije 001–010 pokreću se jednom naredbom; 007 dodaje verifikaciju e-maila i MFA kolone, 008 zahtjeve radnika po članu 7, 009 rasponе plata i kriterije (čl. 5 i 6), 010 API ključeve i isporuke. Postojeći korisnici bez Google prijave morat će jednom potvrditi e-mail.

Provjeriti privilegije DB korisnika za migraciju i zatim ograničiti runtime korisnika prema operativnom modelu. Migracija koristi transakciju i može se ponovno pokrenuti; to nije pun sustav verzioniranih migracija za buduće izmjene.

Naredbu `admin:setup` pokrenuti u istoj produkcijskoj okolini i s istim DB pristupom i `ADMIN_ENCRYPTION_KEY` kao server. Otvoriti jednokratni link, kreirati vlasnika i uključiti MFA. Naplata se zatim postavlja kroz `/admin`; detalji su u [uputama za vlasnički panel](OWNER-ADMIN.md). Šifrirani kontrolni podaci i ključ trebaju zasebne sigurne kopije.

## Proces

Odabrati jedan process manager. Primjer systemd definicije u [equitensa.service](../deploy/equitensa.service). Prije korištenja promijeniti korisnika i apsolutne putanje; potvrditi stvarnu putanju Node executable-a. Ne pokretati paralelno isti app kroz Plesk Node manager i systemd.

Ako koristite Plesk Node extension, prilagoditi njegov startup način ovom ESM serveru i produkcijski env; ne pretpostavljati da će Passenger i proizvoljni port koristiti isti ugovor. Predloženi operativni model je samostalni Node + Plesk nginx proxy.

## Reverse proxy

Plesk generira nginx konfiguraciju, stoga ne lijepiti drugi `location /` u postojeći blok koji ga već ima. U Plesk postavkama/domenskome predlošku podesiti postojeću aplikacijsku lokaciju na ove vrijednosti ili to prepustiti administratoru:

```nginx
proxy_pass http://127.0.0.1:3000;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 60s;
client_max_body_size 5m;
```

Trenutno Express ne vjeruje proizvoljnim proxy zaglavljima: rate-limit za klijente iza proxyja dijelit će njegovu IP adresu. Prije javnog prometa konfigurirati točno poznati loopback proxy/trust hop i provjeriti da se izvorna IP adresa ne može spoofati; ne postavljati općenito `trust proxy=true`. Time treba riješiti i ograničenja velikih korisničkih grupa.

## Prihvatni test na VPS-u

1. Sve tri HTTPS domene vraćaju ispravan X-Market-Country/X-Market-Locale, a nepoznati host vraća 421.
2. Registracija i prijava rade sa Secure/HttpOnly cookiejem. Nema demo rute u produkciji.
3. Dvije tvrtke ne vide snimke niti izvještaje jedna druge, ni kad mijenjaju URL/host.
4. CSV kreira snimku u PostgreSQL-u; loš uvoz ne mijenja prethodnu snimku.
5. Restart aplikacije i VPS-a ne gubi podatke; proces se ponovno podiže.
6. PDF/CSV/XML/TXT se preuzimaju i zadržavaju oznaku radnog nacrta. Provjeriti slovenska slova s instaliranim fontom.
7. Backup se šifrira i kopira izvan VPS-a; probni restore na zasebnu bazu uspije.
8. Logovi ne sadrže CSV, bruto plaće, lozinke, cookieje i HRIS ključeve; monitoring pokriva disk, DB i dostupnost.

9. Registracija šalje e-mail za potvrdu na jeziku države firme; bez potvrde se ne otvara radni prostor. Reset lozinke i prijava s MFA kodom rade, a kod za oporavak vrijedi samo jednom.
10. Za svaku od tri države: uvoz datoteke u formatu njihovog payroll sistema, potvrda, te izvoz svih dokumenata (izvještaj, zajednička procjena) za sve primaoce. Automatizirano: `tests/country-reports.test.js`.
11. Vlasnik koji izgubi lozinku ili 2FA vraća pristup na serveru naredbom `npm run admin:reset`.

Kada službeni adapteri budu verificirani, dodati test sheme i stvarnu testnu predaju nadležnom tijelu. Ne izlagati neprovjereni build stvarnim kadrovskim podacima.
