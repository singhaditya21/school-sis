-- Encrypt-at-rest for users.email — PII rollout, HIGHEST-RISK batch (login).
--
-- ⚠ This is the sign-in identifier. It is wired with the tolerant lookup pattern
-- (email_enc = encryptEmail($) OR legacy lower(email)=lower($)) on EVERY auth path so
-- both encrypted and not-yet-backfilled rows sign in, but the change MUST be validated
-- against a real login / SCIM / enterprise-SSO flow on staging before it ships.
--
-- EXPAND-ONLY: ADD COLUMN + DROP NOT NULL (relax) + a new unique index. Deterministic
-- encryption makes email_enc uniqueness equivalent to the existing lower(email) one, so
-- uq_users_tenant_email_enc preserves the per-tenant uniqueness the old index enforced.
-- The old uq_users_tenant_email index stays until the plaintext column is dropped later
-- (a separate approved destructive migration, after every environment is backfilled).
ALTER TABLE "users" ADD COLUMN "email_enc" text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_tenant_email_enc" ON "users" ("tenant_id", "email_enc");
