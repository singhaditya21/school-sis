import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSession } from '@/lib/auth/session';
import { requireAuth } from '@/lib/auth/middleware';
import { getCertificateStats, listIssuedCertificates } from '../certificates/_lib/actions';
import {
    certificateStatusClass,
    certificateTypeLabel,
    formatDate,
    formatDateTime,
} from '../certificates/_lib/labels';
import RevokeCertificateDialog from '../certificates/revoke-certificate-dialog';

export const dynamic = 'force-dynamic';

const TABS = ['ALL', 'ISSUED', 'REVOKED'] as const;

const TAB_LABELS: Record<string, string> = {
    ALL: 'Everything',
    ISSUED: 'Standing',
    REVOKED: 'Revoked',
};

interface PageProps {
    searchParams: Promise<{ status?: string }>;
}

export default async function CredentialsPage({ searchParams }: PageProps) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    try {
        await requireAuth('credentials:read');
    } catch {
        redirect('/unauthorized');
    }

    const { status: rawStatus } = await searchParams;
    const status = TABS.includes(rawStatus as (typeof TABS)[number]) ? rawStatus! : 'ALL';

    const [stats, records] = await Promise.all([
        getCertificateStats(),
        listIssuedCertificates({ status }),
    ]);

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Revocation register</h1>
                    <p className="mt-1 max-w-3xl text-muted-foreground">
                        Every certificate this school has issued, and whether it still stands.
                        Withdraw one here when it should no longer be honoured — the record is kept,
                        marked revoked, with the reason and the time it was withdrawn.
                    </p>
                </div>
                <Link
                    href="/certificates"
                    className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                    Issue a certificate
                </Link>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Standing</CardDescription>
                        <CardTitle className="text-4xl text-green-700">{stats.issued}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            Issued and not withdrawn.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Draft</CardDescription>
                        <CardTitle className="text-4xl text-amber-600">{stats.drafts}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            Records created but never issued. They carry no authority.
                        </p>
                    </CardContent>
                </Card>

                <Card className={stats.revoked > 0 ? 'border-2 border-red-100' : undefined}>
                    <CardHeader className="pb-2">
                        <CardDescription>Revoked</CardDescription>
                        <CardTitle className="text-4xl text-red-700">{stats.revoked}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">
                            Withdrawn by the school. Presenting one of these should be refused.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex gap-1">
                {TABS.map(tab => (
                    <Link
                        key={tab}
                        href={tab === 'ALL' ? '/credentials' : `/credentials?status=${tab}`}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                            status === tab ? 'bg-gray-900 text-white' : 'text-muted-foreground hover:bg-muted'
                        }`}
                    >
                        {TAB_LABELS[tab]}
                    </Link>
                ))}
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b bg-muted text-xs uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Certificate no.</th>
                                    <th className="px-4 py-3 font-medium">Student</th>
                                    <th className="px-4 py-3 font-medium">Type</th>
                                    <th className="px-4 py-3 font-medium">Issued</th>
                                    <th className="px-4 py-3 font-medium">Standing</th>
                                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {records.map(record => (
                                    <tr key={record.id} className="hover:bg-muted">
                                        <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                                            {record.certificateNumber}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-foreground">
                                                {record.studentName ?? 'Student record removed'}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {record.admissionNumber ?? '—'}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {certificateTypeLabel(record.type)}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            <div>{formatDate(record.issuedDate)}</div>
                                            {record.issuedByName && (
                                                <div className="text-xs text-muted-foreground">
                                                    by {record.issuedByName}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${certificateStatusClass(record.status)}`}>
                                                {record.status}
                                            </span>
                                            {record.status === 'REVOKED' && (
                                                <div className="mt-1 max-w-xs text-xs text-muted-foreground">
                                                    {formatDateTime(record.revokedAt)}
                                                    {record.revokeReason ? ` — ${record.revokeReason}` : ''}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                            <Link
                                                href={`/certificates/${record.id}`}
                                                className="text-sm font-medium text-primary hover:underline"
                                            >
                                                Open
                                            </Link>
                                            {record.status === 'ISSUED' && (
                                                <span className="ml-2 inline-block align-middle">
                                                    <RevokeCertificateDialog
                                                        certificateId={record.id}
                                                        certificateNumber={record.certificateNumber}
                                                        studentName={record.studentName}
                                                    />
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {records.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                            {status === 'REVOKED'
                                                ? 'Nothing has been revoked.'
                                                : 'No certificates have been issued yet.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">What this register is not</p>
                <p className="mt-1">
                    Certificates here are records in this school&apos;s database. They are not
                    cryptographically signed, and there is no public endpoint an employer or another
                    school can query to verify one. W3C Verifiable Credentials and Open Badges
                    issuance are not available in this release — a third party checking a
                    certificate has to contact the school, which can then look it up here.
                </p>
            </div>
        </div>
    );
}
