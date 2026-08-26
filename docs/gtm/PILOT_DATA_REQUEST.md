# Pilot Data Request and Readiness Checklist

Use this checklist only after qualified discovery and before a final pilot proposal. Request the minimum data needed to verify one representative fee-control workflow; do not request production credentials or ask schools to email sensitive exports.

## Stage 1 — discovery sample

The customer may provide masked or synthetic samples through an approved secure channel.

| Dataset | Minimum fields | Purpose |
| --- | --- | --- |
| Campus reference | Campus ID, campus name | Group and campus mapping |
| Student reference | Masked student ID, campus ID, status, grade/class | Stable entity and cohort mapping |
| Fee demand or invoices | Invoice ID, student ID, fee head, due date, amount, status | Expected receivable baseline |
| Receipts or payments | Receipt ID, student ID, invoice/reference ID, date, amount, payment mode, transaction reference | Collection and allocation testing |
| Gateway or bank settlement | Settlement ID, transaction reference, date, gross amount, fee, net amount, settlement status | Payment-to-settlement reconciliation |
| Waivers and concessions | Request/reference ID, student ID, fee head, amount, reason, approver, status, timestamps | Approval and leakage controls |
| Refunds and reversals | Refund/reference ID, linked receipt, amount, reason, approver, status, timestamps | Refund control and audit history |
| Existing month-end output | Current receivable, aging, collection, variance, or reconciliation report | Baseline comparison |

One representative historical period and the current period are sufficient for readiness testing. Larger extracts require a written reason.

## Stage 2 — data workshop decisions

Record each decision in the evidence register or proposal appendix.

- System of record and owner for every dataset.
- File/API format, extract method, volume, cadence, and timezone.
- Stable keys and known duplicates, reversals, late settlements, or mapping gaps.
- Baseline totals the customer considers authoritative.
- Existing reconciliation method, effort, unresolved variance, and sign-off owner.
- Approved transfer channel, storage location, retention period, and deletion process.
- Required masking, encryption, access restrictions, and incident contacts.
- Pilot campuses, reporting period, excluded fee heads, and materiality threshold.
- Weekly working-session attendees and final acceptance authority.

## Secure transfer rules

- Use a customer-approved encrypted workspace or signed upload path.
- Never place raw student or payment data in email, chat, tickets, source control, or this tracker.
- Do not request passwords, live database credentials, full card data, CVV, authentication secrets, or unrelated documents.
- Prefer masked student identifiers and the minimum required personal data.
- Restrict access to named pilot personnel and preserve an access trail.
- Agree retention and deletion timing before the first non-synthetic upload.
- Stop processing and escalate if the extract includes unexpected sensitive data.

## Readiness acceptance

The pilot is ready to quote only when all of the following are true:

- An executive sponsor and operational data owner are named.
- The approved security and data-processing path is documented.
- Sample files open successfully and required fields can be mapped.
- Source totals and one authoritative baseline report are available.
- A representative import produces a reconciled total or a documented variance queue.
- Scope, exclusions, success measures, implementation dependencies, and acceptance authority are written.

## Data manifest

| File or endpoint | Owner | Period | Rows | Masked? | Source total | Received securely? | Mapping result | Open issue |
| --- | --- | --- | ---: | --- | ---: | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |

## Go / no-go record

| Decision | Owner | Date | Evidence link | Conditions |
| --- | --- | --- | --- | --- |
| Pending |  |  |  |  |

