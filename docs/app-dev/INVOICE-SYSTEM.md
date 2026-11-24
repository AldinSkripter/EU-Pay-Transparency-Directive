# Invoice system — consolidated Flutter contract v3

15 November 2026. This is the current invoice change specification. It supersedes narrower domestic-only and EU-service-only scope statements in earlier handoffs. Web and Flutter use the same backend and persisted documents; do not reimplement calculation, numbering, PDF or XML generation in Dart.

## Country and tax are separate choices

Company jurisdiction remains DE, AT or SI. Customer country is any of the 249 ISO alpha-2 codes in OpenAPI Contact.country. Customer location does not change issuer jurisdiction, UI language or issuer format. Customer may be a business or a consumer. Public-sector routing is not released.

After choosing a contact, request `GET /api/finance/tax-options?contactId=...`. The authenticated company determines jurisdiction. Response contains issuerCountry, customerCountry, EUR currency, productionEnabled and options. Each option supplies id, VAT category, supported rate strings, generated legal notice and requiredEvidence. Treat these options as authoritative; refetch after contact/profile changes. Do not display all seven options as valid for every recipient.

## Supported choices

| taxTreatment | Case | Category | Required evidence |
|---|---|---|---|
| domestic | Domestic goods/services, business or consumer | S | Normal supported issuer VAT rate |
| domestic_vat_foreign | Foreign customer, transaction actually taxable in issuer country | S | localVatConfirmed=true; reference explaining place of supply |
| eu_b2b_services | General-rule service to a business in another EU VAT member state | AE | generalRuleConfirmed, externally checked VAT ID, dated verification reference |
| eu_goods | Simple movement of goods from issuer country to business buyer in another EU member state | K | Both VAT IDs, VAT check, transport evidence, destinationCountry equal to customer country, goodsConditionsConfirmed and reportingConfirmed |
| export_goods | Simple physical export from issuer country to customer outside EU | G | Transport/customs evidence, destinationCountry equal to customer country and goodsConditionsConfirmed |
| non_eu_b2b_services | General-rule service supplied to a business outside EU | O | generalRuleConfirmed and businessEvidence |
| small_business | Actual national small-business exemption for domestic transactions | E | smallBusinessConfirmed and issuer national tax number or VAT ID |

Only S has positive VAT rates. AE/K/G/O/E use string `0`, with different category and notice. Never collapse these choices into “0%” or call every foreign transaction reverse charge. No treatment is automatically assigned just because a country or VAT ID exists.

Domestic VAT rates exposed by the server: DE 19/7; AT 20/13/10/4.9; SI 22/9.5/5. Classification of goods/services remains the issuer's decision. AT 4.9 has restricted product applicability and serviceDate must be at least 2026-07-01. A positive foreign-customer invoice uses issuer rates only when place of supply is actually domestic; this option is not OSS or destination-country VAT support.

## Draft payload

Keep normal `kind`, `contactId`, dates, lines, reference, einvoice contact, appearance and revision. Add:

```json
{
  "taxTreatment": "eu_goods",
  "taxEvidence": {
    "vatVerified": true,
    "checkedOn": "2026-11-15",
    "reference": "External VIES consultation evidence",
    "goodsConditionsConfirmed": true,
    "destinationCountry": "NL",
    "transportReference": "CMR / carrier / departure evidence record",
    "reportingConfirmed": true
  },
  "lines": [
    {"description":"Goods", "quantity":"2", "unitPrice":"100.00", "rate":"0", "unit":"Stk.", "discountPercent":"10"}
  ]
}
```

The same example under non_eu_b2b_services uses a non-EU business contact and evidence `{generalRuleConfirmed:true,businessEvidence:"Company register evidence"}`. Foreign local VAT uses `{localVatConfirmed:true,reference:"Reason this transaction is taxable in issuer country"}`. Small-business treatment uses `{smallBusinessConfirmed:true}` and only domestic contacts. Full schema is in [OpenAPI](openapi.json).

`domestic` is the default for old records. Existing issued records are not recalculated. Drafts may be saved incomplete; issuance/preflight blocks missing evidence. Evidence is a user declaration/reference, not automatic verification or document approval. VIES integration, transport tracking and customs verification are not implemented. Do not label a user declaration “verified by Equitensa”.

## Editor behavior and outputs

