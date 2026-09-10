import { LEAD_CONSENT_VERSION, parseLeadIntake } from '@/lib/marketing/lead-intake';

function validForm(startedAt = Date.now() - 5_000): FormData {
    const formData = new FormData();
    formData.set('contactName', 'Asha Rao');
    formData.set('contactEmail', 'ASHA@SCHOOL.EDU');
    formData.set('schoolName', 'North School');
    formData.set('studentCapacity', '1500');
    formData.set('privacyConsent', 'true');
    formData.set('startedAt', String(startedAt));
    return formData;
}

describe('lead intake validation', () => {
    it('normalizes a valid consented submission', () => {
        const result = parseLeadIntake(validForm());
        expect(result).toEqual(expect.objectContaining({ success: true }));
        if (!result.success) throw new Error(result.error);
        expect(result.data.contactEmail).toBe('asha@school.edu');
        expect(result.data.consentVersion).toBe(LEAD_CONSENT_VERSION);
    });

    it('silently classifies honeypot and impossible-timing submissions as bots', () => {
        const honeypot = validForm();
        honeypot.set('companyWebsite', 'https://spam.invalid');
        expect(parseLeadIntake(honeypot)).toEqual(expect.objectContaining({ success: false, bot: true }));
        expect(parseLeadIntake(validForm(Date.now()))).toEqual(expect.objectContaining({ success: false, bot: true }));
    });

    it('requires explicit consent and an allowed capacity band', () => {
        const noConsent = validForm();
        noConsent.delete('privacyConsent');
        expect(parseLeadIntake(noConsent)).toEqual(expect.objectContaining({ success: false, bot: false }));

        const arbitraryCapacity = validForm();
        arbitraryCapacity.set('studentCapacity', '999');
        expect(parseLeadIntake(arbitraryCapacity)).toEqual(expect.objectContaining({ success: false, bot: false }));
    });
});
