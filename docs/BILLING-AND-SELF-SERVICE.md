# Samostalni proces i naplata

[Javna aplikacija](../src/Public.jsx) i [checkout](../src/App.jsx) imaju Prepare, Growth i Scale pakete. Cijene su naše produktne pretpostavke, ne Figures cijene. Svaki račun trenutno predstavlja jednu pravnu osobu; grupni multi-entity proizvod nije implementiran.

| Paket | Mjesečno | Godišnje ukupno | Limit zaposlenih |
|---|---:|---:|---:|
| Prepare | €99 | €899 | 250 |
| Growth | €199 | €1.799 | 1.000 |
| Scale | €399 | €3.599 | 2.500 |

Neto B2B cijene. Godišnja cijena štedi oko 24 % u odnosu na 12 mjesečnih uplata. Iznosi su definirani na jednom mjestu, [shared/plans.js](../shared/plans.js); Stripe cijene moraju imati točno te iznose. Svi uključuju CSV mapiranje, sedam EU grupa pokazatelja, klasifikaciju, provjere, potvrde i pripremljene radne izvještaje. Nacrt bez pretplate podržava do 250 zaposlenih. Direktni HRIS konektori nisu aktivni.

## Tok korisnika

Odabir paketa → registracija → pregled cijene i perioda → checkout → aktivacija preko potvrđenog provider događaja → import i mapiranje → obuhvat → četiri kriterija kategorije → sedam pokazatelja → objašnjenja/mjere → potvrda → odabir primaoca → izvoz.

[Workflow API](../server/app.js) i [validacija](../server/workflow.js) vežu potvrde za konkretan snimak. Novi uvoz ili materijalna promjena traži ponovnu potvrdu. Završni izvoz provjerava aktivan paket i sve radne korake; ne potvrđuje nacionalnu zakonsku predaju.

## Lokalno testiranje

Bez `DATABASE_URL` račun i podaci se čuvaju u memoriji i gube restartom. Kupnja je eksplicitna sandbox simulacija bez kartice i bez novčane naplate. Potvrda narudžbe provjerava firmu iz sesije. Produkcija nema sandbox-confirm endpoint. Koristiti sintetičke podatke.

## Stripe konfiguracija

Implementacija koristi Stripe HTTPS API, ne dodatni SDK. Potrebni su merchant račun, šest recurring Price ID-jeva, Stripe Tax postavke, Customer Portal i pravno potvrđeni komercijalni uslovi/impressum/privatnost za produkcijsko lansiranje.

1. Dodati `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_ORIGIN` i šest `STRIPE_PRICE_*` varijabli iz [predloška](../.env.example). Price objekti moraju imati prikazane EUR cijene, tačnu periodiku i porez izvan cijene.
2. `BILLING_ORIGIN` je operaterom zadani HTTPS origin; ne preuzima se iz proizvoljnog Host zaglavlja.
3. Stripe Checkout: subscription, billing address, tax ID i automatic tax. Iznos/prices se ne prihvataju iz klijenta.
4. Webhook: `POST /api/billing/webhook`, sirovo JSON tijelo, `Stripe-Signature` i replay window pet minuta. Obavezni događaji: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
5. Checkout aktivira tek potpisan `payment_status: paid` događaj povezan s server-side narudžbom. URL `?checkout=success` nije dokaz plaćanja.
6. Event ID se zapisuje idempotentno. Stariji događaji ne smiju ponovo aktivirati otkazanu pretplatu. Nepovezan event vraća 409 da Stripe pokuša ponovo.
7. Portal koristi customer povezan sa sačuvanom pretplatom. Potpisane promjene pretplate ažuriraju paket i period prema tačno jednom konfigurisanom Price ID-ju i količini 1. Nepoznata ili višestruka cijena daje status `price_unverified` i ne omogućava pripremljeni izvoz. Konfigurisati račune, promjenu i otkazivanje paketa u Stripe Customer Portalu. Trenutno pravilo ne implementira kompleksne proration/refund/grupne ugovore.
8. Uraditi pravi Stripe test-mode checkout i lifecycle test nakon konfiguracije; to u ovoj sesiji nije izvedeno. Potpis, replay, izolacija i događaji provjereni su lokalnim testovima, bez stvarnog provider računa.

Workflow, narudžbe i billing events imaju [PostgreSQL migraciju](../db/002_self_service.sql). Export audit čuva verziju pravila, user, snimak i dokument provjere. U ovoj sesiji stvarna PostgreSQL baza nije bila dostupna; CI test ima potrebne dodatne provjere.
