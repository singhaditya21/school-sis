# Migration Sequence: Endpoint-by-Endpoint Plan

## Overview

This document outlines the exact sequence for migrating endpoints from TypeScript/Next.js to Java Spring Boot using the **Strangler Fig Pattern**.

---

## Migration Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway / Proxy                     │
│   (Routes traffic based on feature flags or path prefix)     │
└─────────────────────────────────────────────────────────────┘
              │                              │
              ▼                              ▼
    ┌─────────────────┐            ┌─────────────────┐
    │  Next.js App    │            │  Java Spring    │
    │  (Legacy)       │◄──────────►│  (New)          │
    └─────────────────┘            └─────────────────┘
              │                              │
              └──────────┬───────────────────┘
                         ▼
                ┌─────────────────┐
                │   PostgreSQL    │
                │   (Shared DB)   │
                └─────────────────┘
```

**Key Principle:** Both apps share the same database during migration. Feature flags control routing.

---

## Phase 4: Platform Module (Week 1)

### 4.1 Tenant + Config

| Priority | Endpoint | HTTP | Java Package |
|----------|----------|------|--------------|
| 1 | Tenant resolution (filter) | - | `platform.infrastructure` |
| 2 | Config properties loading | - | `platform.config` |

### 4.2 Authentication

| Priority | Endpoint | HTTP | Java Package |
|----------|----------|------|--------------|
| 3 | `POST /api/v1/auth/login` | POST | `platform.api.v1.AuthController` |
| 4 | `POST /api/v1/auth/logout` | POST | `platform.api.v1.AuthController` |
| 5 | `GET /api/v1/auth/me` | GET | `platform.api.v1.AuthController` |
| 6 | `POST /api/v1/auth/refresh` | POST | `platform.api.v1.AuthController` |

**Source files:**

- `src/lib/actions/auth.ts` → `AuthController + AuthService`
- `src/lib/auth/session.ts` → `JwtService + SecurityConfig`

### 4.3 RBAC + Audit

| Priority | Endpoint | HTTP | Notes |
|----------|----------|------|-------|
| 7 | Permission enforcement | - | `@PreAuthorize` annotations |
| 8 | Audit logging | - | AOP-based interceptor |
| 9 | `GET /api/v1/audit-logs` | GET | Admin only |

---

## Phase 5A-P0: Students Module (Week 2)

### 5.1 Student CRUD

| Priority | Endpoint | HTTP | Source Action |
|----------|----------|------|---------------|
| 10 | `GET /api/v1/students` | GET | `prisma.student.findMany` |
| 11 | `GET /api/v1/students/{id}` | GET | `prisma.student.findUnique` |
| 12 | `POST /api/v1/students` | POST | `forms.ts:createStudent` |
| 13 | `PUT /api/v1/students/{id}` | PUT | `forms.ts:updateStudent` |
| 14 | `DELETE /api/v1/students/{id}` | DELETE | (soft delete) |

### 5.2 Guardian Management

| Priority | Endpoint | HTTP | Source Action |
|----------|----------|------|---------------|
| 15 | `GET /api/v1/students/{id}/guardians` | GET | nested query |
| 16 | `POST /api/v1/students/{id}/guardians` | POST | link guardian |
| 17 | `DELETE /api/v1/students/{id}/guardians/{gid}` | DELETE | unlink |

**Source files:**

- `src/lib/actions/forms.ts` (createStudent, updateStudent)
- `src/app/(admin)/students/*/page.tsx` (display logic)

---

## Phase 5A-P0: Fees Module (Week 2-3)

### 5.3 Fee Plans

| Priority | Endpoint | HTTP | Source Action |
|----------|----------|------|---------------|
| 18 | `GET /api/v1/fee-plans` | GET | listing |
| 19 | `POST /api/v1/fee-plans` | POST | `fee-plans.ts:createFeePlan` |
| 20 | `POST /api/v1/fee-plans/{id}/assign` | POST | assign to students |

### 5.4 Invoices

| Priority | Endpoint | HTTP | Source Action |
|----------|----------|------|---------------|
| 21 | `GET /api/v1/invoices` | GET | filter by status/student |
| 22 | `GET /api/v1/invoices/{id}` | GET | `fees.ts:getInvoiceDetails` |
| 23 | `POST /api/v1/invoices` | POST | generate invoice |
| 24 | `PUT /api/v1/invoices/{id}/cancel` | PUT | cancel flow |

### 5.5 Payments

| Priority | Endpoint | HTTP | Source Action |
|----------|----------|------|---------------|
| 25 | `POST /api/v1/payments` | POST | `fees.ts:recordPayment` |
| 26 | `GET /api/v1/payments/{id}/receipt` | GET | PDF download |

### 5.6 Concessions & Fines

| Priority | Endpoint | HTTP | Source Action |
|----------|----------|------|---------------|
| 27 | `POST /api/v1/invoices/{id}/concessions` | POST | apply concession |
| 28 | `POST /api/v1/invoices/{id}/fines` | POST | apply late fee |

### 5.7 Analytics

| Priority | Endpoint | HTTP | Source Action |
|----------|----------|------|---------------|
| 29 | `GET /api/v1/fees/defaulters` | GET | `fees.ts:getDefaulters` |
| 30 | `GET /api/v1/fees/cashflow` | GET | dashboard data |
| 31 | `GET /api/v1/fees/intelligence` | GET | AI risk scoring |

**Source files:**

- `src/lib/actions/fees.ts`
- `src/lib/actions/fee-plans.ts`
- `src/lib/services/fees/*`
- `src/lib/services/ai/*` (Gemini integration)

---

## Phase 5A-P0: Attendance Module (Week 3)

### 5.8 Attendance

| Priority | Endpoint | HTTP | Source Action |
|----------|----------|------|---------------|
| 32 | `GET /api/v1/attendance/classes` | GET | class list for marking |
| 33 | `GET /api/v1/attendance/classes/{id}` | GET | students + status |
| 34 | `POST /api/v1/attendance` | POST | `attendance.ts:markClassAttendance` |
| 35 | `GET /api/v1/attendance/reports` | GET | monthly stats |
| 36 | `GET /api/v1/students/{id}/attendance` | GET | student summary |

**Source files:**

- `src/lib/actions/attendance.ts`
- `src/app/(admin)/attendance/*/page.tsx`

---

## Phase 5A-P1: Admissions Module (Week 4)

### 5.9 Leads & Applications

| Priority | Endpoint | HTTP | Source Action |
|----------|----------|------|---------------|
| 37 | `GET /api/v1/admission-leads` | GET | CRM pipeline |
| 38 | `POST /api/v1/admission-leads` | POST | `forms.ts:createAdmissionLead` |
| 39 | `PUT /api/v1/admission-leads/{id}/stage` | PUT | advance stage |
| 40 | `POST /api/v1/admission-leads/{id}/apply` | POST | create application |
| 41 | `GET /api/v1/applications` | GET | listing |
| 42 | `PUT /api/v1/applications/{id}/review` | PUT | approve/reject |

---

## Phase 5A-P1: Exams Module (Week 4-5)

### 5.10 Exams

| Priority | Endpoint | HTTP | Source Action |
|----------|----------|------|---------------|
| 43 | `GET /api/v1/exams` | GET | listing |
| 44 | `POST /api/v1/exams` | POST | `exams.ts:createExam` |
| 45 | `GET /api/v1/exams/{id}` | GET | detail |

### 5.11 Marks Entry

| Priority | Endpoint | HTTP | Source Action |
|----------|----------|------|---------------|
| 46 | `GET /api/v1/exams/{id}/classes/{cid}/marks` | GET | existing marks |
| 47 | `POST /api/v1/exams/{id}/marks` | POST | `exams.ts:enterMarks` |

### 5.12 Report Cards

| Priority | Endpoint | HTTP | Source Action |
|----------|----------|------|---------------|
| 48 | `GET /api/v1/report-cards` | GET | by class/term |
| 49 | `POST /api/v1/report-cards/generate` | POST | batch generate |
| 50 | `GET /api/v1/report-cards/{studentId}/{termId}` | GET | PDF download |

**Source files:**

- `src/lib/actions/exams.ts`
- `src/lib/services/pdf/report-card-generator.ts`

---

## Phase 5B-P2: Remaining Modules (Week 5-6)

### Timetable (5 endpoints)

| Endpoint | HTTP |
|----------|------|
| `GET /api/v1/timetable/classes/{id}` | GET |
| `POST /api/v1/timetable/entries` | POST |
| `POST /api/v1/substitutions` | POST |
| `GET /api/v1/substitutions/today` | GET |

### Transport (6 endpoints)

| Endpoint | HTTP |
|----------|------|
| `GET /api/v1/vehicles` | GET |
| `GET /api/v1/routes` | GET |
| `POST /api/v1/routes/{id}/stops` | POST |
| `POST /api/v1/students/{id}/transport` | POST |
| `GET /api/v1/transport/eta/{routeId}` | GET |

### Communication (5 endpoints)

| Endpoint | HTTP |
|----------|------|
| `GET /api/v1/message-templates` | GET |
| `POST /api/v1/message-templates` | POST |
| `POST /api/v1/messages/send` | POST |
| `GET /api/v1/consent/purposes` | GET |
| `POST /api/v1/consent/record` | POST |

---

## Rollout Checklist (per endpoint)

```markdown
- [ ] Java controller created
- [ ] Service layer implemented
- [ ] Repository with tenant scoping
- [ ] Input validation (Jakarta)
- [ ] RBAC annotation added
- [ ] Audit logging configured
- [ ] Unit tests passing
- [ ] Integration test with Testcontainers
- [ ] API docs generated (OpenAPI)
- [ ] Feature flag configured
- [ ] Parity test: same input → same output
- [ ] Deployed to staging
- [ ] Traffic migrated (gradual 10% → 50% → 100%)
- [ ] Legacy endpoint deprecated
```

---

## Timeline Summary

| Week | Phase | Endpoints | Module(s) |
|------|-------|-----------|-----------|
| 1 | 4 | 1-9 | Platform (Auth, RBAC, Audit) |
| 2 | 5A-P0 | 10-20 | Students, Fee Plans |
| 3 | 5A-P0 | 21-36 | Invoices, Payments, Attendance |
| 4 | 5A-P1 | 37-45 | Admissions, Exams |
| 5 | 5A-P1 | 46-50 | Marks, Report Cards |
| 6 | 5B-P2 | 51-65 | Timetable, Transport, Comms |

**Total: ~65 endpoints over 6 weeks**
