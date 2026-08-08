# Notification Delivery Runbook

## Production contract

External notification channels are opt-in. Leaving a `*_PROVIDER` selector unset disables that channel: enqueueing fails before an outbox row is created. Production rejects mock providers and rejects an incomplete live provider configuration at startup.

| Channel | Live provider | Required send configuration | Receipt path |
| --- | --- | --- | --- |
| Email | `resend` | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Native Resend/Svix webhook |
| Email | `smtp` | SMTP credentials, shared receipt secret | Trusted normalized receipt bridge |
| SMS | `twilio` | Twilio credentials, from number, HTTPS callback URL | Native Twilio status callback |
| SMS | `msg91` | `MSG91_AUTH_KEY`, shared receipt secret | Trusted normalized receipt bridge |
| WhatsApp | `twilio` | Twilio credentials, WhatsApp sender, HTTPS callback URL | Native Twilio status callback |
| Push | `firebase` | Firebase Admin credentials, shared receipt secret | Trusted server-side delivery-data bridge |
| In-app | `database` | None | Recorded `DELIVERED` synchronously |

Use `REQUIRED_NOTIFICATION_CHANNELS=email,sms,whatsapp,push` to make selected providers mandatory at production startup. Do not put a shared receipt secret in a browser or mobile client. The bridge is a trusted server-side adapter that converts a provider delivery export or callback to the normalized contract below.

## Receipt endpoints

- Twilio: `POST /api/webhooks/notifications/twilio`, form encoded, authenticated with `X-Twilio-Signature` and the exact `NOTIFICATION_TWILIO_STATUS_CALLBACK_URL`.
- Resend: `POST /api/webhooks/notifications/resend`, raw JSON, authenticated with `svix-id`, `svix-timestamp`, and `svix-signature`. Replays outside five minutes fail authentication; `svix-id` is the event idempotency key.
- MSG91, Firebase, or SMTP bridge: `POST /api/webhooks/notifications/{provider}`, raw JSON, authenticated with `X-School-SIS-Signature: sha256=<hex HMAC-SHA256 of raw body>`.

Normalized bridge payload:

```json
{
  "providerMessageId": "provider-message-id",
  "status": "DELIVERED",
  "eventId": "provider-unique-event-id",
  "occurredAt": "2026-08-07T10:00:00.000Z",
  "error": null,
  "metadata": {}
}
```

Allowed statuses are `SENT`, `DELIVERED`, `FAILED`, and `SUPPRESSED`. Authentication occurs before the cross-tenant provider-id lookup. After lookup, the outbox update, delivery-event insert, and linked-message update execute under the resolved tenant's RLS context in one transaction. Duplicate event ids are acknowledged without mutation, and older callbacks or late `SENT` callbacks cannot regress a terminal status.

Provider-confirmed `FAILED` receipts are excluded from the automatic retry sweep so the system cannot send a duplicate after a definitive delivery failure. An operator may still replay one deliberately after correcting the recipient or provider condition.

Each worker atomically changes one eligible outbox row to `PROCESSING` before invoking a provider. Other workers treat that marker as an active claim and do not send. The provider outcome, delivery event, and linked-message state are then committed together; linked messages already marked `DELIVERED` cannot be regressed to `SENT`. Explicit provider rejections become retryable `FAILED` outcomes. Transport timeouts, disconnects, malformed acceptance responses, and accepted sends whose bookkeeping transaction cannot be confirmed remain `PROCESSING`, with automatic retry blocked. The CRITICAL reconciliation incident includes the opaque provider message id whenever one was returned. This deliberately favors duplicate prevention over unattended replay.

## Provider setup

For Twilio SMS and WhatsApp, configure `NOTIFICATION_TWILIO_STATUS_CALLBACK_URL` as the public HTTPS Twilio endpoint above. The send adapters include this URL in every outbound request. The receiver maps `delivered`/`read` to `DELIVERED`, `failed`/`undelivered` to `FAILED`, and `canceled` to `SUPPRESSED`.

For Resend, subscribe the endpoint to at least `email.sent`, `email.delivered`, `email.failed`, `email.bounced`, `email.suppressed`, and `email.complained`. Store its signing secret as `RESEND_WEBHOOK_SECRET`.

Firebase Cloud Messaging acknowledges provider acceptance but does not expose a direct per-message delivery webhook. If provider-confirmed per-device delivery is required, deploy a trusted server-side bridge backed by the approved Firebase delivery-data export and sign its normalized callbacks. Until that bridge is configured, the outbox remains at `SENT`, never fabricated as `DELIVERED`.

## Delivery drill

Run the drill only with approved test recipients and live sandbox/production provider credentials. It refuses mock and disabled providers, emits no recipient values, and fails unless every selected channel receives an authenticated `DELIVERED` receipt.

```bash
cd apps/web
export NOTIFICATION_DRILL_TENANT_ID=00000000-0000-4000-8000-000000000000
export NOTIFICATION_DRILL_TARGETS_JSON='{"EMAIL":"qa@example.edu","SMS":"+919999999999","WHATSAPP":"+919999999999","PUSH":"test-device-token"}'
export NOTIFICATION_DRILL_EVIDENCE_FILE=/tmp/notification-delivery-drill.json
pnpm exec tsx scripts/notification-delivery-drill.ts
```

Review the JSON artifact for `passed: true`, a `DELIVERED` final status, and a `DELIVERED` authenticated receipt for every channel. Attach that artifact to the release record without adding it to Git; notification ids and a one-way recipient hash are included for traceability.

## Operations and alerts

- The operator console shows queued, sent, delivered, failed, dead-letter, and suppressed totals by channel.
- Prometheus exposes `school_sis_notification_outbox{status,channel,provider}`.
- Investigate any increase in `FAILED`, `DEAD_LETTER`, or `SUPPRESSED` using `notification_delivery_events` before replaying.
- Alert on a `PROCESSING` row whose `updated_at` exceeds the normal provider latency. Reconcile it against the provider by notification id and provider message id before deliberately moving it to a retryable state; never bulk-requeue unknown outcomes.
- A notification left at `SENT` means the provider accepted it but no confirmed delivery receipt has arrived. Do not count `SENT` as delivered.
