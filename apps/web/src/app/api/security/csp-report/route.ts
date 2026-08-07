import { NextResponse } from 'next/server';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { logger, requestContextFrom } from '@/lib/observability/logger';

const MAX_REPORT_BYTES = 16 * 1024;
const MAX_REPORTS_PER_REQUEST = 10;

type BoundedBodyResult =
    | { ok: true; text: string }
    | { ok: false };

function clientIpFrom(request: Request): string {
    return (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown')
        .split(',')[0]
        .trim()
        .toLowerCase() || 'unknown';
}

function objectValue(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function boundedString(value: unknown, maxLength = 500): string | null {
    return typeof value === 'string' && value
        ? value.slice(0, maxLength)
        : null;
}

function sanitizedReportUrl(value: unknown): string | null {
    const bounded = boundedString(value);
    if (!bounded) return null;

    try {
        const parsed = new URL(bounded);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return `${parsed.origin}${parsed.pathname}`.slice(0, 500);
        }
        return parsed.protocol.slice(0, 32);
    } catch {
        return bounded.split(/[?#]/, 1)[0].slice(0, 500);
    }
}

function normalizedReport(value: unknown): Record<string, unknown> | null {
    const envelope = objectValue(value);
    if (!envelope) return null;

    const report = objectValue(envelope['csp-report']) || objectValue(envelope.body) || envelope;
    return {
        documentUri: sanitizedReportUrl(report['document-uri'] ?? report.documentURL),
        violatedDirective: boundedString(report['violated-directive'] ?? report.effectiveDirective, 200),
        blockedUri: sanitizedReportUrl(report['blocked-uri'] ?? report.blockedURL),
        sourceFile: sanitizedReportUrl(report['source-file'] ?? report.sourceFile),
        disposition: boundedString(report.disposition, 32),
        statusCode: report['status-code'] ?? report.statusCode ?? null,
        lineNumber: report['line-number'] ?? report.lineNumber ?? null,
        columnNumber: report['column-number'] ?? report.columnNumber ?? null,
    };
}

async function readBoundedBody(request: Request): Promise<BoundedBodyResult> {
    if (!request.body) return { ok: true, text: '' };

    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let bytesRead = 0;
    let text = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            bytesRead += value.byteLength;
            if (bytesRead > MAX_REPORT_BYTES) {
                await reader.cancel().catch(() => undefined);
                return { ok: false };
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        return { ok: true, text };
    } finally {
        reader.releaseLock();
    }
}

export async function POST(request: Request) {
    try {
        const rateLimitError = await consumeRateLimit(clientIpFrom(request), {
            scope: 'csp_report_ip',
            maxAttempts: 120,
            degradedMaxAttempts: 1,
            endpointClass: 'public-write',
            message: 'Too many CSP reports.',
        });
        if (rateLimitError) {
            return NextResponse.json({ error: rateLimitError }, { status: 429 });
        }

        const declaredLength = Number(request.headers.get('content-length') || '0');
        if (Number.isFinite(declaredLength) && declaredLength > MAX_REPORT_BYTES) {
            return NextResponse.json({ error: 'CSP report is too large.' }, { status: 413 });
        }

        const boundedBody = await readBoundedBody(request);
        if (!boundedBody.ok) {
            return NextResponse.json({ error: 'CSP report is too large.' }, { status: 413 });
        }
        const rawBody = boundedBody.text;

        let payload: unknown;
        try {
            payload = JSON.parse(rawBody);
        } catch {
            return NextResponse.json({ error: 'Invalid CSP report.' }, { status: 400 });
        }

        const reports = (Array.isArray(payload) ? payload : [payload])
            .slice(0, MAX_REPORTS_PER_REQUEST)
            .map(normalizedReport)
            .filter((report): report is Record<string, unknown> => report !== null);

        if (reports.length === 0) {
            return NextResponse.json({ error: 'Invalid CSP report.' }, { status: 400 });
        }

        const requestContext = requestContextFrom(request);
        for (const report of reports) {
            logger.warn('security.csp_violation', 'Browser reported a Content Security Policy violation', {
                ...requestContext,
                source: 'csp-report',
                metadata: report,
            });
        }

        return new NextResponse(null, {
            status: 204,
            headers: {
                'Cache-Control': 'no-store',
            },
        });
    } catch (error) {
        // Reporting is best-effort. A telemetry backend failure must not make a
        // browser retry violations indefinitely or affect application traffic.
        logger.warn('security.csp_report_failed', 'CSP report ingestion failed', {
            ...requestContextFrom(request),
            source: 'csp-report',
            metadata: {
                error: error instanceof Error ? error.message : String(error),
            },
        });
        return new NextResponse(null, { status: 204 });
    }
}
