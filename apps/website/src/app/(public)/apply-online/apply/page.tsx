'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Eye, Lock, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type SyntheticApplicationProfile = {
    id: string;
    label: string;
    applicationRef: string;
    studentName: string;
    dob: string;
    gender: string;
    grade: string;
    previousSchool: string;
    parentName: string;
    relation: string;
    email: string;
    phone: string;
    address: string;
    registrationFee: string;
    documents: string[];
};

const SYNTHETIC_PROFILES: SyntheticApplicationProfile[] = [
    {
        id: 'profile-a',
        label: 'Sample A · Aarav Sharma (Class 6)',
        applicationRef: 'GWD-SANDBOX-2026-0104',
        studentName: 'Aarav Sharma (Synthetic Sample)',
        dob: '2015-04-14',
        gender: 'Male',
        grade: 'Class 6',
        previousSchool: 'Horizon Demo Public School (Sample)',
        parentName: 'Meera Sharma (Synthetic Guardian)',
        relation: 'Mother',
        email: 'meera.sharma.demo@example.invalid',
        phone: '+91 00000 00104 (Synthetic)',
        address: 'Flat 402, Sample Enclave, Demo Layout, Bengaluru 560001',
        registrationFee: '₹500 (Simulated — No Charge)',
        documents: [
            'Birth Certificate (sample_birth_cert_demo.pdf — verified format)',
            'Previous Academic Report Card (sample_grade5_transcript.pdf)',
        ],
    },
    {
        id: 'profile-b',
        label: 'Sample B · Diya Nair (Class 11 Science)',
        applicationRef: 'GWD-SANDBOX-2026-0219',
        studentName: 'Diya Nair (Synthetic Sample)',
        dob: '2010-09-22',
        gender: 'Female',
        grade: 'Class 11 Science',
        previousSchool: 'oakridge-sample-academy.invalid (Sample)',
        parentName: 'Raghav Nair (Synthetic Guardian)',
        relation: 'Father',
        email: 'raghav.nair.demo@example.invalid',
        phone: '+91 00000 00219 (Synthetic)',
        address: '18 Synthetic Avenue, Sandbox Nagar, Kochi 682001',
        registrationFee: '₹500 (Simulated — No Charge)',
        documents: [
            'Class 10 Board Marksheet (sample_class10_marks.pdf — verified format)',
            'Transfer Certificate Draft (sample_tc_preview.pdf)',
        ],
    },
];

function ReadOnlyField({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-semibold text-slate-700">{label}</label>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                    <Lock size={11} />
                    Synthetic Read-Only
                </span>
            </div>
            <input
                type="text"
                value={value}
                readOnly
                aria-readonly="true"
                tabIndex={-1}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-100/90 text-slate-700 font-medium text-sm cursor-not-allowed select-none"
            />
        </div>
    );
}

