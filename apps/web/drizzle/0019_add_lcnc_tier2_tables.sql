-- Expand-only LCNC Platform Tier-2 ("Salesforce Lightning Parity") migration:
-- 1. Organization-Wide Defaults (`tenant_object_settings.owd_mode`), Record Ownership (`metadata_records.owner_user_id`), and Criteria Sharing Rules (`metadata_sharing_rules`)
-- 2. Cross-Field Boolean Formula Validation Rules (`metadata_validation_rules`)
-- 3. Multi-Step Declarative Approval Processes & Stateful Instances with Record Lock (`metadata_approval_processes`, `metadata_approval_instances`)
-- 4. Multi-Widget Role-Scoped Custom Dashboards (`metadata_dashboards`)
-- 5. Unified 360° Record File Attachments (`metadata_record_attachments`)

ALTER TABLE "tenant_object_settings" ADD COLUMN IF NOT EXISTS "owd_mode" varchar(30) DEFAULT 'PUBLIC_READ_WRITE' NOT NULL;
--> statement-breakpoint
ALTER TABLE "metadata_records" ADD COLUMN IF NOT EXISTS "owner_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metadata_sharing_rules" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "object_api_name" varchar(100) NOT NULL,
    "name" varchar(120) NOT NULL,
    "criteria_field" varchar(100),
    "criteria_operator" varchar(20) DEFAULT 'eq' NOT NULL,
    "criteria_value" varchar(255),
    "shared_with_role" varchar(80) NOT NULL,
    "access_level" varchar(20) DEFAULT 'READ' NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metadata_validation_rules" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "object_api_name" varchar(100) NOT NULL,
    "name" varchar(120) NOT NULL,
    "description" text,
    "error_condition_formula" text NOT NULL,
    "error_message" text NOT NULL,
    "error_field" varchar(100),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metadata_approval_processes" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "object_api_name" varchar(100) NOT NULL,
    "name" varchar(120) NOT NULL,
    "description" text,
    "entry_criteria_formula" text,
    "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "lock_record_on_submit" boolean DEFAULT true NOT NULL,
    "field_updates_on_approve" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "field_updates_on_reject" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metadata_approval_instances" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "process_id" uuid NOT NULL REFERENCES "metadata_approval_processes"("id") ON DELETE CASCADE,
    "object_api_name" varchar(100) NOT NULL,
    "record_id" uuid NOT NULL,
    "status" varchar(20) DEFAULT 'PENDING' NOT NULL,
    "current_step" integer DEFAULT 1 NOT NULL,
    "submitted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "submission_comment" text,
    "step_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "is_locked" boolean DEFAULT true NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metadata_dashboards" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name" varchar(120) NOT NULL,
    "description" text,
    "allowed_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "widgets" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metadata_record_attachments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "object_api_name" varchar(100) NOT NULL,
    "record_id" uuid NOT NULL,
    "file_name" varchar(255) NOT NULL,
    "mime_type" varchar(120) NOT NULL,
    "size_bytes" integer NOT NULL,
    "storage_key" varchar(500),
    "inline_base64" text,
    "sha256_checksum" varchar(64) NOT NULL,
    "description" text,
    "uploaded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_sharing_rules_tenant_obj" ON "metadata_sharing_rules" ("tenant_id", "object_api_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_validation_rules_tenant_obj" ON "metadata_validation_rules" ("tenant_id", "object_api_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_approval_processes_tenant_obj" ON "metadata_approval_processes" ("tenant_id", "object_api_name");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_approval_instances_tenant_rec" ON "metadata_approval_instances" ("tenant_id", "object_api_name", "record_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_dashboards_tenant" ON "metadata_dashboards" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_record_attachments_tenant_rec" ON "metadata_record_attachments" ("tenant_id", "object_api_name", "record_id");
