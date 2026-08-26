import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getProcurementPageData, readScopes } from './queries';

export const metadata = {
    title: 'Vendor & Data Processing | ScholarMind',
};

function formatDateTime(value: Date | string | null): string {
    if (!value) return 'Never';
    return new Date(value).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default async function ProcurementPage() {
    const { campusName, processors, apiKeyCount, webhookCount } = await getProcurementPageData();

    const liveCount = processors.filter((p) => p.mode === 'LIVE').length;
    const failingCount = processors.filter((p) => p.status !== 'ACTIVE' || p.lastError).length;

    return (
        <div className="space-y-6">
            <div className="border-b border-gray-200 dark:border-gray-800 pb-6">
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
                    Vendor &amp; Data Processing
                </h1>
                <p className="text-gray-600 dark:text-gray-400 mt-2">
                    The third-party systems {campusName ?? 'this campus'} has connected, what each one is
                    allowed to reach, and when it last exchanged data.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="uppercase tracking-wider text-xs font-semibold">
                            Connected systems
                        </CardDescription>
                        <CardTitle className="text-3xl">{processors.length}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {liveCount} sending live data, {processors.length - liveCount} in mock mode.
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="uppercase tracking-wider text-xs font-semibold">
                            API keys issued
                        </CardDescription>
                        <CardTitle className="text-3xl">{apiKeyCount}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Credentials that can read this campus&rsquo;s data over the API.
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription className="uppercase tracking-wider text-xs font-semibold">
                            Outbound webhooks
                        </CardDescription>
                        <CardTitle className="text-3xl">{webhookCount}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Endpoints this campus pushes event data to.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle className="text-xl">Connected data processors</CardTitle>
                        <CardDescription>
                            Every external provider with a connection record for this campus, and the scopes it
                            was granted.
                        </CardDescription>
                    </div>
                    {failingCount > 0 && (
                        <Badge variant="outline" className="text-red-700 bg-red-50 border-red-200">
                            {failingCount} needing attention
                        </Badge>
                    )}
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="border-y border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Provider</th>
                                    <th className="px-6 py-4">Mode</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Granted scopes</th>
                                    <th className="px-6 py-4">Last successful sync</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                {processors.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                            No third-party system is connected to this campus, so no student or
                                            fee data leaves ScholarMind through an integration. Connections are
                                            provisioned through the integrations API — there is no
                                            campus-facing screen for creating one in this release.
                                        </td>
                                    </tr>
                                ) : (
                                    processors.map((row) => {
                                        const scopes = readScopes(row.scopes);
                                        return (
                                            <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                                                <td className="px-6 py-4 font-semibold">{row.provider}</td>
                                                <td className="px-6 py-4">
                                                    <Badge
                                                        variant="outline"
                                                        className={
                                                            row.mode === 'LIVE'
                                                                ? 'text-amber-700 bg-amber-50 border-amber-200'
                                                                : ''
                                                        }
                                                    >
                                                        {row.mode}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge
                                                        variant="outline"
                                                        className={
                                                            row.status === 'ACTIVE'
                                                                ? 'text-green-700 bg-green-50 border-green-200'
                                                                : 'text-red-700 bg-red-50 border-red-200'
                                                        }
                                                    >
                                                        {row.status}
                                                    </Badge>
                                                    {row.lastError && (
                                                        <p className="text-xs text-red-600 mt-1 max-w-xs truncate">
                                                            {row.lastError}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-xs">
                                                    {scopes.length === 0 ? (
                                                        <span className="text-gray-400">No scopes recorded</span>
                                                    ) : (
                                                        <span className="font-mono">{scopes.join(', ')}</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                                                    {formatDateTime(row.lastSuccessAt)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-xl">Procurement evidence packs</CardTitle>
                    <CardDescription>Certifications, DPAs and responsibility matrices.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                    <p>
                        Not available in this release. ScholarMind does not store compliance certificates,
                        data processing agreements, subprocessor attestations or a shared-responsibility
                        matrix, so this page cannot generate or hand them out. Ask your ScholarMind account
                        contact for those documents directly.
                    </p>
                    <p>
                        The records that <em>are</em> available for a procurement review live on{' '}
                        <Link href="/audit" className="text-blue-600 dark:text-blue-400 hover:underline">
                            the audit log
                        </Link>
                        , which shows who changed what inside this campus.
                    </p>
                    <p className="text-xs">
                        Platform-level operator actions (impersonation, tenant provisioning) are recorded, but
                        that ledger is readable only by ScholarMind platform operators — a campus login cannot
                        query it.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
