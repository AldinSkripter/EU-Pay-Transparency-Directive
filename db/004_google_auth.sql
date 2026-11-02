ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;
CREATE TABLE IF NOT EXISTS auth_flows (
  token_hash VARCHAR(64) PRIMARY KEY,
  binding_hash VARCHAR(64) NOT NULL,
  document JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_flows_expiry ON auth_flows(expires_at);
