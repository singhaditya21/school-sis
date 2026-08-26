'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
    setStudentApaarId,
    type ApaarStudentRow,
    type DigilockerCertificateRow,
    type DigilockerSyncLogRow,
} from './actions';

interface Props {
    students: ApaarStudentRow[];
    certificates: DigilockerCertificateRow[];
    syncAttempts: DigilockerSyncLogRow[];
}

const syncBadgeClass: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-700',
    SUCCESS: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
};

export default function DigilockerClient({ students, certificates, syncAttempts }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [search, setSearch] = useState('');
    const [linkedFilter, setLinkedFilter] = useState<'all' | 'linked' | 'unlinked'>('all');
    const [editing, setEditing] = useState<ApaarStudentRow | null>(null);
    const [apaarInput, setApaarInput] = useState('');

    const linkedCount = students.filter((s) => s.apaarId).length;

    const filteredStudents = useMemo(() => {
        const q = search.trim().toLowerCase();
        return students.filter((s) => {
            if (linkedFilter === 'linked' && !s.apaarId) return false;
            if (linkedFilter === 'unlinked' && s.apaarId) return false;
            if (!q) return true;
            return [s.firstName, s.lastName, s.admissionNumber, s.apaarId ?? '', s.gradeName ?? '']
                .some((v) => v.toLowerCase().includes(q));
        });
    }, [students, search, linkedFilter]);

    function openEditor(student: ApaarStudentRow) {
        setEditing(student);
        setApaarInput(student.apaarId ?? '');
    }

    function handleSave(clear = false) {
        if (!editing) return;
        startTransition(async () => {
            const result = await setStudentApaarId(editing.studentId, clear ? null : apaarInput);
            if (result.success) {
                toast.success(clear ? 'APAAR ID cleared.' : 'APAAR ID recorded.');
                setEditing(null);
                router.refresh();
            } else {
                toast.error(result.error || 'Could not update the APAAR ID.');
            }
        });
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">DigiLocker &amp; APAAR</h1>
                    <p className="text-gray-600 mt-1">
                        APAAR ID register, issued documents, and the history of delivery attempts
                    </p>
                </div>
                <Link href="/certificates" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    ← Back to Certificates
                </Link>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-medium">Delivery to DigiLocker is not available in this release.</p>
                <p className="mt-1">
                    ScholarMind has no DigiLocker or NAD gateway integration, so documents cannot be
                    transmitted and APAAR IDs cannot be verified against the national registry from here.
                    What this page does maintain is your own record: the APAAR IDs your office has
                    collected, the certificates that are ready to hand over once a gateway exists, and any
                    delivery attempts already logged.
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Students</div>
                        <div className="text-2xl font-bold text-blue-600">{students.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">APAAR recorded</div>
                        <div className="text-2xl font-bold text-purple-600">{linkedCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Issued documents</div>
                        <div className="text-2xl font-bold text-emerald-600">{certificates.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Delivery attempts logged</div>
                        <div className="text-2xl font-bold text-gray-600">{syncAttempts.length}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="gap-3">
                    <CardTitle>APAAR ID Register</CardTitle>
                    <p className="text-sm text-gray-500">
                        Recorded locally by your office. ScholarMind does not check these against NAD.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search name, admission number, APAAR ID…"
                            className="w-full sm:w-80 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                            value={linkedFilter}
                            onChange={(e) => setLinkedFilter(e.target.value as 'all' | 'linked' | 'unlinked')}
                            aria-label="Filter by APAAR status"
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All students</option>
                            <option value="linked">APAAR recorded</option>
                            <option value="unlinked">No APAAR yet</option>
                        </select>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-y">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">APAAR ID</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredStudents.map((student) => (
                                    <tr key={student.studentId} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium">
                                                {student.firstName} {student.lastName}
                                            </div>
                                            <div className="text-xs text-gray-500">{student.admissionNumber}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {student.gradeName ?? '—'}
                                            {student.sectionName ? ` · ${student.sectionName}` : ''}
                                        </td>
                                        <td className="px-4 py-3">
                                            {student.apaarId ? (
                                                <span className="font-mono text-sm">{student.apaarId}</span>
                                            ) : (
                                                <span className="text-gray-400 text-sm">Not recorded</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => openEditor(student)}
                                                disabled={isPending}
                                                className="text-blue-600 hover:underline text-sm disabled:opacity-50"
                                            >
                                                {student.apaarId ? 'Edit' : 'Record APAAR ID'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredStudents.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                                            {students.length === 0
                                                ? 'No students on roll yet.'
                                                : 'No students match these filters.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Issued documents</CardTitle>
                    <p className="text-sm text-gray-500">
                        Certificates already issued from ScholarMind. These are what would be handed to
                        DigiLocker once a gateway is available.
                    </p>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-y">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">APAAR</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issued</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last delivery attempt</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {certificates.map((doc) => (
                                    <tr key={doc.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{doc.templateName || 'Certificate'}</div>
                                            {doc.templateType && (
                                                <Badge variant="outline" className="mt-1">
                                                    {doc.templateType}
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-sm">{doc.certificateNumber}</td>
                                        <td className="px-4 py-3 text-sm">{doc.studentName}</td>
                                        <td className="px-4 py-3 text-sm">
                                            {doc.apaarId ? (
                                                <span className="font-mono text-green-700">{doc.apaarId}</span>
                                            ) : (
                                                <span className="text-orange-500">Not recorded</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {new Date(`${doc.issuedDate}T00:00:00`).toLocaleDateString('en-IN')}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {doc.lastSyncStatus ? (
                                                <>
                                                    <Badge className={syncBadgeClass[doc.lastSyncStatus] || 'bg-gray-100 text-gray-600'}>
                                                        {doc.lastSyncStatus}
                                                    </Badge>
                                                    {doc.lastSyncError && (
                                                        <div className="text-xs text-red-500 mt-1">{doc.lastSyncError}</div>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-gray-400">Never attempted</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {certificates.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                                            No certificates have been issued yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Delivery attempt log</CardTitle>
                    <p className="text-sm text-gray-500">
                        Every recorded attempt to push a document, most recent first.
                    </p>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-y">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">When</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document type</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Result</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {syncAttempts.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                            {new Date(log.syncAttemptedAt).toLocaleString('en-IN')}
                                        </td>
                                        <td className="px-4 py-3 text-sm">{log.documentType}</td>
                                        <td className="px-4 py-3 text-sm">{log.studentName ?? '—'}</td>
                                        <td className="px-4 py-3 text-sm">
                                            <Badge className={syncBadgeClass[log.status] || 'bg-gray-100 text-gray-600'}>
                                                {log.status}
                                            </Badge>
                                            {log.errorMessage && (
                                                <div className="text-xs text-red-500 mt-1">{log.errorMessage}</div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {syncAttempts.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                                            No delivery has ever been attempted.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Dialog
                open={editing !== null}
                onOpenChange={(open) => {
                    if (!open) setEditing(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Record APAAR ID</DialogTitle>
                    </DialogHeader>
                    {editing && (
                        <div className="space-y-4 pt-2">
                            <div>
                                <p className="text-sm text-gray-500">Student</p>
                                <p className="font-medium">
                                    {editing.firstName} {editing.lastName} · {editing.admissionNumber}
                                </p>
                            </div>
                            <div>
                                <Label htmlFor="apaar-id">APAAR ID</Label>
                                <Input
                                    id="apaar-id"
                                    value={apaarInput}
                                    onChange={(e) => setApaarInput(e.target.value)}
                                    placeholder="12-digit number"
                                    inputMode="numeric"
                                    className="mt-1 font-mono"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Stored in ScholarMind only. It is not checked against NAD, because no
                                    verification service is connected.
                                </p>
                            </div>
                            <div className="flex justify-between gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => handleSave(true)}
                                    disabled={isPending || !editing.apaarId}
                                    className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                                >
                                    Clear
                                </button>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setEditing(null)}
                                        className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleSave(false)}
                                        disabled={isPending}
                                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
