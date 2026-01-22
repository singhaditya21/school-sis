'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const grades = [
    'Nursery', 'LKG', 'UKG',
    'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
    'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
    'Class 11 Science', 'Class 11 Commerce', 'Class 12 Science', 'Class 12 Commerce'
];

export default function ApplyPage() {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        studentName: '',
        dob: '',
        gender: '',
        grade: '',
        parentName: '',
        relation: '',
        email: '',
        phone: '',
        address: '',
        previousSchool: '',
        documents: [] as string[],
    });
    const [submitted, setSubmitted] = useState(false);
    const [applicationId, setApplicationId] = useState('');

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = () => {
        const id = `GWD-2026-${Math.floor(10000 + Math.random() * 90000)}`;
        setApplicationId(id);
        setSubmitted(true);
    };

    if (submitted) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-6">
                <Card className="max-w-lg w-full text-center">
                    <CardContent className="pt-8 pb-8">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <span className="text-4xl">✅</span>
                        </div>
                        <h1 className="text-2xl font-bold text-green-700 mb-2">Application Submitted!</h1>
                        <p className="text-gray-600 mb-6">Your application has been received successfully.</p>
                        <div className="bg-gray-50 p-4 rounded-lg mb-6">
                            <p className="text-sm text-gray-500">Application ID</p>
                            <p className="text-2xl font-mono font-bold text-blue-600">{applicationId}</p>
                        </div>
                        <p className="text-sm text-gray-500 mb-6">
                            Please save this ID for future reference. We will contact you within 3-5 working days.
                        </p>
                        <Link href="/admissions" className="text-blue-600 hover:underline">
                            ← Back to Admissions Page
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 py-12 px-6">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8">
                    <Link href="/admissions" className="text-blue-600 hover:underline text-sm">
                        ← Back to Admissions
                    </Link>
                    <h1 className="text-3xl font-bold mt-4">Admission Application</h1>
                    <p className="text-gray-600">Academic Year 2026-27</p>
                </div>

                {/* Progress */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    {[1, 2, 3].map(s => (
                        <div key={s} className="flex items-center gap-2">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                                }`}>
                                {s}
                            </div>
                            {s < 3 && <div className={`w-12 h-1 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />}
                        </div>
                    ))}
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>
                            {step === 1 && 'Student Information'}
                            {step === 2 && 'Parent/Guardian Details'}
                            {step === 3 && 'Review & Submit'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {step === 1 && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Student Full Name *</label>
                                    <input
                                        type="text"
                                        value={formData.studentName}
                                        onChange={(e) => handleChange('studentName', e.target.value)}
                                        className="w-full px-4 py-2 border rounded-lg"
                                        placeholder="Enter full name"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Date of Birth *</label>
                                        <input
                                            type="date"
                                            value={formData.dob}
                                            onChange={(e) => handleChange('dob', e.target.value)}
                                            className="w-full px-4 py-2 border rounded-lg"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Gender *</label>
                                        <select
                                            value={formData.gender}
                                            onChange={(e) => handleChange('gender', e.target.value)}
                                            className="w-full px-4 py-2 border rounded-lg"
                                        >
                                            <option value="">Select</option>
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Applying for Grade *</label>
                                    <select
                                        value={formData.grade}
                                        onChange={(e) => handleChange('grade', e.target.value)}
                                        className="w-full px-4 py-2 border rounded-lg"
                                    >
                                        <option value="">Select grade</option>
                                        {grades.map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Previous School (if any)</label>
                                    <input
                                        type="text"
                                        value={formData.previousSchool}
                                        onChange={(e) => handleChange('previousSchool', e.target.value)}
                                        className="w-full px-4 py-2 border rounded-lg"
                                        placeholder="School name"
                                    />
                                </div>
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Parent/Guardian Name *</label>
                                    <input
                                        type="text"
                                        value={formData.parentName}
                                        onChange={(e) => handleChange('parentName', e.target.value)}
                                        className="w-full px-4 py-2 border rounded-lg"
                                        placeholder="Full name"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Relation *</label>
                                    <select
                                        value={formData.relation}
                                        onChange={(e) => handleChange('relation', e.target.value)}
                                        className="w-full px-4 py-2 border rounded-lg"
                                    >
                                        <option value="">Select</option>
                                        <option value="Father">Father</option>
                                        <option value="Mother">Mother</option>
                                        <option value="Guardian">Guardian</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Email *</label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => handleChange('email', e.target.value)}
                                            className="w-full px-4 py-2 border rounded-lg"
                                            placeholder="email@example.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium mb-1">Phone *</label>
                                        <input
                                            type="tel"
                                            value={formData.phone}
                                            onChange={(e) => handleChange('phone', e.target.value)}
                                            className="w-full px-4 py-2 border rounded-lg"
                                            placeholder="10-digit mobile"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">Address *</label>
                                    <textarea
                                        value={formData.address}
                                        onChange={(e) => handleChange('address', e.target.value)}
                                        className="w-full px-4 py-2 border rounded-lg"
                                        rows={3}
                                        placeholder="Complete address"
                                    />
                                </div>
                            </>
                        )}

                        {step === 3 && (
                            <div className="space-y-4">
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="font-semibold mb-2">Student Details</h4>
                                    <p><strong>Name:</strong> {formData.studentName}</p>
                                    <p><strong>DOB:</strong> {formData.dob}</p>
                                    <p><strong>Gender:</strong> {formData.gender}</p>
                                    <p><strong>Applying for:</strong> {formData.grade}</p>
                                </div>
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="font-semibold mb-2">Parent Details</h4>
                                    <p><strong>Name:</strong> {formData.parentName} ({formData.relation})</p>
                                    <p><strong>Email:</strong> {formData.email}</p>
                                    <p><strong>Phone:</strong> {formData.phone}</p>
                                </div>
                                <div className="bg-yellow-50 p-4 rounded-lg text-sm">
                                    <p className="font-medium text-yellow-800">📋 Registration Fee: ₹500</p>
                                    <p className="text-yellow-700">You will be redirected to payment after submission.</p>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between pt-4">
                            {step > 1 && (
                                <button
                                    onClick={() => setStep(step - 1)}
                                    className="px-6 py-2 border rounded-lg hover:bg-gray-50"
                                >
                                    ← Back
                                </button>
                            )}
                            {step < 3 ? (
                                <button
                                    onClick={() => setStep(step + 1)}
                                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 ml-auto"
                                >
                                    Next →
                                </button>
                            ) : (
                                <button
                                    onClick={handleSubmit}
                                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 ml-auto"
                                >
                                    Submit Application
                                </button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
