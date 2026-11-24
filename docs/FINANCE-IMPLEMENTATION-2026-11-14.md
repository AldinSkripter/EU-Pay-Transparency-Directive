# Finance development release — 14 November 2026

## Available locally

Open `/finance`, also linked from public navigation and the Pay workspace. Shared authentication and registration country (DE/AT/SI); explicit company-country confirmation; German for DE/AT, Slovenian for SI. A demo can be started with a chosen country without registering.

Implemented working flows:

- Company profile, checksum-validated IBAN, PNG/JPEG logo upload with content/size/dimension limits, accent color and footer; live branding preview.
- Company-scoped customer contacts including country and business/public-sector classification.
- Offers and invoice drafts, editable before issuance, offer-to-invoice conversion with duplicate-conversion protection, 1–100 item lines.
- Exact integer-cent calculations, fractional quantities, unambiguous decimal dot/comma input, VAT by rate group. Standard/reduced rates offered for the selected country; the software does not determine a transaction's tax classification.
- PDF download with issuer/customer identity, dates, lines, rate groups and totals, payment details and branding. Unicode font required via `PDF_FONT_PATH` or supported OS fallback. Draft and test documents are clearly labelled.
- Limited **test-only** issuance with missing-field checks, per-company/kind/year numbering and immutable issuer/customer/document data. German invoice issuance is blocked until a validated structured format is implemented; this conservative block is not a claim that every PDF invoice is unlawful. Private domestic B2B AT/SI bank-transfer scenarios can be simulated. Cash/card fiscalisation, public-sector and cross-border cases are not released.
- Partial/full manual payment recording, overpayment/date checks, expense register with duplicate detection, complete JSON export and activity history. Expenses do not yet include original file attachment or OCR.
- Independent Finance package quote and free local subscription simulation: 9.99/19.99/29.99 EUR, 1/2/3 internal seats; additional seats 6.99 EUR, 12-month minimum. No live charge, invitations or actual seat enforcement are implied by this simulation.
- Overview reflects saved documents, balances and dated manual cash activity. No fabricated turnover, bank feeds, profit or tax reports.

## Security and persistence

Finance routes run behind existing authentication, verified email, company suspension, Origin and rate-limit middleware. Request bodies never choose the company. No production Finance access is enabled yet: existing HR sessions must not acquire financial access before independent roles and entitlements are implemented.

State is stored in the existing `company_documents` table under `finance_v1`. PostgreSQL mutations use a transaction and `SELECT ... FOR UPDATE`; a revision check prevents silent concurrent overwrites. Failed changes roll back. Numbering, status change and activity entry commit together. MemoryStore provides the same local test interface; local demo data is temporary and disappears on server restart. Limits: 500 contacts, 500 documents, 500 expense records, last 1,000 activity entries. This development storage arrangement must move to normalized indexed Finance tables before a scalable production launch. No new migration is needed to run this development version.

Issued documents have no edit endpoint that accepts changes; later branding edits do not modify the stored issuer snapshot. Payment entries are separate from document totals. Credit notes/storno, refunds and audit retention policies are still required before production issuance.

## Country checks and official sources

