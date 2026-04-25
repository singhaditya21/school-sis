# ScholarMind V6 — Issues & Roadmap

> **Document Version**: 1.0.0  
> **Last Audited**: 2026-04-26  
> **Auditor**: Code Audit Agent  
> **Scope**: Full-stack audit of `apps/web` (Next.js), `services/agents` (Python), infrastructure, dependencies, and security posture.

---

## A. Executive Summary

| Category | Count | Severity |
|----------|-------|----------|
| Security Vulnerabilities (Dependencies) | 8 | 1 Critical, 4 High, 3 Medium |
| Security Gaps (Code-Level) | 6 | Medium |
| Unimplemented / Mock Features | 18 | Low–Medium |
| TODO / FIXME Comments | 9 | Low |
| API Routes Missing Auth | 7 | High |
| Performance Risks | 4 | Medium |
| Test Coverage | ~1.3% (5 test files / 372+ source files) | Critical |
| Documentation Drift | 3 | Low |

**Overall Health Score**: 🟡 **6.5 / 10** — Functional core with strong architecture, but significant security debt, near-zero test coverage, and heavy reliance on mock data outside the fee module.

---

## B. Security Issues

### B.1 Dependency Vulnerabilities (CVEs)

| Package | CVE / Advisory | Severity | Installed | Fixed In | Status |
|---------|---------------|----------|-----------|----------|--------|
| **jsPDF** | CVE-2026-31938 | **CRITICAL** | 4.0.0–4.2.0 | ≥4.2.1 | 🔴 Unpatched in pnpm-lock |
| jsPDF | CVE-2026-31898 | **HIGH** | 4.0.0–4.2.0 | ≥4.2.1 | 🔴 Unpatched |
| jsPDF | CVE-2026-24133 | **HIGH** | 4.0.0 | ≥4.1.0 | 🔴 Unpatched |
| jsPDF | CVE-2026-24737 | **HIGH** | 4.0.0 | ≥4.1.0 | 🔴 Unpatched |
| jsPDF | CVE-2026-25535 | **HIGH** | 4.0.0 | ≥4.2.0 | 🔴 Unpatched |
| jsPDF | CVE-2026-25755 | **HIGH** | 4.0.0 | ≥4.1.0 | 🔴 Unpatched |
| jsPDF | CVE-2026-25940 | **HIGH** | 4.0.0 | ≥4.1.0 | 🔴 Unpatched |
| **Next.js** | GHSA-h25m-26qc-wcjf | **HIGH** | 15.5.9–15.5.12 | ≥15.5.10 / ≥16.1.5 | 🟡 Partially mitigated by pnpm override |
| Next.js | CVE-2026-27980 | MEDIUM | 15.5.12 | ≥16.1.7 | 🟡 Override exists but version is edge |
| Next.js | CVE-2026-29057 | MEDIUM | 15.5.12 | ≥15.5.13 / ≥16.1.7 | 🟡 Same as above |
| **lodash** | CVE-2025-13465 | MEDIUM | 4.17.21 | ≥4.17.23 | 🟢 Override declared in root package.json |
| **DOMPurify** | CVE-2026-0540 | MEDIUM | 3.3.1 | ≥3.3.2 | 🟢 Override declared |
| **flatted** | GHSA-25h7-pfq9-p65f | **HIGH** | ≤3.4.1 | ≥3.4.2 | 🟢 Override declared |
| **minimatch** | GHSA-3ppc-4f35-3m26 | **HIGH** | 9.0.0–9.0.6 | ≥9.0.7 | 🟢 Override declared |

**Root Cause**: `pnpm-lock.yaml` still resolves old versions of jsPDF (4.0.0) while `apps/web/package.json` lists `jspdf: ^4.2.1`. The root `package.json` has `pnpm.overrides` for some packages but **jsPDF is missing from overrides**.

**Fix**: Add `jspdf: ">=4.2.1"` to `pnpm.overrides` in root `package.json`, run `pnpm install`, verify with `pnpm audit` and `trivy`.

