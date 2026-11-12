import type { Metadata } from 'next';
import { WEBSITE_BASE_URL } from '@/lib/seo-guides';
import { resolveAppUrl } from '@/lib/app-url';
import DpdpScorerClient from './dpdp-scorer-client';

export const metadata: Metadata = {
    title: '2-Minute School DPDP Act 2023 Section 9 Readiness Scorer | ScholarMind',
    description:
        'Free 8-point self-assessment for Indian CBSE, ICSE, and Educational Trust leadership to benchmark child-data encryption, parental consent, PostgreSQL RLS isolation, and MFA under DPDP Act 2023 Section 9.',
    alternates: {
        canonical: `${WEBSITE_BASE_URL}/tools/dpdp-readiness`,
    },
};

export default function DpdpReadinessToolPage() {
    const appUrl = resolveAppUrl();

    return (
        <div className="min-h-screen bg-ivory pt-32 pb-24 text-slate-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
                <header className="max-w-3xl space-y-4">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-parchment border border-brass/35">
                        <span className="h-2 w-2 rounded-full bg-brass" />
                        <span className="text-xs font-bold uppercase tracking-widest text-oxford">
                            Free Statutory Self-Assessment · Zero Sign-Up Required
                        </span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight text-oxford leading-tight">
                        2-Minute School DPDP Act 2023 (Section 9) Readiness Scorer
                    </h1>
                    <p className="text-lg text-slate-600 leading-relaxed">
                        Every student under 18 is classified as a child under Section 9 of India&apos;s Digital Personal Data Protection Act 2023. Answer 8 plain-English control checks to generate an instant readiness score and Board of Trustees remediation memo.
                    </p>
                </header>

                <DpdpScorerClient appUrl={appUrl} />
            </div>
        </div>
    );
}
