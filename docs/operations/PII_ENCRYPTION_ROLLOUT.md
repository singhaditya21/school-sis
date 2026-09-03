# PII-at-rest encryption — rollout plan

**Scheme (built):** deterministic AEAD in `apps/web/src/lib/encryption.ts`. The
crypto foundation is done and unit-tested; this document is the field-by-field
rollout, which is deliberately staged because each field is a live data migration.

## What is built

- `encryptDeterministic` / `decryptDeterministic` — SIV-style deterministic
  authenticated encryption (AES-256-GCM with a plaintext-derived nonce). The **same
  plaintext always yields the same ciphertext**, so equality lookups work directly on
  the ciphertext: `WHERE email = encryptEmail($1)`.
- Field helpers that normalise **before** encrypting so a query encrypts the same way
  the stored value did: `encryptEmail`, `encryptPhone`, `encryptIdNumber`, and
  `decryptField` (reads both deterministic and legacy random-IV values).
- Keys are domain-separated from the legacy random-IV `encrypt` (the TOTP path), both
  derived from `PII_ENCRYPTION_KEY`.

**Hard limitation:** deterministic encryption preserves **equality only**. `ORDER BY`,
`LIKE`/`ILIKE`, and range queries on an encrypted column stop working. Any read site
that sorts or substring-searches a field must be reworked (drop the sort, or keep a
separate non-PII sort/search key) *before* that field is encrypted.

## Safe per-field pattern (no big-bang)

For each field, in order, so the column is never half-broken:

1. **Encrypt on write + tolerant read.** Write path calls the field helper; read path
   uses `decryptField` (returns legacy plaintext unchanged, decrypts `det.v1:` values).
   New rows are encrypted; old rows still read.
2. **Backfill** existing rows (a data migration or a batched background job) so every
   value is `det.v1:`.
3. **Switch equality lookups** to encrypt the query (`WHERE col = encryptX($1)`). Until
   the backfill completes, equality is unreliable on mixed rows — gate the switch on
   backfill completion.
4. **Verify** against a migrated copy, then **enforce** (reject/So alert on any
   remaining plaintext).

Migrations live in `apps/web/drizzle` (+ `db:types` regen from a migrated DB).
`PII_ENCRYPTION_KEY` is already required in production. **Do not rotate it** without a
re-encryption pass — deterministic ciphertext changes with the key.

## Field inventory, by risk (do top-down)

### Pilot — contained, equality/display only, no sort/search
Lowest risk; validates the whole pattern end to end.
- `students.aadhaar_number`, `students.apaar_id`
- `staff_profiles.aadhaar_number`

### Medium — display + some equality, little/no sort
- `guardians.email` / `guardians.phone` / `guardians.alternate_phone`
- `alumni_profiles.email` / `.phone`, `host_families.phone`, `visitors.email` / `.phone`
- `health_records.emergency_phone` / `.doctor_phone`
- `admission_leads.parent_email` / `.parent_phone`, `marketing_leads.contact_email`

### High-risk — auth and/or search; do LAST, with the most testing
- **`users.email`** — the login lookup. Encrypting it means the login path must
  `encryptEmail(input)` for the `WHERE`, and every admin email search/sort must be
  reworked first. Highest blast radius.
- `users.phone`, `tenants.email` / `tenants.phone`
- `messages.recipient_email` / `.recipient_phone` (delivery + the new receipt webhooks
  match on `provider_message_id`, not these, so they are display-only here)

## Why this isn't done in one commit

`users.email` alone is read across auth, search, exports, and display; a wrong data
migration on live PII is unrecoverable. Each field is its own reviewed PR with a
migration verified against a migrated database — exactly the cadence the pilot field
is meant to establish.
