'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle,
    ArrowRight,
    Check,
    CheckCircle2,
    Copy,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';

interface DpdpQuestion {
    id: string;
    sectionRef: string;
    question: string;
    remediation: string;
    weight: number;
}

const DPDP_QUESTIONS: readonly DpdpQuestion[] = [
    {
        id: 'encryption_at_rest',
        sectionRef: 'DPDP §8(5) Security Safeguards',
        question:
            'Are student & guardian mobile numbers, emails, and Aadhaar/APAAR identifiers encrypted at the field level (AES-256) rather than stored in readable SQL/Excel columns?',
        remediation:
            'Migrate plaintext student sheets into AES-256-GCM / SIV encrypted storage so raw database backups never expose child or parent contact numbers.',
        weight: 16,
    },
    {
        id: 'verifiable_parental_consent',
        sectionRef: 'DPDP §9(1) Child Data Consent',
        question:
            'Does your school capture timestamped, versioned parental consent notices before processing online admissions, medical records, and WhatsApp alerts for students under 18?',
        remediation:
            'Enable versioned guardian consent capture across /apply-online and parent onboarding portals with an immutable consent ledger.',
        weight: 15,
    },
    {
        id: 'no_child_tracking',
        sectionRef: 'DPDP §9(3) Tracking & Behavioral Ban',
        question:
            'Are your parent and student portals completely free of third-party advertising pixels, behavioral trackers, and commercial lead cross-selling?',
        remediation:
            'Remove ad-tech scripts and consumer analytics trackers from all student-facing and parent-facing school portals immediately.',
        weight: 12,
    },
    {
        id: 'tenant_rls_isolation',
        sectionRef: 'DPDP §8(5) Breach Prevention',
        question:
            'If you use a cloud ERP, is your school isolated by database-enforced Row-Level Security (RLS) rather than relying solely on application URL filters?',
        remediation:
            'Adopt PostgreSQL Row-Level Security (RLS) tenant isolation so one school’s query can never read another campus’s student rows.',
        weight: 14,
    },
    {
        id: 'privileged_mfa',
        sectionRef: 'DPDP §8(4) Access Governance',
        question:
            'Is Multi-Factor Authentication (TOTP MFA) enforced for Principal, Finance Officer, Registrar, and Super Admin accounts that can export student rosters?',
        remediation:
            'Turn on mandatory TOTP 2FA and session revocation controls for every administrative and fee-counter login.',
        weight: 12,
    },
    {
        id: 'four_eyes_audit',
        sectionRef: 'Accountability & Auditability',
        question:
            'Are sensitive record edits, fee waivers, and bulk CSV exports recorded in an append-only audit log with maker-checker (4-eyes) approval?',
        remediation:
            'Gate concessions, refunds, and published academic record changes behind 4-eyes approval queues with user-ID separation.',
        weight: 11,
    },
    {
        id: 'ai_pii_redaction',
        sectionRef: 'Third-Party Processor Safeguards',
        question:
            'Are teachers and clerks prevented from pasting raw student Aadhaar, phone, or email lists into unredacted external AI chatbots?',
        remediation:
            'Route AI assistance through an automatic PII redaction layer that strips Aadhaar, PAN, phone, and email patterns before model inference.',
        weight: 10,
    },
    {
        id: 'qr_tamper_verification',
        sectionRef: 'Data Accuracy & Credential Integrity',
        question:
            'Do issued Transfer Certificates, report cards, and dismissal gate passes carry cryptographic QR verification instead of easily altered PDFs?',
        remediation:
            'Issue HMAC/QR-verifiable student credentials and dismissal passes to prevent forgery and unauthorized child pickup.',
        weight: 10,
    },
];

type AnswerState = 'YES' | 'PARTIAL' | 'NO';

