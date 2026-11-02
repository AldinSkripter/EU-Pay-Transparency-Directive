# Google registracija i prijava

U vlasničkom panelu `/admin` otvoriti **Google prijava**. Samo aktivni vlasnik može izmijeniti postavke, uz potvrdu svoje lozinke; u produkciji je obavezna vlasnička 2FA. Revizija odbija zastarjeli unos drugog vlasnika.

## Google Cloud

1. Kreirati Google Cloud projekat i konfigurirati Google Auth Platform: Branding, Audience i Data Access. Za javni SaaS izabrati External. Postaviti Equitensa naziv, kontakt, početnu stranicu i objavljene stranice privatnosti i uvjeta korištenja. Potvrditi domene ako Google to zatraži.
2. Kreirati OAuth client vrste **Web application**. Server koristi authorization code tok; Client Secret nije javni frontend ključ.
3. U **Authorized redirect URIs** unijeti tačne adrese:

   ```text
   https://equitensa.de/api/auth/google/callback
   https://equitensa.at/api/auth/google/callback
   https://equitensa.si/api/auth/google/callback
   ```

   Ako se koristi `www`, odgovarajuće `https://www.equitensa.…/api/auth/google/callback` adrese dodati i u Googleu i u panelu. Ako se `www` preusmjerava na korijensku domenu, preusmjeravanje mora završiti prije početka Google prijave. Povratak se ne prebacuje na drugu državu. Sve aktivne domene također trebaju biti u serverskom `APP_ORIGINS`.

4. Kopirati Client ID i Client Secret u panel, uključiti opciju i spremiti uz vlasničku lozinku. Prazno polje tajne zadržava postojeću tajnu. Zamjena tajne ili bilo koje spremanje postavki poništava nezavršene Google tokove. Postavke se koriste odmah, bez restarta.
5. U Google testnom režimu dodati testne korisnike. Za pristup svim klijentima objaviti consent screen i dovršiti provjere koje Google traži. Opseg je samo `openid email profile`; nema Gmail/Drive dozvola.

Lokalno, iz panela dugmetom dodati tačnu adresu trenutnog localhosta, npr. `http://127.0.0.1:3000/api/auth/google/callback`, i istu upisati u Google Cloud. Lokalne HTTP adrese dozvoljene su samo u demo okolini. Produkcijska konfiguracija odbija takve adrese.

## Korisnički tok

- Dugme **Mit Google fortfahren / Nadaljujte z Googlom** pojavljuje se na prijavi i registraciji kada je Google uključen i tačna domena ima povratnu adresu u konfiguraciji.
- Novi Google korisnik potvrđuje naziv firme i DE/AT/SI državu. Firma se kreira tek tada, s HR ulogom; dodatna lozinka se ne generira. Ne povezujemo firme prema e-mail domeni.
- Odabrani paket i mjesečni/godišnji period čuvaju se kroz OAuth i potvrdu firme; korisnik nastavlja na checkout. Google prijava ne aktivira plaćeni paket: to radi postojeći Stripe checkout/webhook tok.
- Postojeći Google `sub` identitet otvara svoj postojeći račun čak i ako Google kasnije promijeni e-mail. Identitet se prepoznaje po potpisanom `sub`, a ne po adresi e-pošte.
- Ako verificirani Google e-mail odgovara računu s lozinkom, korisnik mora unijeti tu lozinku i izričito potvrditi povezivanje. Tek tada Google postaje dodatna prijava tog računa. Nije moguće preuzeti postojeću firmu samo na osnovu Google e-maila.
- Google nikada ne daje vlasnički pristup. Blokirane firme ne mogu završiti Google prijavu.
- Isključivanje zaustavlja nove Google prijave. Postojeće sesije ostaju do isteka ili odjave. Računi koji koriste samo Google trebaju ispravnu ponovno uključenu Google konfiguraciju za sljedeću prijavu; javni password reset nije dio ovog toka.

## Tehničke zaštite i spremanje

Authorization code, PKCE S256, nonce i nasumični state vezani su za HttpOnly SameSite=Lax privremeni kolačić. OAuth tok i naknadna potvrda firme vrijede po najviše deset minuta i mogu se potrošiti jednom. Redovne klijentske sesije zadržavaju SameSite=Strict, HttpOnly i Secure u produkciji. Zahtjevi koji mijenjaju stanje zahtijevaju dozvoljeni Origin.

Biblioteka `jose` provjerava RS256 potpis preko Google JWKS, issuer, audience, expiration, issued-at, nonce, autoriziranu stranu i verificirani e-mail. Koristimo isključivo fiksne Google endpointove. Google access/refresh tokeni se ne spremaju.

Client Secret je u šifriranom kontrolnom dokumentu zajedno s postojećim vlasničkim postavkama. Admin API vraća samo oznaku da tajna postoji; audit ne sadrži tajne. [Migracija 004](../db/004_google_auth.sql) dodaje jedinstveni Google identitet korisnika i tablicu privremenih OAuth tokova. Istekli tokovi brišu se pri kreiranju sljedećeg toka. Kod Google korisnika hash lozinke je NULL.

Prije produkcije pokrenuti `npm run db:migrate`, postaviti HTTPS/APP_ORIGINS i sačuvati odvojeni `ADMIN_ENCRYPTION_KEY` prema [vlasničkim uputama](./OWNER-ADMIN.md). Obavezno napraviti stvarnu Google registraciju i ponovno prijavljivanje na svakoj aktivnoj domeni; spremanje ključeva nije potvrda da je Google consent screen objavljen ili da su Google povratne adrese ispravne.

Automatski testovi koriste potpisane sintetičke ID tokene i mock Google endpointove. Stvarna Google prijava zahtijeva vlastite OAuth podatke; lokalni demo ne sadrži radne Google ključeve.
