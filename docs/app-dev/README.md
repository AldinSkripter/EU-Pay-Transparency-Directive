> Current invoice contract: [INVOICE-SYSTEM.md](INVOICE-SYSTEM.md) (v3, 15 November 2026). Read this first; it supersedes earlier narrower invoice scope below.

# Equitensa — APP DEV handoff

Prepared 15 November 2026. Intended clients: Flutter iOS and Android, one application with Pay and Finance modules.

**Team entry point:** read [START-HERE-FLUTTER](START-HERE-FLUTTER.md) first, followed by the current [package and parity matrix](PACKAGES-AND-PARITY.md). This handoff includes the Rechnungen 7.99 EUR package, server-enforced demo feature restrictions and invoice delivery APIs added on 15 November.

## What is ready today

- Existing web backend: Express, JSON API under `/api`, company-scoped storage; PostgreSQL outside local demo.
- Shared company identity, Pay workflows, Finance development endpoints, PDF and file downloads.
- DE, AT, SI are selected explicitly at registration. The authenticated company determines jurisdiction. Device language must not change it.
- `openapi.json` documents the **core development integration**, not a complete production mobile contract. `routes.json` inventories other routes for follow-up. Neither introduces new endpoints.
- `smoke.mjs` exercises a disposable local demo using its own cookie, without changing a browser session.

## What is NOT ready

Mobile OAuth/OIDC, PKCE, refresh-token rotation, device-session revocation, app/universal links, push delivery, production Finance permissions and live Finance billing are not implemented. `/api/v1`, `/oauth/authorize`, `/oauth/token` and a mobile entitlement endpoint do not exist. Do not build production login around the diagnostic cookie example.

Finance intentionally returns `503 FINANCE_RELEASE_NOT_ENABLED` outside isolated demo mode. Local photo/PDF OCR, structured invoice reading and validated structured TEST exports are implemented; live bank connections, direct sending and team invitations remain unavailable. See [camera and document contract](RECEIPT-CAPTURE.md) and [country-specific export scope](../FINANCE-EINVOICE-SCOPE.md). Do not advertise general legal compliance from this contract.

## Start tomorrow

1. Backend team starts the repository with Node 22.12+ and `npm run dev`. It binds to localhost in demo mode.
2. Run `node docs/app-dev/smoke.mjs` against localhost. It creates synthetic sessions for DE, AT and SI, checks company context, Finance state and Pay analysis, and logs out each session. This is a connectivity check, not a cross-company security audit.
3. Import `openapi.json` into the team's API viewer/client. Base URL: `http://localhost:3000/api` for desktop tooling only.
4. Flutter team may develop screens using fixtures/mocks. Real device testing needs an agreed HTTPS staging environment. No staging URL or reusable credentials have been provisioned. Android emulator localhost is not the development PC; do not expose the demo server publicly as a workaround.
5. Agree identity provider and mobile callback identifiers before implementing authentication. Follow `MOBILE-CONTRACT.md`.

## Shared ownership

Backend owns authentication, company membership, module access, tax/Pay calculations, numbering, PDF generation and persisted data. Flutter owns screens, navigation, validated input collection, camera/file picking and download/share UX. Both teams agree request schemas and error handling before changing them.

Use integer cents for returned money and decimal strings for entered unit prices/quantities. Never recompute authoritative invoice totals on the phone. Dates use `YYYY-MM-DD`; timestamps use ISO 8601. Countries are `DE`, `AT`, `SI`; currency is EUR for current Finance flows.

## Concurrent editing and retries

Finance mutations require the latest `state.revision`. Responses return `{state,result}`; replace local state with the returned state. A `409 FINANCE_VERSION_CONFLICT` requires reloading and presenting a conflict, not silently overwriting edits. General idempotency keys are not implemented. On a timeout, reconcile with the server before retrying creates or payments. Issuance has a stable request-key flow documented in [FINANCE-DELIVERY](FINANCE-DELIVERY.md); do not generate a new key blindly. Issued document snapshots must not be edited.

## Design handoff

Equitensa violet `#7451f8`, primary text `#30223f`, muted text `#6d5b7d`, background `#f7f5fb`, borders `#e4dbea`. Use the shared chart mark, clear PAY/FINANCE identity, same company switch and account area. Mobile controls should be adapted to touch, not copied at desktop pixel sizes. Invoice appearance is customer-controlled and must not inherit dashboard theme overrides.

All screens need loading, empty, error, permission-denied and offline states. Display unavailable capabilities honestly. Do not put real payroll data into mocks, analytics, logs or crash reports.

## Suggested first delivery

Login and company context; module access; overview; customer list; draft invoice create/read; PDF download/share; company logo; Pay report status and download. Camera uploads may follow. Offline writes, background synchronization, subscriptions sold inside the app and push notifications require separate specifications and store-policy review before release.

## Acceptance before production

- OAuth/PKCE tested on real iOS/Android devices, including logout and revoked sessions.
- Cross-company access tests and independent module entitlements enforced by the server.
- DE/AT/SI restrictions surfaced from capabilities, consistent PDF/totals across web/mobile.
- Conflict/timeout handling verified; no duplicate charges, payments or documents.
- Verified universal/app links, HTTPS staging, privacy declarations, release signing and store submissions owned by named team members.
- Existing Finance production gate stays closed until its release requirements are met.

Sources: [Flutter architecture](https://docs.flutter.dev/app-architecture/guide), [OAuth for native apps](https://www.rfc-editor.org/rfc/rfc8252.html).
