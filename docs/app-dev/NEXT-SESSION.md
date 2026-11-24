# Next development session

Historical session notes below. For the current Flutter kickoff and latest package rules, use [START-HERE-FLUTTER](START-HERE-FLUTTER.md) and [PACKAGES-AND-PARITY](PACKAGES-AND-PARITY.md).

## First joint session with Flutter team

1. Run the supplied smoke script against the local backend and read the existing core OpenAPI contract.
2. Assign owners for backend, Flutter, identity provider, staging and store release accounts.
3. Agree OAuth/OIDC provider, callback identifiers, token lifetimes and device-session revocation. Implement the proposed mobile contract before production login.
4. Provide HTTPS staging with synthetic company accounts for DE, AT and SI. Production Finance remains gated.
5. Build one end-to-end slice: login, selected company, module entitlement, contacts, invoice draft, authoritative preview and PDF share. Test revision conflicts and expired sessions.

## Web design work delivered in this session

A shared surface stylesheet now covers both workspace modules: panel surfaces, form labels and controls, focus states, primary and secondary actions, table rows and headers, status notices, Pay workflow navigation and Finance document/contact/catalog/expense/export surfaces. Existing shared company logo, module navigation and account dock are retained. Customer invoice canvas styling remains separate.

Browser navigation checked all 10 Finance main sections and 7 Pay main sections for rendering and document overflow. Pay report preparation and Finance contacts were inspected visually. A Finance contact form was checked at 390px width. This is not a claim that every dialog, data condition or user journey has been visually certified.

## Validation

- Production web build passed (existing large bundle warning remains).
- 20 targeted tests passed for handoff integrity, company identity, Finance plans/calculations and PWA configuration.
- Local connectivity smoke passed for DE, AT and SI.

## Remaining release work

Mobile authentication and staging are not implemented. Complete nested API schemas, module entitlement enforcement, country-specific Finance release requirements and real-device tests before release. Native PWA installation has not been independently verified in a standalone desktop browser. Continue populated-table, invoice-editor and error-state visual checks across screen sizes; navigation checks alone do not prove all functions correct.
