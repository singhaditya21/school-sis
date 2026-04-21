-- Migration: 0008_mfa_columns.sql
-- Adds MFA (TOTP) fields to the users table for Week 1-3 security hardening.
--
-- mfa_secret   : AES-256-GCM encrypted TOTP secret (base32 seed for authenticator apps)
-- mfa_enabled  : Gates whether the MFA challenge is enforced at login
-- mfa_backup_codes : Array of bcrypt-hashed one-time recovery codes

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS mfa_secret       VARCHAR(512),
    ADD COLUMN IF NOT EXISTS mfa_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT[];

-- Index to quickly identify users who have MFA enabled (for enforcement checks)
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled
    ON users (tenant_id, mfa_enabled)
    WHERE mfa_enabled = TRUE;

COMMENT ON COLUMN users.mfa_secret IS
    'AES-256-GCM encrypted TOTP secret. Decrypt with lib/encryption.ts before use.';

COMMENT ON COLUMN users.mfa_backup_codes IS
    'Array of bcrypt-hashed one-time recovery codes. Each code is single-use; mark as null after consumption.';
