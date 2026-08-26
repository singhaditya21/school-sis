import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSession } from '@/lib/auth/session';
import { requireAuth } from '@/lib/auth/middleware';
import {
    getDocumentStats,
    listDocumentTypesInUse,
    listStudentDocuments,
    listStudentsForDocuments,
} from './_lib/actions';
import { formatDateTime, formatFileSize } from './_lib/labels';
import DocumentFilters from './document-filters';
import UploadDocumentDialog from './upload-document-dialog';
import VerificationButton from './verification-button';

export const dynamic = 'force-dynamic';

const TABS = ['ALL', 'PENDING', 'VERIFIED'] as const;

const TAB_LABELS: Record<string, string> = {
    ALL: 'All',
    PENDING: 'Awaiting check',
    VERIFIED: 'Verified',
};

interface PageProps {
    searchParams: Promise<{ verification?: string; type?: string; q?: string }>;
}

export default async function DocumentsPage({ searchParams }: PageProps) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    try {
        await requireAuth('documents:read');
    } catch {
        redirect('/unauthorized');
    }

    const { verification: rawVerification, type: rawType, q } = await searchParams;
    const verification = TABS.includes(rawVerification as (typeof TABS)[number]) ? rawVerification! : 'ALL';
    const documentType = rawType ?? 'ALL';
    const search = q ?? '';

    const [documents, stats, knownTypes, students] = await Promise.all([
        listStudentDocuments({ verification, documentType, search }),
        getDocumentStats(),
        listDocumentTypesInUse(),
        listStudentsForDocuments(),
    ]);

    function tabHref(next: string): string {
        const params = new URLSearchParams();
        if (next !== 'ALL') params.set('verification', next);
        if (documentType !== 'ALL') params.set('type', documentType);
        if (search) params.set('q', search);
        const qs = params.toString();
        return qs ? `/documents?${qs}` : '/documents';
    }

    const filtered = verification !== 'ALL' || documentType !== 'ALL' || search.trim().length > 0;
    // listStudentDocuments caps at 500 rows; say so rather than quietly truncating.
    const capped = documents.length === 500;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Student documents</h1>
                    <p className="mt-1 text-gray-600">
                        Birth certificates, ID proofs and previous school records, with a note of
                        who checked each one against the original.
                    </p>
                </div>
                <UploadDocumentDialog students={students} knownTypes={knownTypes} />
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Documents on file</div>
                        <div className="text-2xl font-bold">{stats.total}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Verified</div>
                        <div className="text-2xl font-bold text-green-600">{stats.verified}</div>
                    </CardContent>
                </Card>
                <Card className={stats.pending > 0 ? 'border-2 border-amber-200' : undefined}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Awaiting check</div>
                        <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Students with a document</div>
                        <div className="text-2xl font-bold">{stats.studentsCovered}</div>
                        <div className="mt-1 text-xs text-gray-500">
                            of {stats.activeStudents} active
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="gap-3 pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="text-lg">Documents</CardTitle>
                        <div className="flex gap-1">
                            {TABS.map(tab => (
                                <Link
                                    key={tab}
                                    href={tabHref(tab)}
                                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                                        verification === tab
                                            ? 'bg-gray-900 text-white'
                                            : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    {TAB_LABELS[tab]}
                                </Link>
                            ))}
                        </div>
                    </div>
                    <DocumentFilters
                        verification={verification}
                        documentType={documentType}
                        search={search}
                        knownTypes={knownTypes}
                    />
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-y bg-gray-50 text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Student</th>
                                    <th className="px-4 py-3 font-medium">Document</th>
                                    <th className="px-4 py-3 font-medium">Type</th>
                                    <th className="px-4 py-3 text-right font-medium">Size</th>
                                    <th className="px-4 py-3 font-medium">Verification</th>
                                    <th className="px-4 py-3 font-medium">Uploaded</th>
                                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {documents.map(doc => (
                                    <tr key={doc.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900">
                                                {doc.studentName ?? 'Student record removed'}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {doc.admissionNumber ?? '—'}
                                                {doc.gradeName ? ` · ${doc.gradeName}${doc.sectionName ? `-${doc.sectionName}` : ''}` : ''}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {doc.fileUrl ? (
                                                <a
                                                    href={doc.fileUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-medium text-blue-600 hover:underline"
                                                >
                                                    {doc.fileName}
                                                </a>
                                            ) : (
                                                <span className="text-gray-900">{doc.fileName}</span>
                                            )}
                                            {!doc.fileUrl && (
                                                <div className="text-xs text-amber-700">
                                                    No stored file — record only
                                                </div>
                                            )}
                                            {doc.notes && (
                                                <div className="mt-0.5 max-w-xs text-xs text-gray-500">
                                                    {doc.notes}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                                                {doc.documentType}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-600">
                                            {formatFileSize(doc.fileSize)}
                                        </td>
                                        <td className="px-4 py-3">
                                            {doc.isVerified ? (
                                                <div>
                                                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                                                        Verified
                                                    </span>
                                                    <div className="mt-1 text-xs text-gray-500">
                                                        {doc.verifiedByName ? `by ${doc.verifiedByName}` : 'by an unknown user'}
                                                        {doc.verifiedAt ? ` · ${formatDateTime(doc.verifiedAt)}` : ''}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                                    Not checked
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            <div>{formatDateTime(doc.createdAt)}</div>
                                            {doc.uploadedByName && (
                                                <div className="text-xs text-gray-500">by {doc.uploadedByName}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <VerificationButton documentId={doc.id} isVerified={doc.isVerified} />
                                        </td>
                                    </tr>
                                ))}
                                {documents.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                                            {filtered
                                                ? 'No documents match these filters.'
                                                : 'No documents on file yet.'}
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
                    Showing the 500 most recent documents. Narrow the search to see older ones.
                </p>
            )}

            <p className="text-xs text-gray-500">
                Verifying a document records that a member of staff checked it against the original.
                Nothing is validated automatically, and no external register is contacted.
            </p>
        </div>
    );
}
