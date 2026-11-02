BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_pending_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_hashes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_step BIGINT NOT NULL DEFAULT 0;
-- Google only issues identities with a verified email, so those accounts are already verified.
UPDATE users SET email_verified_at=now() WHERE email_verified_at IS NULL AND google_sub IS NOT NULL;
CREATE TABLE IF NOT EXISTS user_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('verify_email','reset_password')),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS user_tokens_user_purpose ON user_tokens(user_id, purpose);
COMMIT;
