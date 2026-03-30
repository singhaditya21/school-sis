-- ScholarMind pgvector schema for AI agent embeddings
-- Run against the existing school_sis database

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Embedding Store ────────────────────────────────────
-- All agent-indexed data is stored here with tenant isolation
CREATE TABLE IF NOT EXISTS embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    collection VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    text_content TEXT NOT NULL,
    embedding vector(1024) NOT NULL,
    metadata JSONB DEFAULT '{}',
    indexed_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, collection, entity_id)
);

-- Tenant + collection filter (used in every query)
CREATE INDEX IF NOT EXISTS idx_embeddings_tenant_collection
    ON embeddings(tenant_id, collection);

-- HNSW vector index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
    ON embeddings USING hnsw (embedding vector_cosine_ops);

-- ─── Agent Audit Logs ───────────────────────────────────
-- Every agent interaction is logged for transparency and debugging
CREATE TABLE IF NOT EXISTS agent_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    agent_name VARCHAR(50) NOT NULL,
    query TEXT,
    prompt TEXT,
    response TEXT,
    tool_calls JSONB DEFAULT '[]',
    tool_results JSONB DEFAULT '[]',
    tokens_used INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_tenant
    ON agent_audit_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_audit_agent
    ON agent_audit_logs(agent_name, created_at DESC);

-- ─── Agent Approval Queue ───────────────────────────────
-- When an agent recommends an action requiring human oversight,
-- it is queued here for staff to approve or reject.
CREATE TABLE IF NOT EXISTS agent_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    agent_name VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    proposed_action JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
    priority VARCHAR(20) DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
    created_by_user_id UUID, -- For correlation if trigged by a user chat
    reviewed_by_user_id UUID,
    reviewed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_tenant_status
    ON agent_approvals(tenant_id, status, created_at DESC);
