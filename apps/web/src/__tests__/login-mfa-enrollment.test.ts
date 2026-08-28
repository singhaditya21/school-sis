import {
    establishSession,
    mfaRequiredForSession,
    shouldRequireMfaEnrollment,
} from '@/lib/auth/identity';
import type { SessionData } from '@/lib/auth/session';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * An MFA-required admin that has not yet enrolled must be able to log in and
 * reach enrolment — not be rejected.
 *
 * The login action used to return "MFA enrollment is required for this account
 * before login" without a session, while /mfa/setup needs a session. Every
 * admin not born through /setup's own auto-login — including one created for a
 * seeded pilot branch — was therefore permanently locked out: it could never get
 * the session that enrolment requires. That was the gate the whole pilot sat
 * behind.
 */

const ENFORCED = { REQUIRE_MFA_ENROLLMENT: 'true' };
const originalEnv = process.env.REQUIRE_MFA_ENROLLMENT;

afterEach(() => {
    if (originalEnv === undefined) delete process.env.REQUIRE_MFA_ENROLLMENT;
    else process.env.REQUIRE_MFA_ENROLLMENT = originalEnv;
});

describe('MFA enrolment login path', () => {
    it('gives an unenrolled admin a restricted (unverified) session, not a rejection', () => {
        Object.assign(process.env, ENFORCED);
        expect(shouldRequireMfaEnrollment('SCHOOL_ADMIN', false)).toBe(true);

        const session = {} as SessionData;
        establishSession(session, {
            userId: 'u1',
            tenantId: 't1',
            role: 'SCHOOL_ADMIN',
            email: 'principal@cambridge-spm.example',
            provider: 'password',
            displayName: 'Meera Nair',
            mfaEnabled: false,
            mfaVerified: false,
        });

        // Logged in, but not through the MFA gate — exactly the state the
        // middleware confines to /mfa/setup, and the state login now routes there.
        expect(session.isLoggedIn).toBe(true);
        expect(session.mfaRequired).toBe(true);
        expect(session.mfaVerified).toBe(false);
    });

    it('marks an enrolled admin who passed MFA fully verified', () => {
        Object.assign(process.env, ENFORCED);
        const session = {} as SessionData;
        establishSession(session, {
            userId: 'u1',
            tenantId: 't1',
            role: 'SCHOOL_ADMIN',
            email: 'principal@cambridge-spm.example',
            provider: 'password',
            displayName: 'Meera Nair',
            mfaEnabled: true,
            mfaVerified: true,
        });
        expect(session.mfaVerified).toBe(true);
    });

    it('does not require enrolment of a role outside the MFA set', () => {
        Object.assign(process.env, ENFORCED);
        expect(mfaRequiredForSession('TEACHER', false)).toBe(false);
    });

    it('login no longer dead-ends an unenrolled admin, and routes it to /mfa/setup', () => {
        // The behavioural change lives inside loginActionV2, mixed with DB and
        // session I/O that a unit test cannot drive. Pin it at the source: the
        // rejection string is gone, and the restricted session is sent to enrol.
        const auth = readFileSync(
            resolve(process.cwd(), 'src/lib/actions/auth.ts'),
            'utf8',
        );
        expect(auth).not.toContain('MFA enrollment is required for this account before login');
        expect(auth).toContain("session.mfaRequired && !session.mfaVerified");
        expect(auth).toContain("'/mfa/setup'");
    });
});
