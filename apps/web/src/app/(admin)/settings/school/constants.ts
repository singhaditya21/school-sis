/**
 * Shared, non-action constants for the school profile screen.
 *
 * These cannot live in `actions.ts` because every export of a `'use server'`
 * module must be an async function.
 */

/** Mirrors the `institution_type` enum in the database. */
export const INSTITUTION_TYPES = [
    'K12',
    'COLLEGE',
    'UNIVERSITY',
    'COACHING',
    'HYBRID',
] as const;

export type InstitutionType = (typeof INSTITUTION_TYPES)[number];

export const INSTITUTION_TYPE_LABELS: Record<InstitutionType, string> = {
    K12: 'K-12 School',
    COLLEGE: 'College',
    UNIVERSITY: 'University',
    COACHING: 'Coaching Institute',
    HYBRID: 'Hybrid / Multi-format',
};

export function isInstitutionType(value: string): value is InstitutionType {
    return (INSTITUTION_TYPES as readonly string[]).includes(value);
}
