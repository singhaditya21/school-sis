# PII-at-rest encryption — rollout plan

**Scheme (built):** deterministic AEAD in `apps/web/src/lib/encryption.ts`. The
crypto foundation is done and unit-tested; this document is the field-by-field
rollout, which is deliberately staged because each field is a live data migration.

## What is built

- `encryptDeterministic` / `decryptDeterministic` — versioned, SIV-style deterministic
  authenticated encryption (AES-256-GCM with a plaintext-derived nonce). The **same
  plaintext always yields the same ciphertext**, so equality lookups work directly on
  the ciphertext. Rotation-safe lookups use `encryptEmailCandidates($1)` with
  `email_enc = ANY($2::text[])`.
- Field helpers that normalise **before** encrypting so a query encrypts the same way
  the stored value did: `encryptEmail`, `encryptPhone`, `encryptIdNumber`, and
  `decryptField` (reads both deterministic and legacy random-IV values).
- Deterministic keys are domain-separated by field purpose and from random-IV encryption
  (the TOTP path). New values carry the current key fingerprint (`det.v2` / `rnd.v2`).
- `PII_ENCRYPTION_PREVIOUS_KEY` enables dual-key reads during a bounded rotation; original
  `det.v1` ciphertext remains readable and searchable until it is re-encrypted.

**Hard limitation:** deterministic encryption preserves **equality only**. `ORDER BY`,
`LIKE`/`ILIKE`, and range queries on an encrypted column stop working. Any read site
that sorts or substring-searches a field must be reworked (drop the sort, or keep a
separate non-PII sort/search key) *before* that field is encrypted.

## Safe per-field pattern (no big-bang)

For each field, in order, so the column is never half-broken:

1. **Encrypt on write + tolerant read.** Write path calls the field helper; read path
   uses `decryptFieldTolerant` (returns legacy plaintext unchanged and decrypts `det.v1:`
   and `det.v2:` values).
   New rows are encrypted; old rows still read.
2. **Backfill** existing rows (a data migration or a batched background job) so every
   value is versioned ciphertext.
3. **Switch equality lookups** to candidate arrays (`WHERE col = ANY($n::text[])`) so
   plaintext fallback, original `det.v1`, current-key `det.v2`, and previous-key `det.v2`
   remain usable through rollout and rotation.
4. **Verify** against a migrated copy, then **enforce** (reject/So alert on any
   remaining plaintext).

Migrations live in `apps/web/drizzle` (+ `db:types` regen from a migrated DB).
`PII_ENCRYPTION_KEY` is required in production and `ENCRYPTION_KEY` is rejected there.
Use the protected two-release rotation procedure in
`apps/web/docs/PII_KEY_ROTATION.md`; never replace a key in place.

## Field inventory, by risk (do top-down)

### ✅ Done
- **Pilot** (migration `0009`): `students.aadhaar_number`, `students.apaar_id`,
  `staff_profiles.aadhaar_number` — validates the whole pattern end to end.
- **visitors** (migration `0010`): `visitors.phone`, `visitors.email` — no equality
  lookup and no sort/search, so the cleanest case; contained to `lib/actions/visitor.ts`.
- **guardians** (migration `0011`): `guardians.email`/`phone`/`alternate_phone` — the
  highest-value contact PII (every notification path), across 5 files (messages, student
  record, absence SMS, admissions INSERT, erasure). No value-equality lookup.
- **small batch** (migration `0012`): `alumni_profiles.email`/`phone` (email keeps a
  case-insensitive uniqueness check → `encryptEmail` on ciphertext), `host_families.phone`,
  `health_records.emergency_phone`/`doctor_phone`.
- **login identifier** (migration `0013`): `users.email`; password, SSO, onboarding,
  platform, user-management, and SCIM equality paths use rotation-safe candidates.

### Medium — remaining
- `admission_leads.parent_email` / `.parent_phone`, `marketing_leads.contact_email`
  (lead-capture tables — pair with the #31 lead-consent work).

### High-risk — auth and/or search; do LAST, with the most testing
- `users.phone`, `tenants.email` / `tenants.phone`
- `messages.recipient_email` / `.recipient_phone` (delivery + the new receipt webhooks
  match on `provider_message_id`, not these, so they are display-only here)

## Why this isn't done in one commit

`users.email` alone is read across auth, search, exports, and display; a wrong data
migration on live PII is unrecoverable. Each field is its own reviewed PR with a
migration verified against a migrated database — exactly the cadence the pilot field
is meant to establish.
