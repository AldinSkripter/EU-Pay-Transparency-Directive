# Finance packages and app/web parity

Updated 15 November 2026. Canonical implementation: `shared/finance-plans.js` in the repository. Current catalogue version: `finance-2026-11-15`.

| Package | Stable API ID | Monthly net cents | Included seats | Annual base cents |
|---|---|---:|---:|---:|
| Rechnungen / Računi | finance_start | 799 | 1, fixed | 9588 |
| Business | finance_business | 1999 | 2 | 23988 |
| Pro | finance_pro | 2999 | 3 | 35988 |

The former Start ID is retained for compatibility. Display Rechnungen in German or Računi in Slovenian. All have a 12-month minimum term. Business/Pro additional internal seats cost 699 net cents/month; annual payment is 12 times the monthly total, with no extra discount. Obtain authoritative totals from `POST /api/finance/quote`. Do not treat displayed prices as a completed purchase.

`POST /api/finance/demo-subscription` is explicitly a free local simulation. It saves the selected package and gates development operations. It is not a mobile checkout or production entitlement endpoint. No selected demo package means full exploration. Unknown package IDs fail closed. Existing records and downloads remain available after a downgrade; higher-package mutations are blocked. Actual invitations and independent production module access remain unreleased.

## Capability matrix

| Workflow | Rechnungen | Business | Pro | Current state |
|---|---|---|---|---|
| Contacts, catalogue, offers and invoices | Yes | Yes | Yes | Development APIs |
| Logo, invoice design, PDF and country XML | Yes | Yes | Yes | Supported test cases only |
| Payment QR, manual invoice payment status | Yes | Yes | Yes | Development APIs |
| Stored originals, ZIP/PDF, email draft | Yes | Yes | Yes | No automatic delivery |
| Expenses and original receipt upload | No | Yes | Yes | Manual review required |
| Photo/PDF recognition and receipt import | No | Yes | Yes | Camera UI supplied by Flutter |
| Bank CSV and allocation | No | Yes | Yes | No live bank connection |
| Recurring invoice drafts | No | No | Yes | Not automatic legal issuance |
| Actual team invitations | No | Not released | Not released | Included seats are pricing definitions |
| Tax declarations or automatic submission | No | No | No | Intentionally removed |

`403 FINANCE_PLAN_UPGRADE_REQUIRED` means show an upgrade explanation. Client visibility is not authorization: the server checks the saved package. Do not infer access from a locally selected price card or a successful quote. Production Finance still returns `503 FINANCE_RELEASE_NOT_ENABLED`.

## Screens to cover

**Shared:** authentication, verification/MFA, company identity/logo, country/language, module switch, account/security, logout, package overview and unavailable-feature states.

**Finance:** overview, offers, sales/document list, invoice editor/preview, contacts, catalogue, receivables/payments, expenses/receipt camera+review, bank CSV/allocation, recurring drafts, exports/originals, company/design, package/team screen.

**Pay:** overview, salary import and validation, report preparation workflow, comparable job categories, explanations/actions, approval/evidence, employee information requests, pay criteria, downloads and package/account screens. Use the existing server calculation/report routes; further typed schemas are needed beyond the core OpenAPI subset.

## Countries and synchronization

DE: XRechnung and ZUGFeRD. AT: ebInterface and UBL. SI: e-SLOG and UBL. These are existing test-export capabilities within the documented domestic private B2B scope; do not add a mobile-only format generator or claim broader coverage.

Read country and records from the authenticated company. A domain or UI-language change must not change invoice jurisdiction. Money totals are integer cents from the server; quantity and entered unit prices are decimal strings. Mutations use `state.revision`; on 409 reload and reconcile. Issuance alone has its documented stable request-key retry flow; other mutations must not be retried blindly.
