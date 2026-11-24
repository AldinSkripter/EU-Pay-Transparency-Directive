# Finance release status — 2026-11-15

Finance is still gated in production. This document is not a release certificate.

Scope update 2026-11-15: tax returns/preparation and tax portal links were removed at the user's request. Finance retains invoice creation and ordinary data exports. Tax reporting is no longer a planned release feature under the current request.

## Implemented issuance lifecycle

- Preflight dialog lists missing issuer/customer/reference/contact fields before issuance for the selected country format; schema validation still runs during issuance.
- Invoice-specific ZIP contains stored originals plus a digest manifest. Downloadable `.eml` messages include those same originals, with German text for DE/AT and Slovenian text for SI. They are not sent automatically.
- External sending can be recorded with channel, recipient, timestamp and reference. This is a user assertion, never a provider delivery acknowledgement.
- Converting an offer uses today's invoice date and a 14-day due date; service date remains explicitly editable in the invoice draft.
- The UI provides an idempotency key for issuance retry, including after a response is lost. Ambiguous database commit failures do not delete potentially committed originals.

- Country-specific format selection in the document list: DE XRechnung/ZUGFeRD, AT ebInterface/UBL, SI e-SLOG/UBL.
- Generation and validation before committing the document number or issued state.
- Encrypted original PDF/XML storage with SHA-256 integrity verification, tenant-scoped download and inclusion in the ZIP backup.
- Original PDFs remain byte-identical after changes to the company profile; downloads and newly created share links use the stored original.
- Optimistic revision checking protects concurrent issuance. Losing requests discard their uncommitted files.
- Optional `Idempotency-Key` (16–100 ASCII letters, digits, underscores or hyphens) on the issue endpoint supports retry after a lost response. Reusing a key on the same document with different confirmation/format returns 409. Concurrent retries can return revision conflict; repeat after the winning request commits.
- Format is passed as `format` on `POST /api/finance/documents/:id/issue`. Original metadata is returned in `result.originals`; download via `/api/finance/documents/:id/originals/:file`.
- Issuance remains explicitly test-only. Existing older issued documents without stored originals retain the legacy PDF-rendering path; no historic original is fabricated.
- Nodemailer upgraded to address the dependency audit findings.

## Outstanding release requirements

1. Independent Finance roles, tenant entitlements and real subscription enforcement; the current global production gate must remain until these exist.
2. Selected delivery provider, credentials supplied outside chat, sandbox acceptance tests, acknowledgements/rejections, retries and duplicate prevention. Generating XML is not delivering an invoice.
3. Remaining tax/document scenarios: OSS/IOSS, foreign VAT registrations, cross-border SME exemption, special transactions, credits/cancellations and public-sector routing. The 15 November extension implements domestic B2B/B2C, foreign customers with confirmed domestic place of supply, EU general-rule B2B services, simple EU goods, simple exports, non-EU general-rule B2B services and domestic small-business exemption. EUR/bank transfer only. See [current invoice contract](app-dev/INVOICE-SYSTEM.md); this expands technical scope but does not remove the production gate.
4. Production PostgreSQL and persistent encrypted file volume, key management, backup/restore verification and retention policy. MemoryStore is not production storage. Database and file backup must be coordinated; a process crash before database commit can leave an unreferenced encrypted file, requiring reconciliation.
5. Release environment tests and deployment. The local already-running server must load the new backend before these changes can be exercised there.

Native XML schema validation plus common EN16931 validation does not certify acceptance by every recipient or national platform. Tax authority submission (ELSTER/FinanzOnline/eDavki) is a separate integration and is not implemented by these changes.
