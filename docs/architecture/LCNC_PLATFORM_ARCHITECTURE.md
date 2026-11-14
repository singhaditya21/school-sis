# Low-Code / No-Code (LCNC) Platform Architecture

ScholarMind embeds a multi-tenant metadata, workflow, and application-builder platform ("Salesforce for K-12 Schools") directly inside the TypeScript monorepo (`packages/api/src/metadata/runtime.ts`, `apps/web/src/lib/actions/metadata-engine.ts`, `apps/web/src/lib/actions/lcnc-platform.ts`, and `apps/web/src/lib/actions/lcnc-tier3.ts`).

Every metadata table is tenant-scoped and protected by PostgreSQL `FORCE ROW LEVEL SECURITY` (`packages/api/src/db/migrations/tenant-rls.sql`), verified in CI by `pnpm audit:rls-matrix`.

---

## 1. Dual Storage Modes (`TABLE` vs `EAV`)

Defined in `packages/api/src/metadata/runtime.ts`:

1. **`TABLE` Mode (19 Core System Objects)**
   - Projects over physical domain tables (`students`, `staff_profiles`, `invoices`, `admission_leads`, `attendance_records`, `books`, `vehicles`, `hostels`, etc.) seeded in `apps/web/drizzle/0018_add_lcnc_tables.sql`.
   - Standard fields map to typed SQL columns; tenant-added custom fields persist in each table's `custom_data` JSONB column without requiring runtime DDL.
   - Tenants can enable/disable system objects per workspace via `tenant_object_settings`.

2. **`EAV` Mode (Tenant-Defined Custom Objects)**
   - Newly created custom objects (`table_name = 'metadata_records'`) require zero schema migrations.
   - Parent rows live in `metadata_records` (`tenant_id`, `owner_user_id`, timestamps) and typed cell values live in `metadata_values` (`value_string`, `value_number`, `value_boolean`, `value_date`).
   - Reference starter blueprint: `packages/api/src/metadata/seed-lost-and-found-object.sql` (`/app/lost_and_found_item`).

---

## 2. Schema & Governance Capabilities (Migrations `0018`–`0020`)

### Tier 1 — Objects, Custom Roles, Layouts, Views & Reports (`0018_add_lcnc_tables.sql`)
- **Object Manager (`/settings/objects`, `/settings/objects/[id]`):** Create custom objects, add custom fields (`TEXT`, `NUMBER`, `CURRENCY`, `BOOLEAN`, `DATE`, `PICKLIST`, `LOOKUP`, `FORMULA`), publish schema versions (`metadata.publish`), and configure HTML5 drag-and-drop form/list layouts (`metadata_layouts`) scoped by role (`assigned_roles`).
- **Custom Tenant Roles (`tenant_roles`, `tenant_role_permissions`):** Clone base roles (`TEACHER`, `ACCOUNTANT`, etc.) with granular object/field permissions (`field_permissions`).
- **Persistent Categorized Views (`metadata_view_categories`, `metadata_views`):** Saved filter, sort, column, and Kanban board configurations rendered at `/app/[objectApiName]`.
- **Calculated & Relational Fields:** Safe `FORMULA` evaluation (arithmetic, `CONCAT`, `DAYS_BETWEEN`) and `LOOKUP` relationships with automatic child related lists on 360° record detail pages (`/app/[objectApiName]/[recordId]`).

### Tier 2 — Sharing, Validation, Approvals, Dashboards & Attachments (`0019_add_lcnc_tier2_tables.sql`)
- **Organization-Wide Defaults (OWD) & Criteria Sharing:** `tenant_object_settings.owd_mode` (`PRIVATE`, `PUBLIC_READ_ONLY`, `PUBLIC_READ_WRITE`), record ownership (`metadata_records.owner_user_id`), and criteria-based role sharing (`metadata_sharing_rules`).
- **Formula Validation Rules (`metadata_validation_rules`):** Cross-field boolean error formulas evaluated server-side before create/update mutations commit.
- **Declarative Multi-Step Approval Processes (`metadata_approval_processes`, `metadata_approval_instances`):** Entry criteria formulas, record locking (`lock_record_on_submit`), step histories, and automatic field updates on approve/reject.
- **Role-Scoped Custom Dashboards (`metadata_dashboards`):** Multi-widget KPI and chart builders at `/dashboards` and `/executive`.
- **360° Record Activity & Attachments (`metadata_record_attachments`):** Unified timeline notes, tasks, audit history, and attachment metadata per record.

### Tier 3 — Flow Builder, Web-to-Object Portals, Copilot Bar & Packaging (`0020_add_lcnc_tier3_tables.sql`)
- **Visual Flow Automation (`/settings/automation`, `/settings/automation/new`):** Triggered workflows (`RECORD_CREATED`, `RECORD_UPDATED`, `RECORD_DELETED`) executing `FIELD_UPDATE`, `CREATE_TASK`, `SEND_EMAIL` (via `notification_outbox`), and signed `WEBHOOK` dispatches.
- **Web-to-Object Public Intake Portals (`/portal/[tenantSlug]/[objectApiName]`):** Rate-limited guest intake forms (`consumeGuestPortalRateLimit`) and status lookup tokens backed by `metadata-engine.ts` without exposing authenticated tenant routes.
- **Natural-Language LCNC Copilot Bar:** Embedded copilot assistive bar for drafting object schemas, filters, and bounded record queries under session RBAC/FLS.
- **AppExchange Schema Bundles (`metadata_installed_packages`):** Export and import `.scholarmind.json` blueprints with SHA-256 provenance tracking (`bundle_sha256`) and idempotent conflict resolution.

---

## 3. API & Mobile Parity

- **REST Data Endpoints:** `GET /api/data` (object catalog discovery) and `/api/data/[objectApiName]` (authenticated CRUD + bulk CSV import/export) enforce session RBAC, OWD sharing, FLS masking, and validation rules identically to server actions.
- **Mobile Companion (`apps/mobile/screens/MetadataExplorerScreen.tsx`):** Dynamically renders tenant custom objects and fields from `/api/data` without app-store rebuilds.
