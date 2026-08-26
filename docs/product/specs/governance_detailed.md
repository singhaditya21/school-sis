# ScholarMind V6 — Detailed Governance, Roles & Compliance Specification

This document details the role permission matrices, AI action classifications, safeguarding automation limits, data retention policies, and SLA targets for ScholarMind V6.

---

## 1. Role-Based Access Control (RBAC) Governance Matrix

ScholarMind V6 aggressively enforces segregation of duties across 10 functional roles.

| Role | Can View | Can Edit | Can Approve | Can Publish / Revoke | Special Security Constraints |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`GROUP_EXECUTIVE`** | Aggregate dashboards, benchmark metrics, financial summaries across all campuses. | Policy boundaries only. | Group-level configuration changes. | None (No raw learner record publishing). | No access to raw safeguarding records or detailed student health profiles. |
| **`SUPER_ADMIN`** | Institution-wide operational data, audit trails, and config parameters. | Institution-level configuration. | Institution-level operational actions. | Publish approved records where local policy permits. | Cannot override or deactivate Group-level non-negotiables. |
| **`REGISTRAR`** | Student academic histories, transcripts, and course allocations. | Transcripts, degrees, and certificate records. | Credit transfer matches, prior-learning credits, graduation checklist. | Publish and revoke academic transcripts and degrees. | Dual-control check required for edit operations on historic records. |
| **`FACULTY`** | Assigned classroom grades, attendance lists, and course syllabus. | Marks, attendance logs, and syllabus files. | None. | None. | Read/write access restricted to assigned sections. |
| **`COUNSELOR`** | Assigned student success cases and wellness signals. | Case intervention logs, referral files, and care plans. | Intervention closures. | None. | Anonymized sentiment records; restricted to direct assignment list. |
| **`FINANCE_LEAD`** | Billing statements, collections tables, and treasury data. | Fee schedules, invoice adjustments, and payment terms. | Waivers, collection extensions, and installment plans. | None. | Segregated from cardholder data scope (PCI compliance). |
| **`TRUST_OFFICER`** | System logs, evidence room files, and privacy states. | Policy declarations and evidence templates. | Disclosures and legal packages. | None. | Read-heavy role; zero access to edit student grades or invoices. |
| **`CREDENTIAL_OFFICER`** | Student accomplishment data, credentials, and verification logs. | Issuance settings. | Verification policies. | Cryptographically publish and revoke verifiable credentials. | Dual-control check mandated for batch credential revocations. |
| **`PARENT_GUARDIAN`** | Linked child's attendance, fees, marks, and diaries. | Preference configurations. | None. | None. | Restricted strictly to designated child’s profile. |
| **`LEARNER`** | Own profile, registered courses, grades, and wallet. | Own profile fields. | Consent declarations. | Share own credentials to third-party verifiers. | Zero access to modify grades, attendance, or invoice statuses. |

---

## 2. AI Decision Control & Safety Boundaries

AI operations are classified into four risk categories to ensure human accountability:

| AI Action Class | Description | System Behavior | Human Sign-off Needed? |
| :--- | :--- | :--- | :--- |
| **Informative** | Timetable suggestions, syllabus summarization, email notifications. | Direct execution and delivery. | **No** |
| **Assistive** | Elective courses recommendations, payment installment plans suggestions. | Display suggestion to user. | **No** (But logged) |
| **Decision-Support** | Prior-learning credit mapping, dropout risk warning, intervention routing. | Queue recommendations for review. | **Yes** (If affecting user status) |
| **High-Impact** | Grade modifications, degree revocations, safeguarding case closures. | Block automatic execution. Queue in Approvals inbox. | **Always Yes** |

### 2.1 Non-Automation Rules (Zero-AI-Autonomy Boundaries)
Under no circumstances shall the platform perform the following actions end-to-end without direct human approval:
- Publishing or modifying final academic grades or degree outcomes.
- Granting fee waivers, financial aid approvals, or collection adjustments.
- Triggering safeguarding concern case closures.
- Issuing, revoking, or superseding verifiable credentials.

---

## 3. Compliance, Data Retention & Recovery SLAs

### 3.1 Data Retention Schedule
To satisfy regulatory standards (e.g. SOC2, Family Educational Rights, Local Finance laws), ScholarMind enforces minimum online and archive logging retention:

- **Authentication & Admin Audit Logs**: 1 year online, 3 years archive.
- **Financial Approvals & Reconciliation Logs**: 7 years (online/archive split determined by region).
- **Safeguarding Case Access Logs**: 7 years minimum (non-redactable).
- **AI Recommendation & Override Logs**: 2 years online, 5 years archive.
- **Security Incident Evidence Logs**: 7 years.

### 3.2 Recovery Targets (RTO / RPO)
| Target Metric | Standard SaaS | Professional SaaS | Enterprise / Regulated |
| :--- | :--- | :--- | :--- |
| **Recovery Time Objective (RTO)** | 8 hours | 4 hours | 1 hour |
| **Recovery Point Objective (RPO)** | 4 hours | 1 hour | 15 minutes |

---

## 4. Verification & Testing Scenarios (BDD)

### Scenario: Unauthorized Grade Modification Attempt
```gherkin
Given a User "Alice" with role "FACULTY"
When Alice attempts to call the API endpoint "/api/v1/grades/modify" for Student "Arjun Patel"
Then the system MUST:
  1. Intercept the request at the RBAC middleware.
  2. Detect that "FACULTY" does not possess "Can Publish / Revoke" rights for grades.
  3. Abort the operation and return an HTTP 403 Forbidden status.
  4. Write a critical event in `agent_audit_logs`.
```

### Scenario: High-Impact AI Tool Interception
```gherkin
Given the RiskAgent recommends closing a safeguarding case for Student "Priya Sharma"
When the agent executes the tool "close_safeguarding_case"
Then the Tool Registry MUST:
  1. Read that the tool requires human signoff.
  2. Create a PENDING request in the `agent_approvals` table.
  3. Return "PENDING_HUMAN_APPROVAL" to the RiskAgent.
  4. Display the action inside the approvals dashboard for the "SUPER_ADMIN" role.
```
