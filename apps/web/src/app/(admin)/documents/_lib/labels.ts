/**
 * `student_documents.document_type` is free text (varchar 100). These are the
 * types offered in the picker; anything already in the database is shown as it
 * was stored, whether or not it appears here.
 */
export const COMMON_DOCUMENT_TYPES = [
    'Birth certificate',
    'Aadhaar card',
    'Transfer certificate',
    'Previous marksheet',
    'Report card',
    'Caste certificate',
    'Income certificate',
    'Address proof',
    'Medical record',
    'Passport photograph',
    'Guardian ID proof',
] as const;

export function formatFileSize(bytes: number | null | undefined): string {
    if (bytes == null || bytes <= 0) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
