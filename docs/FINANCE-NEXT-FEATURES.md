# Finance: functional expansion, 15 November 2026

Official product references: [sevdesk functions](https://sevdesk.de/funktionen/), [Lexware invoicing workflows](https://office.lexware.de/steuerberater/funktionen/angebote-rechnungen-schreiben/). These establish comparable workflow categories, not legal specifications for Equitensa.

## Delivered: open receivables

Finance navigation now includes **Offene Posten / Odprte postavke**. It shows outstanding issued test invoices after partial payments, overdue balances, amounts due today through seven calendar days ahead, five aging buckets, customer balances, text/customer/aging filters and opening the source invoice for existing payment/reminder actions.

Authenticated GET `/api/finance/receivables` returns the current ledger snapshot. GET `/api/finance/receivables.csv` exports all open items, optionally restricted to a company-owned `contactId`. CSV intentionally ignores UI text and aging filters; the UI states that scope. Monetary CSV values are EUR decimals; API values are integer cents. Formula-like text is escaped. No state revision or original invoice changes occur.

Drafts, offers and fully paid invoices are excluded. Due today is not overdue. Aging uses UTC calendar days, including the 30/31, 60/61 and 90/91 boundaries. Customer grouping uses IDs, not names. The report is not a historical balance reconstruction, tax return, formal statement delivery or legal debt-collection decision. Existing country issuance and production gates remain in force.

## Existing local capabilities

Draft invoices/offers, offer conversion, document design/PDF, contacts, catalog, partial payments, expense entries and encrypted originals, generic bank CSV import/allocation, recurring drafts, reminder email downloads, exports and package simulation. See [implementation details](FINANCE-IMPLEMENTATION-2026-11-14.md).

## Next prioritized development

1. Order-confirmation/delivery-note workflows; offer tracking is now available as described below.
2. Invoice corrections, credit/cancellation documents and refunds with immutable source relationships and reviewed country rules.
3. Validated structured electronic invoices for supported domestic cases, separately for DE/AT/SI.
4. Production module entitlements and team roles, normalized Finance storage and recovery tests.
5. Real sending with delivery tracking, bank provider connection, confirmed OCR and accountant exports.

These items are not implemented by this change. Direct tax filings and live banking must not be presented as working before their integrations and country-specific tests exist.

## Added: offer tracking and country/language controls

The Offers screen records preparation, externally sent status, acceptance/rejection, expiry and conversion, with actor/timestamp/note history (100 events maximum). These are internal manual records, not actual email delivery, signature verification or customer authentication. Sent or accepted tracked offers cannot be edited until reopened. Tracked offers require acceptance before conversion; conversion remains duplicate-protected. Legacy untracked offers retain their existing conversion flow. Document issuance remains separately gated.

Finance now has an independent German/Slovenian interface preference, defaulting to registered company country. The choice is stored in the current browser. Registered jurisdiction and document preview/PDF language remain company-country based. The header country dialog displays the registered country; demo users can explicitly start a NEW DE/AT/SI demo company. This does not migrate or change an existing company's jurisdiction. Real company country is chosen at registration; country migration and multiple-company account switching are not implemented.

Verification: 19 targeted tests pass and production web build succeeds. Browser: AT company retained AT while interface switched to Slovenian; country dialog created SI demo; SI sample offer calculated 100 EUR net + 22 EUR VAT, and manual sent -> accepted -> invoice draft completed through the UI. This adds no claim of comprehensive national legal compliance.
