CREATE SCHEMA IF NOT EXISTS app_private;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_private.rls_bypass()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(current_setting('app.bypass_rls', true) = 'on', false)
$$;
--> statement-breakpoint
SELECT set_config('app.bypass_rls', 'on', false);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_approval_requests" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "policy_id" varchar(120) NOT NULL,
    "title" varchar(255) NOT NULL,
    "description" text NOT NULL,
    "status" varchar(30) DEFAULT 'PENDING' NOT NULL,
    "priority" varchar(20) DEFAULT 'NORMAL' NOT NULL,
    "resource_type" varchar(100) NOT NULL,
    "resource_id" varchar(160),
    "action_permission" varchar(120) NOT NULL,
    "audit_action" varchar(160) NOT NULL,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "required_approver_roles" text[] NOT NULL,
    "min_approvals" integer DEFAULT 1 NOT NULL,
    "approvals_received" integer DEFAULT 0 NOT NULL,
    "rejections_received" integer DEFAULT 0 NOT NULL,
    "allow_requester_approval" boolean DEFAULT false NOT NULL,
    "requested_by_user_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "requested_by_role" varchar(50) NOT NULL,
    "idempotency_key" varchar(160),
    "escalation_level" integer DEFAULT 0 NOT NULL,
    "due_at" timestamp with time zone NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_approval_reviews" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "approval_request_id" uuid NOT NULL REFERENCES "public"."workflow_approval_requests"("id") ON DELETE cascade,
    "reviewer_user_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "reviewer_role" varchar(50) NOT NULL,
    "decision" varchar(20) NOT NULL,
    "reason" text,
    "delegated_from_user_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_approval_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "approval_request_id" uuid NOT NULL REFERENCES "public"."workflow_approval_requests"("id") ON DELETE cascade,
    "event_type" varchar(40) NOT NULL,
    "from_status" varchar(30),
    "to_status" varchar(30) NOT NULL,
    "actor_user_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "actor_role" varchar(50),
    "reason" text,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_approval_delegations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "policy_id" varchar(120),
    "from_user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
    "from_role" varchar(50) NOT NULL,
    "to_user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE cascade,
    "to_role" varchar(50) NOT NULL,
    "reason" text,
    "is_active" boolean DEFAULT true NOT NULL,
    "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "revoked_at" timestamp with time zone
);
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_approval_requests_status_check') THEN
        ALTER TABLE "workflow_approval_requests"
            ADD CONSTRAINT "workflow_approval_requests_status_check"
            CHECK ("status" IN ('PENDING', 'ESCALATED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_approval_requests_priority_check') THEN
        ALTER TABLE "workflow_approval_requests"
            ADD CONSTRAINT "workflow_approval_requests_priority_check"
            CHECK ("priority" IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_approval_requests_counts_check') THEN
        ALTER TABLE "workflow_approval_requests"
            ADD CONSTRAINT "workflow_approval_requests_counts_check"
            CHECK (
                "min_approvals" > 0
                AND "approvals_received" >= 0
                AND "rejections_received" >= 0
                AND "escalation_level" >= 0
                AND "expires_at" >= "due_at"
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_approval_reviews_decision_check') THEN
        ALTER TABLE "workflow_approval_reviews"
            ADD CONSTRAINT "workflow_approval_reviews_decision_check"
            CHECK ("decision" IN ('APPROVED', 'REJECTED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_approval_events_type_check') THEN
        ALTER TABLE "workflow_approval_events"
            ADD CONSTRAINT "workflow_approval_events_type_check"
            CHECK ("event_type" IN ('REQUESTED', 'REVIEWED', 'APPROVED', 'REJECTED', 'ESCALATED', 'CANCELLED', 'EXPIRED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_approval_delegations_time_check') THEN
        ALTER TABLE "workflow_approval_delegations"
            ADD CONSTRAINT "workflow_approval_delegations_time_check"
            CHECK ("ends_at" > "starts_at");
    END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_approvals_tenant_status_due"
    ON "workflow_approval_requests" USING btree ("tenant_id", "status", "due_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_approvals_tenant_policy_status"
    ON "workflow_approval_requests" USING btree ("tenant_id", "policy_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_approvals_resource"
    ON "workflow_approval_requests" USING btree ("tenant_id", "resource_type", "resource_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_approvals_tenant_idempotency_key"
    ON "workflow_approval_requests" USING btree ("tenant_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_approval_reviews_request_created"
    ON "workflow_approval_reviews" USING btree ("approval_request_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_approval_reviews_tenant_reviewer"
    ON "workflow_approval_reviews" USING btree ("tenant_id", "reviewer_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workflow_approval_reviews_request_reviewer_key"
    ON "workflow_approval_reviews" USING btree ("approval_request_id", "reviewer_user_id")
    WHERE "reviewer_user_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_approval_events_request_created"
    ON "workflow_approval_events" USING btree ("approval_request_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_approval_events_tenant_type_created"
    ON "workflow_approval_events" USING btree ("tenant_id", "event_type", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_approval_delegations_tenant_to_active"
    ON "workflow_approval_delegations" USING btree ("tenant_id", "to_user_id", "is_active");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workflow_approval_delegations_tenant_from"
    ON "workflow_approval_delegations" USING btree ("tenant_id", "from_user_id");
--> statement-breakpoint
ALTER TABLE "workflow_approval_requests" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workflow_approval_requests" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "workflow_approval_requests";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "workflow_approval_requests"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "workflow_approval_reviews" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workflow_approval_reviews" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "workflow_approval_reviews";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "workflow_approval_reviews"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "workflow_approval_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workflow_approval_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "workflow_approval_events";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "workflow_approval_events"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "workflow_approval_delegations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workflow_approval_delegations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "workflow_approval_delegations";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "workflow_approval_delegations"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
