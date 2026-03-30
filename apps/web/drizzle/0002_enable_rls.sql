-- Custom SQL migration to enable Row Level Security (RLS) on all multi-tenant tables
-- This automatically discovers every table with a `tenant_id` column and enforces the isolation policy.

DO $$ 
DECLARE 
    tbl record;
BEGIN
    FOR tbl IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'tenant_id' 
          AND table_schema = 'public'
    LOOP
        -- 1. Enable RLS on the table
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl.table_name);
        
        -- 2. Drop the policy if it already exists to allow idempotent re-runs
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl.table_name);
        
        -- 3. Create the isolation policy. 
        -- `current_setting('app.current_tenant', true)` safely returns NULL if not set, naturally blocking access
        EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I AS PERMISSIVE FOR ALL TO PUBLIC USING (tenant_id = current_setting(''app.current_tenant'', true)::uuid);', tbl.table_name);
        
        -- 4. Force RLS (ensures table owners are also subject to the policy unless bypassed explicitly)
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl.table_name);
    END LOOP;
END $$;