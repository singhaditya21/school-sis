import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getHqOverviewData } from './queries';

export const metadata = {
    title: 'Command Center | ScholarMind',
};

function formatDate(value: Date | string): string {
    return new Date(value).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

export default async function HQDashboard() {
    const { campusName, group, campuses, policies } = await getHqOverviewData();

    if (!group) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        Multi-campus headquarters view for {campusName ?? 'this campus'}.
                    </p>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">Not part of a campus group</CardTitle>
                        <CardDescription>
                            {campusName ?? 'This campus'} has no multi-campus mapping, so there is no
                            headquarters to report into.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-gray-600 dark:text-gray-400 space-y-3">
                        <p>
                            Campus groups are created and campuses attached by a ScholarMind platform
                            operator. A campus login cannot create a group or attach itself to one, so there
                            is nothing to do from this screen.
                        </p>
                        <p>
                            Once this campus is attached, the mandates that apply to it will appear here and
                            on{' '}
                            <Link
                                href="/hq-policies"
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                HQ Policies
                            </Link>
                            .
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const hardBlocks = policies.filter((p) => p.isHardBlock).length;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{group.name}</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        Headquarters in {group.hqCity} · group created {formatDate(group.createdAt)}
                    </p>
                </div>
                <Badge
                    variant="outline"
                    className={group.isActive ? 'text-green-700 bg-green-50 border-green-200' : ''}
                >
                    {group.isActive ? 'Active group' : 'Inactive group'}
                </Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">Campus mapping</CardTitle>
                        <CardDescription>How this campus sits inside the group.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                            {campuses.length === 0 ? (
                                <p className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
                                    No campus mapping is readable for this group.
                                </p>
                            ) : (
                                campuses.map((campus) => (
                                    <div key={campus.id} className="px-6 py-4 flex justify-between items-center">
                                        <div>
                                            <p className="font-semibold">{campus.name ?? 'Unnamed campus'}</p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Region: {campus.region}
                                            </p>
                                        </div>
                                        <Badge variant="outline">{campus.campusType}</Badge>
                                    </div>
                                ))
                            )}
                        </div>
                        <p className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800">
                            A campus login can only read its own mapping row, so this list is not the full
                            group roster. The complete roster is visible to ScholarMind platform operators.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl">Group mandates</CardTitle>
                        <CardDescription>
                            {policies.length === 0
                                ? 'Nothing has been mandated by this group yet.'
                                : `${policies.length} recorded, ${hardBlocks} marked as a hard block.`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {policies.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                No group policy has been recorded for {group.name}.
                            </p>
                        ) : (
                            <ul className="space-y-3">
                                {policies.map((policy) => (
                                    <li
                                        key={policy.id}
                                        className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-gray-800 pb-3 last:border-0 last:pb-0"
                                    >
                                        <div>
                                            <p className="font-medium">{policy.policyName}</p>
                                            <p className="text-xs font-mono uppercase text-gray-500 dark:text-gray-400 mt-1">
                                                {policy.policyKey} = {policy.policyValue}
                                            </p>
                                        </div>
                                        {policy.isHardBlock ? (
                                            <Badge variant="outline" className="text-red-700 bg-red-50 border-red-200 shrink-0">
                                                Hard block
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="shrink-0">
                                                Guideline
                                            </Badge>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2 pt-2">
                            <p>
                                Group policies are recorded and changed by a ScholarMind platform operator.
                                Campus roles — including group executives — have read-only access to them.
                            </p>
                            <p>
                                <Link
                                    href="/hq-policies"
                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    See how each mandate applies to this campus
                                </Link>
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
