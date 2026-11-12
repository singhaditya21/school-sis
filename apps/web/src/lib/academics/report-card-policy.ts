import { sqlFor, withTenant } from '@/lib/db';
import { normalizeBoardPreset, type BoardPreset } from './board-grading';

export interface ReportCardStudioPolicy {
    schoolName: string;
    affiliationBoard: BoardPreset;
    affiliationNumber: string | null;
    udiseCode: string | null;
    holdOnOverdueFees: boolean;
    principalName: string;
    showCoScholastic: boolean;
}

const POLICY_OBJECT_NAME = 'report_card_policy';

export async function loadTenantReportCardPolicy(
    tenantId: string,
): Promise<ReportCardStudioPolicy> {
    return withTenant(tenantId, async (client) => {
        const q = sqlFor(client);

        const tenantRow = await q<{
            name: string;
            affiliationBoard: string | null;
            affiliationNumber: string | null;
            udiseCode: string | null;
        }>`
            SELECT
                name,
                affiliation_board AS "affiliationBoard",
                affiliation_number AS "affiliationNumber",
                udise_code AS "udiseCode"
            FROM tenants
            WHERE id = ${tenantId}
            LIMIT 1
        `.maybeOne();

        const policyRow = await q<{
            actionPayload: Record<string, unknown> | null;
            isActive: boolean;
        }>`
            SELECT
                action_payload AS "actionPayload",
                is_active AS "isActive"
            FROM metadata_workflows
            WHERE tenant_id = ${tenantId}
              AND object_name = ${POLICY_OBJECT_NAME}
            ORDER BY updated_at DESC
            LIMIT 1
        `.maybeOne();

        const payload = (policyRow?.actionPayload ?? {}) as Record<string, unknown>;
        const boardRaw =
            typeof payload.boardPreset === 'string'
                ? payload.boardPreset
                : tenantRow?.affiliationBoard;

        return {
            schoolName: tenantRow?.name ?? 'ScholarMind Campus',
            affiliationBoard: normalizeBoardPreset(boardRaw),
            affiliationNumber: tenantRow?.affiliationNumber ?? null,
            udiseCode: tenantRow?.udiseCode ?? null,
            holdOnOverdueFees: Boolean(payload.holdOnOverdueFees),
            principalName:
                typeof payload.principalName === 'string' && payload.principalName.trim()
                    ? payload.principalName.trim()
                    : 'Principal & Head of Institution',
            showCoScholastic:
                typeof payload.showCoScholastic === 'boolean' ? payload.showCoScholastic : true,
        };
    });
}

export interface ReportCardFeeHoldStatus {
    active: boolean;
    overdueAmount: number;
    overdueCount: number;
}

export async function evaluateStudentReportCardGovernance(
    tenantId: string,
    studentId: string,
): Promise<{
    policy: ReportCardStudioPolicy;
    feeHold: ReportCardFeeHoldStatus;
}> {
    const policy = await loadTenantReportCardPolicy(tenantId);
    if (!policy.holdOnOverdueFees) {
        return {
            policy,
            feeHold: { active: false, overdueAmount: 0, overdueCount: 0 },
        };
    }

    const arrears = await withTenant(tenantId, async (client) => {
        const q = sqlFor(client);
        return q<{
            overdueCount: number;
            overdueAmount: string | number;
        }>`
            SELECT
                COUNT(*)::int AS "overdueCount",
                COALESCE(SUM(GREATEST(total_amount - paid_amount, 0)), 0)::numeric AS "overdueAmount"
            FROM invoices
            WHERE tenant_id = ${tenantId}
              AND student_id = ${studentId}
              AND status NOT IN ('PAID', 'CANCELLED', 'WAIVED', 'DRAFT')
              AND due_date < CURRENT_DATE
              AND (total_amount - paid_amount) > 0
        `.maybeOne();
    });

    const overdueCount = Number(arrears?.overdueCount ?? 0);
    const overdueAmount = Number(arrears?.overdueAmount ?? 0);

    return {
        policy,
        feeHold: {
            active: overdueCount > 0 && overdueAmount > 0,
            overdueAmount,
            overdueCount,
        },
    };
}

export async function saveTenantReportCardPolicy(
    tenantId: string,
    input: {
        boardPreset: BoardPreset;
        holdOnOverdueFees: boolean;
        principalName: string;
        showCoScholastic: boolean;
    },
): Promise<void> {
    const cleanPrincipal =
        input.principalName.trim().slice(0, 120) || 'Principal & Head of Institution';
    const payloadJson = JSON.stringify({
        boardPreset: input.boardPreset,
        holdOnOverdueFees: Boolean(input.holdOnOverdueFees),
        principalName: cleanPrincipal,
        showCoScholastic: Boolean(input.showCoScholastic),
    });

    await withTenant(tenantId, async (client) => {
        const q = sqlFor(client);

        await q`
            UPDATE tenants
            SET affiliation_board = ${input.boardPreset},
                updated_at = NOW()
            WHERE id = ${tenantId}
        `.execute();

        const existing = await q<{ id: string }>`
            SELECT id
            FROM metadata_workflows
            WHERE tenant_id = ${tenantId}
              AND object_name = ${POLICY_OBJECT_NAME}
            ORDER BY updated_at DESC
            LIMIT 1
        `.maybeOne();

        if (existing) {
            await q`
                UPDATE metadata_workflows
                SET action_payload = ${payloadJson}::jsonb,
                    is_active = true,
                    updated_at = NOW()
                WHERE id = ${existing.id}
                  AND tenant_id = ${tenantId}
            `.execute();
        } else {
            await q`
                INSERT INTO metadata_workflows (
                    tenant_id,
                    name,
                    object_name,
                    trigger_event,
                    conditions,
                    action_type,
                    action_payload,
                    is_active
                ) VALUES (
                    ${tenantId},
                    'Report Card Studio Policy',
                    ${POLICY_OBJECT_NAME},
                    'ON_REPORT_CARD_VIEW',
                    '[]'::jsonb,
                    'REPORT_CARD_GOVERNANCE',
                    ${payloadJson}::jsonb,
                    true
                )
            `.execute();
        }
    });
}
