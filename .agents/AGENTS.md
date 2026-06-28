# Database Architecture & Schema Rules

Based on our database audit, adhere to the following rules when creating or modifying Drizzle ORM schema files:

## 1. Strict Multi-Tenancy Enforcement
- **Rule:** EVERY table must include a `tenantId` column that references `tenants.id`, unless it is explicitly a global/platform-level table (e.g., `companies`, `hq_groups`).
- **Rationale:** This prevents accidental cross-tenant data leakage and simplifies the implementation of Row-Level Security (RLS) policies later on. Do not rely solely on parent table joins for tenant scoping.

## 2. Standardized Audit Fields
- **Rule:** EVERY table must include `createdAt` and `updatedAt` timestamp fields.
  - `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`
  - `updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()` (Make sure to handle the update trigger or update it manually in queries).
- **Rationale:** Crucial for caching, data synchronization, and debugging.

## 3. Targeted Soft Deletes
- **Rule:** Do NOT apply soft deletes globally. Add `deletedAt: timestamp('deleted_at', { withTimezone: true })` ONLY to high-value domain entities (e.g., `students`, `users`, `invoices`).
- **Rationale:** Enables data recovery for critical records while allowing child/join tables to remain performant and simple by using `onDelete: 'cascade'`.

## 4. Strict CI/CD Deployment Protocol
- **Rule:** EVERY code change must be committed to GitHub. Before ending your turn, you MUST run `git push origin main` and explicitly verify that the GitHub Actions CI/CD pipeline (tests and Neon migrations) completes successfully, ensuring Vercel triggers its deployment.
- **Rationale:** Enforces rigorous QA and deployment standards, guaranteeing all changes are tested and deployed safely.
