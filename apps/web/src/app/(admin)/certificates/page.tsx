import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getSession } from '@/lib/auth/session';
import { requireAuth } from '@/lib/auth/middleware';
import {
    getCertificateStats,
    listCertificateTemplates,
    listIssuedCertificates,
    listStudentsForCertificate,
} from './_lib/actions';
import { certificateStatusClass, certificateTypeLabel, formatDate } from './_lib/labels';
import CertificateFilters from './certificate-filters';
import IssueCertificateDialog from './issue-certificate-dialog';
import RevokeCertificateDialog from './revoke-certificate-dialog';
import { NewTemplateDialog, TemplateActiveToggle } from './template-controls';

export const dynamic = 'force-dynamic';

const STATUS_TABS = ['ALL', 'ISSUED', 'REVOKED'] as const;

const STATUS_TAB_LABELS: Record<string, string> = {
    ALL: 'All',
    ISSUED: 'Issued',
    REVOKED: 'Revoked',
};

interface PageProps {
    searchParams: Promise<{ status?: string; type?: string; q?: string }>;
}

export default async function CertificatesPage({ searchParams }: PageProps) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    try {
        await requireAuth('certificate:read');
    } catch {
        redirect('/unauthorized');
    }

    const { status: rawStatus, type: rawType, q } = await searchParams;
    const status = STATUS_TABS.includes(rawStatus as (typeof STATUS_TABS)[number]) ? rawStatus! : 'ALL';
    const type = rawType ?? 'ALL';
    const search = q ?? '';

    const [stats, templates, certificates, students] = await Promise.all([
        getCertificateStats(),
        listCertificateTemplates(),
        listIssuedCertificates({ status, type, search }),
        listStudentsForCertificate(),
    ]);

    function tabHref(next: string): string {
        const params = new URLSearchParams();
        if (next !== 'ALL') params.set('status', next);
        if (type !== 'ALL') params.set('type', type);
        if (search) params.set('q', search);
        const qs = params.toString();
        return qs ? `/certificates?${qs}` : '/certificates';
    }

    const filtered = type !== 'ALL' || search.trim().length > 0 || status !== 'ALL';
    // listIssuedCertificates caps at 500 rows; say so rather than quietly truncating.
    const capped = certificates.length === 500;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Certificates</h1>
                    <p className="mt-1 text-muted-foreground">
                        Issue transfer, bonafide and character certificates against a numbered
                        register, and revoke one when it should no longer be honoured.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <NewTemplateDialog />
                    <IssueCertificateDialog templates={templates} students={students} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Active templates</div>
                        <div className="text-2xl font-bold">{stats.activeTemplates}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Issued</div>
                        <div className="text-2xl font-bold text-green-600">{stats.issued}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Draft</div>
                        <div className="text-2xl font-bold text-amber-600">{stats.drafts}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Imported records not yet issued</div>
                    </CardContent>
                </Card>
                <Card className={stats.revoked > 0 ? 'border-2 border-red-100' : undefined}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Revoked</div>
                        <div className="text-2xl font-bold text-red-600">{stats.revoked}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            <Link href="/credentials" className="text-primary hover:underline">
                                Revocation register →
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Templates</CardTitle>
                </CardHeader>
                <CardContent>
                    {templates.length === 0 ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                            No templates yet. Create one before issuing a certificate.
                        </p>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {templates.map(t => (
                                <div
                                    key={t.id}
                                    className={`rounded-lg border p-4 ${t.isActive ? 'border-border' : 'border-dashed border-border bg-muted'}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="font-semibold text-foreground">{t.name}</div>
                                            <div className="mt-0.5 text-xs text-muted-foreground">
                                                {certificateTypeLabel(t.type)}
                                            </div>
                                        </div>
                                        {!t.isActive && <Badge variant="secondary">Retired</Badge>}
                                    </div>
                                    <div className="mt-3 flex items-center justify-between text-sm">
                                        <span className="text-muted-foreground">
                                            {t.issuedCount} {t.issuedCount === 1 ? 'certificate' : 'certificates'} issued
                                        </span>
                                        <TemplateActiveToggle templateId={t.id} isActive={t.isActive} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="gap-3 pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="text-lg">Certificate register</CardTitle>
                        <div className="flex gap-1">
                            {STATUS_TABS.map(tab => (
                                <Link
                                    key={tab}
                                    href={tabHref(tab)}
                                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                                        status === tab
                                            ? 'bg-gray-900 text-white'
                                            : 'text-muted-foreground hover:bg-muted'
                                    }`}
                                >
                                    {STATUS_TAB_LABELS[tab]}
                                </Link>
                            ))}
                        </div>
                    </div>
                    <CertificateFilters status={status} type={type} search={search} />
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-y bg-muted text-xs uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Certificate no.</th>
                                    <th className="px-4 py-3 font-medium">Student</th>
                                    <th className="px-4 py-3 font-medium">Type</th>
                                    <th className="px-4 py-3 font-medium">Issued</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {certificates.map(c => (
                                    <tr key={c.id} className="hover:bg-muted">
                                        <td className="px-4 py-3 font-mono font-medium text-foreground">
                                            {c.certificateNumber}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-foreground">
                                                {c.studentName ?? 'Student record removed'}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {c.admissionNumber ?? '—'}
                                                {c.gradeName ? ` · ${c.gradeName}${c.sectionName ? `-${c.sectionName}` : ''}` : ''}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {certificateTypeLabel(c.type)}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            <div>{formatDate(c.issuedDate)}</div>
                                            {c.issuedByName && (
                                                <div className="text-xs text-muted-foreground">by {c.issuedByName}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${certificateStatusClass(c.status)}`}>
                                                {c.status}
                                            </span>
                                            {c.status === 'REVOKED' && c.revokeReason && (
                                                <div className="mt-1 max-w-xs text-xs text-muted-foreground">
                                                    {c.revokeReason}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right whitespace-nowrap">
                                            <Link
                                                href={`/certificates/${c.id}`}
                                                className="text-sm font-medium text-primary hover:underline"
                                            >
                                                Open
                                            </Link>
                                            {c.status === 'ISSUED' && (
                                                <span className="ml-2 inline-block align-middle">
                                                    <RevokeCertificateDialog
                                                        certificateId={c.id}
                                                        certificateNumber={c.certificateNumber}
                                                        studentName={c.studentName}
                                                    />
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {certificates.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                            {filtered
                                                ? 'No certificates match these filters.'
                                                : 'No certificates issued yet.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {capped && (
                <p className="text-xs text-amber-700">
                    Showing the 500 most recent certificates. Narrow the search to see older ones.
                </p>
            )}

            <p className="text-xs text-muted-foreground">
                Certificates print from the standard record layout on the certificate page.
                Server-side PDF generation and custom printed templates are not available in this release.
            </p>
        </div>
    );
}
