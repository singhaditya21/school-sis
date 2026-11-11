import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { resolveAppUrl } from '@/lib/app-url';
import { PublicPricingTiersClient } from './pricing-currency-client';

export default function PricingPage() {
    const appUrl = resolveAppUrl();
    return (
        <div className="min-h-screen bg-slate-50 pt-28 pb-24 animate-fade-in">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-3xl mx-auto mb-12">
                    <p className="text-sm font-bold tracking-widest uppercase text-indigo-600 mb-4">
                        India INR + GST &amp; International Plans
                    </p>
                    <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
                        Transparent per-student SaaS, or an 8–12 week multi-campus finance pilot.
                    </h1>
                    <p className="text-xl text-slate-500">
                        Provision Core SIS in seconds with automated tenant onboarding, test the live sandbox without signing up, or scope a group finance control pilot.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-4">
                        <a
                            href={`${appUrl}/setup`}
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-indigo-700 transition"
                        >
                            Provision Core SIS Workspace
                            <ArrowRight size={16} />
                        </a>
                        <a
                            href={`${appUrl}/demo`}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-emerald-700 transition"
                        >
                            Explore Live Demo Campus
                            <ArrowRight size={16} />
                        </a>
                        <Link
                            href="/book-demo"
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-100 transition"
                        >
                            Request Multi-Campus Pilot
                        </Link>
                    </div>
                </div>

                <PublicPricingTiersClient appUrl={appUrl} />

                <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm">
                    <h2 className="text-2xl font-bold text-slate-900 mb-3">What determines a multi-campus pilot quote?</h2>
                    <p className="text-slate-600 leading-relaxed">
                        Campus count, source-system complexity, historical period, data quality, required integrations, security review, implementation support, and agreed success measures. All Indian subscriptions include compliant GST tax invoices under SAC 998314.
                    </p>
                </div>
            </div>
        </div>
    );
}
