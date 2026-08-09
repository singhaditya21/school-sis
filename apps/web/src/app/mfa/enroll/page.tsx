import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { MfaEnrollmentClient } from './mfa-enrollment-client';

export const dynamic = 'force-dynamic';

export default async function MfaEnrollmentPage() {
    const session = await getSession();

    if (!session.isLoggedIn || !session.userId) redirect('/login');
    if (!session.mfaRequired || session.mfaVerified) {
        redirect(session.role === 'PLATFORM_ADMIN' ? '/hq' : '/dashboard');
    }

    return <MfaEnrollmentClient accountEmail={session.email} />;
}
