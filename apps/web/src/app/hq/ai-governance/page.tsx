import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { pool, } from '@/lib/db';
import AIGovernanceClient from './client-page';

interface ModelAggregateRow {
    model: string;
    total_tokens: number;
    total_cost: string;
}

interface AgentAggregateRow {
    agent_type: string;
    total_tokens: number;
    request_count: string;
}

export const metadata = {
    title: 'AI Governance | ScholarMind HQ',
};

export default async function AIGovernancePage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    // Note: platform queries use platform context (where applicable) but aiTokenLogs is cross-tenant globally
    await ('platform');

    // Aggregate by Model
    const { rows: modelAggregates } = await pool.query(`
        SELECT 
            model, 
            SUM(tokens_used)::int as total_tokens, 
            SUM(query_cost_usd) as total_cost 
        FROM ai_token_logs 
        GROUP BY model
    `);

    // Aggregate by Agent Type
    const { rows: agentAggregates } = await pool.query(`
        SELECT 
            agent_type, 
            SUM(tokens_used)::int as total_tokens,
            COUNT(*) as request_count 
        FROM ai_token_logs 
        GROUP BY agent_type
    `);

    const totalTokens = (modelAggregates as ModelAggregateRow[]).reduce((a, b) => a + Number(b.total_tokens), 0);
    const totalCost = (modelAggregates as ModelAggregateRow[]).reduce((a, b) => a + Number(b.total_cost), 0);
    
    return <AIGovernanceClient
        modelData={modelAggregates as ModelAggregateRow[]}
        agentData={agentAggregates as AgentAggregateRow[]}
        kpis={{ totalTokens, totalCost }}
    />;
}
