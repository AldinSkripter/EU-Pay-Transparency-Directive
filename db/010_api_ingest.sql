BEGIN;
-- Push integration: per-company API keys and the deliveries received through them. A delivery waits as 'pending'
-- until a user reviews it in the app and confirms the import, so an API call can never replace approved data.
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label VARCHAR(80) NOT NULL,
  prefix VARCHAR(12) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS api_keys_company ON api_keys(company_id);
CREATE TABLE IF NOT EXISTS ingest_batches (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  source VARCHAR(80) NOT NULL,
  reporting_year INT NOT NULL CHECK (reporting_year BETWEEN 2000 AND 2100),
  record_count INT NOT NULL,
  payload TEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','imported','discarded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ingest_batches_company ON ingest_batches(company_id, status, created_at);
COMMIT;
