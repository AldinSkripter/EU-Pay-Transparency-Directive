# Invoice QR implementation

## Payment codes

- DE/AT: EPC069-12 v3.1, payload version 002, UTF-8, error correction M,
  max version 13 and 331 payload bytes. Unstructured invoice-number reference.
- SI: UPN QR, fixed version 15, byte encoding ISO-8859-2 with explicit ECI 4,
  error correction M, 19 fields plus length checksum, max 411 bytes. Ordinary
  bank-transfer order, OTHR purpose, SI99 (no structured reference); invoice number
  is preserved in payment purpose. Unsupported characters/oversize fields are
  rejected, never silently transliterated or truncated.
- Initial beneficiary IBAN scope: valid DE, AT or SI accounts. Other SEPA account
  countries and alternative SI reference models are not yet supported.
- QR contains the original invoice gross amount, not a live outstanding balance.
  Previously printed codes cannot change when a partial payment is recorded.
- Black/white vector QR with a four-module white border; 102 pt overall size in
  PDF (35.98 mm). Position selectable left/right. No decorative logo in QR.
- Draft/demo bank codes intentionally contain non-payment test text. Genuine
  payload generation is unit-tested, but production Finance remains gated.
- Codes are optional, do not initiate transfers themselves, and do not mark a
  document paid. Real bank-app/device acceptance has not been verified.

## Document links

Explicit creation in the saved-document editor or document list generates a
256-bit random bearer token and a frozen PDF snapshot, with 7/30/90-day expiry.
The public endpoint verifies token hash, expiry and company suspension, is rate
limited, and sends no-store/no-referrer/noindex headers. It exposes only that PDF.
Links can be revoked or replaced. Saving draft changes revokes the link. Copies
and converted offers do not inherit sharing. No email is sent automatically.

Anyone possessing the link can view the PDF. Localhost links work only on the
same machine; HTTPS deployment is required for customer use. Public production
access follows the existing Finance release gate. QR links are included in owner
PDF downloads while active. This does not provide customer identity verification.

## Verification

24 targeted tests passed: independent ZXing decoding of EPC and UPN (including
ECI byte checks and Slovenian characters), checksum/field validation, invalid
IBAN and input rejection, non-payable demo codes, PDF text extraction, sharing
tenant isolation/expiry/revocation and existing Finance workflows. Build passed.

## Official specifications

- [EPC guidelines v3.1](https://www.europeanpaymentscouncil.eu/sites/default/files/kb/file/2024-03/EPC069-12%20v3.1%20Quick%20Response%20Code%20-%20Guidelines%20to%20Enable%20the%20Data%20Capture%20for%20the%20Initiation%20of%20an%20SCT.pdf)
- [ZBS UPN QR technical standard](https://www.zbs-giz.si/wp-content/uploads/2021/10/EN_Tehnicni_standard_UPN_QR.pdf)

This implements QR content on invoices, not the full orange UPN payment-slip
layout or a claim of bank/ZBS certification. Bank acceptance testing and any
applicable issuer verification remain production-release work.
