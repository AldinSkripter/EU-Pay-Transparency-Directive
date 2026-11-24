# Equitensa regional deployment

One application and database serve all three domains. `/api/context` resolves
the exact allowed Host; Pay and Finance use this market before sign-in.

| Hosts | Default market | Language |
| --- | --- | --- |
| equitensa.de, www.equitensa.de | DE | German |
| equitensa.at, www.equitensa.at | AT | German |
| equitensa.si, www.equitensa.si | SI | Slovenian |

Registration confirms the actual company country. Once signed in, the stored
company country takes precedence for financial rules. Finance's explicit language
preference affects the interface, not the company country or invoice calculations.
Public regional links preserve Pay or Finance but do not forward query strings,
tokens, fragments or private document paths.

## Hosting steps still required

1. Point each apex domain's DNS to the hosting provider's specified address or
   supported alias. Point each www hostname as instructed by that provider.
   Do not guess IP addresses; these depend on the production host.
2. Attach all six hostnames to the same application and provision HTTPS for each.
3. Preserve the original Host header at the reverse proxy. Unknown hosts return
   HTTP 421; arbitrary forwarded-host headers must not select a market.
4. Use the MARKET_*_HOSTS values in [.env.example](../.env.example). Set production
   APP_ORIGINS to the six HTTPS origins only (remove development localhost entries).
5. Configure the existing PostgreSQL, encryption keys, SMTP and production settings.
   Local MemoryStore demo must not be published. Existing release gates still apply.
6. Test /api/context, registration, verification, login, reset links, Pay and
   Finance on every domain and www alias. Check email links and any configured
   payment/OAuth callbacks against the actual provider configuration.

## Sessions

Accounts share the database, but session cookies are host-only. A user who moves
between .de, .at and .si currently signs in again using the same account. This change
does not implement single sign-on. Never copy cookies or session tokens into URLs.
Production DNS/HTTPS and live sign-in have not been verified by the local tests.