export default function ApplySandboxStepThroughPage() {
    const [selectedProfileId, setSelectedProfileId] = useState<string>(SYNTHETIC_PROFILES[0].id);
    const [step, setStep] = useState<number>(1);
    const [completedPreview, setCompletedPreview] = useState<boolean>(false);

    const profile =
        SYNTHETIC_PROFILES.find((item) => item.id === selectedProfileId) ?? SYNTHETIC_PROFILES[0];

    const handleResetPreview = () => {
        setCompletedPreview(false);
        setStep(1);
    };

    if (completedPreview) {
        return (
            <div className="min-h-screen bg-ivory pt-28 pb-20 px-4 sm:px-6">
                <div className="max-w-2xl mx-auto">
                    <div className="mb-6 rounded-2xl border border-brass/35 bg-parchment px-4 py-3 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-oxford">
                        <Eye size={15} className="text-brass" />
                        Interactive Product Preview — Synthetic Demo Data Only
                    </div>

                    <Card className="border-slate-200/80 shadow-lg rounded-3xl overflow-hidden">
                        <CardContent className="pt-10 pb-10 px-8 text-center space-y-6">
                            <div className="w-16 h-16 bg-parchment text-oxford border border-brass/30 rounded-2xl flex items-center justify-center mx-auto">
                                <CheckCircle2 size={34} className="text-brass" />
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-widest text-brass">
                                    Sandbox Walkthrough Complete · {profile.applicationRef}
                                </p>
                                <h1 className="text-2xl md:text-3xl font-black text-oxford">
                                    Previewed Experience Cloud Handoff
                                </h1>
                                <p className="text-slate-600 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
                                    No network request or personal record was created because this public route runs strictly on read-only synthetic sample data — nothing you entered has been submitted or stored. In a live school deployment, completing Step 3 performs:
                                </p>
                            </div>

                            <div className="text-left bg-ivory border border-slate-200 rounded-2xl p-5 space-y-3 text-sm text-slate-700">
                                <p>
                                    <strong>1. Tenant-Isolated Intake:</strong> Persists the application under the campus&apos;s PostgreSQL row-level-security policy.
                                </p>
                                <p>
                                    <strong>2. Admissions Review Queue:</strong> Places <em>{profile.studentName}</em> ({profile.grade}) into the counsellor verification workspace.
                                </p>
                                <p>
                                    <strong>3. Transactional Outbox Receipt:</strong> Queues an idempotent confirmation notice to the guardian contact once fee reconciliation is verified.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                                <Link
                                    href="/book-demo"
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-oxford text-white rounded-xl font-bold text-sm hover:bg-oxford-dark transition-colors"
                                >
                                    Book a Live Pilot Walkthrough
                                    <ArrowRight size={16} />
                                </Link>
                                <button
                                    type="button"
                                    onClick={handleResetPreview}
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 border border-slate-300 bg-white text-slate-700 rounded-xl font-semibold text-sm hover:bg-ivory transition-colors"
                                >
                                    <RotateCcw size={15} />
                                    Replay Step-Through
                                </button>
                                <Link
                                    href="/apply-online"
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-3 text-oxford hover:text-brass font-semibold text-sm"
                                >
                                    <ArrowLeft size={15} />
                                    Back to Admissions Preview
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-ivory pt-28 pb-20 px-4 sm:px-6">
            <div className="max-w-2xl mx-auto">
                {/* Navigation & Mandatory Sandbox Badge */}
                <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <Link
                        href="/apply-online"
                        className="inline-flex items-center gap-1.5 text-oxford hover:text-brass font-bold text-sm"
                    >
                        <ArrowLeft size={16} />
                        Back to Admissions Preview
                    </Link>
                    <Link
                        href="/book-demo"
                        className="inline-flex items-center gap-1.5 text-slate-600 hover:text-oxford font-semibold text-xs"
                    >
                        Want a live tenant demo? Book assessment →
                    </Link>
                </div>

                <div
                    role="region"
                    aria-label="Synthetic demo data notice"
                    className="mb-6 rounded-2xl border border-brass/35 bg-parchment p-4 shadow-sm"
                >
                    <div className="inline-flex items-center gap-2 rounded-full bg-brass/20 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-oxford mb-2">
                        <Eye size={14} className="text-brass" />
                        Interactive Product Preview — Synthetic Demo Data Only
                    </div>
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                        To protect student and family privacy, free-text PII entry is disabled on this public marketing preview. Select a pre-filled synthetic applicant below and step through all stages of the ScholarMind Experience Cloud admission flow.
                    </p>
                </div>

                {/* Synthetic Sample Switcher */}
                <div className="mb-6 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                        Choose Synthetic Sample Applicant
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {SYNTHETIC_PROFILES.map((item) => {
                            const active = item.id === profile.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setSelectedProfileId(item.id)}
                                    className={`text-left px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                                        active
                                            ? 'bg-oxford text-white border-oxford shadow-sm'
                                            : 'bg-ivory text-slate-700 border-slate-200 hover:bg-parchment/60'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Header */}
                <div className="text-center mb-6">
                    <h1 className="text-2xl sm:text-3xl font-black text-oxford">
                        Experience Cloud Admission Flow
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Sample Reference: <span className="font-mono font-semibold text-oxford">{profile.applicationRef}</span>
                    </p>
                </div>

                {/* Interactive Step Indicator */}
                <div className="flex items-center justify-center gap-2 mb-8">
                    {[
                        { num: 1, label: 'Student' },
                        { num: 2, label: 'Guardian' },
                        { num: 3, label: 'Review' },
                    ].map((s) => (
                        <div key={s.num} className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setStep(s.num)}
                                className={`px-3.5 py-2 rounded-full flex items-center gap-2 text-xs font-bold transition-colors ${
                                    step === s.num
                                        ? 'bg-oxford text-white shadow-sm'
                                        : step > s.num
                                          ? 'bg-parchment text-oxford border border-brass/30'
                                          : 'bg-slate-200 text-slate-600'
                                }`}
                            >
                                <span>{s.num}</span>
                                <span>{s.label}</span>
                            </button>
                            {s.num < 3 && (
                                <div className={`w-8 sm:w-12 h-1 rounded ${step > s.num ? 'bg-brass' : 'bg-slate-200'}`} />
                            )}
                        </div>
                    ))}
                </div>

                <Card className="border-slate-200 shadow-md rounded-3xl">
                    <CardHeader>
                        <CardTitle className="text-xl font-extrabold text-slate-900">
                            {step === 1 && 'Step 1 of 3 · Synthetic Student Information'}
                            {step === 2 && 'Step 2 of 3 · Synthetic Parent / Guardian Details'}
                            {step === 3 && 'Step 3 of 3 · Checklist & Fee Schedule Review'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {step === 1 && (
                            <>
                                <ReadOnlyField label="Student Full Name" value={profile.studentName} />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <ReadOnlyField label="Date of Birth" value={profile.dob} />
                                    <ReadOnlyField label="Gender" value={profile.gender} />
                                </div>
                                <ReadOnlyField label="Applying for Grade" value={profile.grade} />
                                <ReadOnlyField label="Previous Institution" value={profile.previousSchool} />
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <ReadOnlyField label="Parent / Guardian Name" value={profile.parentName} />
                                <ReadOnlyField label="Relation to Applicant" value={profile.relation} />
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <ReadOnlyField label="Guardian Email (Reserved .invalid)" value={profile.email} />
                                    <ReadOnlyField label="Guardian Phone" value={profile.phone} />
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="block text-sm font-semibold text-slate-700">
                                            Residential Address
                                        </label>
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                                            <Lock size={11} />
                                            Synthetic Read-Only
                                        </span>
                                    </div>
                                    <textarea
                                        value={profile.address}
                                        readOnly
                                        aria-readonly="true"
                                        tabIndex={-1}
                                        rows={2}
                                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-100/90 text-slate-700 font-medium text-sm cursor-not-allowed select-none"
                                    />
                                </div>
                            </>
                        )}

                        {step === 3 && (
                            <div className="space-y-4">
                                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm space-y-1.5">
                                    <h4 className="font-bold text-slate-900 mb-2">Synthetic Student Summary</h4>
                                    <p><span className="text-slate-500">Name:</span> <strong>{profile.studentName}</strong></p>
                                    <p><span className="text-slate-500">Date of Birth:</span> {profile.dob}</p>
                                    <p><span className="text-slate-500">Grade Band:</span> {profile.grade}</p>
                                    <p><span className="text-slate-500">Prior School:</span> {profile.previousSchool}</p>
                                </div>

                                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm space-y-1.5">
                                    <h4 className="font-bold text-slate-900 mb-2">Synthetic Guardian Summary</h4>
                                    <p><span className="text-slate-500">Guardian:</span> <strong>{profile.parentName}</strong> ({profile.relation})</p>
                                    <p><span className="text-slate-500">Email:</span> {profile.email}</p>
                                    <p><span className="text-slate-500">Phone:</span> {profile.phone}</p>
                                </div>

                                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm">
                                    <h4 className="font-bold text-slate-900 mb-2">Simulated Document Checklist</h4>
                                    <ul className="space-y-1.5 text-slate-700">
                                        {profile.documents.map((doc) => (
                                            <li key={doc} className="flex items-center gap-2 text-xs sm:text-sm">
                                                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                                                <span>{doc}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="bg-parchment border border-brass/30 p-4 rounded-2xl text-sm">
                                    <p className="font-bold text-oxford">
                                        Registration Fee Preview: {profile.registrationFee}
                                    </p>
                                    <p className="text-slate-700 text-xs mt-1">
                                        In production tenants with payment reconciliation configured, applicants transition to invoice-backed checkout; in this public preview, clicking below displays the staff queue handoff summary.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                            {step > 1 ? (
                                <button
                                    type="button"
                                    onClick={() => setStep(step - 1)}
                                    className="px-5 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-700 hover:bg-ivory transition-colors"
                                >
                                    ← Previous Step
                                </button>
                            ) : (
                                <Link
                                    href="/apply-online"
                                    className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:text-oxford"
                                >
                                    ← Overview
                                </Link>
                            )}

                            {step < 3 ? (
                                <button
                                    type="button"
                                    onClick={() => setStep(step + 1)}
                                    className="px-6 py-2.5 bg-oxford text-white rounded-xl text-sm font-bold hover:bg-oxford-dark transition-colors ml-auto"
                                >
                                    Next Step →
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setCompletedPreview(true)}
                                    className="px-6 py-2.5 bg-brass text-white rounded-xl text-sm font-bold hover:opacity-95 transition-opacity ml-auto"
                                >
                                    Preview Sandbox Completion →
                                </button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
