import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getAcademicYears } from '@/lib/actions/queries';
import { NewFeePlanForm, type AcademicYearOption } from '../_components/new-fee-plan-form';

export const dynamic = 'force-dynamic';

export default async function NewFeePlanPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const academicYears = await getAcademicYears();

    const options: AcademicYearOption[] = academicYears.map((year) => ({
        id: year.id,
        name: year.name,
        isCurrent: Boolean(year.isCurrent),
    }));

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <div>
                <Link href="/fees/plans" className="text-sm text-muted-foreground hover:underline">
                    ← All fee plans
                </Link>
                <h1 className="mt-1 text-3xl font-bold tracking-tight">New fee plan</h1>
                <p className="text-muted-foreground">
                    A plan is only usable once it has at least one mandatory component — invoices are
                    priced from those components.
                </p>
            </div>

            <NewFeePlanForm academicYears={options} />
        </div>
    );
}
