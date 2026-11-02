BEGIN;
ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS stripe_environment VARCHAR(10) CHECK(stripe_environment IN ('test','live'));
CREATE TABLE IF NOT EXISTS platform_control (
 id SMALLINT PRIMARY KEY CHECK (id=1),
 ciphertext TEXT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMIT;
