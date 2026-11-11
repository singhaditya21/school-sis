'use client';

import Link from 'next/link';
import { ArrowRight, Eye, FileCheck2, Lock, Layers, Building2 } from 'lucide-react';

const SAMPLE_PROGRAMS = [
    {
        icon: '🎓',
        title: 'Structured Grade Intake',
        desc: 'Configurable grade seats, sibling linkage rules, and academic-year eligibility windows per campus.',
    },
    {
        icon: '📋',
        title: 'Document Checklist Rules',
        desc: 'Per-grade verification checklists for transfer certificates, identity proofs, and prior transcripts.',
    },
    {
        icon: '🧾',
        title: 'Transparent Fee Schedule',
        desc: 'Publishes board-approved annual tuition and registration fee breakdowns directly from tenant configuration.',
    },
    {
        icon: '🔐',
        title: 'Tenant-Isolated Intake',
        desc: 'In live deployments, each campus microsite writes into its own row-level-security tenant enclave.',
    },
    {
        icon: '👩‍💼',
        title: 'Counsellor Review Queue',
        desc: 'Routes completed applications to authorized admissions staff with auditable status transitions.',
    },
    {
        icon: '✉️',
        title: 'Outbox Notifications',
        desc: 'Queues receipt acknowledgements and interview invitations through the transactional notification outbox.',
    },
];

const SAMPLE_FEE_BANDS = [
    { grade: 'Nursery – KG', fee: '₹85,000', desc: 'Sample annual tuition' },
    { grade: 'Class 1 – 5', fee: '₹95,000', desc: 'Sample annual tuition' },
    { grade: 'Class 6 – 10', fee: '₹1,15,000', desc: 'Sample annual tuition' },
    { grade: 'Class 11 – 12', fee: '₹1,35,000', desc: 'Sample annual tuition' },
];

const SAMPLE_STAGES = [
    { step: 1, title: 'Applicant Profile', desc: 'Synthetic student & grade selection' },
    { step: 2, title: 'Guardian Contact', desc: 'Read-only sample guardian record' },
    { step: 3, title: 'Checklist & Fee Review', desc: 'Fee schedule & document verification preview' },
    { step: 4, title: 'Staff Queue Handoff', desc: 'Preview of tenant admissions routing' },
];

export default function PublicAdmissionsSandboxPage() {
    return (
        <div className="min-h-screen bg-slate-50 pt-28 pb-20 text-slate-900">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Mandatory Synthetic Sandbox Notice Banner */}
                <div
                    role="region"
                    aria-label="Synthetic product preview notice"
                    className="mb-8 rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm"
                >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="space-y-1">
                            <div className="inline-flex items-center gap-2 rounded-full bg-amber-200/80 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-amber-950">
                                <Eye size={14} />
                                Interactive Product Preview — Synthetic Demo Data Only
                            </div>
                            <p className="text-sm text-amber-900 leading-relaxed pt-1">
                                <strong>Greenwood International Academy (Sample Tenant)</strong> is a fictional campus used to demonstrate how ScholarMind Experience Cloud renders a school&apos;s public admissions portal. No child or parent personal data is collected on this preview route.
                            </p>
                        </div>
                        <Link
                            href="/book-demo"
                            className="inline-flex items-center justify-center gap-2 shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
                        >
                            Book a Live Pilot Walkthrough
                            <ArrowRight size={16} />
                        </Link>
                    </div>
                </div>

                {/* Sample Tenant Portal Preview Hero */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 text-white p-8 md:p-14 shadow-xl border border-indigo-500/20">
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-bold uppercase tracking-widest text-indigo-200">
                            <Building2 size={14} />
                            Experience Cloud Sandbox · Tenant: GWD-DEMO
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-xs font-semibold text-emerald-200">
                            <Lock size={13} />
                            Zero PII Collection
                        </span>
                    </div>

                    <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4 max-w-3xl">
                        Greenwood International Academy
                        <span className="block text-indigo-300 text-2xl md:text-3xl font-bold mt-2">
                            2026–27 Admissions Portal Preview
                        </span>
                    </h1>

                    <p className="text-lg text-slate-300 max-w-2xl mb-8 leading-relaxed">
                        Click through the interactive 3-step admission preview pre-populated with synthetic student and guardian profiles to inspect how prospective families experience a ScholarMind-hosted intake portal.
                    </p>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <Link
                            href="/apply-online/apply"
                            className="inline-flex items-center gap-2 px-7 py-4 bg-white text-slate-950 rounded-xl font-extrabold text-base hover:bg-indigo-50 transition-colors shadow-lg"
                        >
                            Launch Interactive Step-Through
                            <ArrowRight size={18} />
                        </Link>
                        <Link
                            href="/book-demo"
                            className="inline-flex items-center gap-2 px-6 py-4 bg-white/10 border border-white/20 text-white rounded-xl font-semibold text-base hover:bg-white/15 transition-colors"
                        >
                            Request Pilot Assessment
                        </Link>
                    </div>
                </div>

                {/* Experience Cloud Capabilities Grid */}
                <section id="info" className="py-16">
                    <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-1">
                                Experience Cloud Architecture
                            </p>
                            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900">
                                What this admission workflow demonstrates
                            </h2>
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-full">
                            <Layers size={14} className="text-indigo-600" />
                            Sample Tenant Configuration
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {SAMPLE_PROGRAMS.map((item) => (
                            <div
                                key={item.title}
                                className="p-6 bg-white rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors"
                            >
                                <div className="text-3xl mb-3">{item.icon}</div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">{item.title}</h3>
                                <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Sample Published Fee Structure */}
                <section className="bg-white rounded-3xl border border-slate-200 p-8 md:p-10 shadow-sm mb-16">
                    <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-1">
                                Sample Fee Schedule (Fictional Figures)
                            </p>
                            <h2 className="text-2xl font-extrabold text-slate-900">
                                Published Tuition Bands — Academic Year 2026–27
                            </h2>
                        </div>
                        <span className="text-xs font-medium text-slate-500">
                            Illustrative sandbox values · Not an active school offer
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
                        {SAMPLE_FEE_BANDS.map((item) => (
                            <div
                                key={item.grade}
                                className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 text-center"
                            >
                                <div className="text-sm font-semibold text-slate-600 mb-2">{item.grade}</div>
                                <div className="text-3xl font-black text-indigo-600 mb-1">{item.fee}</div>
                                <div className="text-xs text-slate-500">{item.desc}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Workflow Steps & Launch CTA */}
                <section className="bg-white rounded-3xl border border-slate-200 p-8 md:p-10 shadow-sm">
                    <h2 className="text-2xl font-extrabold text-slate-900 text-center mb-8">
                        4-Stage Admission Workflow Preview
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-10">
                        {SAMPLE_STAGES.map((item) => (
                            <div
                                key={item.step}
                                className="flex flex-col items-center text-center p-4 rounded-2xl bg-slate-50 border border-slate-200/70"
                            >
                                <div className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm mb-3">
                                    {item.step}
                                </div>
                                <h3 className="font-bold text-slate-900 text-sm mb-1">{item.title}</h3>
                                <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link
                            href="/apply-online/apply"
                            className="inline-flex items-center gap-2 px-7 py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-sm"
                        >
                            <FileCheck2 size={18} />
                            Step Through Synthetic Application
                        </Link>
                        <Link
                            href="/book-demo"
                            className="inline-flex items-center gap-2 px-7 py-3.5 bg-slate-100 text-slate-800 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
                        >
                            Evaluate for Your Institution
                        </Link>
                    </div>
                </section>
            </div>
        </div>
    );
}
