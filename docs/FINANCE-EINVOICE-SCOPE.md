# E-invoice formats, national scope and release limits

Checked and implemented 2026-11-15.

## Local implementation

- DE: XRechnung 3.0 CII XML and ZUGFeRD 2 EN16931 PDF/A-3 with embedded CII. The PDF is generated from the same server-calculated draft as the XML. Mustang combines a PDF/A-1b source with XML and validates the resulting hybrid PDF.
- AT: ebInterface 6.1 XML; SI: e-SLOG 2.0 XML. Both map the server-calculated invoice into their own national structure, validate the common CII model with Mustang and validate the generated national XML against the vendored official XSD. XSD validation is not a complete national business-rule or recipient acceptance certification. UBL 2.1 remains available for both countries.
- Every export must pass pinned Mustang 2.26.0 validation; failure returns 422 instead of a file. Invalid monetary totals are tested as a negative case. This is technical format validation, not tax advice or a certification of every invoice situation.
- Endpoint `/api/finance/einvoice-preview` is a TEST/DRAFT download only. It does not consume an invoice number, persist a document, send an invoice or bypass the production release gate.
- Current scope: positive domestic private B2B EUR invoices with supported positive VAT rates, supported units, bank transfer and required issuer/buyer details. Discounts are line allowances; tax grouping uses existing exact-cent server calculations.
- XRechnung requires buyer reference, seller contact person/phone and electronic addresses. Other exports also require issuer/buyer emails and buyer reference for the chosen interoperable profile. These are stricter product/profile requirements than ordinary PDF invoice fields.
- AT: buyer VAT ID required above EUR 10,000. The ebInterface test profile currently requires a valid-shaped Austrian buyer UID for all amounts instead of inventing a placeholder UID; non-VAT-registered recipients are not supported by that profile. AT 4.9% is date-gated from 2026-07-01. Users must select that rate only for eligible goods, not arbitrary services.
- Unsupported: reverse charge, exempt/small-business invoices, foreign currency, cross-border, credit notes/corrections, cash/fiscalization, B2G recipient routing, USP/UJP/Peppol transport and recipient-specific procurement requirements. Do not enable production claims for these cases.

## Country references

| Country | Published position relevant here | Implementation consequence |
|---|---|---|
| DE | BMF recognizes XRechnung and eligible ZUGFeRD profiles. KoSIT says XRechnung 3.0 remains effective until at least 2027-07-31; 4.0 is a preview. | Use XRechnung 3.0 and ZUGFeRD EN16931, not a preview 4.0 profile or an ordinary PDF mislabeled as e-invoice. |
| AT | Federal e-Rechnung accepts ebInterface and UBL. Ordinary invoice fields follow UStG §11, including buyer UID above EUR10,000 in the stated domestic B2B case. | ebInterface and UBL test exports exist; portal-specific references and submission remain separate work. |
| SI | UJP accepts e-SLOG, UBL2.1 and CEFACT100. Published legislation introduces domestic B2B exchange from 2028-01-01. | e-SLOG and UBL test exports exist; UJP envelope, authorized exchange and recipient acceptance remain separate work. |

Sources:

- [BMF e-invoice FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)
- [KoSIT XRechnung versions](https://xeinkauf.de/xrechnung)
- [Austrian accepted formats](https://www.erechnung.gv.at/erb/de_DE/tec_formats)
- [Austrian invoice fields](https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/vorsteuerabzug-und-rechnung/formerfordernisse.html)
- [Austrian 4.9% scope](https://www.usp.gv.at/aktuelles/gesetzliche-neuerungen/Bundesgesetzblatt/umsatzsteuergesetz.html)
- [Slovenian UJP formats](https://www.gov.si/teme/izmenjava-e-racunov-s-proracunskimi-uporabniki/)
- [Slovenian B2B legislation announcement](https://www.gov.si/novice/2025-10-23-drzavni-zbor-sprejel-zakon-o-izmenjavi-elektronskih-racunov-in-drugih-elektronskih-dokumentov/)

## Validator deployment

Install Java17+ and run `node scripts/setup-einvoice.mjs`. The script downloads the version-pinned Apache-2.0 Mustang CLI from its official GitHub release and verifies SHA-256. The binary lives in ignored `var/tools/`; a fresh checkout needs this setup. No financial document is sent to an external validation website. Two validator jobs per process, each command bounded to 60 seconds and 512MB JVM heap. Temporary files are removed after the job. Production deployment needs a dedicated resource-managed worker/service rather than relying on this local capacity.

Tests execute real validator calls when the pinned jar is installed; otherwise that integration subset is explicitly skipped. Unit checks remain active. [Mustang source and license](https://github.com/ZUGFeRD/mustangproject).

## Incoming documents and editor

Web selects PDF/image/XML; future Flutter captures camera images and calls the same pipeline. PDF text, scanned PDF OCR and embedded invoice XML are supported with review. Extraction is not incoming schema/legal validation. See [Flutter capture contract](app-dev/RECEIPT-CAPTURE.md).

Editor has a large workspace mode, separate property panel, fixed A4 canvas and widened column weights. Pos./Št., VAT and discount headers do not split into individual letters when all seven columns are enabled. Preview and PDF use the same column definitions.
