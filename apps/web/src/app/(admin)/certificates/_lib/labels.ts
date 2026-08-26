/**
 * Shared, dependency-free labels for the certificate module.
 *
 * Kept out of the 'use server' action modules on purpose: a 'use server' file
 * may only export async functions, and both server and client components need
 * these values.
 */

/** Mirrors the Postgres `certificate_type` enum. Order is the display order. */
export const CERTIFICATE_TYPES = [
    'TRANSFER',
    'CHARACTER',
    'BONAFIDE',
    'MIGRATION',
    'REPORT_CARD',
    'MARKSHEET',
    'CUSTOM',
] as const;

export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export const CERTIFICATE_TYPE_LABELS: Record<string, string> = {
    TRANSFER: 'Transfer certificate',
    CHARACTER: 'Character certificate',
    BONAFIDE: 'Bonafide certificate',
    MIGRATION: 'Migration certificate',
    REPORT_CARD: 'Report card',
    MARKSHEET: 'Marksheet',
    CUSTOM: 'Other',
};

/**
 * Prefix used when allocating a certificate number. Changing these changes the
 * numbering of certificates issued from now on, not of ones already issued.
 */
export const CERTIFICATE_TYPE_PREFIX: Record<string, string> = {
    TRANSFER: 'TC',
    CHARACTER: 'CC',
    BONAFIDE: 'BC',
    MIGRATION: 'MC',
    REPORT_CARD: 'RC',
    MARKSHEET: 'MS',
    CUSTOM: 'GC',
};

/** Mirrors the Postgres `certificate_status` enum. */
export const CERTIFICATE_STATUSES = ['DRAFT', 'ISSUED', 'REVOKED'] as const;

export function certificateTypeLabel(type: string | null | undefined): string {
    if (!type) return 'Unknown type';
    return CERTIFICATE_TYPE_LABELS[type] ?? type;
}

export function certificateStatusClass(status: string): string {
    switch (status) {
        case 'ISSUED':
            return 'bg-green-100 text-green-800';
        case 'REVOKED':
            return 'bg-red-100 text-red-800';
        case 'DRAFT':
            return 'bg-amber-100 text-amber-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

/** Renders a date-only value without dragging it through a timezone. */
export function formatDate(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const iso = typeof value === 'string' ? value : value.toISOString();
    const [datePart] = iso.split('T');
    const [year, month, day] = datePart.split('-');
    if (!year || !month || !day) return iso;
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

export function formatDateTime(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function fullName(first?: string | null, last?: string | null): string {
    return [first, last].filter(Boolean).join(' ').trim();
}
