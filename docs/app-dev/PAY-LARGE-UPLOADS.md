# Pay chunk uploads — web / Flutter contract

Updated 2026-11-15. This replaces base64 for the annual and monthly Pay file screens. Finance attachments and API-key ingestion are separate contracts.

Use the existing authenticated company session and CSRF/origin rules. These endpoints are not API-key endpoints. All job IDs are company scoped; do not share local resume state across accounts.

1. `POST /api/pay-imports` JSON `{name,size}` → 201 `{job}`. Source size is at most 1,073,741,824 bytes (1 GiB). The job returns `id`, `chunkBytes` (4,194,304), `uploadedBytes`, status and expiry.
2. `PUT /api/pay-imports/{id}/chunks/{index}` with `Content-Type: application/octet-stream` and lowercase hex `X-Chunk-SHA256`. Index starts at zero, chunks are sequential and exactly the advertised size except the final chunk. Retry a committed chunk only with identical bytes. Do not base64 encode.
3. Resume with `GET /api/pay-imports/{id}`. Filename, size and modification time are not proof of identity. Rehash/resend prior chunks for server verification, or require a previously persisted full-file digest before resuming. Conflicts require user review/new upload; never combine two files.
4. `POST /api/pay-imports/{id}/process` JSON `{kind,headerRow,sheet?,recordPath?,encoding?,zipEntry?}`. `kind` is `annual`, `hr` or `transactions`; defaults to annual. Header row is 1–50. Reuse the same options in the subsequent import request. Returns 202 `{job}`.
5. Poll `GET` every 2 seconds. `queued` / `processing` are pending, `needs_selection` requires selecting a worksheet/record path/ZIP entry and processing again, `needs_review` includes an error code and does not permit import. `ready` means parsing succeeded, **not** that business validation or report approval succeeded. No partial successful result is exposed after a parsing error. Job `rowCount` is the full count, not the number of preview rows.
6. Pass `file:{uploadId:id,name}` in the existing annual `/api/import/preview`, `/api/import/quality`, `/api/import` or monthly `/api/payroll/preview` / `/api/payroll/stage` body, together with identical parser options. **Transaction jobs must use the monthly routes**; the annual routes explicitly reject paged transaction manifests. Continue existing mapping, data quality, explicit confirmation and country/year/EUR checks. Preview responses expose only the first 30 rows; use `count` for the full record count and never treat `rows.length` as the full import. Staging reads all encrypted pages on the server. Do not send the preview back as a replacement data file.
7. `DELETE /api/pay-imports/{id}` cancels processing and deletes temporary files. Uploads expire after 24 hours; status APIs reject expired jobs immediately. Show cancellation, progress, specific errors and retry actions.

## Explicit monthly corrections

Preview and staging accept `edits:[{record:1,field:"amount",value:"100.25"}]` plus the selected `mapping`. `record` is the 1-based parsed data record, excluding the header, not the physical CSV line; edits beyond the first 30 or first 1,000 records are supported. At most 500 explicit edits; fields must belong to the selected HR/transaction schema and be mapped. Duplicate edits to one record/field are rejected. All corrected rows undergo the same strict validation, and original parsed source rows remain unchanged. Corrections cannot remove records. Changing a correction invalidates the user's confirmation. Successful corrections produce count/hash metadata in the atomic staging audit.

## Limits and format honesty

- Annual/HR: 10,000 parsed data records; subscription employee limits still apply.
- The scalable monthly transaction path no longer has a fixed 500,000-row or 128 MiB materialized-result limit. It writes immutable, generation-bound encrypted pages and production PostgreSQL stores indexed records in batches of 1,000. The annual ledger JSON is only a small revision/classification manifest. The verified volume scenario is 1,000 workers / 1,000,001 transactions / 197,782,162-byte source, including exact annual amounts and hours (synthetic MemoryStore volume test; PostgreSQL-engine paging/rollback is verified separately). Employee subscription limits, structural limits and server resources remain relevant.
- Large paths: CSV/delimited text, UTF-8 tabular XML/JSON, values-only XLSX and ODS. Legacy XLS/HTML/SpreadsheetML/fixed-width inputs retain the bounded 20 MiB / 10,000-row reader and need CSV/XLSX conversion for larger imports. Small workbooks nested inside generic ZIP containers also use the bounded reader; upload the extracted XLSX/ODS itself for the scalable path. XLSB, PDF payslips, images, binary backups and EDI are not Pay source formats.
- ZIP entry selection is explicit; this is not a complete DLS multi-file adapter or automatic ZIP merge.
- Temporary company quota is 2 GiB / 25 jobs. Worker deadline 10 minutes; one worker per process. API polling must not exceed normal API rate limits.
- Run database migration 012 before deploying this backend. PostgreSQL production storage is paged; the local MemoryStore is a synthetic in-memory demo. Read-only calculation uses a repeatable snapshot; staging/version/audit commit together and late errors roll back the entire selected file. Existing multi-file batch semantics still commit successful files separately.
- Annual snapshot preparation, all seven Article 9 groups, approval checks, confidentiality and jurisdiction language remain in the existing reporting pipeline. A larger upload does not automatically make a report approved or an official filing.
- Do not claim unlimited physical capacity, universal vendor support, or legal certification from a successful upload. Vendor documentation evidence and sample-tested connectors are separate statuses.

The full deployment and test scope is in [IMPORT-ENGINE](../IMPORT-ENGINE.md).
