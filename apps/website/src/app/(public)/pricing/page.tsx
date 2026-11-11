import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { resolveAppUrl } from '@/lib/app-url';
import { PublicPricingTiersClient } from './pricing-currency-client';

export default function PricingPage() {
    const appUrl = resolveAppUrl();
    return (
        <div className="min-h-screen bg-ivory pt-28 pb-24 animate-fade-in">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-3xl mx-auto mb-12">
                    <p className="text-xs font-bold tracking-widest uppercase text-brass mb-3">
                        India INR + GST &amp; International Plans
                    </p>
                    <h1 className="text-4xl md:text-5xl font-extrabold text-oxford tracking-tight mb-4">
                        Transparent per-student SaaS, or an 8–12 week multi-campus finance pilot.
                    </h1>
                    <p className="text-lg text-slate-600">
                        Provision Core SIS in seconds with automated tenant onboarding, test the live sandbox without signing up, or scope a group finance control pilot.
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3.5">
                        <a
                            href={`${appUrl}/setup`}
                            className="inline-flex items-center gap-2 rounded-xl bg-oxford px-6 py-3.5 text-sm font-bold text-ivory shadow-sm hover:bg-oxford-dark transition"
                        >
                            Provision Core SIS Workspace
                            <ArrowRight size={16} />
                        </a>
                        <a
                            href={`${appUrl}/demo`}
                            className="inline-flex items-center gap-2 rounded-xl bg-parchment border border-brass/45 px-6 py-3.5 text-sm font-bold text-oxford hover:bg-parchment/80 transition"
                        >
                            Explore Live Demo Campus
                            <ArrowRight size={16} />
                        </a>
                        <Link
                            href="/book-demo"
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-bold text-oxford hover:bg-slate-50 transition"
                        >
                            Request Multi-Campus Pilot
                        </Link>
                    </div>
                </div>

                <PublicPricingTiersClient appUrl={appUrl} />

                <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-2xs">
                    <h2 className="text-2xl font-bold text-oxford mb-3">
                        What determines a multi-campus pilot quote?
                    </h2>
                    <p className="text-slate-600 leading-relaxed">
                        Campus count, source-system complexity, historical period, data quality, required integrations, security review, implementation support, and agreed success measures. All Indian subscriptions include compliant GST tax invoices under SAC 998314.
                    </p>
                </div>
            </div>
        </div>
    );
}
