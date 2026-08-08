# Notification delivery readiness evidence — 2026-08-07

## Repository evidence

- External notification providers are disabled by default; unset selectors return `unconfigured` and enqueue attempts fail before persistence.
- Production mock selectors are rejected.
- Twilio WhatsApp and Firebase push have live adapters; Twilio outbound SMS/WhatsApp requests include the authenticated receipt callback URL.
- Atomic `PROCESSING` claims prevent concurrent workers from sending the same outbox item. Transport-ambiguous and post-acceptance bookkeeping failures stay non-retryable and create reconciliation incidents instead of risking duplicates.
- Twilio, Resend/Svix, and normalized bridge receipts are signature-verified before provider-message lookup. Persistence is tenant-scoped, transactional, idempotent, timestamp-ordered, and monotonic after delivery.
- Operator and Prometheus metrics expose delivered and suppressed outcomes with channel/provider dimensions.
- Automated receipt/provider tests cover invalid signatures, accepted transitions, duplicates, stale/out-of-order callbacks, provider 4xx/5xx classification, concurrent claims, provider configuration, live request construction, and disabled-channel behavior.

## Live delivery status

No live provider drill was executed from the development workspace on 2026-08-07 because it did not contain approved provider credentials, a production tenant id, or approved email/phone/device test recipients. No synthetic success was substituted for this evidence.

The operational acceptance item remains pending until an operator runs the credential-gated drill in `docs/NOTIFICATION_DELIVERY_RUNBOOK.md` and attaches its generated JSON artifact to the release record. Channels not selected in production remain explicitly disabled and cannot report `SENT` or `DELIVERED`.
