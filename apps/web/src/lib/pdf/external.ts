/**
 * Optional external renderer.
 *
 * PDFs are generated natively and no external service is required. If
 * PDF_SERVICE_URL is set, it is tried first as an override — the deployment has
 * deliberately pointed at its own renderer. Anything other than a clean 2xx PDF
 * response falls through to native generation rather than failing the request.
 */
export async function fetchExternalPdf(options: {
    path: string;
    token: string;
    tenantId: string;
    label: string;
}): Promise<ArrayBuffer | null> {
    const base = process.env.PDF_SERVICE_URL;
    if (!base) return null;

    try {
        const response = await fetch(`${base.replace(/\/+$/, '')}${options.path}`, {
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
