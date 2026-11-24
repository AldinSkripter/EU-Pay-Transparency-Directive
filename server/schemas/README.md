# National invoice schemas

Vendored for offline validation; no invoice data is sent to external validators.

- ebInterface 6.1: AUSTRIAPRO's [official development repository](https://github.com/austriapro/ebinterface-standards/tree/master/schemas/ebInterface6p1). [Austria format requirements](https://www.erechnung.gv.at/erb/tec_formats_ebinterface) distinguish general ebInterface from stricter public procurement rules. We use the general schema, not a claim of public portal acceptance.
- e-SLOG 2.0: GZS/ePOS [August 2020 English package](https://epos.si/assets/docs/e-SLOG-2.0-08-2020-EN.zip), linked by [the standard publisher](https://epos.si/eslog). Copyright belongs to its respective publishers; original schema content/notices retained.
- The XMLDSig companion's external DTD declaration was removed for offline validation. Schema declarations are unchanged. Digital signatures are not generated or verified by this feature.
- [manifest.json](manifest.json) records SHA-256 hashes of the installed files and source URLs. Check date: 2026-11-15.

The Java validator accepts only server-selected schemas. Generated XML disallows DTDs/entities and external schema access. Schema compilation permits local companion imports. JVM heap is capped at 128 MB and process duration at 20 seconds. e-SLOG declares very large repetition limits, so the trusted-schema maxOccurLimit is disabled; incoming application invoices remain limited to 100 lines.

Validation layers: existing server input/calculation validation → common EN16931 CII validation → national serialization → national XSD validation. Tests cover mixed tax rates, discounts, fractional quantities, round-trip amounts and altered-total rejection. This is not a full national Schematron suite or fiscal/public delivery approval.
