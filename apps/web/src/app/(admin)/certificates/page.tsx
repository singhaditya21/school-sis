'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CertificateRequest {
    id: string;
    type: 'TC' | 'CHARACTER' | 'BONAFIDE' | 'MIGRATION';
    studentName: string;
    studentClass: string;
    admissionNumber: string;
    requestDate: string;
    status: 'pending' | 'approved' | 'issued';
    issuedDate?: string;
}

// Mock certificate requests
const mockCertificates: CertificateRequest[] = [
    { id: 'c1', type: 'TC', studentName: 'Rahul Sharma', studentClass: '10-A', admissionNumber: 'GWD2020001', requestDate: '2026-01-20', status: 'issued', issuedDate: '2026-01-21' },
    { id: 'c2', type: 'CHARACTER', studentName: 'Priya Patel', studentClass: '12-B', admissionNumber: 'GWD2018015', requestDate: '2026-01-19', status: 'approved' },
    { id: 'c3', type: 'BONAFIDE', studentName: 'Arjun Singh', studentClass: '8-C', admissionNumber: 'GWD2022034', requestDate: '2026-01-18', status: 'pending' },
    { id: 'c4', type: 'MIGRATION', studentName: 'Ananya Gupta', studentClass: '12-A', admissionNumber: 'GWD2018023', requestDate: '2026-01-17', status: 'issued', issuedDate: '2026-01-19' },
    { id: 'c5', type: 'TC', studentName: 'Vivaan Reddy', studentClass: '9-B', admissionNumber: 'GWD2021045', requestDate: '2026-01-15', status: 'pending' },
];

// Mock students for selection
const mockStudents = [
    { id: 's1', name: 'Aarav Sharma', class: '10-A', admissionNumber: 'GWD2020001' },
    { id: 's2', name: 'Priya Patel', class: '12-B', admissionNumber: 'GWD2018015' },
    { id: 's3', name: 'Arjun Singh', class: '8-C', admissionNumber: 'GWD2022034' },
    { id: 's4', name: 'Ananya Gupta', class: '12-A', admissionNumber: 'GWD2018023' },
    { id: 's5', name: 'Vivaan Reddy', class: '9-B', admissionNumber: 'GWD2021045' },
    { id: 's6', name: 'Saanvi Jain', class: '11-A', admissionNumber: 'GWD2019056' },
    { id: 's7', name: 'Krishna Menon', class: '7-A', admissionNumber: 'GWD2023067' },
    { id: 's8', name: 'Kavya Nair', class: '6-B', admissionNumber: 'GWD2024078' },
];

const certificateTypes = [
    { value: 'TC', label: 'Transfer Certificate', icon: '📜', description: 'For students leaving the school' },
    { value: 'CHARACTER', label: 'Character Certificate', icon: '⭐', description: 'Good conduct and character attestation' },
    { value: 'BONAFIDE', label: 'Bonafide Certificate', icon: '📋', description: 'Proof of enrollment in the school' },
    { value: 'MIGRATION', label: 'Migration Certificate', icon: '🎓', description: 'For board/university transfers' },
];

