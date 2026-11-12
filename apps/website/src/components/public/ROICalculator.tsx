'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
    ArrowRight,
    Calculator,
    CheckCircle2,
    Clock,
    IndianRupee,
    ShieldCheck,
    Sparkles,
    Zap,
} from 'lucide-react';
import { resolveAppUrl } from '@/lib/app-url';

type CurrencyMode = 'INR' | 'USD';

function formatMoney(amount: number, currency: CurrencyMode): string {
    if (currency === 'INR') {
        return `₹${Math.round(amount).toLocaleString('en-IN')}`;
    }
    return `$${Math.round(amount).toLocaleString('en-US')}`;
}

function capacityBucket(students: number): '500' | '1500' | '5000' | '10000' {
    if (students <= 500) return '500';
    if (students <= 1500) return '1500';
    if (students <= 5000) return '5000';
    return '10000';
}

export default function ROICalculator() {
    const appUrl = resolveAppUrl();
    const [currency, setCurrency] = useState<CurrencyMode>('INR');
    const [students, setStudents] = useState(1200);
    const [annualTuitionInr, setAnnualTuitionInr] = useState(65000);
    const [overdueRatePct, setOverdueRatePct] = useState(11);
    const [showLeadDrawer, setShowLeadDrawer] = useState(false);
    const [startedAt] = useState(() => String(Date.now()));
    const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [submitError, setSubmitError] = useState('');

    const metrics = useMemo(() => {
        const tuitionPerStudent =
            currency === 'INR' ? annualTuitionInr : Math.round(annualTuitionInr / 84);
        const grossAnnualDemand = students * tuitionPerStudent;
        // Signed WhatsApp UPI + ageing follow-up typically accelerates ~42% of overdue tuition back into term cashflow
        const lockedOverduePool = grossAnnualDemand * (overdueRatePct / 100);
        const workingCapitalRecovered = Math.round(lockedOverduePool * 0.42);
        // Unapproved counter concessions & late-fee waivers typically leak ~0.85% of gross fee demand without 4-eyes lock
        const concessionLeakagePrevented = Math.round(grossAnnualDemand * 0.0085);
        // 1.8 hours per student/yr saved across Tally voucher entry, receipt matching, and reminder calls
        const hoursSaved = Math.round(students * 1.8);
        const totalAnnualImpact = workingCapitalRecovered + concessionLeakagePrevented;

        return {
            tuitionPerStudent,
            grossAnnualDemand,
            workingCapitalRecovered,
            concessionLeakagePrevented,
            hoursSaved,
            totalAnnualImpact,
        };
    }, [currency, students, annualTuitionInr, overdueRatePct]);

    async function handleBoardReportSubmit(formData: FormData) {
        setSubmitState('loading');
        setSubmitError('');

        formData.set('studentCapacity', capacityBucket(students));
        formData.set('sourceUrl', window.location.href);
        formData.set('utmSource', 'organic_tool');
        formData.set('utmMedium', 'interactive_diagnostic');
        formData.set('utmCampaign', 'fee_leakage_calculator');
        formData.set(
            'painPoints',
            `[Fee Diagnostic: ${students} students · ${overdueRatePct}% overdue] Est. Working Capital Unlocked: ${formatMoney(
                metrics.workingCapitalRecovered,
                currency,
            )} + 4-Eyes Waiver Protection: ${formatMoney(
                metrics.concessionLeakagePrevented,
                currency,
            )} (${metrics.hoursSaved} Tally/admin hrs saved/yr).`,
        );

        try {
            const res = await fetch('/api/leads', {
                method: 'POST',
                body: formData,
                cache: 'no-store',
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                setSubmitError(data.error || 'Could not dispatch boardroom summary.');
                setSubmitState('error');
            } else {
                setSubmitState('success');
            }
        } catch {
            setSubmitError('Network error submitting diagnostic.');
            setSubmitState('error');
        }
    }

    return (
        <div
            data-testid="fee-leakage-calculator"
            className="bg-white rounded-3xl border border-slate-200 shadow-lg p-8 md:p-12 relative overflow-hidden"
        >
            <div className="h-1 w-full bg-gradient-to-r from-oxford via-brass to-oxford absolute top-0 left-0" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                {/* Controls */}
                <div className="lg:col-span-6 space-y-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-parchment border border-brass/35 text-xs font-bold text-oxford">
                            <Calculator className="text-brass" size={14} />
                            Boardroom Cashflow &amp; Fee Leakage Diagnostic
                        </div>

                        <div className="inline-flex rounded-xl bg-ivory p-1 border border-slate-200">
                            {(['INR', 'USD'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setCurrency(mode)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                                        currency === mode
                                            ? 'bg-oxford text-ivory shadow-2xs'
                                            : 'text-slate-600 hover:text-oxford'
                                    }`}
                                >
                                    {mode === 'INR' ? '₹ INR' : '$ USD'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="text-3xl font-extrabold text-oxford tracking-tight">
                            Quantify locked tuition &amp; Tally hours in 30 seconds.
                        </h3>
                        <p className="text-slate-600 text-sm mt-2 leading-relaxed">
                            Adjust enrollment, average annual fee, and end-of-quarter arrears to see what 1-tap WhatsApp UPI links, 4-eyes waiver locks, and Tally Prime XML sync recover.
                        </p>
                    </div>

                    {/* Slider 1: Students */}
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                Active Campus Enrollment
                            </span>
                            <span className="text-2xl font-black tabular-nums text-oxford">
                                {students.toLocaleString('en-IN')} students
                            </span>
                        </div>
                        <input
                            type="range"
                            min="200"
                            max="6000"
                            step="100"
                            aria-label="Active Campus Enrollment"
                            value={students}
                            onChange={(e) => setStudents(Number(e.target.value))}
                            className="w-full h-2.5 bg-parchment rounded-lg appearance-none cursor-pointer accent-oxford"
                        />
                    </div>

                    {/* Slider 2: Annual Fee */}
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                Avg. Annual Fee / Student
                            </span>
                            <span className="text-2xl font-black tabular-nums text-oxford">
                                {formatMoney(metrics.tuitionPerStudent, currency)}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="20000"
                            max="240000"
                            step="5000"
                            aria-label="Average Annual Fee Per Student"
                            value={annualTuitionInr}
                            onChange={(e) => setAnnualTuitionInr(Number(e.target.value))}
                            className="w-full h-2.5 bg-parchment rounded-lg appearance-none cursor-pointer accent-oxford"
                        />
                    </div>

                    {/* Slider 3: Overdue % */}
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                Overdue Arrears Beyond 30 Days
                            </span>
                            <span className="text-2xl font-black tabular-nums text-brass">
                                {overdueRatePct}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min="3"
                            max="25"
                            step="1"
                            aria-label="Overdue Arrears Percentage"
                            value={overdueRatePct}
                            onChange={(e) => setOverdueRatePct(Number(e.target.value))}
                            className="w-full h-2.5 bg-parchment rounded-lg appearance-none cursor-pointer accent-oxford"
                        />
                    </div>
                </div>

                {/* Output Boardroom Card */}
                <div className="lg:col-span-6 bg-ivory rounded-2xl p-6 md:p-8 border border-brass/35 space-y-6">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-3">
                        Projected Annual Institutional Impact
                    </h4>

                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-xl bg-parchment text-oxford flex items-center justify-center shrink-0 border border-brass/30">
                                <IndianRupee size={20} />
                            </div>
                            <div>
                                <p className="text-2xl font-extrabold tabular-nums text-oxford">
                                    {formatMoney(metrics.workingCapitalRecovered, currency)}
                                </p>
                                <p className="text-xs text-slate-600">
                                    Overdue working capital accelerated via signed WhatsApp UPI links
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-xl bg-oxford/10 text-oxford flex items-center justify-center shrink-0">
                                <ShieldCheck size={20} />
                            </div>
                            <div>
                                <p className="text-2xl font-extrabold tabular-nums text-oxford">
                                    {formatMoney(metrics.concessionLeakagePrevented, currency)}
                                </p>
                                <p className="text-xs text-slate-600">
                                    Unapproved counter concessions blocked by 4-eyes maker-checker lock
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-xl bg-parchment text-brass flex items-center justify-center shrink-0">
                                <Clock size={20} />
                            </div>
                            <div>
                                <p className="text-2xl font-extrabold tabular-nums text-oxford">
                                    {metrics.hoursSaved.toLocaleString('en-IN')} hrs / yr
                                </p>
                                <p className="text-xs text-slate-600">
                                    Tally Prime voucher typing &amp; manual fee reminder calls saved
                                </p>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-200">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-oxford text-ivory flex items-center justify-center shrink-0 shadow-xs">
                                    <Zap size={22} className="text-brass-light" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-brass uppercase tracking-widest">
                                        Annual Cashflow &amp; Leakage Protected
                                    </p>
                                    <p className="text-3xl md:text-4xl font-black tabular-nums text-oxford">
                                        {formatMoney(metrics.totalAnnualImpact, currency)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                        <a
                            href={`${appUrl}/demo`}
                            className="flex-1 min-w-[200px] inline-flex items-center justify-center gap-2 py-3.5 px-5 rounded-xl bg-oxford text-ivory font-bold text-xs hover:bg-oxford-dark transition shadow-xs"
                        >
                            <Sparkles size={14} className="text-brass-light" />
                            Test Fee Controls in 1-Click Demo
                            <ArrowRight size={14} />
                        </a>
                        <button
                            type="button"
                            onClick={() => setShowLeadDrawer((v) => !v)}
                            className="py-3.5 px-4 rounded-xl bg-white border border-slate-300 text-oxford font-bold text-xs hover:bg-parchment/50 transition"
                        >
                            {showLeadDrawer ? 'Hide Email Form' : 'Email Trustee Summary'}
                        </button>
                    </div>

                    {showLeadDrawer && (
                        <div className="pt-4 border-t border-slate-200">
                            {submitState === 'success' ? (
                                <div className="rounded-xl bg-white p-4 border border-brass/40 flex items-center gap-3 text-xs text-oxford font-semibold">
                                    <CheckCircle2 className="text-brass shrink-0" size={18} />
                                    Boardroom cashflow estimate queued by ScholarMind Institutional Desk.
                                </div>
                            ) : (
                                <form action={handleBoardReportSubmit} className="space-y-3">
                                    <input type="hidden" name="startedAt" value={startedAt} />
                                    <input type="hidden" name="formLoadedAt" value={startedAt} />
                                    <div
                                        className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden"
                                        aria-hidden="true"
                                    >
                                        <input type="text" name="companyWebsite" tabIndex={-1} autoComplete="off" />
                                        <input type="text" name="homepageUrl" tabIndex={-1} autoComplete="off" />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                        <input
                                            type="text"
                                            name="contactName"
                                            required
                                            placeholder="Your Name"
                                            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs"
                                        />
                                        <input
                                            type="email"
                                            name="contactEmail"
                                            required
                                            placeholder="Work Email"
                                            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs"
                                        />
                                        <input
                                            type="text"
                                            name="schoolName"
                                            required
                                            placeholder="School / Trust Name"
                                            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs"
                                        />
                                    </div>
                                    <label className="flex items-center gap-2 text-[11px] text-slate-600">
                                        <input
                                            type="checkbox"
                                            name="privacyConsent"
                                            value="true"
                                            required
                                            className="rounded border-slate-300"
                                        />
                                        <span>
                                            Send this estimate &amp; pilot walkthrough under our{' '}
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
                                        className="w-full py-2.5 rounded-xl bg-brass text-ivory font-bold text-xs hover:bg-brass-light transition"
                                    >
                                        {submitState === 'loading'
                                            ? 'Sending Summary...'
                                            : 'Send Trustee Cashflow Brief →'}
                                    </button>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
