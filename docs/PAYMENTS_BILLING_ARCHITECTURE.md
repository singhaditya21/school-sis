# Payments & Billing Architecture

School SIS now treats payment collection as a tenant-owned ledger workflow rather than a gateway callback side effect.

## Implemented Controls

- **Provider abstraction:** Razorpay and Stripe access goes through `apps/web/src/lib/payments/providers.ts`, which validates required secrets and blocks placeholder secrets in production.
- **Tenant-owned payment orders:** Fee checkout creates a `payment_orders` row tied to `tenant_id`, `invoice_id`, `student_id`, provider, provider order/session ID, amount, currency, creator, and idempotency key.
- **Invoice ownership checks:** Payment order creation and verification read invoices through session-derived tenant context. Parent users must be linked to the invoice student.
- **Reconciliation:** Provider completion locks the invoice, rejects overpayment, writes a `payments` row, updates `invoices.paid_amount/status`, and creates a receipt in a single transaction.
- **Webhook idempotency:** Stripe events are recorded in `payment_provider_events` with a unique `(provider, event_id)` key before processing.
- **Money audit trail:** Manual payments, provider order creation, completed provider payments, and duplicate payment attempts write `payment_audit_logs`.
- **Shared Stripe webhook handling:** `/api/payments/webhook` and `/api/webhooks/stripe` use the same idempotent handler.
- **Approved finance execution:** invoice waivers, invoice cancellations, and full-payment ledger refunds require the reusable workflow approval engine before mutating `invoices`, `payments`, or `payment_audit_logs`.

## Operational Requirements

- Apply migration `0004_payment_billing_architecture.sql` before relying on live payment endpoints.
- Set real production secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID`, and `RAZORPAY_KEY_SECRET`.
- Do not use mock or placeholder payment secrets in production.
- Keep Stripe and Razorpay webhook endpoints pointed at the deployed app after every environment rebuild.

## Remaining Hardening

- Add Razorpay server-to-server webhook ingestion for payment capture/failure events.
- Add provider-native Stripe/Razorpay refund execution, partial refunds, and chargeback flows with the same audit/reconciliation model.
- Add operator-facing reconciliation dashboards for provider events, failed events, and unmatched orders.
