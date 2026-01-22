-- V3__create_audit_logs_table.sql
-- Create or modify audit_logs table with correct camelCase column names

-- First, drop any existing table (in case it has wrong schema)
DROP TABLE IF EXISTS audit_logs CASCADE;

-- Create audit_logs table with camelCase column names to match Prisma convention
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    "entityType" VARCHAR(100) NOT NULL,
    "entityId" UUID,
    before JSONB,
    after JSONB,
    metadata JSONB,
    "ipAddress" VARCHAR(50),
    "userAgent" TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_audit_logs_tenant_entity ON audit_logs ("tenantId", "entityType", "entityId");
CREATE INDEX idx_audit_logs_tenant_user ON audit_logs ("tenantId", "userId");
CREATE INDEX idx_audit_logs_tenant_timestamp ON audit_logs ("tenantId", timestamp);