1. Select customer, load tax-options, show business/consumer and destination country.
2. Choose treatment explicitly. Switching treatment clears evidence and changes all rates to 0 or issuer standard rate. Catalog/new lines follow the active treatment.
3. Reset treatment/evidence when changing customer. Display generated notice separately from editable invoice note. For goods, delivery address is the selected customer's stored address; other shipping addresses are not currently supported.
4. Show only relevant evidence fields and confirmations. EU general-rule service confirmation includes receiving establishment, EU VAT territory and no participating supplier establishment in the recipient country. Goods confirmation excludes triangular/chain transactions, installation supplies, excise goods, new vehicles and tourist exports.
5. `POST /finance/preview` is authoritative for exact cent totals. Render returned taxNotice; do not produce a separate mobile wording or total. Evidence date cannot be after issueDate. Small-business eligibility/thresholds are not determined automatically.
6. Use issue-check, confirmation and stable requestKey, then download stored originals. Domestic consumer and small-business invoices default to PDF. Structured formats can be chosen if their required fields are present. Direct delivery/authority submission is not implemented.
7. EU goods/general-rule services normally have an invoice deadline on the 15th of the following month. Show a reminder; never backdate or stop a user correcting late issuance. ZM/recapitulative, customs and VAT returns remain outside this product.
8. Recurring drafts retain the treatment and clear evidence so each generated document is reviewed.
9. Existing server totals, immutable originals, revision conflicts, bank-transfer payment recording and tenant isolation remain authoritative. Document CSV appends customer_country, tax_treatment and tax_notice; consume columns by header.

## Country format mapping

| Issuer | Tested structured outputs | Notes |
|---|---|---|
| DE | XRechnung, ZUGFeRD EN16931 PDF/XML | Actual foreign buyer country, statutory wording and corresponding S/AE/K/G/O/E category |
| AT | ebInterface 6.1, UBL 2.1 | Native XML XSD and common EN16931 model validation |
| SI | e-SLOG 2.0, UBL 2.1 | Native XML XSD and common EN16931 model validation; bank transfer only |

Generated goods XML contains delivery country/address. Category O follows outside-scope rules rather than incorrectly describing a non-EU service as an EU exemption. PDF and XML derive from the same stored draft. Validation is technical evidence for these cases, not certification of the customer's real transaction.

## Remaining scope boundaries

Production Finance remains gated: independent permissions/billing/release work is not implemented by this invoice change. Native mobile OAuth also remains separate. This is a tested development contract, not a claim of unrestricted production readiness.

Not supported: OSS/IOSS or foreign VAT registrations/destination VAT, cross-border SME exemption, Northern Ireland XI goods cases, special EU territories, public customers, domestic reverse-charge construction cases, chain/triangular/margin/special transactions, separate delivery addresses, credit notes/storno, cash/card fiscalization. Do not map these to a supported case to bypass rejection. Consumer EU distance sales must not default to issuer VAT merely because the user selected a foreign contact.

## Acceptance checks for Flutter

- DE/AT/SI company -> NL business: choose EU service or EU goods explicitly, require relevant evidence, EUR 200 with 10% discount -> EUR 180 payable and zero issuer VAT, correct AE versus K notice/category.
- DE/AT/SI -> US business: service O, export goods G, ordinary domestic-place-of-supply S are distinct choices.
- Domestic consumer: normal issuer VAT, PDF default. Domestic eligible small business: E and national exemption wording, no mandatory issuer VAT ID if national tax identifier is supplied.
- Missing evidence, wrong destination, wrong-prefix EU VAT ID, positive VAT under a zero-tax treatment: block issuance.
- Contact from any country can be stored without certifying a tax treatment.
- Save on web/open on Flutter and reverse; preserve exact taxTreatment/taxEvidence; test stale revision conflict and lost issuance response retry.

## Sources checked

- [Lexware official workflow for special invoices](https://help.lexware.de/de-form/articles/547981-wie-erstelle-ich-steuerlich-besondere-rechnungen): explicit choice of ordinary invoice, EU service/goods and non-EU service/export, with reason text. Its availability of other features is not evidence those features exist here.
- [sevdesk official VAT treatment explanation, version 1](https://hilfe.sevdesk.de/de/articles/9382135-umsatzsteuerregelungen-v1) and [current mobile invoice guide](https://hilfe.sevdesk.de/de/articles/11433804-rechnungen-in-der-sevdesk-mobile-app): tax treatment is separate from line price/rate. Legacy article is identified as such.
- [EU cross-border VAT](https://europa.eu/youreurope/business/finance-and-tax/vat/cross-border-vat/index_en.htm)
- [DE UStG §14a](https://www.gesetze-im-internet.de/ustg_1980/__14a.html), [§6a EU goods](https://www.gesetze-im-internet.de/ustg_1980/__6a.html), [§19 small business](https://www.gesetze-im-internet.de/ustg_1980/__19.html)
- [AT invoice requirements](https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/rechnung.html), [export/EU goods](https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/umsaetze-mit-auslandsbezug/ausfuhr-innergemeinschaftliche-lieferung.html), [small business](https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/weitere-steuertatbestaende-und-befreiungen/kleinunternehmen.html)
- [SI ZDDV-1](https://pisrs.si/Pis.web/pregledPredpisa?id=ZAKO4701), [official invoice guide](https://spot.gov.si/sl/teme/izdajanje-racunov), [FURS export proof](https://www.fu.gov.si/carina/podrocja/izvoz_blaga)
