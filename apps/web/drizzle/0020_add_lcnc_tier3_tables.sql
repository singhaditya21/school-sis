-- Expand-only LCNC Platform Tier-3 ("Agentforce + Web-to-Object v2 + AppExchange Packaging") migration:
-- 1. Installed Blueprint & Schema Bundle Registry (`metadata_installed_packages`) with SHA-256 package provenance

CREATE TABLE IF NOT EXISTS "metadata_installed_packages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "package_key" varchar(120) NOT NULL,
    "name" varchar(140) NOT NULL,
    "description" text,
    "version" varchar(40) DEFAULT '1.0.0' NOT NULL,
    "source_type" varchar(40) DEFAULT 'BUNDLE_IMPORT' NOT NULL,
    "bundle_sha256" varchar(64) NOT NULL,
    "installed_objects" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "artifact_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "installed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "installed_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT "metadata_installed_packages_tenant_key_uniq" UNIQUE("tenant_id", "package_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_metadata_installed_packages_tenant" ON "metadata_installed_packages" ("tenant_id", "updated_at");
