# Flutter camera → shared Finance document pipeline

Updated 2026-11-15. Camera/scanner UI belongs to Flutter. The web UI selects PDF/image/XML files; both send the same bytes to the backend. No separate mobile calculation or OCR service is needed.

## Current endpoints (local web-session authentication only)

1. Capture with a Flutter camera/document-scanner plugin, or choose a file. Request camera permission only when needed. Allow retake, rotation/crop, preview and explicit upload. Camera plugin choice and native implementation are the app team's work.
2. Normalize orientation and compress to PNG/JPEG <=2,000,000 bytes. Maximum dimensions 6000 × 6000 and maximum 12 million pixels. HEIC is not accepted; convert before upload. PDF and supported invoice XML also <=2 MB; PDF processing limited to 5 pages.
3. POST `/api/finance/receipt-scan` with JSON `{filename, data}`; `data` is base64 with no `data:` prefix. Set a client timeout longer than the 60-second backend deadline. The authenticated company determines DE/AT/SI and OCR language, not a client-supplied country.
4. Display returned `suggestions` beside the original: supplier, reference, incurredOn, amount (gross EUR), category, note. Always require review. OCR may confuse issuer/recipient or invoice/due dates. Structured extraction is not legal validation. No automatic VAT deduction or accounting posting occurs.
5. Fetch the latest Finance `state.revision`. POST `/api/finance/receipt-import` with `{revision, attachment:{filename,data}, reviewed:true, supplier,reference,incurredOn,amount,category,note}`. Original file and expense link are stored atomically. Response is `{state,result}`.
6. For retry after timeout, reload state and check whether the record/attachment digest exists. Identical originals and repeated supplier/reference are rejected with 409; do not change references to bypass duplicate detection. Revision conflicts require reconciliation.

Supported incoming structured data: UBL Invoice and CII invoice XML (type 380, EUR); common `factur-x.xml` / `zugferd-invoice.xml` ZUGFeRD PDF attachments. Credit notes, non-EUR and other profiles require a future workflow. Never import a document as a positive expense if it is actually a credit note.

PDFs with a text layer are read directly; image-only pages are rendered and OCR processed. Encrypted, damaged, oversized, unsupported or timed-out files return an error. Keep the original locally only as long as needed for retry; offer manual entry without implying successful recognition. No mobile offline queue or background sync has been built here.

## Security and release boundary

Existing endpoints require the current web session, verified email and Origin policy. They do not accept a newly invented Bearer token. Native OAuth/OIDC + PKCE, per-device sessions and a production HTTPS staging environment still need implementation. Do not weaken CSRF checks or embed a web owner's credentials in the app. Finance production remains gated.

The OpenAPI handoff now includes receipt scan/import and validated e-invoice preview endpoints. Server validation and totals remain authoritative on web and mobile.
