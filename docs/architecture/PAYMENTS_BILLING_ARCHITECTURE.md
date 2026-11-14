# Payments & Billing Architecture

School SIS now treats payment collection as a tenant-owned ledger workflow rather than a gateway callback side effect.

## Implemented Controls

- **Provider abstraction:** Razorpay and Stripe access goes through `apps/web/src/lib/payments/providers.ts`, which validates required secrets and blocks placeholder secrets in production.
- **Tenant-owned payment orders:** Fee checkout creates a `payment_orders` row tied to `tenant_id`, `invoice_id`, `student_id`, provider, provider order/session ID, amount, currency, creator, and idempotency key.
- **Invoice ownership checks:** Payment order creation and verification read invoices through session-derived tenant context. Parent users must be linked to the invoice student.
- **Reconciliation:** Provider completion locks the invoice, rejects overpayment, writes a `payments` row, updates `invoices.paid_amount/status`, and creates a receipt in a single transaction.
- **Webhook idempotency:** Stripe events are recorded in `payment_provider_events` with a unique `(provider, event_id)` key before processing.
- **Money audit trail:** Manual payments, provider order creation, completed provider payments, and duplicate payment attempts write `payment_audit_logs`.
- **Shared Stripe & Razorpay webhook handling:** `/api/payments/webhook` handles both signed Stripe (`stripe-signature`) and Razorpay (`x-razorpay-signature`) server-to-server webhooks idempotently, with `/api/webhooks/stripe` as a Stripe-specific alias and `/api/payments/verify` for client checkout verification.
- **Approved finance execution:** invoice waivers, invoice cancellations, and full-payment ledger refunds require the reusable workflow approval engine before mutating `invoices`, `payments`, or `payment_audit_logs`.
- **Provider-native refunds after approval:** approved full-payment refunds call Stripe refunds for stored payment intent IDs and Razorpay refunds for stored Razorpay payment IDs before the tenant ledger is marked refunded. Manual payments remain internal ledger refunds.

## Operational Requirements

- Apply the canonical migration chain (`apps/web/drizzle/0000_init_baseline.sql` + `0002_invoice_billing_integrity.sql` onward) before relying on live payment endpoints.
- Set real production secrets for your chosen `PAYMENT_PROVIDER`: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, or `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET`.
- Do not use mock or placeholder payment secrets in production.
- Keep Stripe and Razorpay webhook endpoints pointed at the deployed app after every environment rebuild.

## Remaining Hardening

- Add partial refunds and chargeback flows with the same audit/reconciliation model.
- Expand operator-facing reconciliation workflows for unmatched orders and disputed settlements.
