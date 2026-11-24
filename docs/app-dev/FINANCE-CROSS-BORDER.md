> Current invoice contract: [INVOICE-SYSTEM.md](INVOICE-SYSTEM.md) (v3, 15 November 2026). Read this first; it supersedes earlier narrower invoice scope below.

# Flutter change note — international contacts and EU B2B services

Updated 15 November 2026. This note supersedes older statements that every foreign contact is blocked. Production Finance issuance remains disabled; this is the tested development contract, not release approval.

## Country models

- Company/issuer country remains DE, AT or SI, supplied by the authenticated company. Never derive issuer country from the contact, domain, device locale or invoice language.
- Contact country accepts the 249 ISO 3166-1 alpha-2 codes in [contact-countries](../../shared/contact-countries.js). OpenAPI Contact.country contains the same enum. Show localized names, store the code. NL is a valid customer country in every issuer market.
- Contact creation/editing routes and revision handling are unchanged. Existing contacts and invoices need no migration.

## New draft fields

```json
{
  "taxTreatment": "eu_b2b_services",
  "taxEvidence": {
    "generalRuleConfirmed": true,
    "vatVerified": true,
    "checkedOn": "2026-11-15",
    "reference": "External VIES consultation record / evidence reference"
  },
  "lines": [
    {"description":"Consulting", "quantity":"2", "unitPrice":"100.00", "rate":"0", "unit":"h"}
  ]
}
```

Merge these fields into the normal draft payload (kind, contactId, dates, revision). `domestic` is the backward-compatible default taxTreatment. Do not replace rates with numeric JSON values.

`eu_b2b_services` covers only general-rule services under Articles 44/196 of Directive 2006/112/EC, by an issuer in DE/AT/SI to a private business customer in another EU VAT member state. Both VAT IDs are required. Greek VAT prefix is EL while country is GR. This is not permission for goods, consumer sales, non-EU destinations, special territories, immovable-property services, admissions or other special place-of-supply cases. No participating issuer establishment in the buyer country. User must confirm the actual receiving establishment and applicable general rule.

VAT verification is **external/manual**, not an implemented VIES API integration. Do not display “VIES verified by Equitensa”. Record the user's verification date/reference and confirmation. No evidence is inferred from syntax. A failed/unavailable external verification must not be represented as successful verification.

## Screen behavior

1. Customer selection shows country. Reset tax treatment/evidence and domestic line rates whenever customer changes.
2. Offer domestic or EU B2B service treatment. Enable the latter only for another EU member-state private business customer.
3. Changing treatment updates every line's rate (RC: string `0`; domestic: issuer standard rate), clears evidence and refreshes server preview. New/catalog lines must use the active treatment.
4. Show general-rule confirmation, external VAT verification confirmation, check date and evidence reference for RC. Drafts may be saved incomplete; issuance/preflight blocks missing evidence.
5. Render server `taxNotice` separately from editable note. Server calculates all monetary values; never implement a second Flutter VAT calculator.
6. Use issue-check and show returned field problems. New keys: `taxTreatment`, `eu_service_b2b_required`, `general_rule_confirmation`, `vat_verification_evidence`, `reverse_charge_zero_tax`, `customer.vatId_format`.
7. Show statutory timing reminder: generally invoice by the 15th of the following month. Do not backdate late invoices or block correcting late issuance. No ZM/recapitulative or other tax filing is submitted by this app.
8. Recurring templates preserve tax treatment but clear verification evidence. Review each generated draft before issuance.

## Outputs and parity

For supported EU services, server generates 0 VAT, payable equal to discounted net, mandatory localized reverse-charge wording, actual buyer country, and AE VAT category in structured output. DE XRechnung/ZUGFeRD, AT ebInterface/UBL, SI e-SLOG/UBL are tested with actual validators. Country of the buyer does not select issuer format. Payment method remains EUR bank transfer.

Native client downloads the same stored originals as web, preserving filenames and bytes. It must not recreate XML/PDF or numbering locally. No authority transport, tax filing, production billing or native auth is added by this change.

## Acceptance cases

- DE, AT and SI issuer -> NL business with verified external evidence: preview 2 × EUR 100 => net/payable EUR 200, VAT EUR 0; save, issue-check and supported test formats.
- Missing evidence/confirmation, missing or wrong-prefix buyer VAT ID: blocked issuance. Invalid tax mode or positive line VAT under RC: reject draft calculation.
- NL contact can be stored without evidence; saving a contact never certifies a tax treatment.
- US/JP contacts can be stored; their invoice issuance remains unsupported. Foreign consumer, goods and special service cases are also unsupported, not silently RC.
- Existing domestic documents retain the old calculation behavior; domestic arbitrary 0% remains invalid.
- Open draft created on web in Flutter, preserve fields, edit, save, refresh web; repeat in reverse. Handle revision conflicts without losing input.

## Official references checked

- [EU cross-border VAT](https://europa.eu/youreurope/business/finance-and-tax/vat/cross-border-vat/index_en.htm)
- [DE UStG §14a](https://www.gesetze-im-internet.de/ustg_1980/__14a.html)
- [AT USP reverse charge](https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/umsaetze-mit-auslandsbezug/reverse-charge.html)
- [SI ZDDV-1, especially Articles 25, 81, 82](https://pisrs.si/Pis.web/pregledPredpisa?id=ZAKO4701)