### B.2 Code-Level Security Gaps

| # | Issue | File | Line | Risk | Fix |
|---|-------|------|------|------|-----|
| 1 | **Hardcoded bcrypt hashes** | `backend/app/bin/main/db/migration/V1__initial_schema.sql` | 194, 208 | Credential leak in source | Rotate hashes, move to env-seeded seed script |
| 2 | **Hardcoded bcrypt hashes** | `backend/app/src/main/resources/db/migration/V1__initial_schema.sql` | 194, 208 | Credential leak in source | Same as above |
| 3 | **Log forging / injection** | `apps/web/src/lib/actions/webhooks.ts` | ~103 | Attacker-controlled format strings in logs | Use structured logging (`console.log({event, data})`) |
| 4 | **Log forging / injection** | `apps/web/src/lib/services/jobs.ts` | ~58 | Same as above | Same as above |
| 5 | **API routes without auth** | `apps/web/src/app/api/attendance/route.ts` | — | Data exposure | Add `getSession()` + tenant check |
| 6 | **API routes without auth** | `apps/web/src/app/api/leads/route.ts` | — | Data exposure | Add `getSession()` + tenant check |
| 7 | **API routes without auth** | `apps/web/src/app/api/mock/route.ts` | — | Data exposure + seed data risk | Restrict to dev or add auth |
| 8 | **API routes without auth** | `apps/web/src/app/api/fee-plans/route.ts` | — | Data exposure | Add `getSession()` + tenant check |
| 9 | **API routes without auth** | `apps/web/src/app/api/exams/route.ts` | — | Data exposure | Add `getSession()` + tenant check |
| 10 | **API routes without auth** | `apps/web/src/app/api/payments/webhook/route.ts` | — | Webhook spoofing | Add Stripe/Razorpay signature verification |
| 11 | **API routes without auth** | `apps/web/src/app/api/webhooks/stripe/route.ts` | — | Webhook spoofing | Add Stripe signature verification |
| 12 | **Tenant validation missing** | `apps/web/src/middleware.ts` | 34 | Subdomain bypass | Implement DB-backed tenant validation |

**Note on Prior Reports**: The `SECURITY_REPORT.md` flagged GCM auth tag issues and path traversal. Current code review shows these have been **patched**:
- `encryption.ts` now validates `authTag.length === 16` before decryption.
- `storage.ts` now has robust `validateObjectKey()` with path traversal guards, null-byte rejection, and tenant scoping.

### B.3 Infrastructure & Secrets

| Item | Status | Recommendation |
|------|--------|----------------|
| `.env.example` | ✅ Present | Good template with clear warnings |
| `SESSION_SECRET` enforcement | ✅ Implemented | Throws at runtime if < 32 chars |
| `ENCRYPTION_KEY` fallback | ⚠️ Weak | Falls back to empty string + SHA256 hash; should hard-fail in production |
| Docker `read_only` | ✅ Fixed | Applied to postgres and redis |
| Docker `no-new-privileges` | ✅ Fixed | Applied to both services |
| Secrets in CI | ✅ Secure | Uses `secrets.XXX` or dummy vars for build |

---

## C. Code Quality Issues

### C.1 TODO / FIXME Inventory

| File | Line | Comment | Priority |
|------|------|---------|----------|
| `middleware.ts` | 34 | `// TODO: Implement tenant validation logic` | **High** |
| `api/payments/orders/route.ts` | 17 | `// TODO: Replace with actual Razorpay order creation` | **High** |
| `api/payments/verify/route.ts` | 80 | `// TODO: Update invoice status in database (Phase 3 — mock removal)` | **High** |
| `lib/services/jobs.ts` | 99 | `// TODO: Integrate with Gupshup/Msg91` | Medium |
| `lib/services/jobs.ts` | 106 | `// TODO: Integrate with Resend/SendGrid/Nodemailer` | Medium |
| `lib/services/jobs.ts` | 113 | `// TODO: Integrate with Gupshup WhatsApp Business API` | Medium |
| `(admin)/settings/grading/page.tsx` | 50 | `// TODO: Replace with actual API call` | Low |
| `(admin)/settings/roles/page.tsx` | 113 | `// TODO: Call API to save role permissions` | Low |
| `(admin)/dashboard/page.tsx` | 40 | `// TODO: implement consent tracking` | Low |

