'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
    openApplication,
    recordAdmissionDocument,
    removeAdmissionDocument,
    setAdmissionDocumentVerified,
    type LeadDocumentPack,
} from '../../actions';

interface Props {
    pack: LeadDocumentPack;
}

function statusOf(item: LeadDocumentPack['items'][number]) {
    if (!item.document) return { label: 'Not received', className: 'bg-gray-100 text-gray-600' };
    if (!item.document.verifiedAt) return { label: 'Awaiting check', className: 'bg-amber-100 text-amber-700' };
    return { label: 'Verified', className: 'bg-emerald-100 text-emerald-700' };
}

export default function DocumentsChecklist({ pack }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [dialogType, setDialogType] = useState<string | null>(null);
    const [customType, setCustomType] = useState('');
    const [fileName, setFileName] = useState('');
    const [fileUrl, setFileUrl] = useState('');
    const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

    const isCustom = dialogType === '__other__';

    function openDialog(documentType: string, existingName?: string, existingUrl?: string) {
        setDialogType(documentType);
        setCustomType('');
        setFileName(existingName ?? '');
        setFileUrl(existingUrl ?? '');
    }

    function closeDialog() {
        setDialogType(null);
        setCustomType('');
        setFileName('');
        setFileUrl('');
    }

    function handleRecord() {
        const type = isCustom ? customType : dialogType;
        if (!type) return;
        startTransition(async () => {
            const result = await recordAdmissionDocument(pack.leadId, type, fileName, fileUrl);
            if (result.success) {
                toast.success(`${type} recorded.`);
                closeDialog();
                router.refresh();
            } else {
                toast.error(result.error || 'Could not record the document.');
            }
        });
    }

    function handleVerify(documentId: string, verified: boolean) {
        startTransition(async () => {
            const result = await setAdmissionDocumentVerified(pack.leadId, documentId, verified);
            if (result.success) {
                toast.success(verified ? 'Marked as verified.' : 'Verification cleared.');
                router.refresh();
            } else {
                toast.error(result.error || 'Could not update the document.');
            }
        });
    }

    function handleRemove(documentId: string) {
        startTransition(async () => {
            const result = await removeAdmissionDocument(pack.leadId, documentId);
            if (result.success) {
                toast.success('Document record removed.');
                setConfirmRemoveId(null);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not remove the document.');
            }
        });
    }

    function handleOpenApplication() {
        startTransition(async () => {
            const result = await openApplication(pack.leadId);
            if (result.success) {
                toast.success(`Application ${result.applicationNumber} opened.`);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not open an application.');
            }
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Document Checklist</h1>
                    <p className="text-muted-foreground mt-1">
                        {pack.childName} • {pack.applyingForGrade}
                        {pack.applicationNumber ? ` • Application ${pack.applicationNumber}` : ''}
                    </p>
                </div>
                <Link href={`/admissions/${pack.leadId}`} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                    ← Back to lead
                </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-5">
                        <div className="text-sm text-gray-500">Recorded</div>
                        <div className="text-2xl font-bold text-blue-600">{pack.recordedCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-5">
                        <div className="text-sm text-gray-500">Verified</div>
                        <div className="text-2xl font-bold text-emerald-600">{pack.verifiedCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-5">
                        <div className="text-sm text-gray-500">Required still outstanding</div>
                        <div className="text-2xl font-bold text-amber-600">{pack.requiredOutstanding}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-medium">In-app file upload is not available in this release.</p>
                <p className="mt-1">
                    No file storage provider is configured for this deployment, so ScholarMind cannot host the
                    scans itself. Record where each document is stored (a link to your drive or document
                    management system) and the office can verify it from here.
                </p>
            </div>

            {!pack.applicationId && (
                <Card>
                    <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">No application opened yet</p>
                            <p className="text-sm text-muted-foreground mt-1">
                                Documents are filed against an application record. Recording the first document
                                opens one automatically, or you can open it now.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleOpenApplication}
                            disabled={isPending}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                        >
                            Open application
                        </button>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Checklist</CardTitle>
                    <button
                        type="button"
                        onClick={() => openDialog('__other__')}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900"
                    >
                        + Other document
                    </button>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-900 border-y">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stored file</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Checked by</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {pack.items.map((item) => {
                                    const status = statusOf(item);
                                    const doc = item.document;
                                    return (
                                        <tr key={item.documentType} className="hover:bg-gray-50 dark:hover:bg-gray-900/40">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-900 dark:text-white">{item.documentType}</div>
                                                {!item.required && (
                                                    <div className="text-xs text-gray-400">Additional</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge className={status.className}>{status.label}</Badge>
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                {doc ? (
                                                    <a
                                                        href={doc.fileUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                                                    >
                                                        {doc.fileName}
                                                    </a>
                                                ) : (
                                                    <span className="text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-muted-foreground">
                                                {doc?.verifiedAt
                                                    ? `${doc.verifiedByName || 'Staff'} • ${new Date(doc.verifiedAt).toLocaleDateString('en-IN')}`
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-2 flex-wrap">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            openDialog(
                                                                item.documentType,
                                                                doc?.fileName,
                                                                doc?.fileUrl,
                                                            )
                                                        }
                                                        disabled={isPending}
                                                        className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50"
                                                    >
                                                        {doc ? 'Replace link' : 'Record link'}
                                                    </button>
                                                    {doc && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleVerify(doc.id, !doc.verifiedAt)}
                                                            disabled={isPending}
                                                            className="px-3 py-1 text-xs border border-blue-200 text-blue-600 rounded hover:bg-blue-50 disabled:opacity-50"
                                                        >
                                                            {doc.verifiedAt ? 'Unverify' : 'Verify'}
                                                        </button>
                                                    )}
                                                    {doc && (
                                                        confirmRemoveId === doc.id ? (
                                                            <span className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemove(doc.id)}
                                                                    disabled={isPending}
                                                                    className="px-3 py-1 text-xs bg-red-600 text-white rounded disabled:opacity-50"
                                                                >
                                                                    Confirm
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setConfirmRemoveId(null)}
                                                                    className="px-2 py-1 text-xs text-gray-500"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setConfirmRemoveId(doc.id)}
                                                                disabled={isPending}
                                                                className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                                                            >
                                                                Remove
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={dialogType !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{isCustom ? 'Record another document' : `Record ${dialogType}`}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        {isCustom && (
                            <div>
                                <Label htmlFor="doc-type">Document type</Label>
                                <Input
                                    id="doc-type"
                                    value={customType}
                                    onChange={(e) => setCustomType(e.target.value)}
                                    placeholder="e.g. Caste Certificate"
                                    className="mt-1"
                                />
                            </div>
                        )}
                        <div>
                            <Label htmlFor="doc-name">File name</Label>
                            <Input
                                id="doc-name"
                                value={fileName}
                                onChange={(e) => setFileName(e.target.value)}
                                placeholder="e.g. birth-certificate.pdf"
                                className="mt-1"
                            />
                        </div>
                        <div>
                            <Label htmlFor="doc-url">Link to the stored file</Label>
                            <Input
                                id="doc-url"
                                value={fileUrl}
                                onChange={(e) => setFileUrl(e.target.value)}
                                placeholder="https://…"
                                className="mt-1"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                                Must be a full http(s) link. The file stays wherever your school already keeps it.
                            </p>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={closeDialog}
                                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleRecord}
                                disabled={isPending}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                            >
                                Save record
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
