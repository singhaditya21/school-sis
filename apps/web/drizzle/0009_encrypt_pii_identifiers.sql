-- Encrypt-at-rest for national identifiers — PII rollout, pilot field set
-- (students.aadhaar_number / students.apaar_id / staff_profiles.aadhaar_number).
--
-- EXPAND-ONLY. Deterministic AEAD ciphertext is far longer than the existing
-- varchar(12/20) caps, so it cannot be stored in place; these nullable text columns
-- hold it instead. No destructive change here, so the release auto-applies it.
--
-- Transition contract:
--   • The application writes ciphertext to <col>_enc and clears the plaintext column,
--     and reads COALESCE(<col>_enc, <col>) through decryptFieldTolerant (a raw
--     plaintext value read before backfill is returned unchanged).
--   • scripts/backfill-encrypt-pii-identifiers.ts encrypts existing rows and nulls the
--     plaintext columns, once per environment.
--   • Dropping the old varchar columns is a LATER, separately-approved destructive
--     migration, after every environment is backfilled and verified.
ALTER TABLE "students" ADD COLUMN "apaar_id_enc" text;--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "aadhaar_number_enc" text;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD COLUMN "aadhaar_number_enc" text;
