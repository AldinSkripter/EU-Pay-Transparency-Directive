# Finance: receipt capture and invoice design

Implemented locally, 2026-11-15. Production Finance remains gated; this work is not a release or legal-compliance certification.

**Later update on the same day:** PDF text/scanned-PDF processing, incoming UBL/CII/ZUGFeRD reading and validated structured test exports have now been added. The first-stage limits below are historical; see [current e-invoice scope](FINANCE-EINVOICE-SCOPE.md) and [current upload contract](app-dev/RECEIPT-CAPTURE.md).

## Receipt capture

Finance → Ausgaben / Stroški → Beleg auswählen / Izberi dokument.

- JPEG/PNG up to 2 MB, bounded to 12 million pixels and 6000 pixels per dimension.
- Tesseract runs on our application server with packaged German (DE/AT) or Slovenian (SI) models. Images are not sent to an external OCR/AI service.
- Suggestions: supplier, invoice reference, date, gross EUR amount. Conservative text patterns leave ambiguous amounts blank. Supplier/date suggestions can be wrong; all values require review.
- Side-by-side image and editable form, extracted-text view, explicit review checkbox. No automatic tax deduction, category decision or posting.
- Original and expense are saved in one state mutation; encrypted file is removed on failure. SHA-256 duplicate prevention, revision conflict checks and tenant isolation.
- PDF attachment plus manual entry is available. Scanned PDF OCR, structured e-invoice extraction, batch import and an email inbox are not implemented here.
- One OCR operation per process, 60-second deadline, five scan requests per minute per IP. This is a bounded local implementation, not a distributed worker queue.
- Unsaved review is temporary and disappears on navigation/reload. Unsupported languages, handwriting and poor images require manual correction. Only EUR expense capture is supported.

## Invoice editor

Finance → Firma & Design / Podjetje in izgled → Layout / Postavitev.

- Business layout: logo area, parties and dates before title, business footer with company/contact/bank details.
- Configurable columns: position, description, quantity, unit price, VAT rate, discount, net total. Description and total remain mandatory. Hiding quantity/unit-price columns moves those values into the description.
- Selected columns are shared by preview and PDF. PDF repeats table headers after page breaks and right-aligns totals.
- Existing logo, colors, typography, spacing, title settings, reusable templates, text blocks and payment QR controls remain available.
- Preview is a design view; PDF pagination may differ. This is a structured invoice designer, not arbitrary drag-and-drop placement.

## Competitor review and next gaps

| Capability | Published competitor functionality | Equitensa local status |
|---|---|---|
| Receipt capture | Lexware extracts document type, contact, number, dates and amount into review. sevdesk offers OCR and suggested postings. | Photo OCR plus reviewed gross register; no automated accounting. |
| Document appearance | Lexware has base layouts, logo, stationery and configurable columns. | Four layouts, logo/style controls, blocks, columns and reusable designs; no uploaded PDF stationery. |
| Sales documents | Both offer invoices, offers and reminders; broader document types vary. | Offers, drafts, local test issuance, reminder file download; no delivery-note or staged-invoice workflow. |
| Bank | Connections and transaction matching. | CSV import and manual allocation; no live bank connection. |
| Recurring documents | Automated recurring invoices. | Recurring draft generation; no scheduled external sending. |
| Accountant / e-invoices | Accountant integrations and structured e-invoices. | General exports; validated country-specific structured e-invoice flows and accountant permissions remain work. |

Priorities: structured e-invoices, PDF/batch receipt capture, reliable delivery workflow, invoice correction/storno, accountant access, then bank-provider integration. Competitor German accounting functionality does not establish Austrian or Slovenian compliance.

Sources checked 2026-11-15:

- [Lexware automatic recognition](https://help.lexware.de/de-form/articles/548870-die-automatische-inhaltserkennung)
- [Lexware print layout](https://help.lexware.de/de-form/articles/548055-wie-bearbeite-ich-mein-drucklayout)
- [Lexware functions](https://www.lexware.de/funktionen/)
- [sevdesk receipt capture](https://sevdesk.de/belege-erfassen/)
- [sevdesk functions](https://sevdesk.de/funktionen/)
- [sevdesk product overview](https://sevdesk.de/produktuebersicht/)

Validation: real generated-image OCR in German and Slovenian; PDF text/amount checks for all three countries; atomic import, review requirement, duplicate/revision rejection and tenant-isolation tests. Browser exercised photo → recognized form → confirmed expense and original attachment.
