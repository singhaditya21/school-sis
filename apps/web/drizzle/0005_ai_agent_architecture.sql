CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "embeddings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "collection" varchar(50) NOT NULL,
    "entity_type" varchar(50) NOT NULL,
    "entity_id" uuid NOT NULL,
    "text_content" text NOT NULL,
    "embedding" vector(1024) NOT NULL,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "indexed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_audit_logs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "agent_name" varchar(50) NOT NULL,
    "query" text,
    "prompt" text,
    "response" text,
    "tool_calls" jsonb DEFAULT '[]'::jsonb,
    "tool_results" jsonb DEFAULT '[]'::jsonb,
    "tokens_used" integer DEFAULT 0 NOT NULL,
    "latency_ms" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_approvals" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "agent_name" varchar(50) NOT NULL,
    "title" varchar(255) NOT NULL,
    "description" text NOT NULL,
    "proposed_action" jsonb NOT NULL,
    "status" varchar(20) DEFAULT 'PENDING' NOT NULL,
    "priority" varchar(20) DEFAULT 'NORMAL' NOT NULL,
    "created_by_user_id" uuid,
    "reviewed_by_user_id" uuid,
    "reviewed_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_audit_logs" ADD CONSTRAINT "agent_audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_approvals" ADD CONSTRAINT "agent_approvals_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embeddings_tenant_collection" ON "embeddings" USING btree ("tenant_id","collection");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_embeddings_tenant_collection_entity" ON "embeddings" USING btree ("tenant_id","collection","entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embeddings_vector" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_audit_tenant" ON "agent_audit_logs" USING btree ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_audit_agent" ON "agent_audit_logs" USING btree ("agent_name","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_agent_approvals_tenant_status" ON "agent_approvals" USING btree ("tenant_id","status","created_at");
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
ALTER TABLE "embeddings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "embeddings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "embeddings";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "embeddings"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "agent_audit_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_audit_logs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "agent_audit_logs";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "agent_audit_logs"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
ALTER TABLE "agent_approvals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agent_approvals" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_policy ON "agent_approvals";
--> statement-breakpoint
CREATE POLICY tenant_isolation_policy ON "agent_approvals"
    AS PERMISSIVE FOR ALL
    USING (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id())
    WITH CHECK (app_private.rls_bypass() OR tenant_id = app_private.current_tenant_id());
--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_entity_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSON;
BEGIN
    IF TG_TABLE_NAME = 'students' THEN
        payload = json_build_object('type', 'student', 'id', NEW.id, 'tenant_id', NEW.tenant_id);
    ELSIF TG_TABLE_NAME = 'invoices' THEN
        payload = json_build_object('type', 'invoice', 'id', NEW.id, 'tenant_id', NEW.tenant_id);
    ELSE
        RETURN NEW;
    END IF;

    PERFORM pg_notify('entity_changes', payload::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_student_changes ON students CASCADE;
--> statement-breakpoint
CREATE TRIGGER trg_student_changes
AFTER INSERT OR UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION notify_entity_change();
--> statement-breakpoint
DROP TRIGGER IF EXISTS trg_invoice_changes ON invoices CASCADE;
--> statement-breakpoint
CREATE TRIGGER trg_invoice_changes
AFTER INSERT OR UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION notify_entity_change();
