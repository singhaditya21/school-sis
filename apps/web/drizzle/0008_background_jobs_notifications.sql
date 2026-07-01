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
CREATE TABLE IF NOT EXISTS "background_jobs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "scope" varchar(20) DEFAULT 'TENANT' NOT NULL,
    "queue" varchar(80) DEFAULT 'default' NOT NULL,
    "task_name" varchar(120) NOT NULL,
    "status" varchar(30) DEFAULT 'QUEUED' NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "idempotency_key" varchar(160),
    "scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
    "available_at" timestamp with time zone DEFAULT now() NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "locked_at" timestamp with time zone,
    "locked_by" varchar(120),
    "last_error" text,
    "result" jsonb,
    "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "background_job_attempts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "job_id" uuid NOT NULL REFERENCES "public"."background_jobs"("id") ON DELETE cascade,
    "tenant_id" uuid REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "attempt_number" integer NOT NULL,
    "status" varchar(30) NOT NULL,
    "worker_id" varchar(120),
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "finished_at" timestamp with time zone,
    "error" text,
    "result" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_outbox" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "job_id" uuid REFERENCES "public"."background_jobs"("id") ON DELETE set null,
    "channel" varchar(20) NOT NULL,
    "status" varchar(30) DEFAULT 'PENDING' NOT NULL,
    "provider" varchar(40) DEFAULT 'mock' NOT NULL,
    "recipient" varchar(320) NOT NULL,
    "recipient_user_id" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "subject" varchar(500),
    "body" text NOT NULL,
    "template_id" uuid REFERENCES "public"."message_templates"("id") ON DELETE set null,
    "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "idempotency_key" varchar(160),
    "scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
    "provider_message_id" varchar(255),
    "last_error" text,
    "created_by" uuid REFERENCES "public"."users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_delivery_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "public"."tenants"("id") ON DELETE cascade,
    "notification_id" uuid NOT NULL REFERENCES "public"."notification_outbox"("id") ON DELETE cascade,
    "job_id" uuid REFERENCES "public"."background_jobs"("id") ON DELETE set null,
    "status" varchar(30) NOT NULL,
    "provider" varchar(40) DEFAULT 'mock' NOT NULL,
    "provider_message_id" varchar(255),
    "error" text,
    "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'background_jobs_scope_check') THEN
        ALTER TABLE "background_jobs"
            ADD CONSTRAINT "background_jobs_scope_check"
            CHECK ("scope" IN ('TENANT', 'PLATFORM'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'background_jobs_status_check') THEN
        ALTER TABLE "background_jobs"
            ADD CONSTRAINT "background_jobs_status_check"
            CHECK ("status" IN ('QUEUED', 'SCHEDULED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'background_jobs_scope_tenant_check') THEN
        ALTER TABLE "background_jobs"
            ADD CONSTRAINT "background_jobs_scope_tenant_check"
            CHECK (
                ("scope" = 'TENANT' AND "tenant_id" IS NOT NULL)
                OR ("scope" = 'PLATFORM' AND "tenant_id" IS NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'background_jobs_attempts_check') THEN
        ALTER TABLE "background_jobs"
            ADD CONSTRAINT "background_jobs_attempts_check"
            CHECK ("attempts" >= 0 AND "max_attempts" > 0 AND "attempts" <= "max_attempts");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'background_job_attempts_status_check') THEN
        ALTER TABLE "background_job_attempts"
            ADD CONSTRAINT "background_job_attempts_status_check"
            CHECK ("status" IN ('RUNNING', 'SUCCEEDED', 'FAILED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'background_job_attempts_attempt_check') THEN
        ALTER TABLE "background_job_attempts"
            ADD CONSTRAINT "background_job_attempts_attempt_check"
            CHECK ("attempt_number" > 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_outbox_channel_check') THEN
        ALTER TABLE "notification_outbox"
            ADD CONSTRAINT "notification_outbox_channel_check"
            CHECK ("channel" IN ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH', 'IN_APP'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_outbox_status_check') THEN
        ALTER TABLE "notification_outbox"
            ADD CONSTRAINT "notification_outbox_status_check"
            CHECK ("status" IN ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'DEAD_LETTER', 'SUPPRESSED'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_outbox_attempts_check') THEN
        ALTER TABLE "notification_outbox"
            ADD CONSTRAINT "notification_outbox_attempts_check"
            CHECK ("attempts" >= 0 AND "max_attempts" > 0 AND "attempts" <= "max_attempts");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_delivery_events_status_check') THEN
        ALTER TABLE "notification_delivery_events"
            ADD CONSTRAINT "notification_delivery_events_status_check"
            CHECK ("status" IN ('PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'DEAD_LETTER', 'SUPPRESSED'));
    END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_background_jobs_tenant_status_available"
    ON "background_jobs" USING btree ("tenant_id", "status", "available_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_background_jobs_queue_status_available"
    ON "background_jobs" USING btree ("queue", "status", "available_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_background_jobs_task_status"
    ON "background_jobs" USING btree ("task_name", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "background_jobs_tenant_idempotency_key"
    ON "background_jobs" USING btree ("tenant_id", "idempotency_key")
    WHERE "tenant_id" IS NOT NULL AND "idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "background_jobs_platform_idempotency_key"
    ON "background_jobs" USING btree ("idempotency_key")
    WHERE "tenant_id" IS NULL AND "idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_background_job_attempts_job_attempt"
    ON "background_job_attempts" USING btree ("job_id", "attempt_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_background_job_attempts_tenant_started"
    ON "background_job_attempts" USING btree ("tenant_id", "started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_outbox_tenant_status_next"
    ON "notification_outbox" USING btree ("tenant_id", "status", "next_attempt_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_outbox_job"
    ON "notification_outbox" USING btree ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_outbox_recipient"
    ON "notification_outbox" USING btree ("tenant_id", "recipient");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_outbox_tenant_idempotency_key"
    ON "notification_outbox" USING btree ("tenant_id", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_events_notification_created"
    ON "notification_delivery_events" USING btree ("notification_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notification_events_tenant_created"
    ON "notification_delivery_events" USING btree ("tenant_id", "created_at");
--> statement-breakpoint
ALTER TABLE "background_jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "background_jobs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "background_jobs";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "background_jobs"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "background_job_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "background_job_attempts" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "background_job_attempts";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "background_job_attempts"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "notification_outbox" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_outbox" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "notification_outbox";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "notification_outbox"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "notification_delivery_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_delivery_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "notification_delivery_events";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "notification_delivery_events"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
SELECT set_config('app.bypass_rls', 'off', false);
