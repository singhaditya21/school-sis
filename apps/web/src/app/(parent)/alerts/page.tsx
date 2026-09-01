import { AlertList } from '@/components/parent/alert-list';
import { ParentTopBar } from '@/components/parent/parent-top-bar';
import { getMyAlerts, getMyChildren } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AlertsPage({
    searchParams,
}: {
    searchParams: Promise<{ child?: string }>;
}) {
    const { child: requestedChild } = await searchParams;
    const [students, alerts] = await Promise.all([getMyChildren(), getMyAlerts()]);
    const selectedId = students.find((s) => s.id === requestedChild)?.id ?? students[0]?.id ?? null;

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <ParentTopBar students={students} selectedId={selectedId} />

            <div className="border-b border-border pb-4">
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
                    <span className="text-rose-500">🔔</span> Alerts
                </h1>
                <p className="mt-1 text-muted-foreground">
                    Messages the school has sent to your account.
                    {students.length > 1
                        ? ' Alerts are addressed to you rather than to one child, so this list covers all of your children.'
                        : ''}
                </p>
            </div>

            <AlertList alerts={alerts} />
        </div>
    );
}
