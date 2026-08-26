/**
 * Shared types and pure helpers for consent management.
 * Kept out of `actions.ts` because a `'use server'` module may only export
 * async functions.
 */

/** Mirrors the `consent_response` enum. Only these two values exist. */
export const CONSENT_RESPONSES = ['ACCEPTED', 'DECLINED'] as const;
export type ConsentResponse = (typeof CONSENT_RESPONSES)[number];

/**
 * `consent_forms.audience` is a free varchar, not an enum, and nothing in the schema
 * joins it to a cohort. These are the values this UI writes; older rows may hold
 * anything else and are displayed verbatim.
 */
export const CONSENT_AUDIENCES = ['ALL', 'STUDENTS', 'PARENTS', 'STAFF'] as const;

/** Common Indian-school consent categories. `form_type` is free text, so this is a convenience list. */
export const CONSENT_FORM_TYPES = [
    'FIELD_TRIP',
    'MEDICAL',
    'PHOTO_RELEASE',
    'TRANSPORT',
    'SPORTS',
    'DATA_PRIVACY',
    'OTHER',
] as const;

export type ConsentForm = {
    id: string;
    title: string;
    description: string | null;
    formType: string;
    audience: string;
    /** ISO date `YYYY-MM-DD`, or null. */
    dueDate: string | null;
    isActive: boolean;
    createdAt: string;
    responseCount: number;
    acceptedCount: number;
    declinedCount: number;
};

export type ConsentResponseRow = {
    id: string;
    studentId: string;
    studentName: string;
    admissionNumber: string;
    className: string;
    respondentName: string | null;
    response: ConsentResponse;
    respondedAt: string;
    notes: string | null;
};

export type ConsentStats = {
    totalForms: number;
    activeForms: number;
    overdueForms: number;
    totalResponses: number;
    accepted: number;
    declined: number;
};

export type StudentOption = {
    id: string;
    name: string;
    admissionNumber: string;
    className: string;
};

export type ActionResult = { success: boolean; error?: string };

export function isConsentResponse(value: string): value is ConsentResponse {
    return (CONSENT_RESPONSES as readonly string[]).includes(value);
}

export function humanise(value: string): string {
    return value
        .split('_')
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(' ');
}

export function formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function isOverdue(form: ConsentForm, todayIso: string): boolean {
    return Boolean(form.isActive && form.dueDate && form.dueDate < todayIso);
}
