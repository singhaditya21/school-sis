import { getTenantHQPoliciesAction } from '@/lib/actions/tenant-policies';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock, Building2, Info, ShieldAlert } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { hasPermission, UserRole } from '@/lib/rbac/permissions';
import SchoolProfileForm from './school-profile-form';
import { getSchoolProfile } from './actions';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata = {
    title: 'School Settings | School SIS',
};

type HQPolicy = {
    id: string;
    policyName: string;
    policyKey: string;
    policyValue: string | null;
    isHardBlock: boolean;
    documentUrl: string | null;
};

export default async function SchoolSettingsPage() {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    if (!hasPermission(session.role as UserRole, 'settings:read')) {
        return (
            <div className="max-w-4xl mx-auto">
                <Card>
                    <CardContent className="py-16 text-center">
                        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                        <p className="font-medium text-foreground dark:text-slate-200">
                            Your role cannot view school settings.
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Ask a school administrator if you need access.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const profile = await getSchoolProfile();
    const { isMappedToHQ, hqGroup, policies } = await getTenantHQPoliciesAction();
    const hqPolicies = policies as HQPolicy[];

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-foreground dark:text-white">
                        School Settings
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Institution details for this campus, plus any policies cascaded from your
                        group headquarters.
                    </p>
                </div>
            </div>

            {profile ? (
                <SchoolProfileForm profile={profile} />
            ) : (
                <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                        <Building2 className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                        <p className="font-medium text-foreground dark:text-slate-200">
                            No school record found for this session.
                        </p>
                        <p className="mt-1 text-sm">
                            The signed-in tenant has no matching row in the tenants table, so
                            there is nothing to configure here.
                        </p>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        Group Headquarters Policies
                    </CardTitle>
                    <CardDescription>
                        {isMappedToHQ && hqGroup
                            ? `Cascaded from ${hqGroup.name}. These are set at group level and are read-only here.`
                            : 'Policies cascaded from a multi-campus group headquarters appear here.'}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!isMappedToHQ ? (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                            This campus is not mapped to a multi-campus group, so no headquarters
                            policies apply.
                        </div>
                    ) : hqPolicies.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                            {hqGroup?.name ?? 'Your group'} has not published any policies yet.
                        </div>
                    ) : (
                        <div className="divide-y rounded-lg border">
                            {hqPolicies.map((policy) => (
                                <div
                                    key={policy.id}
                                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                                >
                                    <div className="min-w-0">
                                        <p className="font-medium text-foreground dark:text-slate-100">
                                            {policy.policyName}
                                        </p>
                                        <p className="font-mono text-xs text-muted-foreground">
                                            {policy.policyKey}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="font-semibold text-foreground dark:text-slate-100">
                                            {policy.policyValue ?? '—'}
                                        </span>
                                        {policy.isHardBlock ? (
                                            <Badge
                                                variant="outline"
                                                className="border-red-200 bg-red-50 text-[10px] text-red-700"
                                            >
                                                Enforced
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-[10px]">
                                                Advisory
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p>
                    Operational thresholds such as minimum attendance, late-fee penalties and
                    discount caps are not campus-configurable in this release — the schema has no
                    store for them. Where a group headquarters has published one, it is listed
                    above; otherwise the value is fixed by the relevant module.
                </p>
            </div>
        </div>
    );
}
