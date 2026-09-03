-- Encrypt-at-rest for visitor contact details — PII rollout, visitors batch
-- (visitors.phone / visitors.email). Same deterministic-AEAD dual-column pattern as
-- 0009: ciphertext is longer than the varchar caps, so it goes in new text columns.
--
-- EXPAND-ONLY. ADD COLUMN is additive; DROP NOT NULL only RELAXES a constraint (a
-- looser schema still accepts every existing and in-flight row), so both are safe to
-- auto-apply and are reversible. `phone` must become nullable because the app moves
-- its value into phone_enc and nulls the plaintext.
--
-- Transition contract (see 0009): write ciphertext to *_enc + null the plaintext;
-- read COALESCE(*_enc, plaintext) via decryptFieldTolerant; one-off backfill; the old
-- varchar columns are dropped later in a separate approved destructive migration.
ALTER TABLE "visitors" ADD COLUMN "phone_enc" text;--> statement-breakpoint
ALTER TABLE "visitors" ADD COLUMN "email_enc" text;--> statement-breakpoint
ALTER TABLE "visitors" ALTER COLUMN "phone" DROP NOT NULL;
