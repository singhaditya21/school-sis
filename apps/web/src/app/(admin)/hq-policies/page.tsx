import Link from 'next/link';
import { getTenantHQPoliciesAction } from '@/lib/actions/tenant-policies';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, ShieldAlert, FileText } from 'lucide-react';

export const metadata = {
    title: 'HQ Policies | ScholarMind',
};

interface GroupPolicy {
    id: string | number;
    policyName: string;
    policyKey: string;
    policyValue: string;
    isHardBlock: boolean;
    documentUrl: string | null;
}

/**
 * Policy keys that a hard block actually locks today: /settings/school reads
 * these three and replaces the editable input with the mandated value. Any
 * other key is recorded for reference only — nothing in the app reads it — so
 * the page must not imply it is enforced.
 */
const ENFORCED_POLICY_KEYS = new Set(['MIN_ATTENDANCE_PCT', 'LATE_FEE_AMOUNT', 'MAX_DISCOUNT_PCT']);

export default async function TenantHQPoliciesPage() {
    const { isMappedToHQ, hqGroup, policies } = await getTenantHQPoliciesAction();

    if (!isMappedToHQ) {
        return (
            <div className="p-8 text-center mt-12 max-w-2xl mx-auto bg-muted dark:bg-gray-900 border border-border dark:border-gray-800 rounded-xl">
                <Shield className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-bold mb-2">Independent Campus</h2>
                <p className="text-muted-foreground dark:text-muted-foreground">
                    This campus operates independently and is not mapped to a central Multi-Campus
                    Headquarters. No cascaded policies apply.
                </p>
            </div>
        );
    }

    const enforcedCount = policies.filter(
        (p: GroupPolicy) => p.isHardBlock && ENFORCED_POLICY_KEYS.has(p.policyKey),
    ).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Mandated Group Policies</h1>
                    <p className="text-muted-foreground dark:text-muted-foreground mt-1">
                        Guidelines recorded by{' '}
                        <strong className="text-foreground dark:text-gray-100">{hqGroup?.name}</strong>
                        {hqGroup?.headquartersCity ? ` (HQ in ${hqGroup.headquartersCity})` : ''} that apply
                        to this campus.
                    </p>
                </div>
                <Badge variant="outline" className="px-4 py-2 bg-blue-50 text-blue-700 border-blue-200 uppercase tracking-widest text-xs font-bold">
                    HQ Connected
                </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {policies.length === 0 ? (
                    <div className="col-span-full p-12 text-center text-muted-foreground dark:text-muted-foreground border border-dashed border-border dark:border-gray-800 rounded-xl">
                        No policies have been recorded for this group yet.
                    </div>
                ) : (
                    policies.map((policy: GroupPolicy) => {
                        const locksASetting = policy.isHardBlock && ENFORCED_POLICY_KEYS.has(policy.policyKey);
                        return (
                            <Card
                                key={policy.id}
                                className={`border-l-4 transition-all hover:shadow-md ${policy.isHardBlock ? 'border-l-red-500' : 'border-l-amber-500'}`}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex justify-between items-start">
                                        <CardTitle className="text-lg leading-tight pr-4">
                                            {policy.policyName}
                                        </CardTitle>
                                        {policy.isHardBlock ? (
                                            <Badge variant="destructive" className="shrink-0 flex items-center gap-1">
                                                <ShieldAlert className="w-3 h-3" /> Hard Block
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 shrink-0">
                                                Guideline
                                            </Badge>
                                        )}
                                    </div>
                                    <CardDescription className="font-mono text-xs mt-1 uppercase">
                                        KEY: {policy.policyKey}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="bg-muted dark:bg-gray-900 p-4 rounded-lg border border-border dark:border-gray-800">
                                        <span className="block text-xs uppercase tracking-wider text-muted-foreground dark:text-muted-foreground mb-1">
                                            Mandated value
                                        </span>
                                        <span className="text-lg font-bold">{policy.policyValue}</span>
                                    </div>

                                    <p className="text-xs text-muted-foreground dark:text-muted-foreground mt-3">
                                        {locksASetting ? (
                                            <>
                                                Applied automatically: this locks the matching field on{' '}
                                                <Link
                                                    href="/settings/school"
                                                    className="text-primary hover:underline"
                                                >
                                                    School Settings
                                                </Link>
                                                .
                                            </>
                                        ) : (
                                            <>
                                                Recorded for reference. No module reads this key, so it is not
                                                applied automatically — campus staff must honour it manually.
                                            </>
                                        )}
                                    </p>

                                    {policy.documentUrl && policy.documentUrl.trim() !== '' && (
                                        <a
                                            href={policy.documentUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-4 flex items-center justify-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-accent dark:hover:bg-blue-950/40 py-2 rounded-md transition-colors"
                                        >
                                            <FileText className="w-4 h-4" /> Reference document supplied by HQ
                                        </a>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })
                )}
            </div>

            {policies.length > 0 && (
                <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                    {enforcedCount} of {policies.length} recorded {policies.length === 1 ? 'policy is' : 'policies are'}{' '}
                    applied automatically by the platform; the rest are written down here but not enforced by
                    any module in this release. Policies are added and removed by a ScholarMind platform
                    operator — they cannot be changed from a campus login.
                </p>
            )}
        </div>
    );
}
