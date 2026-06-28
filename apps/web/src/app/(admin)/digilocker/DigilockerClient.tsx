'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { pushToDigilocker, verifyAPAARId } from '@/lib/actions/digilocker';

const DIGILOCKER_DOCUMENT_TYPES = [
    { value: 'MARK_SHEET', code: 'MRKSHT', label: 'Mark Sheet' },
    { value: 'TRANSFER_CERTIFICATE', code: 'TRNCERT', label: 'Transfer Certificate' },
    { value: 'MIGRATION_CERTIFICATE', code: 'MIGCERT', label: 'Migration Certificate' },
    { value: 'PASSING_CERTIFICATE', code: 'PASSCERT', label: 'Passing Certificate' }
];

export default function DigilockerClient({ initialDocuments, initialStudents }: { initialDocuments: any[], initialStudents: any[] }) {
    const [documents, setDocuments] = useState(initialDocuments);
    const [students, setStudents] = useState(initialStudents);
    const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'SUCCESS' | 'FAILED'>('ALL');
    const [pushing, setPushing] = useState<string | null>(null);
    const [showVerifyDialog, setShowVerifyDialog] = useState(false);
    const [verifyStudent, setVerifyStudent] = useState<any | null>(null);
    const [newAaparId, setNewAaparId] = useState('');
    const [verifyResult, setVerifyResult] = useState<{ success: boolean; message: string } | null>(null);

    const getDigiLockerStats = () => ({
        totalDocuments: documents.length,
        pending: documents.filter(d => d.status === 'PENDING').length,
        pushed: documents.filter(d => d.status === 'SUCCESS').length,
        failed: documents.filter(d => d.status === 'FAILED').length,
        studentsLinked: students.filter(s => s.apaarId).length,
    });

    const stats = getDigiLockerStats();
    const filteredDocs = documents.filter(d => filter === 'ALL' || d.status === filter);

    const getStatusBadge = (status: string) => {
        const config: Record<string, { color: string; icon: string }> = {
            PENDING: { color: 'bg-yellow-100 text-yellow-700', icon: '⏳' },
            SUCCESS: { color: 'bg-green-100 text-green-700', icon: '✅' },
            FAILED: { color: 'bg-red-100 text-red-700', icon: '❌' },
        };
        const st = config[status] || config['PENDING'];
        return <Badge className={st.color}>{st.icon} {status}</Badge>;
    };

    const getTypeBadge = (type: string) => {
        const docType = DIGILOCKER_DOCUMENT_TYPES.find(t => t.value === type);
        return <Badge variant="outline">{docType?.code || type}</Badge>;
    };

    const handlePush = async (doc: any) => {
        setPushing(doc.id);
        const result = await pushToDigilocker(doc.studentId, doc.documentType);
        setDocuments(prev => prev.map(d => {
            if (d.id === doc.id) {
                if (result.success) {
                    return { ...d, status: 'SUCCESS', digiLockerUri: result.uri, pushedAt: new Date().toISOString() };
                } else {
                    return { ...d, status: 'FAILED', errorMessage: 'Push failed' };
                }
            }
            return d;
        }));
        setPushing(null);
    };

    const handleVerifyAPAAR = async () => {
        if (!verifyStudent || !newAaparId) return;
        const result = await verifyAPAARId(verifyStudent.studentId, newAaparId);
        setVerifyResult(result);
        if (result.success) {
            setStudents(prev => prev.map(s => s.studentId === verifyStudent.studentId ? { ...s, apaarId: newAaparId, verified: true } : s));
            setDocuments(prev => prev.map(d => d.studentId === verifyStudent.studentId ? { ...d, apaarId: newAaparId } : d));
        }
    };

    const openVerifyDialog = (student: any) => {
        setVerifyStudent(student);
        setNewAaparId(student.apaarId || '');
        setVerifyResult(null);
        setShowVerifyDialog(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">DigiLocker Integration</h1><p className="text-gray-600 mt-1">Push certificates and documents to DigiLocker via NAD gateway</p></div>
                <Link href="/certificates" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">← Back to Certificates</Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="cursor-pointer" onClick={() => setFilter('ALL')}><CardContent className="pt-4"><div className="text-sm text-gray-500">Total</div><div className="text-2xl font-bold text-blue-600">{stats.totalDocuments}</div></CardContent></Card>
                <Card className="cursor-pointer" onClick={() => setFilter('PENDING')}><CardContent className="pt-4"><div className="text-sm text-gray-500">Pending</div><div className="text-2xl font-bold text-yellow-600">{stats.pending}</div></CardContent></Card>
                <Card className="cursor-pointer" onClick={() => setFilter('SUCCESS')}><CardContent className="pt-4"><div className="text-sm text-gray-500">Pushed</div><div className="text-2xl font-bold text-green-600">{stats.pushed}</div></CardContent></Card>
                <Card className="cursor-pointer" onClick={() => setFilter('FAILED')}><CardContent className="pt-4"><div className="text-sm text-gray-500">Failed</div><div className="text-2xl font-bold text-red-600">{stats.failed}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">APAAR Linked</div><div className="text-2xl font-bold text-purple-600">{stats.studentsLinked}</div></CardContent></Card>
            </div>

            <Card>
                <CardHeader><CardTitle>Documents ({filter === 'ALL' ? 'All' : filter})</CardTitle></CardHeader>
                <CardContent>
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document #</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">APAAR ID</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filteredDocs.map(doc => (
                                <tr key={doc.id} className={`hover:bg-gray-50 ${doc.status === 'FAILED' ? 'bg-red-50' : ''}`}>
                                    <td className="px-4 py-3">{getTypeBadge(doc.documentType)}</td>
                                    <td className="px-4 py-3 font-mono text-sm">{doc.documentNumber || 'N/A'}</td>
                                    <td className="px-4 py-3 font-medium">{doc.studentName} {doc.studentLastName}</td>
                                    <td className="px-4 py-3">{doc.apaarId ? <span className="font-mono text-sm text-green-600">{doc.apaarId}</span> : <span className="text-orange-500 text-sm">Not linked</span>}</td>
                                    <td className="px-4 py-3">{getStatusBadge(doc.status)}{doc.errorMessage && <div className="text-xs text-red-500 mt-1">{doc.errorMessage}</div>}</td>
                                    <td className="px-4 py-3">
                                        {doc.status === 'PENDING' && <button onClick={() => handlePush(doc)} disabled={pushing === doc.id || !doc.apaarId} className={`px-3 py-1 text-sm rounded ${pushing === doc.id ? 'bg-gray-300' : doc.apaarId ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>{pushing === doc.id ? 'Pushing...' : '📤 Push'}</button>}
                                        {doc.status === 'FAILED' && <button onClick={() => handlePush(doc)} disabled={pushing === doc.id} className="px-3 py-1 text-sm bg-orange-600 text-white rounded hover:bg-orange-700">🔄 Retry</button>}
                                        {doc.status === 'SUCCESS' && doc.digiLockerUri && <span className="text-xs text-gray-500 font-mono">{doc.digiLockerUri}</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>APAAR ID Management</CardTitle></CardHeader>
                <CardContent>
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">APAAR ID</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {students.map(student => (
                                <tr key={student.studentId} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium">{student.firstName} {student.lastName}</td>
                                    <td className="px-4 py-3">{student.apaarId ? <span className="font-mono text-sm">{student.apaarId}</span> : <span className="text-gray-400">Not linked</span>}</td>
                                    <td className="px-4 py-3">{student.apaarId ? <Badge className="bg-green-100 text-green-700">✅ Linked</Badge> : <Badge variant="outline">Not linked</Badge>}</td>
                                    <td className="px-4 py-3"><button onClick={() => openVerifyDialog(student)} className="text-blue-600 hover:underline text-sm">{student.apaarId ? 'Update/Verify' : 'Link APAAR'}</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Link/Verify APAAR ID</DialogTitle></DialogHeader>
                    {verifyStudent && (
                        <div className="space-y-4 pt-4">
                            <div><label className="block text-sm font-medium mb-1">Student</label><p className="font-medium">{verifyStudent.firstName} {verifyStudent.lastName}</p></div>
                            <div>
                                <label className="block text-sm font-medium mb-1">APAAR ID</label>
                                <input type="text" value={newAaparId} onChange={(e) => setNewAaparId(e.target.value.toUpperCase())} placeholder="APAAR123456789" className="w-full px-4 py-2 border rounded-lg font-mono" />
                            </div>
                            {verifyResult && <div className={`p-3 rounded-lg ${verifyResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{verifyResult.message}</div>}
                            <div className="flex justify-end gap-3 pt-4">
                                <button onClick={() => setShowVerifyDialog(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-50">Close</button>
                                <button onClick={handleVerifyAPAAR} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Verify with NAD</button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
