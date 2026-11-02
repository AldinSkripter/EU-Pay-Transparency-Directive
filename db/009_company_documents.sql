BEGIN;
-- Per-company documents that are not tied to one data snapshot (pay ranges and criteria, Arts. 5 and 6).
CREATE TABLE IF NOT EXISTS company_documents (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind VARCHAR(40) NOT NULL,
  document JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id, kind)
);
COMMIT;
