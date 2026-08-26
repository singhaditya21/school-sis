import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { requireApiAuth } from '@/lib/auth/api';
import { canAccessStudentDocument } from '@/lib/auth/document-access';
import { attachmentDisposition, fetchExternalPdf } from '@/lib/pdf/external';
import {
    loadReportCardForPdf,
    renderReportCardPdf,
    reportCardPdfFilename,
} from '@/lib/pdf/report-card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    try {
        const session = await getSession();
        const external = await fetchExternalPdf({
            path: `/api/v1/exams/report-cards/${studentId}/${termId}/pdf`,
            token: session.token ?? '',
            tenantId: auth.context.tenantId,
            label: 'Report Card PDF',
        });

        if (external) {
            return new NextResponse(external, {
                status: 200,
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': attachmentDisposition(`report-card-${studentId}.pdf`),
                    'Cache-Control': 'private, no-store',
                },
            });
        }

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

        const data = await loadReportCardForPdf(studentId, termId, auth.context.tenantId);
        if (!data) {
            return NextResponse.json(
                { error: 'No published report card exists for this student and term.' },
                { status: 404 },
            );
        }

        const pdf = renderReportCardPdf(data);
        return new NextResponse(new Uint8Array(pdf), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': attachmentDisposition(reportCardPdfFilename(data)),
                'Content-Length': String(pdf.byteLength),
                'Cache-Control': 'private, no-store',
            },
        });
    } catch (error) {
        console.error('[Report Card PDF] Error:', error);
        return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
    }
}
