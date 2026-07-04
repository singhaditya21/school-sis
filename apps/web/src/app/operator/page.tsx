import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import OperatorConsoleClient from './operator-console-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const OPERATOR_ROLES = new Set(['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN']);

export default async function OperatorPage() {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    if (!OPERATOR_ROLES.has(session.role)) {
        redirect('/unauthorized');
    }

    return (
        <OperatorConsoleClient
            initialScope={session.role === 'PLATFORM_ADMIN' ? 'PLATFORM' : 'TENANT'}
            role={session.role}
            tenantId={session.tenantId}
        />
    );
}
