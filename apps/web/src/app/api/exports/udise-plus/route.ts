import { NextRequest, NextResponse } from 'next/server';
import { runWithTenantContext, sql } from '@/lib/db';
import { requireApiPermission } from '@/lib/auth/api';
import { sanitizeCsvValue } from '@/lib/utils/csv-sanitize';
import { logger } from '@/lib/observability/logger';
import {
    requireApprovedWorkflowApprovalOrRequest,
    toWorkflowApprovalSummary,
    WorkflowApprovalError,
} from '@school-sis/api';
import type { AuthorizationRole } from '@school-sis/api';

export const dynamic = "force-dynamic";

/**
 * UDISE+ CSV Export Endpoint
 *
 * Generates a CSV file in the UDISE+ (Unified District Information System for Education)
 * format required by the Government of India for annual school data submission.
 *
 * GET /api/exports/udise-plus
 */

export async function GET(request: NextRequest) {
    const auth = await requireApiPermission('reports:export');
    if (auth.ok === false) return auth.response;

    const tenantId = auth.context.tenantId;
    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason') || undefined;
    const approvalRequestId = searchParams.get('approvalRequestId') || undefined;

    if (!reason?.trim()) {
        return NextResponse.json({ error: 'UDISE+ export requires an audit reason.' }, { status: 400 });
    }

    try {
        const approval = await requireApprovedWorkflowApprovalOrRequest({
            approvalRequestId,
            policyId: 'data.export_pii',
            tenantId,
            title: 'Approve UDISE+ export',
            description: 'UDISE+ export contains aggregate and student-derived institutional data.',
            resource: {
                type: 'bi_export',
                id: 'exports.udise_plus:annual',
                tenantId,
            },
            payload: {
                exportPolicyId: 'exports.udise_plus',
                format: 'csv',
                reason,
            },
            reason,
            requestedBy: {
                userId: auth.context.userId,
                role: auth.context.role as AuthorizationRole,
                tenantId,
            },
        });

        if (!approval.approved) {
            return NextResponse.json({
                approvalRequired: true,
                approval: toWorkflowApprovalSummary(approval.request),
            }, { status: 202 });
        }

        const { school, studentData, totalTeachers } = await runWithTenantContext(tenantId, async () => {
            const schoolRows = await sql<{
                code: string | null;
                name: string | null;
                state: string | null;
                city: string | null;
                udiseCode: string | null;
                affiliationBoard: string | null;
            }>`
                SELECT code,
                       name,
                       state,
                       city,
                       udise_code AS "udiseCode",
                       affiliation_board AS "affiliationBoard"
                FROM tenants
                WHERE id = ${tenantId}
                LIMIT 1
            `;

            const gradeRows = await sql<Record<string, unknown>>`
                SELECT
                    g.name AS grade_name,
                    g.numeric_value AS grade_number,
                    COUNT(*) FILTER (WHERE s.gender = 'MALE') AS boys,
                    COUNT(*) FILTER (WHERE s.gender = 'FEMALE') AS girls,
                    COUNT(*) FILTER (WHERE s.category = 'SC') AS sc_count,
                    COUNT(*) FILTER (WHERE s.category = 'ST') AS st_count,
                    COUNT(*) FILTER (WHERE s.category = 'OBC') AS obc_count,
                    COUNT(*) FILTER (WHERE s.category = 'GENERAL') AS general_count,
                    COUNT(*) AS total
                FROM students s
                JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = ${tenantId}
                JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = ${tenantId}
                WHERE s.tenant_id = ${tenantId} AND s.status = 'ACTIVE'
                GROUP BY g.name, g.numeric_value, g.display_order
                ORDER BY g.display_order ASC
            `;

            const teacherRows = await sql<{ total_teachers: string | number }>`
                SELECT COUNT(*) AS total_teachers
                FROM users
                WHERE tenant_id = ${tenantId} AND role = 'TEACHER' AND is_active = true
            `;

            return {
                school: schoolRows[0] ?? null,
                studentData: gradeRows,
                totalTeachers: teacherRows[0]?.total_teachers ?? 0,
            };
        });

        if (!school) {
            return NextResponse.json({ error: 'School not found' }, { status: 404 });
        }

        const headers = [
            'UDISE Code', 'School Name', 'State', 'District', 'Affiliation Board',
            'Grade', 'Boys', 'Girls', 'Total',
            'SC', 'ST', 'OBC', 'General',
            'Total Teachers',
        ];
        const rows: string[] = [headers.map(h => sanitizeCsvValue(h)).join(',')];

        for (const row of studentData) {
            rows.push([
                school.udiseCode || '',
                school.name || '',
                school.state || '',
                school.city || '',
                school.affiliationBoard || '',
                row.grade_name,
                row.boys,
                row.girls,
                row.total,
                row.sc_count,
                row.st_count,
                row.obc_count,
                row.general_count,
                totalTeachers,
            ].map(cell => sanitizeCsvValue(cell)).join(','));
        }

        const csv = rows.join('\n');
        const safeCode = String(school.code || 'school').replace(/[^a-zA-Z0-9_-]/g, '_') || 'school';

        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="udise_plus_${safeCode}_${new Date().toISOString().slice(0, 10)}.csv"`,
            },
        });
    } catch (error: unknown) {
        if (error instanceof WorkflowApprovalError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        logger.error('udise_export.failed', 'UDISE+ export failed', {
            tenantId,
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return NextResponse.json({ error: 'Failed to generate UDISE+ export' }, { status: 500 });
    }
}
