# Austrian and Slovenian native invoice exports

Implemented 2026-11-15.

## User flow

Choose the company country during onboarding. In Finance → Verkauf, open an invoice draft and supply company/customer address, email, VAT details, supported unit, reference and dates. The structured invoice section offers:

- AT: **ebInterface XML** (6.1) or **UBL XML** (2.1).
- SI: **e-SLOG XML** (2.0) or **UBL XML** (2.1).

The same formats are listed inside Start, Business and Pro for the company's country. Downloading validates before returning a file. A rejected invoice does not generate an attachment or consume an invoice number. Native XML can be uploaded through receipt capture for review; the imported gross amount, supplier, document number and issue date are extracted.

## Implemented validation

- Server-side country, domestic private B2B, currency, VAT, units and required-field checks.
- Existing exact-cent calculation, line discounts, fractional quantities and grouped tax rates.
- EN16931 core validation by pinned Mustang, followed by official national XSD validation of the actual generated XML.
- AT buyer UID is required in this ebInterface test profile, even below EUR10,000. No fictional UID is inserted.
- XML escaping, rejection of DTD/entity input and invalid namespaces, bounded processing.
- Country-bound API tests and round-trip import assertions.

## Remaining production work

The generated files are **TEST / DRAFT**, not issued invoices. National schema validation does not cover all legal or recipient-specific business rules. Public recipients, UJP envelopes/routing, Austrian supplier/order-position identifiers, Peppol transport, official acknowledgements, credit notes/corrections, exempt/reverse-charge cases, cash fiscalization and production permission/billing release remain unsupported. No successful submission status is fabricated.

The previously running local process needs a restart to load backend changes. Source and test servers execute the updated handlers; frontend changes are loaded through Vite.

## References

- [Austria: ebInterface and additional public-recipient requirements](https://www.erechnung.gv.at/erb/tec_formats_ebinterface)
- [AUSTRIAPRO: schema and examples](https://github.com/austriapro/ebinterface-standards/tree/master/schemas/ebInterface6p1)
- [GZS/ePOS: official e-SLOG documentation](https://epos.si/eslog)
- [UJP: supported interchange formats](https://www.gov.si/teme/izmenjava-e-racunov-s-proracunskimi-uporabniki/)
- [Vendored schema provenance and checksums](../server/schemas/README.md)
- [Overall supported scope](FINANCE-EINVOICE-SCOPE.md)
