# Finance document delivery workflow

All routes require the existing company session, verified email and Finance access. Current deployment gate remains demo-only. Native mobile authentication is a separate prerequisite.

1. `GET /api/finance/documents/:id/issue-check?format=xrechnung` returns `ready`, missing `fields`, company country and `validationPending`. This checks fields, not recipient acceptance or final schema validity.
2. `POST /api/finance/documents/:id/issue` accepts `revision`, `confirm:true`, `taxScopeConfirmed:true`, `format`, and a stable `requestKey` (UUID recommended). The equivalent `Idempotency-Key` header is supported. Retry with the same key/payload after a lost response; revision conflicts require reloading state.
3. `GET /api/finance/documents/:id/bundle.zip` downloads the original PDF/XML with a manifest. Original bytes are authenticated by the vault on read.
4. `POST /api/finance/documents/:id/email-draft` accepts optional `recipient`, `subject`, `message`, returning `message/rfc822`. The message includes stored attachments and `X-Unsent: 1`. The customer sends it using their own mail application. No sent status is inferred from download.
5. `POST /api/finance/documents/:id/delivery` accepts `revision`, `confirm:true`, `channel` (`email`, `portal`, `other`), `recipient` email, `sentAt` ISO timestamp, `reference`. Response is a user-recorded external event, not an acknowledgement from an email or national delivery service.

The formats remain DE XRechnung/ZUGFeRD, AT ebInterface/UBL, SI e-SLOG/UBL within the documented domestic private B2B scope. None of these APIs creates a tax return or submits one.
