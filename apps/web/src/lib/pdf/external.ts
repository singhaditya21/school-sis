/**
 * Optional external renderer.
 *
 * PDFs are generated natively and no external service is required. If
 * PDF_SERVICE_URL is set, it is tried first as an override — the deployment has
 * deliberately pointed at its own renderer. Anything other than a clean 2xx PDF
 * response falls through to native generation rather than failing the request.
 */
export function buildSafeExternalPdfUrl(base: string, rawPath: string): URL | null {
    if (!base || !rawPath || !rawPath.startsWith('/')) return null;
    if (
        rawPath.includes('\\') ||
        rawPath.includes('\0') ||
        rawPath.includes('//') ||
        rawPath.includes('?') ||
        rawPath.includes('#')
    ) {
        return null;
    }

    let baseUrl: URL;
    try {
        baseUrl = new URL(base);
    } catch {
        return null;
    }

    const rawSegments = rawPath.slice(1).split('/');
    if (rawSegments.length === 0) return null;

    const encodedSegments: string[] = [];
    for (const rawSegment of rawSegments) {
        if (!rawSegment || rawSegment === '.' || rawSegment === '..') {
            return null;
        }
        let decoded: string;
        try {
            decoded = decodeURIComponent(rawSegment);
        } catch {
            return null;
        }
        if (
            !decoded ||
            decoded === '.' ||
            decoded === '..' ||
            decoded.includes('/') ||
            decoded.includes('\\') ||
            decoded.includes('\0')
        ) {
            return null;
        }
        encodedSegments.push(encodeURIComponent(decoded));
    }

    const basePath = baseUrl.pathname.replace(/\/+$/, '');
    const targetUrl = new URL(`${basePath}/${encodedSegments.join('/')}`, baseUrl.origin);
    if (targetUrl.origin !== new URL(base).origin || targetUrl.search !== '' || targetUrl.hash !== '') {
        return null;
    }

    return targetUrl;
}

export async function fetchExternalPdf(options: {
    path: string;
    token: string;
    tenantId: string;
    label: string;
}): Promise<ArrayBuffer | null> {
    const base = process.env.PDF_SERVICE_URL;
    if (!base) return null;

    const targetUrl = buildSafeExternalPdfUrl(base, options.path);
    if (!targetUrl) {
        console.warn(`[${options.label}] Rejected unsafe external PDF path; using native generation.`);
        return null;
    }

    try {
        const response = await fetch(targetUrl.toString(), {
            headers: {
                Authorization: `Bearer ${options.token}`,
                'X-Tenant-Id': options.tenantId,
                Accept: 'application/pdf',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            console.warn(
                `[${options.label}] PDF_SERVICE_URL returned ${response.status}; using native generation.`,
            );
            return null;
        }

        const buffer = await response.arrayBuffer();
        if (buffer.byteLength === 0) {
            console.warn(`[${options.label}] PDF_SERVICE_URL returned an empty body; using native generation.`);
            return null;
        }
        return buffer;
    } catch (error) {
        console.warn(`[${options.label}] PDF_SERVICE_URL unreachable; using native generation.`, error);
        return null;
    }
}

/** RFC 5987-safe Content-Disposition value for an attachment. */
export function attachmentDisposition(filename: string): string {
    const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