### C.2 Mock Data & Unimplemented UI

The following pages rely entirely on inline mock data and will not reflect real database state:

| Page | File | Mock Type |
|------|------|-----------|
| Health / Medical | `(admin)/health/page.tsx` | `MOCK_INCIDENTS` array |
| Homework | `(admin)/homework/page.tsx` | `MOCK_ASSIGNMENTS` array |
| DigiLocker | `(admin)/digilocker/page.tsx` | `mockDigiLockerDocuments` + fake push function |
| Quiz Attempt | `(admin)/quiz/[id]/attempt/page.tsx` | Inline `mockQuiz` object |
| Quiz Results | `(admin)/quiz/[id]/results/page.tsx` | Inline `mockQuiz` object |
| Message Tracking | `(admin)/messages/tracking/page.tsx` | `generateMockMessages()` function |
| ID Cards | `(admin)/id-cards/page.tsx` | Inline mock types |
| Admissions | `(admin)/admissions/page.tsx` | Hardcoded student name/score |
| Exams Verification | `(admin)/exams/verification/page.tsx` | `// Mock data` comment |
| Fee Alerts | `(admin)/fees/alerts/page.tsx` | `// Mock data` comment |
| Fee Plan Edit | `(admin)/fees/plans/[id]/edit/page.tsx` | `// Mock fetch plan data` |
| Coaching Batches | `(admin)/coaching/components/CreateBatchForm.tsx` | Injected mock `tenantId` via `uuidv4()` |
| Teacher Welfare | `teacher/students/[id]/welfare/page.tsx` | Mock student ID generation |
| Teacher Profile | `teacher/profile/page.tsx` | Mock teacher profile data |
| HQ Settings | `hq/settings/client-page.tsx` | `// Mock save` comment |
| Upload API | `api/upload/route.ts` | Returns fake URL/key when storage is unconfigured |

### C.3 Error Handling & Reliability

| Issue | Location | Impact |
|-------|----------|--------|
| `after()` from `next/server` used for background jobs without retry logic | `jobs.ts` | Jobs fail silently on Render cold starts |
| No BullMQ fallback activation | `jobs.ts` | Production runs sync-only; no queue durability |
| Payment verify returns success but does **not** update invoice record | `api/payments/verify/route.ts` | Payment appears successful but invoice stays unpaid in DB |
| Razorpay order creation is fully mocked | `api/payments/orders/route.ts` | No real payment initiation possible |
| Stripe webhook has no signature verification | `api/webhooks/stripe/route.ts` | Forgeable webhook events |
| Razorpay webhook has no signature verification | `api/payments/webhook/route.ts` | Forgeable webhook events |

### C.4 Type Safety & Build

| Item | Status |
|------|--------|
| TypeScript strict mode | ✅ Enabled in `drizzle.config.ts` |
| `tsc --noEmit` in CI | ✅ Enabled |
| ESLint in CI | ✅ Enabled |
| Jest unit tests | ⚠️ Only 5 test files for 372+ source files |
| Playwright E2E | ✅ Configured but likely minimal coverage |
| Prisma references in scripts | ⚠️ `package.json` scripts still reference `prisma` but project uses **Drizzle** — docs need update |

---

## D. Performance Issues

