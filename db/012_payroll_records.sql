BEGIN;
CREATE TABLE IF NOT EXISTS payroll_records (
 company_id UUID NOT NULL,
 reporting_year INT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('hr','transactions')),
 record_key TEXT NOT NULL,
 payload JSONB NOT NULL,
 PRIMARY KEY(company_id,reporting_year,kind,record_key),
 FOREIGN KEY(company_id,reporting_year) REFERENCES payroll_ledgers(company_id,reporting_year) ON DELETE CASCADE
);
COMMIT;
