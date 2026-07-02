# Core SIS Domain Architecture

This slice defines the product-domain spine for School SIS. The goal is not to rewrite every module at once; it is to give admissions, enrollment, attendance, timetable, exams, gradebook, fees, transport, library, hostel, HR, and communications one shared contract for ownership, lifecycle state, events, and mutation patterns.

## Source Of Truth

Code contract:

```text
packages/api/src/domain/core-sis/
```

Exports:

- `CORE_SIS_MODULES`: bounded-context catalog.
- `CORE_SIS_STATE_MACHINES`: canonical lifecycle transition rules.
- `CORE_SIS_DOMAIN_EVENTS`: stable event names for audit/jobs/integrations.
- `assertDomainCommandContext`: tenant and actor context guard.
- `createDomainEventEnvelope`: standard event envelope shape.

## Bounded Contexts

Each context declares:

- owner role
- primary entities and tables
- product routes
- services
- permissions
- emitted events
- invariants
- async workflows
- operational reports
- data classification
- tenant and audit requirements

The current contexts are:

```text
admissions
enrollment
attendance
timetable
exams
gradebook
fees
transport
library
hostel
hr
communications
```

## Lifecycle State Machines

The first lifecycle contracts are:

- `admissionLead`: lead to enrollment handoff.
- `studentEnrollment`: active, suspended, inactive, alumni, transferred.
- `attendanceRecord`: correction model for attendance statuses.
- `examLifecycle`: draft to scheduled to marks entry to review to published/archive.
- `invoiceLifecycle`: draft, pending, partial, paid, overdue, cancelled, waived.
- `libraryIssue`: issued, overdue, lost, returned.
- `hostelAllocation`: pending, active, vacated.
- `leaveRequest`: pending, approved, rejected, cancelled.
- `substitutionRequest`: pending, approved, rejected, cancelled.

Mutation code should call `assertDomainTransition()` before changing lifecycle fields, and should use the returned transition metadata for permission checks, audit action names, and emitted event names.

## Mutation Pattern

Every domain mutation should eventually follow this shape:

1. Resolve trusted tenant and actor context from session/API key/job context.
2. Call `assertDomainCommandContext()`.
3. Load the current record inside tenant context.
4. Validate ownership and lifecycle transition.
5. Persist the change in a transaction.
6. Write audit entry using transition `auditAction`.
7. Emit a `core_sis.<module>.<topic>.v1` event envelope.
8. Queue follow-up jobs from the event, not from caller-supplied payloads.

## Event Rules

Events are named:

```text
core_sis.<module>.<topic>.v1
```

Rules:

- Events are tenant-scoped unless explicitly platform-level.
- PII events must stay inside trusted queues/log sinks.
- Integration/webhook payloads should transform internal events into partner-safe payloads.
- Async jobs should consume event envelopes instead of scraping database rows without context.

## Migration Path

Recommended module-by-module adoption:

1. Admissions: gate stage updates through `admissionLead`.
2. Fees: gate invoice changes through `invoiceLifecycle`.
3. Library and hostel: enforce copy/bed invariants in the same transaction as lifecycle updates.
4. Attendance: require correction reasons after initial marking.
5. Timetable: use `substitutionRequest` for approval flow.
6. Exams/gradebook: add persisted lifecycle status to exams before result publishing becomes strict.

## Current Limitations

- Some existing tables do not yet have explicit lifecycle status columns that match the architecture, especially exams.
- Some modules still implement mutations directly in pages/actions instead of domain services.
- Domain events are defined as a code contract first; persistent event outbox wiring should be added module by module.