| # | Issue | Evidence | Recommendation |
|---|-------|----------|----------------|
| 1 | **No database indexes audited** | Migrations create tables but index coverage is unknown | Run `EXPLAIN ANALYZE` on high-traffic queries (fee collection, attendance, invoice lists) |
| 2 | **Synchronous job execution in production path** | `jobs.ts` uses `after()` without queue | Activate BullMQ + Redis for production |
| 3 | **Potential N+1 in fee defaulter service** | `defaulter.service.ts` iterates students then invoices | Batch query with `JOIN` or Drizzle relational queries |
| 4 | **No CDN / edge caching configured** | `next.config.js` not audited | Add `stale-while-revalidate` headers for public assets; use Vercel/Render edge caching |
| 5 | **Large bundle risk from Tremor + Radix** | Multiple `@radix-ui/*` + `@tremor/react` | Audit with `@next/bundle-analyzer`; tree-shake unused Tremor components |

---

## E. Feature Gaps

### E.1 Fee Module (Partially Complete)
From `docs/FEE_COLLECTIONS_SUMMARY.md` and code review:

| Feature | Status | Blocker |
|---------|--------|---------|
| Cashflow forecast (7/14/30 days) | ❌ Missing | Requires time-series calculation |
| Real payment gateway UI | ❌ Mock only | Razorpay/Stripe integration incomplete |
| Send reminder flows | ❌ Missing | SMS/WhatsApp job handlers not implemented |
| Invoice detail page (admin) | ❌ Missing | UI exists but may be static |
| Receipt PDF generation | ⚠️ Partial | `pdf/receipt-generator.ts` exists but not wired to UI |
| Invoice edit / cancel | ❌ Missing | UI pages exist but may be mock-backed |

### E.2 Authentication & Security

| Feature | Status | Notes |
|---------|--------|-------|
| MFA enrollment UI | ✅ Exists | `mfa.ts` + settings pages |
| **MFA enforcement** | ❌ Missing | No middleware check forcing MFA for sensitive roles |
| Password reset flow | ⚠️ Partial | DB table exists (`003_password_reset_tokens.sql`), UI not audited |
| Session timeout warning | ❌ Missing | 7-day cookie without idle timeout |
| Role-permission matrix API | ⚠️ Partial | UI has TODO to call API |

### E.3 AI Agent Swarm

| Feature | Status | Notes |
|---------|--------|-------|
| 26 agents defined | ✅ Yes | Full toolset in `services/agents/src/tools/` |
| HITL approval queue | ✅ Exists | `core/approvals.py` + DB table |
| Approval UI | ⚠️ Partial | `approvals/page.tsx` exists but depth not audited |
| Agent observability | ⚠️ Unknown | No metrics/logging review performed |
| RAG pipeline | ✅ Exists | `core/rag.py` + `indexing/` pipeline |
| Vector search | ✅ Yes | `pgvector` enabled in Postgres |

### E.4 Compliance & Governance

| Feature | Status | Notes |
|---------|--------|-------|
| Audit trail logging | ✅ Yes | `audit.service.ts` + `audit-trail` API |
| DPDPA handler | ✅ Exists | `lib/privacy/dpdpa.ts` |
| GDPR handler | ✅ Exists | `lib/privacy/gdpr.ts` |
| Consent tracking UI | ⚠️ Partial | Dashboard shows `consentBlocked: 0` (TODO) |
| SOC2 evidence collection | ⚠️ Partial | Audit reports exist but are manual |

---

## F. Roadmap

### Phase 1 — Security Hardening (Week 1–2)
- [ ] Add `jspdf: ">=4.2.1"` to root `pnpm.overrides`
- [ ] Run `pnpm audit fix` and `trivy` re-scan
- [ ] Remove hardcoded bcrypt hashes from migration scripts
- [ ] Add auth guards to 7 unprotected API routes
- [ ] Implement Stripe + Razorpay webhook signature verification
- [ ] Add tenant validation in `middleware.ts`
- [ ] Replace `console.log` concatenation with structured JSON logging
- [ ] Make `ENCRYPTION_KEY` hard-fail in production (no fallback)

