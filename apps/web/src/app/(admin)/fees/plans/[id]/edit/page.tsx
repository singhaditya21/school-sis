import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getFeePlanDetail } from '@/lib/actions/fee-plans';
import { EditFeePlanForm } from '../../_components/edit-fee-plan-form';

export const dynamic = 'force-dynamic';

export default async function EditFeePlanPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { id } = await params;
    const plan = await getFeePlanDetail(id);

    if (!plan) notFound();

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div>
                <Link href="/fees/plans" className="text-sm text-muted-foreground hover:underline">
                    ← All fee plans
                </Link>
                <h1 className="mt-1 text-3xl font-bold tracking-tight">{plan.name}</h1>
                <p className="text-muted-foreground">
                    Edit the plan and the components its invoices are priced from.
                </p>
            </div>

            <EditFeePlanForm plan={plan} />
        </div>
    );
}
