# Invoice editor additions — 2026-11-15

Implemented in the existing Finance development module:

- Per-line percentage discounts (0–100%, up to two decimal places). Server uses
  integer arithmetic: rounded original line net, rounded discount, remaining net,
  then VAT grouped by rate. UI preview and PDF display the discount.
- Payment-date shortcuts: immediately, 7, 14, 30, 60 days from issue date. These
  set an explicit due date; changing the issue date later does not silently change it.
- Order/project reference, persisted with the draft and printed in preview/PDF.
- Title size/alignment and soft/plain/brand-color table headers. Available for
  company design and individual drafts, with server validation and PDF rendering.
- Company-scoped named design library (up to 30 layouts). Applying a layout copies
  it into the draft; removing a library entry does not alter saved documents.
- Save actions now consistently block while the preview calculation is invalid
  or pending.

The library is inside the document composer, above the data/preview columns.
New UI labels are supplied in German and Slovenian. Existing document-country
rules remain in effect. This is a constrained document editor, not arbitrary HTML
or a free-position canvas. Existing production Finance release gates remain.
Payment shortcuts do not implement cash discounts (Skonto). Percentage discounts
are not credit notes or cancellation documents. Local demo data remains ephemeral.

## Verification

19 focused tests passed, including existing Finance integration tests, tenant
isolation, revision conflicts, invoice snapshots, discount arithmetic for DE/AT/SI,
calendar boundaries and PDF generation. Production build passed (existing large
bundle warning remains).

Browser flow verified in SI demo: 100 EUR net, 10% discount, 90 EUR taxable net,
19.80 EUR VAT, 109.80 EUR gross; 30-day due date, PO-DEMO-42 reference,
Studio Violet layout saved, document saved and PDF endpoint returned 200.

## Product references consulted

- [sevdesk features](https://sevdesk.de/funktionen/)
- [Lexware invoice creation](https://help.lexware.de/de-form/articles/547986-rechnung-oder-teilrechnung-erstellen-schritt-fur-schritt)

These informed feature selection, not a claim of equivalent completeness or
country-specific legal certification.
