import React from 'react';
import { requireRole } from '@/lib/auth/middleware';
import { UserRole } from '@/lib/rbac/permissions';
import { db, setTenantContext } from '@/lib/db';
import { aiTokenLogs } from '@/lib/db/schema/platform';
import { sql, sum, count } from 'drizzle-orm';
import AIGovernanceClient from './client-page';

export const metadata = {
    title: 'AI Governance | ScholarMind HQ',
};

export default async function AIGovernancePage() {
    await requireRole(UserRole.PLATFORM_ADMIN, UserRole.SUPER_ADMIN);
    // Note: platform queries use platform context (where applicable) but aiTokenLogs is cross-tenant globally
    await setTenantContext('platform');

    // Aggregate by Model
    const modelAggregates = await db.execute(sql`
        SELECT 
            model, 
            SUM(tokens_used)::int as total_tokens, 
            SUM(query_cost_usd) as total_cost 
        FROM ai_token_logs 
        GROUP BY model
    `);

    // Aggregate by Agent Type
    const agentAggregates = await db.execute(sql`
        SELECT 
            agent_type, 
            SUM(tokens_used)::int as total_tokens,
            COUNT(*) as request_count 
        FROM ai_token_logs 
        GROUP BY agent_type
    `);

    const totalTokens = (modelAggregates as any[]).reduce((a, b) => a + Number(b.total_tokens), 0);
    const totalCost = (modelAggregates as any[]).reduce((a, b) => a + Number(b.total_cost), 0);
    
    return <AIGovernanceClient 
        modelData={modelAggregates as any[]} 
        agentData={agentAggregates as any[]}
        kpis={{ totalTokens, totalCost }}
    />;
}
