import { getDeniedFields } from '@school-sis/api/src/authorization/evaluator';

/**
 * Enforce AUTHORIZATION_FIELD_POLICIES on a row a role is about to be shown.
 *
 * Those policies mark student Aadhaar/DOB/medical/address, guardian contact,
 * staff salary and so on as registrar- or finance-grade — but nothing enforced
 * them: getDeniedFields / canAccessField had no callers, so a TEACHER opening a
 * pupil's record saw their date of birth, blood group, address and the
 * guardians' phone and email. This is the enforcement point.
 *
 * A denied field is nulled rather than dropped, so the shape a caller expects is
 * preserved and the UI renders an empty field instead of breaking.
 */
export function maskDeniedFields<T extends Record<string, unknown>>(
    role: string,
    resource: string,
    row: T,
): T {
    const denied = getDeniedFields({ role }, resource, 'read', Object.keys(row));
    if (denied.length === 0) return row;
    const masked: Record<string, unknown> = { ...row };
    for (const field of denied) masked[field] = null;
    return masked as T;
}
