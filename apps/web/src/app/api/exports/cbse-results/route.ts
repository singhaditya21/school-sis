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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * CBSE Board Results Export
 *
 * Generates CSV in CBSE LOC (List of Candidates) format
 * required for board exam registration and result submission.
 *
 * GET /api/exports/cbse-results?examId={examId}
 */

export async function GET(request: NextRequest) {
    const auth = await requireApiPermission('reports:export');
    if (auth.ok === false) return auth.response;

    const tenantId = auth.context.tenantId;
    const { searchParams } = new URL(request.url);
    const examId = searchParams.get('examId');
    const reason = searchParams.get('reason') || undefined;
    const approvalRequestId = searchParams.get('approvalRequestId') || undefined;

    if (examId && !UUID_RE.test(examId)) {
        return NextResponse.json({ error: 'Invalid examId format.' }, { status: 400 });
    }

    if (!reason?.trim()) {
        return NextResponse.json({ error: 'CBSE results export requires an audit reason.' }, { status: 400 });
    }

    try {
        const approval = await requireApprovedWorkflowApprovalOrRequest({
            approvalRequestId,
            policyId: 'data.export_pii',
            tenantId,
            title: 'Approve CBSE results export',
            description: 'CBSE results export contains student academic PII and requires workflow approval.',
            resource: {
                type: 'bi_export',
                id: examId ? `exports.cbse_results:${examId}` : 'exports.cbse_results:all',
                tenantId,
            },
            payload: {
                exportPolicyId: 'exports.cbse_results',
                format: 'csv',
                examId: examId ?? null,
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

        const { data, tenantCode } = await runWithTenantContext(tenantId, async () => {
            const resultRows = await sql<Record<string, unknown>>`
                SELECT
                    s.admission_number AS "Roll Number",
                    s.first_name || ' ' || s.last_name AS "Candidate Name",
                    s.gender AS "Gender",
                    s.date_of_birth AS "DOB",
                    s.category AS "Category",
                    g.name AS "Class",
                    sub.name AS "Subject",
                    sub.code AS "Subject Code",
                    er.marks_obtained AS "Marks Obtained",
                    es.max_marks AS "Total Marks",
                    er.grade AS "Grade"
                FROM student_results er
                JOIN exam_schedules es ON es.id = er.exam_schedule_id
                JOIN subjects sub ON sub.id = es.subject_id AND sub.tenant_id = ${tenantId}
                JOIN exams e ON e.id = es.exam_id AND e.tenant_id = ${tenantId}
                JOIN students s ON s.id = er.student_id AND s.tenant_id = ${tenantId}
                LEFT JOIN sections sec ON sec.id = s.section_id AND sec.tenant_id = ${tenantId}
                LEFT JOIN grades g ON g.id = sec.grade_id AND g.tenant_id = ${tenantId}
                WHERE er.tenant_id = ${tenantId}
                  AND (${examId ?? null}::uuid IS NULL OR e.id = ${examId ?? null}::uuid)
                ORDER BY g.display_order, s.admission_number, sub.name
            `;

            const tenants = await sql<{ code: string | null }>`
                SELECT code FROM tenants WHERE id = ${tenantId} LIMIT 1
            `;
            return {
                data: resultRows,
                tenantCode: tenants[0]?.code || 'export',
            };
        });

        if (data.length === 0) {
            return NextResponse.json({ error: 'No results found' }, { status: 404 });
        }

        const columns = ['Roll Number', 'Candidate Name', 'Gender', 'DOB', 'Category', 'Class', 'Subject', 'Subject Code', 'Marks Obtained', 'Total Marks', 'Grade'];
        const rows = [columns.map(col => sanitizeCsvValue(col)).join(',')];

        for (const row of data) {
            rows.push(columns.map(col => sanitizeCsvValue(row[col])).join(','));
        }

        const safeTenantCode = String(tenantCode).replace(/[^a-zA-Z0-9_-]/g, '_') || 'export';

        return new NextResponse(rows.join('\n'), {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="cbse_results_${safeTenantCode}_${new Date().toISOString().slice(0, 10)}.csv"`,
            },
        });
    } catch (error: unknown) {
        if (error instanceof WorkflowApprovalError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        logger.error('cbse_export.failed', 'CBSE results export failed', {
            tenantId,
            metadata: { error: error instanceof Error ? error.message : String(error) },
        });
        return NextResponse.json({ error: 'Export failed' }, { status: 500 });
    }
}
