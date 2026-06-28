import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { isAdminRole } from '@/lib/rbac';
import { getTenantInfo } from '@/lib/actions/dashboard';
import OnboardingWizardClient from './wizard-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function OnboardingWizardPage() {
    const session = await getSession();

    if (!session.isLoggedIn || !isAdminRole(session.role!)) {
        redirect('/dashboard');
    }

    const tenantInfo = await getTenantInfo();

    // If already onboarded, redirect back to dashboard
    if (tenantInfo.hasAcademicYear) {
        redirect('/dashboard');
    }

    return (
        <div className="max-w-4xl mx-auto py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Welcome to {tenantInfo.name}! 👋
                </h1>
                <p className="text-muted-foreground mt-2 text-lg">
                    Let's get your school's workspace set up. This will only take a minute.
                </p>
            </div>
            
            <OnboardingWizardClient />
        </div>
    );
}
