# ScholarMind SIS: API & Developer Documentation

Welcome to the API and Developer Documentation for the ScholarMind School Information System (SIS) platform. This guide covers the metadata REST APIs, provider adapters, payment & messaging webhooks, and accounting sync endpoints.

Production API base: https://school-sis-web.vercel.app. Health: `GET /api/health`. Readiness: `GET /api/ready` (`Authorization: Bearer $METRICS_TOKEN`).

---

## 1. Metadata & Low-Code Data APIs

ScholarMind includes a multi-tenant Metadata Engine (`apps/web/src/lib/actions/metadata-engine.ts` and `packages/api/src/metadata/runtime.ts`) supporting both 19 Core System Objects (`TABLE` mode with `custom_data` JSONB) and tenant-defined custom objects (`EAV` mode in `metadata_records` / `metadata_values`). See [`LCNC_PLATFORM_ARCHITECTURE.md`](../../architecture/LCNC_PLATFORM_ARCHITECTURE.md) for full details.

### Core Endpoints
- `GET /api/data` — Returns the authenticated tenant's enabled standard and custom object catalog (`metadata_objects`, `tenant_object_settings`) filtered by role permissions.
- `GET /api/data/[objectApiName]` — Lists tenant-scoped records enforcing Organization-Wide Defaults (`owd_mode`), sharing rules (`metadata_sharing_rules`), and Field-Level Security (`field_permissions`).
- `POST /api/data/[objectApiName]` — Validates payload types and formula validation rules (`metadata_validation_rules`), persists the record, and triggers active `metadata_workflows`.
- **Public Web-to-Object Intake:** `/portal/[tenantSlug]/[objectApiName]` exposes rate-limited guest intake forms and status lookups (`consumeGuestPortalRateLimit`) for published portal-enabled objects.

---

## 2. Messaging, Storage & Accounting Integrations

All external notification channels default to fail-loud in live mode (`INTEGRATIONS_MODE=live`) and reject mock adapters in production. Every channel includes a ₹0 / $0 free-tier option (see [`GO_LIVE_INTEGRATIONS.md`](../../operations/GO_LIVE_INTEGRATIONS.md)).

### WhatsApp (`apps/web/src/lib/providers/whatsapp.ts`)
- **Self-Hosted Free Gateways (`₹0`):** `WHATSAPP_PROVIDER=waha` (`ops/whatsapp/docker-compose.whatsapp-free.yml`) or `WHATSAPP_PROVIDER=evolution`.
- **Official Meta Cloud API:** `WHATSAPP_PROVIDER=meta_cloud` (`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`).
- **Inbound & Receipt Webhook:** `GET/POST /api/webhooks/whatsapp` verifies `X-Hub-Signature-256` (`WHATSAPP_APP_SECRET`) or WAHA HMAC (`WHATSAPP_WEBHOOK_SECRET`).

### Email (`apps/web/src/lib/providers/email.ts`)
- `EMAIL_PROVIDER=smtp` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` — works with Gmail App Passwords or Brevo Free).
- `EMAIL_PROVIDER=resend` (`RESEND_API_KEY`, `EMAIL_FROM`).

### SMS (`apps/web/src/lib/providers/sms.ts`)
- `SMS_PROVIDER=twilio` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`) or `SMS_PROVIDER=msg91` (`MSG91_AUTH_KEY`).
- **Delivery Receipt Webhook:** `POST /api/webhooks/sms` verifies `X-Twilio-Signature` or `MSG91_WEBHOOK_SECRET`.

### Accounting Sync (Tally ERP 9 / Prime)
- **Endpoint:** `POST /api/integrations/tally/vouchers`
- **Workflow:** Maps ScholarMind payment methods to Tally ledger names and exports `<TALLYREQUEST>Import Data</TALLYREQUEST>` XML vouchers for `Gateway of Tally > Import Data > Vouchers`.

---

## 3. Online Payments & Webhooks (`Razorpay` & `Stripe`)

Payment collection runs on a tenant-owned ledger (`apps/web/src/lib/payments/ledger.ts` and `apps/web/src/lib/payments/providers.ts`). Select `PAYMENT_PROVIDER=razorpay` or `PAYMENT_PROVIDER=stripe`.

### Webhook & Verification Endpoints
- **Unified Webhook (`Stripe` + `Razorpay`):** `POST /api/payments/webhook` — verifies `stripe-signature` (`STRIPE_WEBHOOK_SECRET`) or `x-razorpay-signature` (`RAZORPAY_WEBHOOK_SECRET`).
- **Stripe Alias:** `POST /api/webhooks/stripe` — verifies `stripe-signature`.
- **Razorpay Checkout Verification:** `POST /api/payments/verify` — verifies client checkout HMAC signatures against stored `payment_orders`.

### Transactional Ledger Guarantees
1. Inbound events are recorded idempotently in `payment_provider_events` (`UNIQUE (provider, event_id)`).
2. Completion locks the target `invoices` row, prevents overpayment, writes `payments` and `payment_audit_logs`, updates `invoices.paid_amount` / `status`, and issues the receipt in a single database transaction.
3. Unverified signatures or processing failures return non-2xx responses so providers retry safely against the idempotent ledger.

---

## 4. Background Jobs, Outbox & Bounded Copilot

- **Job & Outbox Dispatcher:** `GET/POST /api/jobs/dispatch` (authenticated via `CRON_SECRET` or `JOB_DISPATCH_SECRET`) claims due `background_jobs` and `notification_outbox` rows with `FOR UPDATE SKIP LOCKED`. Driven locally via `pnpm scheduler` and in production via `.github/workflows/jobs-dispatch.yml`.
- **AI Copilot:** `POST /api/copilot` runs bounded, session-authenticated decision support (`apps/web/src/lib/ai/`). Any proposed write opens a human-reviewed `workflow_approval_requests` item (`/api/workflow-approvals`).
