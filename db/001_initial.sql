BEGIN;
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  country CHAR(2) NOT NULL CHECK (country IN ('DE', 'AT', 'SI')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'hr_manager' CHECK (role IN ('hr_manager', 'admin'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS snapshots (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reporting_year INT NOT NULL CHECK (reporting_year BETWEEN 2000 AND 2100),
  source VARCHAR(100) NOT NULL,
  methodology_version VARCHAR(30) NOT NULL DEFAULT 'v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, company_id)
);
CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL,
  anonymized_id CHAR(64) NOT NULL,
  gender CHAR(1) NOT NULL CHECK (gender IN ('M','F','O')),
  job_title VARCHAR(255) NOT NULL,
  worker_category VARCHAR(255) NOT NULL,
  job_category_kv VARCHAR(255),
  base_annual NUMERIC(16,4) NOT NULL CHECK (base_annual >= 0),
  bonuses_annual NUMERIC(16,4) NOT NULL CHECK (bonuses_annual >= 0),
  paid_hours_annual NUMERIC(12,4) NOT NULL CHECK (paid_hours_annual > 0),
  hours_per_week NUMERIC(8,4) NOT NULL CHECK (hours_per_week > 0),
  base_hourly NUMERIC(16,8) NOT NULL,
  variable_hourly NUMERIC(16,8) NOT NULL,
  total_hourly NUMERIC(16,8) NOT NULL,
  fte_hourly_rate NUMERIC(16,8) NOT NULL,
  FOREIGN KEY (snapshot_id, company_id) REFERENCES snapshots(id, company_id) ON DELETE CASCADE,
  UNIQUE (snapshot_id, anonymized_id)
);
CREATE INDEX IF NOT EXISTS snapshots_tenant_year ON snapshots(company_id, reporting_year, created_at DESC);
CREATE INDEX IF NOT EXISTS employees_tenant_snapshot ON employees(company_id, snapshot_id);
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMIT;
