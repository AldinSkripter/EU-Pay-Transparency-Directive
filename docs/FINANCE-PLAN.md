# Equitensa Finance — agreed product and pricing

Decision: 14 November 2026. Finance is a separate paid module under the Equitensa brand, sharing company identity and sign-in with Pay. Buying Finance does not grant access to Pay data or paid Pay reports.

## Approved prices

Net EUR, per company:

| Package | Monthly payment | Annual payment | Included internal seats |
| --- | ---: | ---: | ---: |
| Start | 9.99 | 119.88 | 1 |
| Business | 19.99 | 239.88 | 2 |
| Pro | 29.99 | 359.88 | 3 |

Additional internal seats: EUR 6.99/month each, EUR 83.88/year for annual billing. Minimum term: 12 months for either payment frequency. One restricted external accountant account is planned as included, separately from internal seats. The owner counts as an internal seat.

Example: Business with six internal seats = 19.99 + 4 × 6.99 = EUR 47.95/month net (EUR 575.40 for 12 months).

Before purchasing more seats, the owner must see the extra recurring cost, any prorated charge and new total, then explicitly confirm. Reusing an already purchased seat costs nothing extra. Increases are prorated; decreases take effect at the next billing period after checking active users/invitations. Seat additions do not restart the base contract term. Provider preview and confirmed billing state must be authoritative; the local quote function does not calculate proration or tax.

## Product scope

One application with a Pay/Finance switch and a separate Finance product page. Finance navigation: overview, sales, expenses, contacts, accountant/exports. Company branding includes logo, accent, document templates, issuer details, payment instructions and localized text. Issued documents must preserve their original data and branding snapshot.

First release: customer/supplier records, offers and invoices, incoming documents, manual payment allocation, country-specific supported e-invoice generation/validation, document exports and company settings. Bank feeds, OCR/AI and paid delivery channels need vendor costing and explicit usage allowances before package promises are finalized. Feature allocation across packages remains a proposal, not a released capability.

## Implementation status

Implemented initially: independent Finance price catalogue and exact-cent seat quote calculator with tests. The subsequent local development release now includes the Finance dashboard, branding, contacts, draft calculation/PDF, limited marked test issuance, payments, expenses and quote simulation. See [development release and precise limits](FINANCE-IMPLEMENTATION-2026-11-14.md). Pay prices are unchanged. Live Finance checkout, invitations, seat enforcement and validated structured e-invoice delivery are not released. Real Stripe Finance prices and seat items have not been provisioned.

Next implementation: company-scoped data model and permissions, Finance UI and branding, draft calculation engine, invoice issuance/numbering and immutable snapshots, validated national e-invoice adapters, then independent subscriptions and owner-approved seat changes. Production must use durable PostgreSQL and tenant-isolation tests; demo data is temporary.
