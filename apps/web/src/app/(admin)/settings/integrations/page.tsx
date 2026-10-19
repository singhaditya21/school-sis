import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getIntegrationsConsoleData } from './actions';
import { IntegrationsClient } from './integrations-client';

export const metadata = {
    title: 'External Integrations & Outbox | ScholarMind',
};

export default async function IntegrationsSettingsPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const data = await getIntegrationsConsoleData();

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">
                        External Integrations &amp; Outbox
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Verify live provider credentials (Email, SMS, WhatsApp, Push, In-App) and inspect queued workflow deliveries.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/settings/payments"
                        className="px-3 py-2 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
                    >
                        Stripe Payments Setup →
                    </Link>
                </div>
            </div>

            <IntegrationsClient
                channels={data.channels}
                summary={data.summary}
                recentOutbox={data.recentOutbox}
                defaultEmail={session.email || 'admin@school.edu'}
            />
        </div>
    );
}
