import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The public admission form must not fake a successful submission.
 *
 * It collected a full 3-step application, then fabricated a "GWD-2026-#####"
 * confirmation ID client-side and showed "Application Submitted — received
 * successfully" while making no network call and discarding everything. A parent
 * would leave believing they had applied. There is no admissions-application
 * intake to wire it to (the only public endpoint is a B2B sales-lead capture),
 * so until one exists the form must be honest instead.
 */
const applyPage = readFileSync(
    resolve(
        process.cwd(),
        '../..',
        'apps/website/src/app/(public)/apply-online/apply/page.tsx',
    ),
    'utf8',
);

describe('public admission application honesty', () => {
    it('does not fabricate a confirmation ID', () => {
        expect(applyPage).not.toContain('GWD-2026-');
        expect(applyPage).not.toMatch(/Math\.random\(\)[\s\S]{0,40}applicationId/);
    });

    it('does not claim an application was received when nothing was submitted', () => {
        expect(applyPage).not.toContain('received successfully');
        expect(applyPage).not.toContain('Application Submitted!');
    });

    it('tells the applicant nothing was submitted', () => {
        expect(applyPage).toContain('nothing you entered has');
    });
});