| Country | Checked baseline | Implemented / remaining |
| --- | --- | --- |
| DE | [UStG §14](https://www.gesetze-im-internet.de/ustg_1980/__14.html), [BMF e-invoice FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html) | Required-data model and 19/7% calculation. Validated XRechnung/ZUGFeRD, recipient requirements, transitional exceptions and delivery remain. Issuance currently blocked. |
| AT | [Invoice requirements](https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/weitere-informationen-zur-umsatzsteuer/vorsteuerabzug-und-rechnung/formerfordernisse.html), [VAT rates](https://www.usp.gv.at/themen/steuern-finanzen/umsatzsteuer-ueberblick/steuersaetze-und-steuerbefreiungen-der-umsatzsteuer.html), [Federal e-invoice](https://www.erechnung.gv.at/erb/precond) | 20/13/10/4.9% calculation; 4.9% selection blocked for service dates before July 2026. Buyer UID required for test invoices above EUR 10,000 gross. ebInterface/Peppol, exemptions, special cases and full date-effective classification remain. |
| SI | [SPOT invoice requirements](https://spot.gov.si/sl/teme/izdajanje-racunov/), [FURS VAT](https://www.fu.gov.si/davki_in_druge_dajatve/podrocja/davek_na_dodano_vrednost_ddv), [Adopted e-invoice law](https://www.gov.si/novice/2025-10-23-drzavni-zbor-sprejel-zakon-o-izmenjavi-elektronskih-racunov-in-drugih-elektronskih-dokumentov/) | 22/9.5/5% calculation and Slovenian documents. Test scope is bank-transfer domestic private B2B. Structured e-invoice exchange, 2028 requirements, e-SLOG and FURS cash/card fiscalisation remain; no purported FURS submission. |

These checks establish an implementation baseline, not certification. A tax rate being selectable does not mean it applies to every sale. This release does not support reverse charge, exemptions/small-business schemes, advances, final/partial invoices, foreign currency or cross-border VAT treatment. Missing national special cases cannot be bypassed by treating them as ordinary domestic VAT.

## Validation

Automated checks exercise DE/AT/SI authentication, tenant isolation, country mismatch, draft/PDF output, immutable issued snapshots, payment limits, expense duplicates, stale revisions, offer conversion and edits, integer rounding, invalid dates/amounts/logos/IBAN, and PostgreSQL persistence/rollback. Full project suite: **222 pass, 0 fail, 1 skipped** (external PostgreSQL test without configured database; embedded PostgreSQL checks pass). Build succeeds with the existing main-bundle size advisory.

Browser walkthrough: chose AT demo, saved company and bank information, added a customer, calculated 2.5 × EUR 120.00 + 20% VAT = EUR 360.00, produced marked test invoice `RE-2026-00001`, and fetched its PDF (HTTP 200, application/pdf). Responsive overview checked at 390px without horizontal overflow.

## Next release gates

1. Normalized Finance database, dedicated Finance permissions, accountant access, seat invitations/limits, data-retention/export procedures and recovery/load tests.
2. Independent real subscriptions, Stripe price provisioning, webhook lifecycle, proration preview and approved seat changes, minimum-term cancellation and module entitlements.
3. National date-effective tax regimes and invoice types, validated e-invoice generation/import, delivery providers, receipt/status handling, credit notes/storno and reconciliation.
4. Persistent original document storage, malware/content screening, OCR with confirmation, SMTP/provider setup and bank-provider integration.
5. Independent accountant/legal acceptance on real anonymized samples for each supported transaction class and country.

No dashboard polish or passing test substitutes for these release gates. Production remains closed until the supported country flows and access controls have been reviewed.

## Document design studio and Equitensa UI update

Finance now uses the Equitensa violet identity, layered surfaces, entry transitions, animated payment indicators, chart tooltips and pointer-responsive document previews. Reduced-motion preferences and hidden browser tabs skip numerical animation so values remain accurate.

Company-scoped document design supports Signature / Minimal / Editorial templates; sans / serif / mono fonts; accent, text and surface colors; logo upload and left/right placement; compact/comfortable spacing; and a multiline footer. Settings are validated server-side and used by draft PDF generation. Issued test documents retain an immutable issuer/design snapshot. Screen preview is illustrative: PDF pagination/layout is not pixel-identical. PDF fonts use local Unicode font fallbacks where the selected font is unavailable.

Verification: 8 Finance tests pass, including nine template/font PDF combinations, rejected invalid design values, saved settings reload, and issued design immutability. Browser checks cover live template/font switching, save, draft PDF download (200/application-pdf), chart tooltips and range switching, and a 390px editor with no horizontal overflow. Production release gates above still apply.

## Expanded Finance entry and document composer

The public Finance entry was rebuilt with a violet branded document showcase, interactive color/template preview, country selection and functional demo/login entry. Authenticated visitors can inspect it at /finance?discover=1.

The sales form now has a document composer with debounced, authenticated server-side calculation preview (no document mutation), multiline line descriptions, duplicate/remove/reorder line controls, and a preview beside the form on desktop. User content remains plain escaped text.

Document customization now includes custom invoice/offer titles, 9-13pt body font size, 50-150pt logo width, 30-60pt margins, and up to eight text sections (80-character heading, 1200-character body). Sections can be reordered within their selected placement before items, before totals or after totals. Each draft can override the company appearance without changing company defaults; overrides and issued issuer/design snapshots are persisted. This is a template-and-section editor, not an unrestricted free-position canvas. PDF output now uses two-column parties, a line table with continuation headers, and custom text blocks; pagination is not pixel-identical to browser preview.

Verification: complete suite 224 tests, 223 pass, zero failures, one existing external-PostgreSQL skip. Finance tests cover read-only previews, cross-company isolation, custom appearance persistence/issued immutability, bounded inputs and all nine template/font PDF combinations. Browser verified custom title and text block, saved draft appearance, 360 -> 720 -> 360 EUR line changes, PDF HTTP 200, and 390px views without horizontal overflow. Existing production gates and unsupported tax/transport cases still apply.

## Finance workspace essentials

Added a company-scoped product/service catalog (create/edit, unique case-insensitive SKU, archive/restore), insertion into document drafts, editable contacts with existing document snapshots retained, a document center with search/status filters/sorting/open and overdue balances, and copying documents into fresh drafts with current dates and no issued number or payments. Contacts display linked-document counts and outstanding invoice balances.

Manual expense entries now support internal categories, notes and corrections, without claiming a tax ledger or input-VAT calculation. CSV exports cover documents, payments, expenses, contacts and products; dated records can be restricted to a year. Cells are quoted and formula-like text is prefixed to prevent spreadsheet formula execution. JSON remains a full export. The export screen labels these as generic exports, not DATEV/BMD/e-SLOG.

Contacts, catalog, document center, expenses, exports and subscription screens now share a violet design system, stronger typography, search toolbars, clear empty states and responsive layouts. Document creation opens on demand instead of covering the document list. Overview document links open the selected draft or locate an issued document in the document center.

Validation: 9 Finance tests pass. Full suite: 225 total, 224 pass, zero failures, one pre-existing external PostgreSQL skip. Tests cover catalog validation and tenant isolation, contact snapshot behavior, copying, expense correction/categories, CSV filtering and formula protection. Browser verified catalog creation -> invoice insertion -> EUR 150.00 preview -> save -> document search -> copy, contact save, expense category edit and CSV download. Six workspace screens checked at 390px with no horizontal overflow. All previously listed production gates remain.

## Series, bank-CSV workflow, reminder drafts and quick navigation

Added calendar-anchored monthly/quarterly/yearly invoice series. A series stores its own line/design template, refreshes contact details when creating a period, preserves end-of-month anchors, supports pause/resume and prepares drafts only. Due periods can be generated manually or, with explicit series opt-in, when a user opens Finance. No unattended scheduler, automatic issuance or sending is claimed. Runs are atomic and version guarded; processing is capped at 12 periods per series and 50 drafts per run. Each generated draft stores its series and period identifiers.

The new bank workspace imports generic EUR CSV with explicit column mapping, ISO dates, decimal point/comma amounts and stable account/transaction IDs. A preview precedes confirmation; editing import inputs invalidates the preview. Imports are bounded to 1 MB/500 rows and 2000 saved transactions per company. Identical IDs are skipped; conflicting payloads roll back the entire import. Confirmed incoming transactions can be allocated partially to issued test invoices, bounded by both transaction remainder and invoice balance. Transactions before an invoice date and debit allocations are rejected. Debit CSV rows remain informational and are not automatically booked as expenses. This does not provide direct bank access, PSD2 connectivity, account-balance reporting or OCR.

Overdue, unpaid test invoices can generate an RFC822 .eml reminder draft, marked TEST and X-Unsent. Current balances are rechecked at download, current contact email is used when available, and paid/not-yet-due/draft invoices are blocked. The system does not send email, add fees or claim statutory dunning workflows.

Overview now contains actionable setup/draft/overdue/series tasks. A native-dialog quick search (Ctrl/Cmd+K) navigates pages, opens documents and starts invoices from contacts or catalog items, with keyboard selection and mobile layout.

Validation: full suite 227 tests, 226 pass, zero failures, one pre-existing external PostgreSQL skip. Added tests for month-end anchors, repeated runs, pause/resume, current reminder balances and tenant isolation; bank amount parsing, duplicate/conflicting IDs, preview non-mutation, atomic rollback, confirmation and over-allocation checks. Browser verified a EUR150 CSV credit against a EUR240 open invoice (EUR90 remaining), duplicate import skips, manual and on-open series generation, current .eml response, quick search, invalidated stale CSV preview, and 390px layouts for bank/series/overview/dialog. Build passes. Production remains gated as described above.

## Original receipts and portable backup

Expenses now support original PDF/PNG/JPEG attachments (2 MB each, 50 files per local test company). Files are validated by signature and bounded image dimensions, stored in a company-scoped local vault under random UUID paths, encrypted with AES-256-GCM using a finance-specific key derived from the application account key, and checked against plaintext SHA-256 on retrieval. Download requires the existing verified company session and sends attachment/no-store/nosniff headers. Filenames never determine filesystem paths. If a metadata transaction fails after writing, the newly written file is removed.

The ZIP export streams finance-data.json and original receipt files, with UTF-8 paths and per-entry CRC, without changing the original bytes. JSON alone contains structured records and receipt metadata; ZIP includes the actual originals. No OCR, antivirus certification, production retention workflow or cloud object-storage availability is claimed. Production release still requires stable key management, persistent/replicated storage, malware handling and verified backup/recovery. Local demo state is ephemeral, which the collapsible test-status panel now states explicitly.

Validation: full suite 229 tests, 228 pass, zero failures, one existing external PostgreSQL skip. File tests cover exact download bytes/hash, denied cross-company access, malformed/oversized content, invalid path IDs, encrypted disk payload, integrity failure and ZIP extraction. Browser uploaded a synthetic receipt through the actual file input, downloaded an identical SHA-256 original, and fetched a ZIP package successfully. Build passes. The desktop/mobile UI uses a compact expandable feature-status panel and shorter sidebar labels.
# Package and module navigation revision

- Finance packages now use an explicit monthly/annual segmented control, annual invoice totals, included seats, additional-seat controls, and an exact-cent minimum-term summary. Existing 9.99/19.99/29.99 EUR and 6.99 EUR extra-seat prices are unchanged. All current test features are explicitly shared across plans; included seats distinguish them.
- Pay and Finance use the same ModuleSwitcher component immediately below the company in their left navigation, with the same active-state styling and a Finance package-management shortcut. Finance mobile navigation now uses a menu drawer, matching Pay's navigation pattern.
- Existing simulated subscription selection is restored when Finance loads. Module activation, invitations and real billing remain explicitly unavailable in production.
- A country-specific status panel explains current issuance restrictions and links to official DE/AT/SI sources. This UI change does not extend the tax cases supported by the backend.
- Verified browser round trip Pay → Finance packages, monthly/annual + extra-seat totals (Business + one extra seat = 323.76 EUR annually), mobile overflow and drawer opening/closing. Finance integration suite: 13/13 passing; production build passes, existing main-chunk size advisory remains.


## Document studio and dashboard refresh

Firma & Design now uses FinanceBrandBuilder: a document canvas, style/layout/content/company/brand tool rail, contextual section selection, invoice/offer preview, zoom, collapsible inspector and explicit company-template save. It supports the existing bounded PDF appearance settings, logo upload, footer, company data and up to eight custom blocks. Blocks have presets, duplication, reordering and position selection. Per-document editing retains its independent appearance settings and undo/redo. This is a structured document builder, not arbitrary pixel positioning.

Pay and Finance overview pages now share quick-action cards and stronger hero/KPI/panel styling. Shared identity and module navigation remain in the same sidebar position. Module packages open in a centered native dialog.

Verified in browser: company block create/duplicate/reorder/remove, save and persistence after reload; clicking the preview header opens content controls; 390px viewport has no page overflow; Pay quick action opens the seven-indicator step. Inspected both dashboard screenshots. Production build passes and all 16 Finance plan/integration tests pass, including design PDF generation and issued-document snapshots. Existing main bundle size advisory remains. Production Finance release gates above are unchanged.

## Shared company identity and account UX

Fixed the public Finance wordmark cascade: navigation button styles no longer shrink or frame the Equitensa logo. Both workspaces now have a shared company-profile dialog, persisted through authenticated company-scoped /api/company/brand routes. Display name and validated PNG/JPEG logo are shared across Pay and Finance; legal names and invoice templates remain separate. Upload size limit is 250 KB; validation decodes image data and rejects unsupported content. Saving is disabled while FileReader is loading.

Both sidebars use an independently scrolling navigation region and a fixed account dock with labelled logout and account-security access. Finance now exposes the existing account-security screen. Overview/Focus controls persist a local browser preference and hide secondary chart sections without affecting report data. KPI panels and dashboard surfaces have refined shared styling.

Validation: 17 targeted Finance/branding tests pass, including unauthorized requests, tenant isolation, logo validation/removal and persistence. Browser verified upload/save in Finance, retrieval in Pay, removal, Finance security navigation, focus mode in both modules and 390px layout without overflow. Public Finance logo computed size is 27px; mobile logout stays within viewport. Build passes with the existing main bundle size advisory. Local server restarted to load new routes; ephemeral demo was reset.
