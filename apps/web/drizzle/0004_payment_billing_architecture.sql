CREATE TABLE IF NOT EXISTS "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_order_id" varchar(255),
	"provider_payment_id" varchar(255),
	"amount" numeric(12, 2) NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"status" varchar(32) DEFAULT 'CREATED' NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"created_by" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"provider" varchar(32) NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"event_type" varchar(255) NOT NULL,
	"status" varchar(32) DEFAULT 'PROCESSING' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid,
	"payment_id" uuid,
	"payment_order_id" uuid,
	"actor_user_id" uuid,
	"provider_event_id" uuid,
	"provider" varchar(32) NOT NULL,
	"action" varchar(64) NOT NULL,
	"amount" numeric(12, 2),
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_audit_logs" ADD CONSTRAINT "payment_audit_logs_provider_event_id_payment_provider_events_id_fk" FOREIGN KEY ("provider_event_id") REFERENCES "public"."payment_provider_events"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_orders_tenant_invoice" ON "payment_orders" USING btree ("tenant_id","invoice_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_orders_provider_order" ON "payment_orders" USING btree ("provider","provider_order_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_orders_tenant_idempotency" ON "payment_orders" USING btree ("tenant_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_payment_provider_events_provider_event" ON "payment_provider_events" USING btree ("provider","event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_provider_events_tenant" ON "payment_provider_events" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_audit_logs_tenant_created" ON "payment_audit_logs" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_audit_logs_invoice" ON "payment_audit_logs" USING btree ("invoice_id");
--> statement-breakpoint
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
ALTER TABLE "payment_orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_orders" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "payment_orders";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "payment_orders"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "payment_provider_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_provider_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "payment_provider_events";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "payment_provider_events"
    AS PERMISSIVE FOR ALL
    USING (
        app_private.rls_bypass()
        OR tenant_id = app_private.current_tenant_id()
    )
    WITH CHECK (
        app_private.rls_bypass()
        OR tenant_id = app_private.current_tenant_id()
    );
--> statement-breakpoint
ALTER TABLE "payment_audit_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_audit_logs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "payment_audit_logs";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "payment_audit_logs"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
