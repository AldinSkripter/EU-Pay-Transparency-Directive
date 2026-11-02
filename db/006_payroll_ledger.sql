BEGIN;
CREATE TABLE IF NOT EXISTS payroll_ledgers (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reporting_year INT NOT NULL CHECK(reporting_year BETWEEN 2000 AND 2100),
  version INT NOT NULL DEFAULT 1,
  document JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(company_id,reporting_year)
);
COMMIT;
