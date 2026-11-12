'use server';

import { sqlFor, withTenant } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { resolveAiProvider } from '@/lib/ai/provider';
import { providerFetch } from '@/lib/providers/transport';
import {
    scoreAdmissionLeadPropensity,
    type LeadPropensityResult,
} from '@/lib/admissions/lead-scoring';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LeadCopilotBriefResponse {
    propensity: LeadPropensityResult;
    engineSource: string;
    aiTalkingPoints: string[];
}

export async function generateLeadAiCopilotBriefAction(
    leadId: string,
): Promise<{ data?: LeadCopilotBriefResponse; error?: string }> {
    const { tenantId } = await requireAuth('admissions:read');

    if (!UUID_RE.test(leadId)) {
        return { error: 'Invalid admission lead identifier.' };
    }

    const loaded = await withTenant(tenantId, async (client) => {
        const q = sqlFor(client);
        const [tenantRow, leadRow] = await Promise.all([
            q<{ name: string }>`
                SELECT name FROM tenants WHERE id = ${tenantId} LIMIT 1
            `.maybeOne(),
            q<{
                id: string;
                childFirstName: string;
                childLastName: string;
                childDob: string | null;
                applyingForGrade: string;
                parentName: string;
                parentEmail: string | null;
                parentPhone: string | null;
                source: string;
                stage: string;
                notes: string | null;
                previousSchool: string | null;
                createdAt: Date;
            }>`
                SELECT
                    id,
                    child_first_name AS "childFirstName",
                    child_last_name AS "childLastName",
                    child_dob AS "childDob",
                    applying_for_grade AS "applyingForGrade",
                    parent_name AS "parentName",
                    parent_email AS "parentEmail",
                    parent_phone AS "parentPhone",
                    source,
                    stage,
                    notes,
                    previous_school AS "previousSchool",
                    created_at AS "createdAt"
                FROM admission_leads
                WHERE id = ${leadId} AND tenant_id = ${tenantId}
                LIMIT 1
            `.maybeOne(),
        ]);

        if (!leadRow) return null;
        return {
            schoolName: tenantRow?.name || 'ScholarMind Campus',
            lead: leadRow,
        };
    });

    if (!loaded) {
        return { error: 'Admission lead not found in this campus.' };
    }

    const propensity = scoreAdmissionLeadPropensity(loaded.lead, loaded.schoolName);
    const provider = resolveAiProvider();

    if (!provider.configured) {
        return {
            data: {
                propensity,
                engineSource: 'DETERMINISTIC_PROPENSITY_ENGINE',
                aiTalkingPoints: propensity.talkingPoints,
            },
        };
    }

    try {
        const baseUrl = provider.config.baseURL.replace(/\/+$/, '');
        const response = await providerFetch(
            `${baseUrl}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${provider.config.apiKey}`,
                },
                body: JSON.stringify({
                    model: provider.config.model,
                    temperature: 0.3,
                    max_tokens: 220,
                    messages: [
                        {
                            role: 'system',
                            content:
                                'You are an Indian K-12 Admissions Counselor Copilot. Return exactly 3 concise, high-empathy counselor call talking points (one per line, no numbering, no PII beyond first name and grade).',
                        },
                        {
                            role: 'user',
                            content: `School: ${loaded.schoolName}. Scholar: ${loaded.lead.childFirstName}, applying for ${loaded.lead.applyingForGrade}. Stage: ${loaded.lead.stage}. Source: ${loaded.lead.source}. Propensity score: ${propensity.score}/99 (${propensity.tier}). Previous school: ${loaded.lead.previousSchool || 'Not specified'}.`,
                        },
                    ],
                }),
            },
            5000,
        );

        if (response.ok && response.json && typeof response.json === 'object') {
            const choices = (response.json as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
            const rawContent = choices?.[0]?.message?.content;
            if (typeof rawContent === 'string' && rawContent.trim().length > 10) {
                const lines = rawContent
                    .split('\n')
                    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
                    .filter((l) => l.length > 8)
                    .slice(0, 3);
                if (lines.length > 0) {
                    return {
                        data: {
                            propensity,
                            engineSource: provider.config.source,
                            aiTalkingPoints: lines,
                        },
                    };
                }
            }
        }
    } catch {
        // Gracefully fall back to deterministic talking points on timeout/rate-limit
    }

    return {
        data: {
            propensity,
            engineSource: 'DETERMINISTIC_PROPENSITY_ENGINE',
            aiTalkingPoints: propensity.talkingPoints,
        },
    };
}
