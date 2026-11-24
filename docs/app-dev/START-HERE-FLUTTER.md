> Current invoice contract: [INVOICE-SYSTEM.md](INVOICE-SYSTEM.md) (v3, 15 November 2026). Read this first; it supersedes earlier narrower invoice scope below.

# Flutter team: start here

Handoff updated 15 November 2026: international contacts and EU B2B service reverse charge. Read [the required change note](FINANCE-CROSS-BORDER.md) before implementing invoice models.

## Product and integration rule

Build one Equitensa app with Pay and Finance workspaces. The app and web use **the same backend, authenticated company and persisted records**. Do not build a second database, invoice numbering service, tax calculator, report generator or subscription system. Flutter renders server results and collects user input.

Changes saved in the app must appear on web after refresh, and vice versa. Real-time push updates are not implemented. Initially refetch on screen entry, app resume and pull-to-refresh. Preserve unsaved edits and handle conflicts explicitly.

## Read in this order

1. [README](README.md): current environment and release boundaries.
2. [Mobile contract](MOBILE-CONTRACT.md): required native authentication work, not available endpoints.
3. [OpenAPI](openapi.json): selected implemented development API routes. Base URL ends in `/api`.
4. [Route inventory](routes.json): additional source locations. Not a complete typed contract.
5. [Camera/import workflow](RECEIPT-CAPTURE.md).
6. [Invoice issuance and delivery](FINANCE-DELIVERY.md).
7. [Package and parity matrix](PACKAGES-AND-PARITY.md).

The ZIP is documentation, not a runnable backend or Flutter application. Request repository access from the project owner. Do not expect the partial OpenAPI schemas to generate a complete production Dart client without further contract work.

## First working milestone

- Start the existing backend locally using repository instructions and run `node docs/app-dev/smoke.mjs`.
- Build DE/AT/SI mock screens and the API adapter against the documented development contract.
- Backend owner supplies a secured HTTPS staging environment and native auth contract. No URL, reusable credentials, OAuth provider or mobile client identifiers are provisioned in this handoff.
- Demonstrate: authenticate, select authorized company, show modules, open Finance, create customer and draft, request server calculation, download/share PDF, then see the same draft on web.
- Reverse the flow: edit on web, refresh in app, show the changed record. Force a revision conflict and preserve the user's unsaved input.
- Add camera capture -> review -> upload -> expense, available only to Business/Pro.

Do not expose the current demo server publicly or disable Origin/CSRF checks to connect a device. Native production login remains a backend prerequisite. No secrets belong in Flutter source or the ZIP.

## UX agreement

Use the Equitensa brand mark from repository assets, violet `#7451f8`, and clearly visible PAY/FINANCE labels. Keep the module switch in the same location in both workspaces. Show unavailable modules with their package/activation explanation; never imply that switching tabs purchases a module.

Use touch-friendly native layouts for tables and invoice controls. Invoice preview and exported PDF must come from the shared document model/backend. Company logos and invoice styling are customer settings, separate from app theme. Include loading, empty, offline, denied, validation-error and conflict states on every data screen.

Country is the company's registered `DE`, `AT` or `SI`, not GPS or phone language. Default UI language is German for DE/AT and Slovenian for SI; an explicit UI language override never changes country rules. Use `sl`/`sl-SI` for Slovenian locale, `SI` for country.

## Responsibilities and release acceptance

**Backend:** native auth, staging, tenant isolation, production module entitlements, calculations, file generation, invoice numbers, storage, backups and billing.

**Flutter:** screens/navigation, camera/file picker, secure session storage once auth exists, editing UX, PDF/file sharing and error handling.

**Both teams:** review request/response schemas, maintain contract tests and verify the following before claiming web parity:

- Same company data, totals, issued original bytes and report results on web/app.
- Cross-company requests denied; Pay access does not grant Finance access.
- Invoice-only package cannot invoke expenses/OCR/bank APIs; Business cannot invoke recurring APIs.
- Session expiration/revocation, lost responses and concurrent edits do not duplicate documents or payments.
- All supported countries tested; unsupported invoice cases remain blocked.
- No payroll data, document contents, tokens or passwords in logs/crash reports.

No offline write queue, push service, native authentication or full production Finance release is provided by this documentation. Complete those contracts before implementing dependent behavior. Finance tax returns/ELSTER/FinanzOnline/eDavki are intentionally out of scope; Pay transparency reports remain in scope.
