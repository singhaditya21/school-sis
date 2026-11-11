import Link from 'next/link';
import {
    LineChart,
    ShieldCheck,
    Landmark,
    Globe,
    Users,
    ArrowRight,
    Sparkles,
    CheckCircle2,
} from 'lucide-react';
import { resolveAppUrl } from '@/lib/app-url';

export default function LandingPage() {
    const appUrl = resolveAppUrl();
    return (
        <div className="flex flex-col min-h-screen bg-ivory overflow-x-hidden text-slate-900">
            {/* Subtle Architectural Grid Overlay */}
            <div
                aria-hidden="true"
                className="fixed inset-0 z-0 pointer-events-none opacity-45"
                style={{
                    backgroundImage: 'radial-gradient(rgba(22, 43, 77, 0.08) 1px, transparent 1px)',
                    backgroundSize: '28px 28px',
                }}
            />

            {/* EDITORIAL OXFORD NAVY & WARM IVORY HERO */}
            <section className="relative z-10 pt-32 pb-20 md:pt-40 md:pb-28 border-b border-slate-200/80">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-8">
                    <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-parchment border border-brass/35 shadow-xs mx-auto">
                        <span className="flex h-2 w-2 rounded-full bg-brass" />
                        <span className="text-xs font-bold tracking-widest uppercase text-oxford">
                            Institutional Operating System · India INR &amp; Global Campuses
                        </span>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.08] max-w-5xl mx-auto text-oxford">
                        Financial governance &amp; clarity{' '}
                        <span className="text-brass">for every campus.</span>
                    </h1>

                    <p className="max-w-2xl mx-auto text-lg md:text-xl text-slate-600 leading-relaxed">
                        Unify student registries, Razorpay UPI &amp; WhatsApp fee collection, maker-checker waiver approvals, and multi-campus treasury visibility — with a guided 48-hour ERP importer.
                    </p>

                    <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3.5 pt-4">
                        <a
                            href={`${appUrl}/setup`}
                            data-testid="hero-start-workspace"
                            className="group inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-xl bg-oxford text-ivory font-bold text-base transition-all hover:bg-oxford-dark shadow-md"
                        >
                            Start school workspace
                            <ArrowRight className="group-hover:translate-x-1 transition-transform" size={18} />
                        </a>
                        <a
                            href={`${appUrl}/demo`}
                            data-testid="hero-explore-demo"
                            className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-parchment hover:bg-parchment/80 border border-brass/45 text-oxford font-bold text-base transition-all shadow-xs"
                        >
                            <Sparkles size={17} className="text-brass" />
                            Explore 1-click live demo
                        </a>
                        <Link
                            href="/book-demo"
                            className="px-6 py-4 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-oxford font-semibold text-base transition-all"
                        >
                            Book a pilot assessment
                        </Link>
                        <Link
                            href="/architecture"
                            className="px-6 py-4 rounded-xl text-slate-600 hover:text-oxford font-semibold text-base transition-colors"
                        >
                            Inspect Architecture →
                        </Link>
                    </div>

                    {/* Institutional Benchmark Strip */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-14 pt-12 border-t border-slate-200 max-w-4xl mx-auto">
                        <div className="flex flex-col items-center p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                            <span className="text-3xl font-black tabular-nums text-oxford">48 hrs</span>
                            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase mt-1.5">
                                Guided ERP migration
                            </span>
                        </div>
                        <div className="flex flex-col items-center p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                            <span className="text-3xl font-black tabular-nums text-brass">99.5%</span>
                            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase mt-1.5">
                                Reconciliation target
                            </span>
                        </div>
                        <div className="flex flex-col items-center p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                            <span className="text-3xl font-black tabular-nums text-oxford">8–12 wk</span>
                            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase mt-1.5">
                                Structured group pilot
                            </span>
                        </div>
                        <div className="flex flex-col items-center p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                            <span className="text-3xl font-black tabular-nums text-oxford">0</span>
                            <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase mt-1.5">
                                Big-bang cutover risk
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* INSTITUTIONAL CAPABILITY BENTO GRID */}
            <section id="features" className="relative z-10 py-24 md:py-32">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="mb-16 max-w-3xl">
                        <p className="text-xs font-bold uppercase tracking-widest text-brass mb-3">
                            Built for Trustees, Principals &amp; Finance Leads
                        </p>
                        <h2 className="text-4xl md:text-5xl font-extrabold text-oxford tracking-tight mb-4">
                            Verified financial control. Zero migration guesswork.
                        </h2>
                        <p className="text-lg text-slate-600 leading-relaxed">
                            Start with the fee, receipt, and approval workflows leadership relies on every day, verify every rupee against bank settlements, and scale across campuses with confidence.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        {/* Box 1: Primary Oxford Navy Feature Card */}
                        <div className="md:col-span-8 relative bg-oxford text-ivory rounded-3xl p-8 md:p-10 overflow-hidden border border-oxford-dark shadow-lg flex flex-col justify-between min-h-[320px]">
                            <div className="h-1 w-24 bg-brass rounded-full mb-6" />
                            <div className="relative z-10 max-w-xl space-y-4">
                                <div className="w-12 h-12 bg-brass/20 border border-brass/45 rounded-xl flex items-center justify-center">
                                    <Landmark className="text-brass-light" size={24} />
                                </div>
                                <h3 className="text-3xl font-extrabold tracking-tight text-ivory">
                                    UPI, WhatsApp Pay Links &amp; Fee Reconciliation
                                </h3>
                                <p className="text-slate-200/90 text-base leading-relaxed">
                                    Collect tuition via Razorpay UPI, NetBanking, RuPay, and 1-click signed WhatsApp payment links while exposing every waiver, refund, or settlement variance before sign-off.
                                </p>
                                <div className="flex flex-wrap gap-3 pt-2 text-xs font-semibold text-parchment">
                                    <span className="inline-flex items-center gap-1.5">
                                        <CheckCircle2 size={14} className="text-brass-light" />
                                        Tally Prime XML Sync
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <CheckCircle2 size={14} className="text-brass-light" />
                                        Razorpay Route Split Settlements
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Box 2: Maker-Checker Compliance */}
                        <div className="md:col-span-4 bg-white rounded-3xl p-8 md:p-10 border border-slate-200 shadow-xs flex flex-col justify-between min-h-[320px]">
                            <div className="w-12 h-12 bg-parchment border border-brass/35 rounded-xl flex items-center justify-center">
                                <ShieldCheck className="text-brass" size={24} />
                            </div>
                            <div className="space-y-2.5 mt-6">
                                <h3 className="text-2xl font-bold text-oxford">4-Eyes Approval Evidence</h3>
                                <p className="text-slate-600 text-sm leading-relaxed">
                                    Enforce maker-checker authorization and preserve an immutable audit trail for fee concessions, waivers, refunds, and sensitive gradebook changes.
                                </p>
                            </div>
                        </div>

                        {/* Box 3: 48h Coexist & Migrate */}
                        <div className="md:col-span-4 bg-white rounded-3xl p-8 md:p-10 border border-slate-200 shadow-xs flex flex-col justify-between min-h-[300px]">
                            <div className="w-12 h-12 bg-parchment border border-brass/35 rounded-xl flex items-center justify-center">
                                <Globe className="text-oxford" size={24} />
                            </div>
                            <div className="space-y-2.5 mt-6">
                                <h3 className="text-2xl font-bold text-oxford">Coexist or Switch in 48h</h3>
                                <p className="text-slate-600 text-sm leading-relaxed">
                                    Auto-map Entab, Fedena, MCB, Edunext, or Tally spreadsheets with dry-run validation, AES-256-GCM guardian PII encryption, and 1-click batch rollback.
                                </p>
                            </div>
                        </div>

                        {/* Box 4: Group Executive Visibility */}
                        <div className="md:col-span-8 bg-parchment/55 rounded-3xl p-8 md:p-10 border border-brass/30 flex flex-col justify-between min-h-[300px]">
                            <div className="flex gap-3">
                                <div className="w-11 h-11 bg-white border border-brass/30 flex items-center justify-center rounded-xl">
                                    <LineChart className="text-oxford" size={20} />
                                </div>
                                <div className="w-11 h-11 bg-white border border-brass/30 flex items-center justify-center rounded-xl">
                                    <Users className="text-brass" size={20} />
                                </div>
                            </div>
                            <div className="max-w-xl space-y-2.5 mt-6">
                                <h3 className="text-3xl font-extrabold text-oxford tracking-tight">
                                    Multi-Campus Trust &amp; Society Visibility
                                </h3>
                                <p className="text-slate-700 text-base leading-relaxed">
                                    Compare billed, collected, overdue ageing buckets, concessions, and daily attendance across every campus in your education trust from a single row-level-isolated platform.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* OXFORD NAVY & HERITAGE BRASS CLOSING CTA */}
            <section id="demo" className="relative z-10 py-24 bg-oxford text-ivory border-t-2 border-brass">
                <div className="max-w-4xl mx-auto px-4 text-center space-y-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-brass-light">
                        Zero-Risk Evaluation
                    </p>
                    <h2 className="text-4xl md:text-6xl font-black tracking-tight text-ivory">
                        Prove value before campus cutover.
                    </h2>
                    <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto">
                        Explore our pre-seeded CBSE sandbox in one click, provision your own school workspace in 60 seconds, or scope a multi-campus pilot with our engineering team.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
                        <a
                            href={`${appUrl}/demo`}
                            className="px-8 py-4 rounded-xl bg-brass hover:bg-brass-light text-ivory font-bold text-base transition-all shadow-md"
                        >
                            Launch 1-Click Demo Campus
                        </a>
                        <Link
                            href="/book-demo"
                            className="px-8 py-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-ivory font-bold text-base transition-all"
                        >
                            Start Pilot Assessment
                        </Link>
                        <Link
                            href="/pricing"
                            className="px-8 py-4 rounded-xl border border-brass/45 text-parchment hover:bg-white/5 font-semibold text-base transition-all"
                        >
                            View INR &amp; USD Pricing
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
