# Pilot Scope Freeze

> Effective from 2026-08-21 until the first three paid pilots complete or the founder explicitly resets the beachhead.

## Purpose

Concentrate engineering and commercial effort on a single verifiable outcome. This freeze does not pause the production P0 or required security/reliability work; it stops unrelated horizontal expansion.

## Work that may proceed

1. Production deployment evidence and release gates.
2. Secure authentication, authorization, tenant isolation, audit, and observability.
3. CSV/import adapters for student, fee, invoice, payment, waiver, refund, and ledger data.
4. Import validation, normalization, reconciliation, unexplained-variance reporting, and rerun safety.
5. Receivables, aging, exceptions, waiver/refund approvals, and audit history.
6. Multi-campus finance dashboard and executive exports.
7. Native receipt/report generation needed by the pilot.
8. Demo-tenant safety, sample data, pilot instrumentation, and support tooling.
9. Lead-capture hardening required to receive and route qualified pilot enquiries.
10. Bugs or reliability work that blocks a pilot workflow.

## Work that is gated

- Mobile production rollout.
- Autonomous AI or agent workflows.
- Higher-education and coaching-specific modules.
- Broad LMS, classroom-content, transport, library, or HR expansion unrelated to the pilot.
- Dedicated-cloud variants, private-model tuning, and deployment promises not proven in production.
- Bespoke features requested by one prospect unless they generalize across the design-partner cohort.

## Exception test

A gated item enters the active backlog only if it meets at least one condition:

- It closes a production or security blocker.
- It is required by two or more qualified design partners.
- It reduces implementation effort materially across the cohort.
- It directly improves an agreed pilot success metric.
- It produces evidence necessary to close a paid pilot or annual conversion.

The decision owner records the exception and evidence in [`EVIDENCE_AND_DECISION_LOG.md`](./EVIDENCE_AND_DECISION_LOG.md).

## Pilot-critical definition of done

- A controlled production environment passes the authenticated readiness check.
- One month of representative source data imports without silent loss or duplication.
- Financial records reconcile to at least 99.5%, with every variance classified.
- Sensitive changes require authorization and appear in the audit history.
- An executive can compare receivables, aging, exceptions, approvals, and reconciliation across pilot campuses.
- Outputs can be exported and reviewed without engineering intervention.
- No critical security, tenant-isolation, or financial-control defect remains open.
