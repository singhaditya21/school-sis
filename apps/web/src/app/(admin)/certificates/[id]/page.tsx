import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { requireAuth } from '@/lib/auth/middleware';
import { getCertificateRecord } from '../_lib/actions';
import { certificateTypeLabel, formatDate, formatDateTime } from '../_lib/labels';
import RevokeCertificateDialog from '../revoke-certificate-dialog';
import PrintButton from './print-button';

export const dynamic = 'force-dynamic';

/**
 * Isolates the certificate sheet when the browser prints, so the admin chrome
 * around it does not end up on the page.
 */
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #certificate-sheet, #certificate-sheet * { visibility: visible !important; }
  #certificate-sheet {
    position: absolute; left: 0; top: 0; width: 100%;
    border: none !important; box-shadow: none !important;
  }
}
`;

function stringField(data: Record<string, unknown>, key: string): string | null {
    const value = data?.[key];
    return typeof value === 'string' && value.trim() ? value : null;
}

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function CertificateRecordPage({ params }: PageProps) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    try {
        await requireAuth('certificate:read');
    } catch {
        redirect('/unauthorized');
    }

    const { id } = await params;
    const record = await getCertificateRecord(id);
    if (!record) notFound();

    const snapshot = (record.data ?? {}) as Record<string, unknown>;
    // The snapshot is the truth for a document already handed to a family; the
    // live student row is only a fallback for records issued before snapshots.
    const studentName = stringField(snapshot, 'studentName') ?? record.studentName;
    const admissionNumber = stringField(snapshot, 'admissionNumber') ?? record.admissionNumber;
    const gradeName = stringField(snapshot, 'gradeName') ?? record.gradeName;
    const sectionName = stringField(snapshot, 'sectionName') ?? record.sectionName;
    const dateOfBirth = stringField(snapshot, 'dateOfBirth');
    const admissionDate = stringField(snapshot, 'admissionDate');
    const remarks = stringField(snapshot, 'remarks');
    const hasSnapshot = stringField(snapshot, 'studentName') !== null;

    const schoolLocation = [record.schoolCity, record.schoolState].filter(Boolean).join(', ');
    const affiliation = [record.schoolAffiliationBoard, record.schoolAffiliationNumber]
        .filter(Boolean)
        .join(' · ');

    return (
        <div className="space-y-6">
            <style>{PRINT_CSS}</style>

            <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
                <div>
                    <Link href="/certificates" className="text-sm text-blue-600 hover:underline">
                        ← Certificates
                    </Link>
                    <h1 className="mt-1 text-2xl font-bold">{record.certificateNumber}</h1>
                    <p className="mt-1 text-gray-600">
                        {certificateTypeLabel(record.type)}
                        {record.templateName ? ` · ${record.templateName}` : ''}
                    </p>
                </div>
                <div className="flex gap-2">
                    <PrintButton />
                    {record.status === 'ISSUED' && (
                        <RevokeCertificateDialog
                            certificateId={record.id}
                            certificateNumber={record.certificateNumber}
                            studentName={studentName}
                            triggerLabel="Revoke certificate"
                        />
                    )}
                </div>
            </div>

            {record.status === 'REVOKED' && (
                <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4 print:hidden" role="alert">
                    <div className="font-semibold text-red-800">This certificate has been revoked</div>
                    <div className="mt-1 text-sm text-red-700">
                        Revoked {formatDateTime(record.revokedAt)}
                        {record.revokeReason ? ` — ${record.revokeReason}` : ''}
                    </div>
                </div>
            )}

            {record.status === 'DRAFT' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 print:hidden">
                    This record is still a draft and has not been issued.
                </div>
            )}

            <div
                id="certificate-sheet"
                className="mx-auto max-w-3xl rounded-lg border-2 border-gray-300 bg-white p-10"
            >
                <header className="border-b-2 border-gray-800 pb-4 text-center">
                    <h2 className="text-2xl font-bold tracking-wide text-gray-900">{record.schoolName}</h2>
                    {record.schoolAddress && (
                        <p className="mt-1 text-sm text-gray-600">{record.schoolAddress}</p>
                    )}
                    {schoolLocation && <p className="text-sm text-gray-600">{schoolLocation}</p>}
                    {affiliation && <p className="mt-1 text-xs text-gray-500">{affiliation}</p>}
                    {record.schoolUdiseCode && (
                        <p className="text-xs text-gray-500">UDISE: {record.schoolUdiseCode}</p>
                    )}
                </header>

                <div className="mt-6 flex items-baseline justify-between text-sm">
                    <span className="font-mono font-semibold text-gray-900">
                        No. {record.certificateNumber}
                    </span>
                    <span className="text-gray-600">Date: {formatDate(record.issuedDate)}</span>
                </div>

                <h3 className="mt-6 text-center text-lg font-bold uppercase tracking-widest text-gray-900">
                    {certificateTypeLabel(record.type)}
                </h3>

                {record.status === 'REVOKED' && (
                    <p className="mt-4 border-2 border-red-500 py-2 text-center text-sm font-bold uppercase tracking-widest text-red-600">
                        Revoked
                    </p>
                )}

                <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-gray-500">Name of student</dt>
                        <dd className="mt-0.5 font-semibold text-gray-900">{studentName ?? '—'}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-gray-500">Admission number</dt>
                        <dd className="mt-0.5 font-semibold text-gray-900">{admissionNumber ?? '—'}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-gray-500">Class</dt>
                        <dd className="mt-0.5 text-gray-900">
                            {gradeName ? `${gradeName}${sectionName ? ` — ${sectionName}` : ''}` : '—'}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-gray-500">Date of birth</dt>
                        <dd className="mt-0.5 text-gray-900">{dateOfBirth ? formatDate(dateOfBirth) : '—'}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-gray-500">Date of admission</dt>
                        <dd className="mt-0.5 text-gray-900">{admissionDate ? formatDate(admissionDate) : '—'}</dd>
                    </div>
                    <div>
                        <dt className="text-xs uppercase tracking-wide text-gray-500">Issued by</dt>
                        <dd className="mt-0.5 text-gray-900">{record.issuedByName ?? '—'}</dd>
                    </div>
                </dl>

                {remarks && (
                    <div className="mt-6">
                        <dt className="text-xs uppercase tracking-wide text-gray-500">Remarks</dt>
                        <dd className="mt-1 whitespace-pre-line text-gray-900">{remarks}</dd>
                    </div>
                )}

                <div className="mt-16 flex justify-end">
                    <div className="w-56 border-t border-gray-800 pt-2 text-center text-sm text-gray-700">
                        Principal / Registrar
                    </div>
                </div>
            </div>

            <div className="mx-auto max-w-3xl space-y-1 text-xs text-gray-500 print:hidden">
                <p>
                    {hasSnapshot
                        ? 'Student details are shown exactly as they were recorded when this certificate was issued.'
                        : 'This record predates issue-time snapshots, so student details are read from the current student record and may have changed since issue.'}
                </p>
                <p>Recorded in the register {formatDateTime(record.createdAt)}.</p>
            </div>
        </div>
    );
}
