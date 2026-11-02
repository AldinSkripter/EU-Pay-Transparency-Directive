BEGIN;
CREATE TABLE IF NOT EXISTS import_profiles (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  structure_hash CHAR(64) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  document JSONB NOT NULL,
  approved_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,structure_hash)
);
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL,
  reporting_year INT NOT NULL,
  fingerprint CHAR(64) NOT NULL,
  file_hash CHAR(64) NOT NULL,
  format VARCHAR(20) NOT NULL,
  structure_hash CHAR(64) NOT NULL,
  mapping_version INT NOT NULL,
  mapping JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(snapshot_id,company_id) REFERENCES snapshots(id,company_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS import_batches_tenant_year ON import_batches(company_id,reporting_year,created_at DESC);
COMMIT;
