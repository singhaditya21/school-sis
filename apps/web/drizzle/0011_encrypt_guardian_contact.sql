-- Encrypt-at-rest for guardian contact details — PII rollout, guardians batch
-- (guardians.email / guardians.phone / guardians.alternate_phone). Same
-- deterministic-AEAD dual-column pattern as 0009/0010.
--
-- EXPAND-ONLY. All three source columns are already nullable, so this is a plain
-- additive ADD COLUMN — no constraint changes. The application writes ciphertext to
-- *_enc and nulls the plaintext, and reads COALESCE(*_enc, plaintext) via
-- decryptFieldTolerant. The one-off backfill encrypts existing rows; the old varchar
-- columns are dropped later in a separate approved destructive migration.
--
-- alternate_phone has no app read/write path (only erasure nulls it) — its _enc column
-- exists so the backfill can protect any existing values and erasure can clear both.
ALTER TABLE "guardians" ADD COLUMN "email_enc" text;--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN "phone_enc" text;--> statement-breakpoint
ALTER TABLE "guardians" ADD COLUMN "alternate_phone_enc" text;
