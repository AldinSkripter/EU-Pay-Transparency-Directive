# Tax reporting removed — reference notes only

On 2026-11-15 the user explicitly removed tax reporting from Finance scope. The preparation panel, tax portal links, calculation work-in-progress and tax API routes have been removed. The references below are research history, not shipped product capabilities. Ordinary data exports and invoice PDF/XML remain available.

Checked 2026-11-15. Invoice interchange and tax returns are separate workflows.

## Verified reference workflow

[Lexware Office](https://www.lexware.de/funktionen/umsatzsteuervoranmeldung/) derives the USt-Voranmeldung from bookings and lets the user transmit it via ELSTER after review. It does not derive a complete tax return merely from invoice XML.

| Country | VAT return channel | Invoice formats / public recipient context | Current Equitensa test output |
|---|---|---|---|
| DE | USt-Voranmeldung / ELSTER | XRechnung, ZUGFeRD | Validated XRechnung 3.0 CII and ZUGFeRD EN16931 |
| AT | UVA / U30 / FinanzOnline | ebInterface, UBL | ebInterface 6.1 and UBL 2.1 test exports; no public delivery |
| SI | DDV-O / eDavki | e-SLOG, UBL, CII through UJP | e-SLOG 2.0 and UBL 2.1 test exports; no UJP delivery |

## Remaining functionality

- Package screen shows all three countries, highlights the registered company country and separates test exports from missing integrations.
- Exports screen provides general CSV/JSON and ZIP downloads; there is no tax preparation panel or portal integration.
- Full original-document archive remains available for all periods.
- No transmission button, false success status or invented tax due is shown.

## Work required for actual tax submission

1. Persist company tax regime, tax identification, applicable accounting/tax timing and filing periods.
2. Build complete balanced bookings and tax classifications, including deductible input VAT, credit notes, corrections, exemptions and cross-border cases. Current gross-only expense records cannot determine deductible VAT.
3. Version field mappings and validations against the official form and year, with reconciliation back to bookings and immutable reviewed snapshots.
4. Integrate authenticated national transmission, user authorization, retries with duplicate prevention and durable official receipt/protocol. Never mark a return submitted on HTTP acceptance alone.
5. Implement correction workflows and audited integration tests before release.

ELSTER manufacturer access requires registration and ERiC integration. No developer credentials or production national transmission connections are configured here. SI also requires electronic output/input VAT records; DDV-O alone does not cover those obligations.

## Official references

- [ELSTER developer participation](https://www.faq.elster.de/elsterweb/infoseite/entwickler?locale=de_DE)
- [Austria UVA / U30](https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/entstehen-der-steuerschuld-und-pflichten/umsatzsteuervoranmeldung.html)
- [Slovenia VAT and eDavki](https://spot.gov.si/sl/teme/davek-na-dodano-vrednost-ddv/)
- [FURS obligations including VAT records](https://www.fu.gov.si/fileadmin/Internet/Poslovni_dogodki/Kratke_informacije_glede_obveznosti_do_FURS_za_pravno_osebo.pdf)
- [Austria e-invoice formats](https://www.erechnung.gv.at/erb/de_DE/tec_formats)
- [Slovenia UJP invoice exchange](https://www.gov.si/teme/izmenjava-e-racunov-s-proracunskimi-uporabniki/)
- [DE BMF e-invoice FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html)

See [e-invoice implementation scope](FINANCE-EINVOICE-SCOPE.md) for the exact supported business cases. Format conformance does not constitute a full national production release.
