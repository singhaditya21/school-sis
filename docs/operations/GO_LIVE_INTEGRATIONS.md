# Go-live integrations runbook

Every capability shipped in the recent security/notifications work ships **inert** —
unset secrets mean the feature does nothing (webhooks fail closed, the CAPTCHA is
skipped, encryption stays dormant). Nothing here breaks a deploy if left unset; this
runbook is how to **turn each on** in production (Vercel env + the provider dashboards).

Set every server secret in **Vercel → Project → Settings → Environment Variables**
(Production, and Preview if you want it there too). `NEXT_PUBLIC_*` values are exposed
to the browser by design; everything else is server-only. After changing env, redeploy.

---

## 1. PII encryption at rest (`PII_ENCRYPTION_KEY`)

Deterministic-AEAD encryption for national identifiers. Migration `0009` adds the
`*_enc` columns; the app encrypts on write and reads tolerantly.

| Variable | Required | Notes |
|---|---|---|
| `PII_ENCRYPTION_KEY` | **yes** (already enforced in prod) | ≥ 32 chars, high-entropy. **Stable — do NOT rotate** without a full re-encryption pass; the ciphertext is keyed, so a new key orphans every encrypted value. |

**Deploy order:**
1. Apply migration `0009` (adds `students.apaar_id_enc`, `students.aadhaar_number_enc`,
   `staff_profiles.aadhaar_number_enc`) via the usual prod DDL path.
2. Run the one-off backfill (idempotent, safe to re-run):
   ```
   DATABASE_URL=… PII_ENCRYPTION_KEY=… \
     pnpm --filter @school-sis/web exec tsx scripts/backfill-encrypt-pii-identifiers.ts
   ```
3. Verify aadhaar/apaar read back correctly on the DigiLocker + compliance screens.
4. The old plaintext `varchar` columns are dropped **later**, in a separate approved
   destructive migration, once every environment is backfilled.

Rollout beyond the aadhaar/apaar pilot (email/phone, `users.email` last) follows
[`PII_ENCRYPTION_ROLLOUT.md`](./PII_ENCRYPTION_ROLLOUT.md).

---

## 2. WhatsApp delivery receipts

Endpoint: `POST/GET https://<host>/api/webhooks/whatsapp`. Ingests Meta Cloud API
message-status callbacks so a queued message advances to Delivered/Failed.

| Variable | Purpose |
|---|---|
| `WHATSAPP_PROVIDER` | must be a Meta Cloud value (`meta_cloud` / `meta` / `whatsapp_cloud` / `cloud_api`) for the receipt route to accept payloads |
| `WHATSAPP_APP_SECRET` | verifies `X-Hub-Signature-256` (fail-closed if unset) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | the GET subscription-handshake token |

**Meta app dashboard → WhatsApp → Configuration → Webhook:**
- Callback URL: `https://<host>/api/webhooks/whatsapp`
- Verify token: the same value as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Subscribe to the **messages** field (delivery statuses ride on it).

---

## 3. SMS delivery receipts

Endpoint: `POST https://<host>/api/webhooks/sms`. Provider-gated by `SMS_PROVIDER`.

### Twilio (`SMS_PROVIDER=twilio`)
| Variable | Purpose |
|---|---|
| `TWILIO_AUTH_TOKEN` | verifies `X-Twilio-Signature` (fail-closed if unset) |
| `TWILIO_STATUS_CALLBACK_URL` | *optional* — pin the exact public URL Twilio signs, if a proxy/CDN rewrites host/proto |

Set the message **Status Callback URL** to `https://<host>/api/webhooks/sms` (on the
Messaging Service, or per-message). Terminal statuses map: `delivered`→Delivered,
`undelivered`/`failed`/`canceled`→Failed.

### MSG91 (`SMS_PROVIDER=msg91`)
| Variable | Purpose |
|---|---|
| `MSG91_WEBHOOK_SECRET` | shared secret (MSG91 sends no HMAC); the route checks it from an `x-webhook-secret` header or a `?secret=` query param, fail-closed |

Configure MSG91's delivery-report webhook to
`https://<host>/api/webhooks/sms?secret=<MSG91_WEBHOOK_SECRET>`.

> ⚠ **Confirm before relying on MSG91 receipts.** MSG91's delivery-report body shape
> is version-specific; the parser is best-effort and fail-safe (an unrecognised body
> records nothing rather than the wrong thing). Send one real DLR to the endpoint and
> confirm receipts land before treating MSG91 delivery status as authoritative.

> Push notifications (FCM/APNs) have **no delivery-receipt concept** — there is nothing
> to ingest, by design.

---

## 4. Lead-capture bot protection (Cloudflare Turnstile)

Layered on top of the always-on honeypot + submit-timing screening. Skipped until keyed.

| Variable | Purpose |
|---|---|
| `TURNSTILE_SECRET_KEY` | server-side siteverify (when set, `/api/leads` requires a valid token) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | renders the widget on the book-a-demo form |

Create a Turnstile widget in the **Cloudflare dashboard → Turnstile**, add the site's
hostname, and copy the **site key** (public) and **secret key** (server). Behaviour once
keyed: fails **closed** on a missing/invalid token, fails **open** on a Cloudflare
outage (so a verification blip never drops real leads — the honeypot, timing, and
rate-limits still apply).

---

## 5. Toolchain (developers only — not a deploy var)

Run `corepack enable` once locally; Corepack then uses the pinned pnpm from
`package.json`. `pnpm check:toolchain` verifies Node/pnpm match the pins (it also gates
CI). Nothing to set in Vercel.

---

## Env quick reference

| Variable | Where | Feature | Unset behaviour |
|---|---|---|---|
| `PII_ENCRYPTION_KEY` | server | PII encryption | required in prod (build fails / throws) |
| `WHATSAPP_APP_SECRET` | server | WhatsApp receipts | POST fails closed (401) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | server | WhatsApp handshake | GET handshake 403 |
| `SMS_PROVIDER` | server | SMS routing | receipts route returns 400 (not receipt-capable) |
| `TWILIO_AUTH_TOKEN` | server | Twilio receipts | POST fails closed (401) |
| `TWILIO_STATUS_CALLBACK_URL` | server | Twilio (proxy) | derives URL from request headers |
| `MSG91_WEBHOOK_SECRET` | server | MSG91 receipts | POST fails closed (401) |
| `TURNSTILE_SECRET_KEY` | server | CAPTCHA | CAPTCHA skipped (screening still on) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | client | CAPTCHA widget | widget not rendered |