export default function CertificatesPage() {
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [showPreviewDialog, setShowPreviewDialog] = useState(false);
    const [certificates, setCertificates] = useState(mockCertificates);
    const [selectedCertificate, setSelectedCertificate] = useState<CertificateRequest | null>(null);
    const [formData, setFormData] = useState({
        type: 'TC' as CertificateRequest['type'],
        studentId: '',
        reason: '',
    });

    const getTypeBadge = (type: CertificateRequest['type']) => {
        const colors: Record<string, string> = {
            TC: 'bg-blue-100 text-blue-700',
            CHARACTER: 'bg-green-100 text-green-700',
            BONAFIDE: 'bg-purple-100 text-purple-700',
            MIGRATION: 'bg-orange-100 text-orange-700',
        };
        return <Badge className={colors[type]}>{type}</Badge>;
    };

    const getStatusBadge = (status: CertificateRequest['status']) => {
        switch (status) {
            case 'pending': return <Badge className="bg-yellow-500">Pending</Badge>;
            case 'approved': return <Badge className="bg-blue-500">Approved</Badge>;
            case 'issued': return <Badge className="bg-green-500">Issued</Badge>;
        }
    };

    const handleCreateCertificate = () => {
        const student = mockStudents.find(s => s.id === formData.studentId);
        if (!student) return;

        const newCert: CertificateRequest = {
            id: `c${certificates.length + 1}`,
            type: formData.type,
            studentName: student.name,
            studentClass: student.class,
            admissionNumber: student.admissionNumber,
            requestDate: new Date().toISOString().split('T')[0],
            status: 'pending',
        };

        setCertificates([newCert, ...certificates]);
        setShowCreateDialog(false);
        setFormData({ type: 'TC', studentId: '', reason: '' });
    };

    const handlePreview = (cert: CertificateRequest) => {
        setSelectedCertificate(cert);
        setShowPreviewDialog(true);
    };

    const pendingCount = certificates.filter(c => c.status === 'pending').length;
    const issuedCount = certificates.filter(c => c.status === 'issued').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Certificate Issuance</h1>
                    <p className="text-gray-600 mt-1">Generate TC, Character, Bonafide, and Migration certificates</p>
                </div>
                <button
                    onClick={() => setShowCreateDialog(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    + New Certificate Request
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Total Requests</div>
                        <div className="text-2xl font-bold text-blue-600">{certificates.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Pending Approval</div>
                        <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">Issued This Month</div>
                        <div className="text-2xl font-bold text-green-600">{issuedCount}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-gray-500">DigiLocker Pushed</div>
                        <div className="text-2xl font-bold text-purple-600">12</div>
                    </CardContent>
                </Card>
            </div>

            {/* Certificate Types Quick Access */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {certificateTypes.map(type => (
                    <Card key={type.value} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => {
                        setFormData({ ...formData, type: type.value as CertificateRequest['type'] });
                        setShowCreateDialog(true);
                    }}>
                        <CardContent className="pt-4 text-center">
                            <div className="text-3xl mb-2">{type.icon}</div>
                            <div className="font-medium">{type.label}</div>
                            <div className="text-xs text-gray-500 mt-1">{type.description}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Certificates Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Certificate Requests</CardTitle>
                </CardHeader>
                <CardContent>
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Admission #</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Request Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {certificates.map(cert => (
                                <tr key={cert.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">{getTypeBadge(cert.type)}</td>
                                    <td className="px-4 py-3 font-medium">{cert.studentName}</td>
                                    <td className="px-4 py-3">{cert.studentClass}</td>
                                    <td className="px-4 py-3 text-gray-500">{cert.admissionNumber}</td>
                                    <td className="px-4 py-3">{new Date(cert.requestDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                                    <td className="px-4 py-3">{getStatusBadge(cert.status)}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handlePreview(cert)}
                                                className="text-blue-600 hover:underline text-sm"
                                            >
                                                Preview
                                            </button>
                                            {cert.status === 'issued' && (
                                                <button className="text-green-600 hover:underline text-sm">
                                                    Download
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* Create Dialog */}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Certificate Request</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Certificate Type</label>
                            <select
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value as CertificateRequest['type'] })}
                                className="w-full px-3 py-2 border rounded-lg"
                            >
                                {certificateTypes.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Student</label>
                            <select
                                value={formData.studentId}
                                onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg"
                            >
                                <option value="">Select student...</option>
                                {mockStudents.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} ({s.class})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Reason / Remarks</label>
                            <textarea
                                value={formData.reason}
                                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                                placeholder="Enter reason for certificate request..."
                                className="w-full px-3 py-2 border rounded-lg"
                                rows={3}
                            />
                        </div>
                        <div className="flex justify-end gap-3 pt-4">
                            <button
                                onClick={() => setShowCreateDialog(false)}
                                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateCertificate}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            >
                                Create Request
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Certificate Preview</DialogTitle>
                    </DialogHeader>
                    {selectedCertificate && (
                        <div className="border-2 border-gray-300 p-8 bg-white">
                            <div className="text-center mb-6">
                                <div className="text-2xl font-bold text-blue-800">GREENWOOD INTERNATIONAL SCHOOL</div>
                                <div className="text-sm text-gray-600">Affiliated to CBSE, New Delhi</div>
                                <div className="text-sm text-gray-600">School Code: 1234567</div>
                            </div>
                            <div className="text-center mb-6">
                                <div className="text-xl font-bold underline">
                                    {certificateTypes.find(t => t.value === selectedCertificate.type)?.label.toUpperCase()}
                                </div>
                            </div>
                            <div className="space-y-3 text-sm">
                                <p><span className="font-medium">Certificate No:</span> GWD/{selectedCertificate.type}/2026/{selectedCertificate.id.replace('c', '')}</p>
                                <p><span className="font-medium">Student Name:</span> {selectedCertificate.studentName}</p>
                                <p><span className="font-medium">Admission Number:</span> {selectedCertificate.admissionNumber}</p>
                                <p><span className="font-medium">Class:</span> {selectedCertificate.studentClass}</p>
                                <p><span className="font-medium">Date of Issue:</span> {selectedCertificate.issuedDate || 'Pending'}</p>
                            </div>
                            <div className="mt-8 text-sm">
                                <p>This is to certify that the above-named student is/was a bonafide student of this institution.</p>
                            </div>
                            <div className="mt-12 flex justify-between text-sm">
                                <div className="text-center">
                                    <div className="border-t border-gray-400 pt-1 w-32">Class Teacher</div>
                                </div>
                                <div className="text-center">
                                    <div className="border-t border-gray-400 pt-1 w-32">Principal</div>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
