# PII encryption key operations

The web application uses `PII_ENCRYPTION_KEY` as the current data-encryption root and
optionally accepts one `PII_ENCRYPTION_PREVIOUS_KEY` during a controlled rotation.
Ciphertexts carry a non-secret key fingerprint, and deterministic fields also carry a
field purpose. New writes always use the current key. Reads and equality lookups accept
the current key, the previous key, and the original `det.v1` format.

Production uses the protected GitHub `production` Environment as its key source of truth.
`PII_ENCRYPTION_KEY_V1` and `PII_ENCRYPTION_KEY_V2` are secret slots;
`PII_ENCRYPTION_CURRENT_VERSION` selects the writer. The workflow resolves the other
configured slot as the previous key and passes both directly to the immutable Vercel
deployment. Preview generates a fresh per-run key. Neon stores ciphertext, not application
encryption keys. `ENCRYPTION_KEY` is retired and rejected by the deployment contract.

## Normal rotation

1. Create a pre-rotation Neon recovery branch/checkpoint using the protected production
   release workflow.
2. Generate a new root with at least 32 random bytes. Do not print it in CI logs. Save it in
   the unused protected GitHub secret slot.
3. Keep `PII_ENCRYPTION_CURRENT_VERSION` on the old slot and set
   `PII_ENCRYPTION_ROTATION_MODE=off`. Deploy once so production can read both keys before
   any row is rewritten.
4. Switch `PII_ENCRYPTION_CURRENT_VERSION` to the new slot and set
   `PII_ENCRYPTION_ROTATION_MODE=execute`. Deploy through the protected workflow. The
   workflow creates a Neon checkpoint, migrates/backfills, and re-encrypts in bounded
   transactions before promotion. The still-live prior deployment can read both keys.
5. Verify sign-in, MFA, SSO, SCIM email filters, user creation, and authenticated readiness.
   For an independent administrative audit with the direct Neon migration URL, run:

   ```bash
   pnpm --filter @school-sis/web db:pii:rotate
   ```

6. Re-encrypt in bounded transactions:

   ```bash
   pnpm --filter @school-sis/web db:pii:rotate -- --execute --batch-size=250
   ```

7. Run with `--assert-current`; every target must report `0 pending`.
8. Set `PII_ENCRYPTION_ROTATION_MODE=audit`, delete the old secret slot, and deploy again.
   The previous key is not retired until this release and all authentication checks pass.

## Abort and recovery

- Before re-encryption starts: restore the old key as `PII_ENCRYPTION_KEY`, remove the
  previous-key variable, and redeploy.
- While re-encryption is running: keep both keys configured. The job is idempotent and may
  be safely rerun after resolving the failure.
- After any rows use the new key: never deploy an old-key-only runtime. Either keep the
  dual-key deployment or restore the pre-rotation Neon checkpoint together with the old
  key configuration.
- If a required key is lost, stop writes, preserve the database and Vercel deployment, and
  restore the matching key from the controlled recovery copy. Ciphertext cannot be
  recovered from Neon backups without its application key.

## Verification contract

- `PII_ENCRYPTION_KEY` is mandatory and at least 32 characters.
- A configured previous key must meet the same minimum and differ from the current key.
- New deterministic values start with `det.v2:<key-id>:<purpose>:`.
- New random-IV values start with `rnd.v2:<key-id>:`.
- The rotation job aborts on unknown keys, malformed ciphertext, authentication failure,
  nonce mismatch, or a concurrent update.
