export const LEAD_CONSENT_VERSION = 'privacy-2026-09-10';

const ALLOWED_STUDENT_CAPACITIES = new Set([500, 1500, 5000, 10000]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MINIMUM_FORM_AGE_MS = 1_200;
const MAXIMUM_FORM_AGE_MS = 4 * 60 * 60 * 1000;

export type LeadIntake = {
    contactName: string;
    contactEmail: string;
    schoolName: string;
    studentCapacity: number;
    painPoints: string | null;
    consentVersion: string;
    sourceUrl: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
};

export type LeadIntakeParseResult =
    | { success: true; data: LeadIntake }
    | { success: false; error: string; bot: boolean };

function value(formData: FormData, name: string, maxLength: number): string {
    return String(formData.get(name) || '').trim().slice(0, maxLength);
}

function optionalUrl(rawValue: string): string | null {
    if (!rawValue) return null;
    try {
        const parsed = new URL(rawValue);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:'
            ? parsed.toString().slice(0, 2_000)
            : null;
    } catch {
        return null;
    }
}

export function parseLeadIntake(formData: FormData, now = Date.now()): LeadIntakeParseResult {
    if (value(formData, 'companyWebsite', 1_000)) {
        return { success: false, error: 'Submission accepted.', bot: true };
    }

    const startedAt = Number(value(formData, 'startedAt', 32));
    const formAge = now - startedAt;
    if (!Number.isSafeInteger(startedAt) || formAge < MINIMUM_FORM_AGE_MS || formAge > MAXIMUM_FORM_AGE_MS) {
        return { success: false, error: 'Please refresh the form and try again.', bot: true };
    }

    const contactName = value(formData, 'contactName', 255);
    const contactEmail = value(formData, 'contactEmail', 320).toLowerCase();
    const schoolName = value(formData, 'schoolName', 255);
    const studentCapacity = Number(value(formData, 'studentCapacity', 20));
    const painPoints = value(formData, 'painPoints', 5_000) || null;
    const privacyConsent = value(formData, 'privacyConsent', 16);

    if (contactName.length < 2 || schoolName.length < 2 || !EMAIL_PATTERN.test(contactEmail)) {
        return { success: false, error: 'Enter a valid name, work email, and institution.', bot: false };
    }
    if (!ALLOWED_STUDENT_CAPACITIES.has(studentCapacity)) {
        return { success: false, error: 'Select a valid student-capacity range.', bot: false };
    }
    if (!['true', '1', 'on'].includes(privacyConsent.toLowerCase())) {
        return { success: false, error: 'Consent is required before we can contact you.', bot: false };
    }

    return {
        success: true,
        data: {
            contactName,
            contactEmail,
            schoolName,
            studentCapacity,
            painPoints,
            consentVersion: LEAD_CONSENT_VERSION,
            sourceUrl: optionalUrl(value(formData, 'sourceUrl', 2_000)),
            utmSource: value(formData, 'utmSource', 255) || null,
            utmMedium: value(formData, 'utmMedium', 255) || null,
            utmCampaign: value(formData, 'utmCampaign', 255) || null,
        },
    };
}
