-- Password Reset Tokens table
-- Required by the password reset flow in actions/password-reset.ts

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_prt_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX idx_prt_expires ON password_reset_tokens(expires_at);

-- Auto-cleanup expired tokens (run via cron or QStash)
-- DELETE FROM password_reset_tokens WHERE expires_at < NOW();
