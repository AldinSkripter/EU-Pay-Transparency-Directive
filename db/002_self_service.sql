BEGIN;
CREATE TABLE IF NOT EXISTS report_workflows (
 company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 reporting_year INT NOT NULL,
 document JSONB NOT NULL DEFAULT '{}',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id, reporting_year)
);
CREATE TABLE IF NOT EXISTS billing_orders (
 id UUID PRIMARY KEY,
 company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 plan VARCHAR(30) NOT NULL,
 mode VARCHAR(20) NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'pending',
 interval VARCHAR(20) NOT NULL DEFAULT 'monthly',
 event_created BIGINT NOT NULL DEFAULT 0,
 provider_session TEXT UNIQUE,
 provider_subscription TEXT UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS billing_events (
 id TEXT PRIMARY KEY,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMIT;
