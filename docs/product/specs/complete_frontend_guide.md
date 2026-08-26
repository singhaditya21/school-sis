# ScholarMind V6 — Complete Frontend & UI Dashboard Specification

This document outlines the frontend routing model, authentication patterns, role-based dashboards, and the Human-in-the-Loop (HITL) approval dashboard implementation details.

---

## 1. Next.js 15 App Router Structure

The frontend is structured in the `/apps/web` monorepo directory utilizing Next.js App Router:

- `/src/middleware.ts`: Secures routes, extracts tenant scope, and intercepts cross-tenant access.
- `/src/app/api/auth/`: NextAuth/IronSession endpoints managing login, session refreshes, and MFA.
- `/src/app/dashboard/[tenantId]/`: Root layout for a campus-specific dashboard:
  - `page.tsx`: Core aggregate overview.
  - `fees/`: Payment invoice lists, transaction histories, and billing metrics.
  - `students/`: Pupil details, directories, and attendance trackers.
  - `approvals/`: Staff inbox for reviewing pending AI actions.
  - `credentials/`: Verifiable transcript credentials issuance desk.
- `/src/app/hq/`: The Group Executive dashboard, bypassing single-campus limits to display trust-wide metrics.

---

## 2. Authentication, Session Context & MFA

ScholarMind secures sessions using IronSession cookie storage. 

```mermaid
graph TD
    Client[Web Client] -->|Post Credentials| Login[/api/auth/login]
    Login --> AuthDB{Verify Hash & Check MFA}
    AuthDB -->|If Enabled| MFAPage[Prompt MFA TOTP Code]
    AuthDB -->|MFA Valid / Disabled| Session[Generate Session Token]
    Session --> Cookie[Set Encrypted HTTPOnly Cookie]
    Cookie --> TenantInject[Inject tenantId & role into request headers]
```

- **MFA Enforcement**: When MFA is enabled, users must submit a TOTP code during login. Hashed backup codes are provided during initial setup for emergency account recovery.
- **Tenant Context Injection**: The middleware reads the encrypted cookie session, extracts the user's `tenantId` and `role`, and sets them as request headers to ensure they are available to all server components and API queries.

---

## 3. Role-Based Dashboard Configurations

### 3.1 Group Executive Dashboard (`/apps/web/src/app/hq`)
- **Primary Audience**: Trust Executives, CEOs, and Trustees.
- **Layout Panels**:
  - *Consolidated Treasury Summary*: Total billed vs. collected fees across all campuses.
  - *Unified Attendance Board*: High-level attendance statistics and dropout prediction maps.
  - *Policy Push Panel*: Dashboard interface to deploy uniform fee schedules or grading boards down the hierarchy tree.

### 3.2 Super Admin Console (`/apps/web/src/app/dashboard/[tenantId]`)
- **Primary Audience**: Campus Principals, IT Administrators.
- **Layout Panels**:
  - *System Modules Toggles*: Activation matrix for ERP modules.
  - *User Management Board*: Roster of campus users, role assignments, and MFA status flags.

### 3.3 Approvals Console (`/apps/web/src/app/dashboard/[tenantId]/approvals`)
- **Primary Audience**: Super Admins, Registrars, Finance Leads.
- **Layout Panels**:
  - *Filter Header*: Toggles between PENDING, APPROVED, REJECTED, and EXPIRED statuses.
  - *Queue Table*: Displays pending items sorted by priority (`CRITICAL`, `HIGH`, `NORMAL`, `LOW`).
  - *Action Detail Card*: Displays:
    - Target Entity (e.g. Student name or Invoice ID).
    - Source Agent.
    - Proposed payload parameters (JSON explorer).
    - Action confirmation triggers (Approve / Reject buttons).

---

## 4. BDD UI Interaction Flow Specifications

### Scenario: Processing a Grade Approval Request
```gherkin
Given a Registrar is logged in and viewing "/dashboard/[tenantId]/approvals"
And there is a pending action card: "AcademAgent: Update Student Grade to A+"
When the Registrar clicks the "Approve" button
Then the UI MUST:
  1. Disable the action button controls on the card.
  2. Send a POST request to `/api/v1/approvals/[tenantId]/[approvalId]/review` with:
     | action  | "APPROVED" |
     | user_id | "[userID]" |
  3. Await a success status response from the backend.
  4. Slide the card out of view using a smooth CSS ease-out transition.
  5. Trigger a Radix toast notification: "Grade updated successfully."
```