### Phase 2 — Mock → Real (Week 3–4)
- [ ] Replace mocked Razorpay order creation with live SDK calls
- [ ] Wire payment verification to update invoice + create receipt in DB
- [ ] Activate BullMQ job queue with Redis (production)
- [ ] Implement SMS handler (Gupshup/Msg91)
- [ ] Implement email handler (Resend/SendGrid)
- [ ] Implement WhatsApp handler (Gupshup WABA)
- [ ] Replace inline mock data on 16 UI pages with server actions + Drizzle queries

### Phase 3 — Feature Completion (Week 5–6)
- [ ] Cashflow forecast service (7/14/30 day prediction)
- [ ] Admin invoice detail / edit / cancel flows
- [ ] Receipt PDF generation wired to parent portal
- [ ] Fee reminder template editor + scheduling
- [ ] MFA enforcement middleware for `SUPER_ADMIN` / `FINANCE_LEAD`
- [ ] Password reset end-to-end flow test

### Phase 4 — Performance & Quality (Week 7–8)
- [ ] Add missing PostgreSQL indexes (invoices, payments, attendance)
- [ ] Audit and fix N+1 queries in fee / student services
- [ ] Add `@next/bundle-analyzer` and optimize bundle
- [ ] Write unit tests for `fee-engine.service.ts`, `defaulter.service.ts`, auth middleware
- [ ] Write E2E tests for critical path: login → fee payment → receipt download
- [ ] Add API rate limiting (per-tenant + per-IP)

### Phase 5 — AI & Compliance (Ongoing)
- [ ] Agent execution observability (OpenTelemetry / Prometheus)
- [ ] SOC2 Type II evidence automation (automated Trivy + Semgrep reports)
- [ ] DPDPA data-export API for students/guardians
- [ ] Automated RLS policy regression tests
- [ ] AI agent HITL load testing (100+ concurrent approval requests)

---

## G. Compliance & Governance Checklist

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Data encryption at rest | ✅ | AES-256-GCM for PII |
| Data encryption in transit | ✅ | PostgreSQL SSL, HTTPS in prod |
| Role-based access control | ✅ | `rbac/permissions.ts` + middleware |
| Audit logging | ✅ | `audit.service.ts` |
| Password hashing | ✅ | `bcryptjs` |
| MFA support | ⚠️ | UI exists, enforcement missing |
| Row Level Security | ✅ | `002_rls_policies.sql` |
| Dependency vulnerability scanning | ✅ | CI runs `pnpm audit` |
| SAST (Semgrep) | ✅ | `SECURITY_REPORT.md` references scans |
| Secret detection | ⚠️ | Hardcoded hashes in migrations |
| Backup / DR strategy | ❌ | Not documented |
| Penetration test report | ❌ | Not documented |

---

## H. Quick Wins (Do These First)

1. **Fix jsPDF override** — one line in `package.json`, eliminates CRITICAL CVE.
2. **Add auth to 7 API routes** — copy-paste `getSession()` pattern, ~20 min total.
3. **Remove mock data from 3 highest-traffic pages** — Health, Homework, DigiLocker.
4. **Wire payment verify to DB** — call `applyPaymentAction()` after signature check.
5. **Delete or gate `/api/mock`** — prevents accidental seed exposure in production.

---

## I. Appendix: File Inventory

### Key Configuration Files
- `package.json` — root monorepo config with pnpm overrides
- `apps/web/package.json` — Next.js app dependencies
- `pnpm-workspace.yaml` — workspace definition
- `docker-compose.yml` — local infra (Postgres + Redis)
- `render.yaml` — Render deployment spec
- `vercel.json` — Vercel deployment spec
- `.github/workflows/ci.yml` — CI pipeline

### Key Source Directories
- `apps/web/src/app/` — 100+ Next.js App Router pages
- `apps/web/src/lib/services/` — 25+ domain services
- `apps/web/src/lib/actions/` — Server Actions (mutations)
- `apps/web/src/lib/db/schema/` — Drizzle ORM schema
- `apps/web/drizzle/` — SQL migrations (0000–0008)
- `services/agents/src/` — Python FastAPI AI swarm

---

*End of Audit Document*
