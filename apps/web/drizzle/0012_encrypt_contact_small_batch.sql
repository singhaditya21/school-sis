-- Encrypt-at-rest for the small contact fields — PII rollout, contained batch
-- (alumni_profiles.email/phone, host_families.phone, health_records.emergency_phone/
-- doctor_phone). Same deterministic-AEAD dual-column pattern as 0009–0011.
--
-- EXPAND-ONLY. ADD COLUMN is additive; two DROP NOT NULLs only RELAX a constraint so
-- the plaintext can be nulled after moving to *_enc. All reversible.
--
-- alumni email keeps a case-insensitive uniqueness check, so it is encrypted with the
-- normalising helper (encryptEmail) and matched on ciphertext. doctor_phone has no app
-- read/write (its _enc column exists only so the backfill can protect existing values).
ALTER TABLE "alumni_profiles" ADD COLUMN "email_enc" text;--> statement-breakpoint
ALTER TABLE "alumni_profiles" ADD COLUMN "phone_enc" text;--> statement-breakpoint
ALTER TABLE "alumni_profiles" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "host_families" ADD COLUMN "phone_enc" text;--> statement-breakpoint
ALTER TABLE "host_families" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "health_records" ADD COLUMN "emergency_phone_enc" text;--> statement-breakpoint
ALTER TABLE "health_records" ADD COLUMN "doctor_phone_enc" text;
