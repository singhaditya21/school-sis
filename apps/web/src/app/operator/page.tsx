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
        <div className="min-h-screen bg-background">
            <div className="border-b border-border bg-card px-6 py-2.5 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                    Signed in as {session.email} ({session.role})
                </span>
                <form action="/api/logout" method="POST">
                    <button
                        type="submit"
                        className="px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted rounded-lg border border-border transition-colors"
                    >
                        Sign Out
                    </button>
                </form>
            </div>
            <OperatorConsoleClient
                initialScope={session.role === 'PLATFORM_ADMIN' ? 'PLATFORM' : 'TENANT'}
                role={session.role}
                tenantId={session.tenantId}
            />
        </div>
    );
}
