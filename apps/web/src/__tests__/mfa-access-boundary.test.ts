import fs from 'node:fs';
import path from 'node:path';
import { getSession } from '@/lib/auth/session';
import { requireApiAuth } from '@/lib/auth/api';
import { isMFARequired, MFA_REQUIRED_ROLES } from '@/lib/auth/mfa';
import { MFA_REQUIRED_ROLE_NAMES } from '@/lib/auth/session-options';

jest.mock('@/lib/auth/session', () => ({
    getSession: jest.fn(),
}));

describe('MFA enrollment access boundary', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns an explicit 403 for an MFA-restricted API session', async () => {
        (getSession as jest.Mock).mockResolvedValue({
            isLoggedIn: false,
            userId: '',
            tenantId: '',
            role: '',
            email: '',
            passwordChangeRequired: false,
            mfaRequired: true,
            mfaVerified: false,
        });

        const result = await requireApiAuth();

        expect(result.ok).toBe(false);
        if (result.ok !== false) throw new Error('Expected MFA-restricted API authentication to fail.');
        expect(result.response.status).toBe(403);
        await expect(result.response.json()).resolves.toEqual({
            error: 'MFA enrollment required',
            code: 'MFA_ENROLLMENT_REQUIRED',
        });
    });

    it('requires MFA consistently for every privileged Tier 0-2 role', () => {
        const privilegedRoles = [
            'PLATFORM_ADMIN',
            'SUPER_ADMIN',
            'GROUP_EXECUTIVE',
            'SCHOOL_ADMIN',
            'PRINCIPAL',
            'REGISTRAR',
            'FINANCE_LEAD',
            'ACCOUNTANT',
        ];

        expect([...MFA_REQUIRED_ROLES]).toEqual(privilegedRoles);
        expect([...MFA_REQUIRED_ROLE_NAMES]).toEqual(privilegedRoles);
        for (const role of privilegedRoles) expect(isMFARequired(role)).toBe(true);
        for (const role of ['TEACHER', 'STUDENT', 'PARENT']) expect(isMFARequired(role)).toBe(false);
    });

    it('keeps restricted identity out of DB resolver context and routes only to enrollment', () => {
        const instrumentation = fs.readFileSync(path.join(process.cwd(), 'src/instrumentation.ts'), 'utf8');
        const serverAuth = fs.readFileSync(path.join(process.cwd(), 'src/lib/auth/middleware.ts'), 'utf8');
        const edgeMiddleware = fs.readFileSync(path.join(process.cwd(), 'src/middleware.ts'), 'utf8');
        const login = fs.readFileSync(path.join(process.cwd(), 'src/lib/actions/auth.ts'), 'utf8');

        expect(instrumentation).toContain('(session.mfaRequired && !session.mfaVerified)');
        expect(serverAuth).toContain("redirect('/mfa/enroll')");
        expect(edgeMiddleware).toContain("pathname !== '/mfa/enroll'");
        expect(edgeMiddleware.indexOf('session.passwordChangeRequired')).toBeLessThan(
            edgeMiddleware.indexOf("pathname !== '/mfa/enroll'"),
        );
        expect(login).toContain("? '/mfa/enroll'");
        expect(login).not.toContain('MFA enrollment is required for your role before login');
    });
});
