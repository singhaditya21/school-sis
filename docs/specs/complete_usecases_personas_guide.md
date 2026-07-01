# ScholarMind V6 — Complete Personas & Use Case Specification

This document details the extended user personas and representative use cases with BDD/Gherkin workflows for ScholarMind V6.

---

## 1. Extended User Personas & Profile Cards

ScholarMind models roles and dashboard configurations according to segment-specific persona attributes.

### 1.1 `GROUP_EXECUTIVE`: Group CEO / Trustee
- **Profile Summary**: Manages a chain of 15+ campuses. Focuses on overall financial health, enrollment ratios, and brand reputation.
- **Key Pain Point**: Fragmented campus operating software, lack of consolidated real-time treasury figures, and manual policy enforcement.
- **Outcome**: Unified command center with cross-campus analytics, shared staff allocation pools, and standard group compliance checks.

### 1.2 `REGISTRAR`: University Registrar
- **Profile Summary**: Supervises student lifecycles, transcript certifications, class timetabling, and quality accreditations.
- **Key Pain Point**: Processing transfer equivalency credits, degree audits, and manual evidence gathering for NAAC/ABET accreditations.
- **Outcome**: Automated credit equivalency mapping, verifiable digital academic credential issuance, and continuous evidence rooms for accreditation audits.

### 1.3 `SCHOOL_ADMIN`: Coaching Network Director
- **Profile Summary**: Operates multiple test-prep and tutoring centers.
- **Key Pain Point**: Managing student batch schedules, test score lists, and parent communication updates.
- **Outcome**: Automatic batch allocation wizards, rank prediction algorithms, and WhatsApp updates.

---

## 2. Core Operational Use Cases & BDD Specifications

### Use Case 1: Multi-Campus Policy and KPI Benchmarking
- **Actors**: Group CEO, Trust Auditor.
- **Preconditions**: Campuses A and B are active under Company C.
- **Flow Description**: Group CEO defines a standard fee plan structure and deploys it to all campus nodes. The HQ dashboard collects anonymized collections summaries.

#### Scenario: Enforcing standard grading boundaries
```gherkin
Given a Group Executive "Alice" sets a standard grading rule: "Pass threshold = 40%"
When Alice deploys this policy trust-wide via the HQ console
Then the system MUST:
  1. Cascade the grading configuration to all campus databases.
  2. Block local campus principals from overriding the threshold below 40%.
  3. Log the policy deployment event in `agent_audit_logs`.
```

---

### Use Case 2: AI-Assisted University Course Registration
- **Actors**: College Student, Registrar.
- **Preconditions**: Student has completed prerequisite courses.

#### Scenario: Validating prerequisite compliance during registration
```gherkin
Given a Student "Bob" attempting to register for "Advanced Algorithms"
And "Data Structures" is a strict prerequisite for "Advanced Algorithms"
When Bob submits the registration request
Then the AdvisorAgent MUST:
  1. Retrieve Bob's academic transcript from the RAG store.
  2. If the transcript contains a passing grade for "Data Structures":
     - Approve the course registration.
  3. If the transcript does NOT contain the prerequisite:
     - Flag a prerequisite failure warning.
     - Block registration execution and log the hold in `agent_audit_logs`.
```

---

### Use Case 3: Verifiable Credential Issuance
- **Actors**: Registrar, Credential Officer, Graduate.
- **Preconditions**: Student success checks and fee checks are clear.

#### Scenario: Issuing a cryptographically signed degree
```gherkin
Given a Graduate "Charles" who has successfully completed all degree requirements
And Charles' outstanding fee balance is zero
When the Registrar initiates "issue_degree"
Then the CredentialAgent MUST:
  1. Compile the graduation transcript into an W3C Verifiable Credential object.
  2. Request a cryptographic signature from the Credential Officer's key.
  3. Publish the signed VC metadata hash to the Neon instance.
  4. Send Charles an alert to export the degree to his digital wallet.
```
