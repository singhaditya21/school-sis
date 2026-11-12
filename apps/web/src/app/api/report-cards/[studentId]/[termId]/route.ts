import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { requireApiAuth } from '@/lib/auth/api';
import { canAccessStudentDocument } from '@/lib/auth/document-access';
import { withTenant } from '@/lib/db';
import { evaluateStudentReportCardGovernance } from '@/lib/academics/report-card-policy';
import { attachmentDisposition, fetchExternalPdf } from '@/lib/pdf/external';
import {
    loadReportCardForPdf,
    renderReportCardPdf,
    reportCardPdfFilename,
} from '@/lib/pdf/report-card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Report card PDF, generated in-process with jsPDF. No external renderer is
 * required; PDF_SERVICE_URL is honoured only as an override when a deployment
 * sets it.
 *
 * `termId` accepts either a `terms` row — every published exam starting inside
 * the term — or a single published exam id. Only exams with status PUBLISHED
 * are ever read, so a draft mark sheet cannot leave as a PDF; when nothing
 * published matches, the route answers 404.
 */
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ studentId: string; termId: string }> }
) {
    const { studentId, termId } = await params;
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    if (!UUID_RE.test(studentId) || !UUID_RE.test(termId)) {
        return NextResponse.json(
            { error: 'Invalid studentId or termId' },
            { status: 400 },
        );
    }

    try {
        // requireApiAuth only proves a session in this tenant. Without this, any
        // signed-in parent or student could pull another child's report card.
        const allowed = await canAccessStudentDocument({
            tenantId: auth.context.tenantId,
            userId: auth.context.userId,
            role: auth.context.role,
            studentId,
            staffPermission: 'exams:read',
        });
        if (!allowed) {
            return NextResponse.json(
                { error: 'No published report card exists for this student and term.' },
                { status: 404 },
            );
        }

        if (
            (auth.context.role === 'PARENT' || auth.context.role === 'STUDENT') &&
            typeof withTenant === 'function'
        ) {
            const governance = await evaluateStudentReportCardGovernance(
                auth.context.tenantId,
                studentId,
            );
            if (governance.feeHold.active) {
                return NextResponse.json(
                    {
                        error: 'Official report card download is currently on hold pending overdue fee clearance.',
                        feeHold: governance.feeHold,
                    },
                    { status: 402 },
                );
            }
        }

        const data = await loadReportCardForPdf(studentId, termId, auth.context.tenantId);
        if (!data) {
            return NextResponse.json(
                { error: 'No published report card exists for this student and term.' },
                { status: 404 },
            );
        }

        const filename = reportCardPdfFilename(data);
        const session = await getSession();
        const external = await fetchExternalPdf({
            path: `/api/v1/exams/report-cards/${encodeURIComponent(studentId)}/${encodeURIComponent(termId)}/pdf`,
            token: session.token ?? '',
            tenantId: auth.context.tenantId,
            label: 'Report Card PDF',
        });

        if (external) {
            return new NextResponse(external, {
                status: 200,
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': attachmentDisposition(filename),
                    'Cache-Control': 'private, no-store',
                },
            });
        }

        const pdf = renderReportCardPdf(data);
        return new NextResponse(new Uint8Array(pdf), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': attachmentDisposition(filename),
                'Content-Length': String(pdf.byteLength),
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        console.error('[Report Card PDF] Error:', error);
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
    }
}
