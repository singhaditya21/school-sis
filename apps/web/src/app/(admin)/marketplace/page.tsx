import { redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { getSession } from '@/lib/auth/session';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import { Card, CardContent } from '@/components/ui/card';
import MarketplaceClient from './marketplace-client';
import { getModuleEntitlements } from './actions';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata = {
    title: 'Modules & Entitlements | School SIS',
};

export default async function MarketplacePage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const canRead = hasPermission(session.role as UserRole, 'settings:read');

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                        Modules & Entitlements
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Which parts of ScholarMind this school is entitled to use.
                    </p>
                </div>
            </div>

            {canRead ? (
                <MarketplaceClient entitlements={await getModuleEntitlements()} />
            ) : (
                <Card>
                    <CardContent className="py-16 text-center">
                        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                        <p className="font-medium text-slate-700 dark:text-slate-200">
                            Your role cannot view module entitlements.
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Ask a school administrator if you need access.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