export default function DpdpScorerClient({ appUrl }: { appUrl: string }) {
    const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => ({
        encryption_at_rest: 'NO',
        verifiable_parental_consent: 'PARTIAL',
        no_child_tracking: 'YES',
        tenant_rls_isolation: 'NO',
        privileged_mfa: 'NO',
        four_eyes_audit: 'PARTIAL',
        ai_pii_redaction: 'NO',
        qr_tamper_verification: 'NO',
    }));
    const [copiedMemo, setCopiedMemo] = useState(false);
    const [startedAt] = useState(() => String(Date.now()));
    const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [submitError, setSubmitError] = useState('');

    const evaluation = useMemo(() => {
        let earned = 0;
        const gaps: DpdpQuestion[] = [];

        for (const q of DPDP_QUESTIONS) {
            const ans = answers[q.id] || 'NO';
            if (ans === 'YES') {
                earned += q.weight;
            } else if (ans === 'PARTIAL') {
                earned += Math.round(q.weight * 0.5);
                gaps.push(q);
            } else {
                gaps.push(q);
            }
        }

        const score = Math.min(100, Math.max(0, earned));
        let grade: 'A' | 'B' | 'C' | 'D' = 'D';
        let bandLabel = 'High Statutory Exposure — Immediate Board Action Needed';
        if (score >= 85) {
            grade = 'A';
            bandLabel = 'Strong DPDP Section 9 Posture';
        } else if (score >= 65) {
            grade = 'B';
            bandLabel = 'Moderate Readiness — Close Encryption & MFA Gaps';
        } else if (score >= 40) {
            grade = 'C';
            bandLabel = 'Elevated Child-PII Risk — Legacy ERP Controls Insufficient';
        }

        return { score, grade, bandLabel, gaps };
    }, [answers]);

    const boardMemoText = useMemo(() => {
        const lines = [
            'BOARD OF TRUSTEES BRIEFING — DPDP ACT 2023 (SECTION 9 CHILD DATA) READINESS',
            `Score: ${evaluation.score}/100 (Grade ${evaluation.grade} — ${evaluation.bandLabel})`,
            '',
            'Priority Remediation Actions:',
            ...(evaluation.gaps.length === 0
                ? ['• Maintain periodic key rotation, MFA reviews, and consent audit logs.']
                : evaluation.gaps.map(
                      (g, idx) => `${idx + 1}. [${g.sectionRef}] ${g.remediation}`,
                  )),
            '',
            `Reference Architecture & Live Sandbox: ${appUrl}/demo`,
            'Prepared via ScholarMind Institutional Desk',
        ];
        return lines.join('\n');
    }, [evaluation, appUrl]);

    async function handleCopyMemo() {
        await navigator.clipboard.writeText(boardMemoText);
        setCopiedMemo(true);
        setTimeout(() => setCopiedMemo(false), 2500);
    }

    async function handleLeadSubmit(formData: FormData) {
        setSubmitState('loading');
        setSubmitError('');

        formData.set('sourceUrl', window.location.href);
        formData.set('utmSource', 'organic_tool');
        formData.set('utmMedium', 'interactive_diagnostic');
        formData.set('utmCampaign', 'dpdp_readiness_scorer');
        formData.set(
            'painPoints',
            `[DPDP Readiness Score: ${evaluation.score}/100 · Grade ${evaluation.grade}] Gaps (${evaluation.gaps.length}): ${evaluation.gaps
                .slice(0, 4)
                .map((g) => g.sectionRef)
                .join(', ')}`,
        );

        try {
            const res = await fetch('/api/leads', {
                method: 'POST',
                body: formData,
                cache: 'no-store',
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                setSubmitError(data.error || 'Could not submit readiness report request.');
                setSubmitState('error');
            } else {
                setSubmitState('success');
            }
        } catch {
            setSubmitError('Network error submitting request.');
            setSubmitState('error');
        }
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 7 cols: 8-Question Interactive Checklist */}
            <div className="lg:col-span-7 space-y-4">
                {DPDP_QUESTIONS.map((q, idx) => {
                    const current = answers[q.id] || 'NO';
                    return (
                        <div
                            key={q.id}
                            data-testid={`dpdp-question-${q.id}`}
                            className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-2xs space-y-4"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-brass bg-parchment px-2.5 py-1 rounded-full border border-brass/30">
                                    Check {idx + 1} · {q.sectionRef}
                                </span>
                                <span className="text-xs font-semibold text-slate-400">
                                    {q.weight} pts
                                </span>
                            </div>

                            <p className="text-base font-bold text-oxford leading-snug">{q.question}</p>

                            <div className="grid grid-cols-3 gap-2.5">
                                {(
                                    [
                                        { value: 'YES', label: 'Yes — Enforced' },
                                        { value: 'PARTIAL', label: 'Partial / Manual' },
                                        { value: 'NO', label: 'No / Unsure' },
                                    ] as const
                                ).map((opt) => {
                                    const selected = current === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() =>
                                                setAnswers((prev) => ({ ...prev, [q.id]: opt.value }))
                                            }
                                            className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                                                selected
                                                    ? 'bg-oxford text-ivory border-oxford shadow-xs'
                                                    : 'bg-ivory text-slate-700 border-slate-200 hover:border-brass/50'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Right 5 cols: Sticky Instant Boardroom Score & Action Card */}
            <div className="lg:col-span-5 lg:sticky lg:top-28 space-y-6">
                <div
                    data-testid="dpdp-score-card"
                    className="bg-oxford text-ivory rounded-3xl p-7 border border-oxford-dark shadow-xl space-y-6"
                >
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-widest text-brass-light">
                                Live DPDP Section 9 Score
                            </p>
                            <p className="text-5xl font-black tabular-nums mt-1">
                                {evaluation.score}
                                <span className="text-xl text-slate-400 font-semibold">/100</span>
                            </p>
                        </div>
                        <div className="w-16 h-16 rounded-2xl bg-brass/20 border border-brass/50 flex flex-col items-center justify-center">
                            <span className="text-[10px] uppercase font-bold text-brass-light">Grade</span>
                            <span className="text-2xl font-black text-ivory">{evaluation.grade}</span>
                        </div>
                    </div>

                    <div className="rounded-xl bg-white/10 border border-white/15 p-3.5 flex items-start gap-2.5 text-xs">
                        {evaluation.score >= 80 ? (
                            <ShieldCheck size={18} className="text-brass-light shrink-0 mt-0.5" />
                        ) : evaluation.score >= 50 ? (
                            <AlertTriangle size={18} className="text-brass-light shrink-0 mt-0.5" />
                        ) : (
                            <ShieldAlert size={18} className="text-brass-light shrink-0 mt-0.5" />
                        )}
                        <span className="font-semibold text-ivory leading-relaxed">
                            {evaluation.bandLabel}
                        </span>
                    </div>

                    {/* Top Remediation Items */}
                    <div className="space-y-2.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
                            Priority Remediation Checklist ({evaluation.gaps.length})
                        </p>
                        {evaluation.gaps.length === 0 ? (
                            <p className="text-xs text-slate-300">
                                All 8 child-PII controls marked active. Keep quarterly audit evidence archived.
                            </p>
                        ) : (
                            <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                {evaluation.gaps.map((gap) => (
                                    <li
                                        key={gap.id}
                                        className="text-xs text-slate-200 bg-white/5 rounded-xl p-3 border border-white/10 leading-relaxed"
                                    >
                                        <strong className="text-brass-light block mb-0.5">
                                            {gap.sectionRef}
                                        </strong>
                                        {gap.remediation}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="flex flex-col gap-2.5 pt-1">
                        <button
                            type="button"
                            onClick={handleCopyMemo}
                            className="w-full py-3 px-4 rounded-xl bg-brass hover:bg-brass-light text-ivory font-bold text-xs inline-flex items-center justify-center gap-2 transition-all"
                        >
                            {copiedMemo ? <Check size={15} /> : <Copy size={15} />}
                            {copiedMemo ? 'Boardroom Memo Copied!' : 'Copy Boardroom Readiness Memo'}
                        </button>
                        <a
                            href={`${appUrl}/demo`}
                            className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-ivory font-bold text-xs inline-flex items-center justify-center gap-2 transition-all"
                        >
                            <Sparkles size={14} className="text-brass-light" />
                            Inspect DPDP Controls in 1-Click Demo
                            <ArrowRight size={14} />
                        </a>
                    </div>
                </div>

                {/* Optional Instant Remediation Pack & Pilot Request */}
                <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
                    {submitState === 'success' ? (
                        <div className="text-center py-4 space-y-2">
                            <CheckCircle2 className="w-10 h-10 text-brass mx-auto" />
                            <h3 className="text-lg font-extrabold text-oxford">
                                DPDP Remediation Pack Dispatched
                            </h3>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                ScholarMind Institutional Desk has recorded your {evaluation.score}/100 diagnostic and prepared your campus sandbox walkthrough.
                            </p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <h3 className="text-base font-extrabold text-oxford">
                                    Email This Diagnostic + Custom Migration Plan
                                </h3>
                                <p className="text-xs text-slate-600 mt-1">
                                    Receive a tailored DPDP Section 9 architecture pack and guided sandbox link from ScholarMind Institutional Desk.
                                </p>
                            </div>
                            <form action={handleLeadSubmit} className="space-y-3">
                                <input type="hidden" name="startedAt" value={startedAt} />
                                <input type="hidden" name="formLoadedAt" value={startedAt} />
                                <div
                                    className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
                                    aria-hidden="true"
                                >
                                    <input type="text" name="companyWebsite" tabIndex={-1} autoComplete="off" />
                                    <input type="text" name="homepageUrl" tabIndex={-1} autoComplete="off" />
                                </div>
                                <input
                                    type="text"
                                    name="contactName"
                                    required
                                    placeholder="Principal / Trustee Name"
                                    className="w-full px-3.5 py-2.5 bg-ivory border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brass"
                                />
                                <input
                                    type="email"
                                    name="contactEmail"
                                    required
                                    placeholder="Official School Email"
                                    className="w-full px-3.5 py-2.5 bg-ivory border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brass"
                                />
                                <div className="grid grid-cols-2 gap-2.5">
                                    <input
                                        type="text"
                                        name="schoolName"
                                        required
                                        placeholder="School / Trust Name"
                                        className="w-full px-3.5 py-2.5 bg-ivory border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brass"
                                    />
                                    <select
                                        name="studentCapacity"
                                        required
                                        defaultValue="1500"
                                        aria-label="Student capacity"
                                        className="w-full px-3 py-2.5 bg-ivory border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brass"
                                    >
                                        <option value="500">Under 500</option>
                                        <option value="1500">500 – 1,500</option>
                                        <option value="5000">1,500 – 5,000</option>
                                        <option value="10000">5,000+ Group</option>
                                    </select>
                                </div>
                                <label className="flex items-start gap-2 text-[11px] text-slate-600">
                                    <input
                                        type="checkbox"
                                        name="privacyConsent"
                                        value="true"
                                        required
                                        className="mt-0.5 rounded border-slate-300"
                                    />
                                    <span>
                                        Consent to receive this DPDP readiness brief under our{' '}
                                        <Link href="/privacy" className="underline text-oxford font-semibold">
                                            Privacy Notice
                                        </Link>
                                        .
                                    </span>
                                </label>
                                {submitState === 'error' && (
                                    <p className="text-xs text-rose-600 font-medium">{submitError}</p>
                                )}
                                <button
                                    type="submit"
                                    disabled={submitState === 'loading'}
                                    className="w-full py-3 rounded-xl bg-oxford text-ivory font-bold text-xs hover:bg-oxford-dark transition disabled:opacity-60"
                                >
                                    {submitState === 'loading'
                                        ? 'Sending Diagnostic...'
                                        : 'Send Boardroom DPDP Pack →'}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
