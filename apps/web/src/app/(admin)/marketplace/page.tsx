import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { getCompanyModules } from '@/lib/actions/marketplace';
import MarketplaceClient from './marketplace-client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function MarketplacePage() {
    const session = await getSession();

    if (!session.isLoggedIn) {
        redirect('/login');
    }

    const activeModules = await getCompanyModules();

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                        App Marketplace
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Extend your school's capabilities with plug-and-play modules.
                    </p>
                </div>
            </div>

            <MarketplaceClient activeModules={activeModules} />
        </div>
    );
}
