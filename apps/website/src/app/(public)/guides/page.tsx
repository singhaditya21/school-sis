import type { Metadata } from 'next';
import { ALL_SEO_GUIDES, WEBSITE_BASE_URL } from '@/lib/seo-guides';
import { resolveAppUrl } from '@/lib/app-url';
import GuidesHubClient from './guides-hub-client';

export const metadata: Metadata = {
    title: 'Institutional Playbooks, Tally Sync & 48h ERP Migration Guides | ScholarMind',
    description:
        'Step-by-step blueprints for CBSE, ICSE, and Educational Trust leadership: Tally Prime XML integration, DPDP Act 2023 Section 9 child-data compliance, and 48-hour ERP migrations from Fedena, Entab, MCB, and Edunext.',
    alternates: {
        canonical: `${WEBSITE_BASE_URL}/guides`,
    },
};

export default function GuidesIndexPage() {
    const appUrl = resolveAppUrl();

    return (
        <div className="min-h-screen bg-ivory pt-32 pb-24 text-slate-900">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
                <header className="max-w-3xl space-y-4">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-parchment border border-brass/35">
                        <span className="h-2 w-2 rounded-full bg-brass" />
                        <span className="text-xs font-bold uppercase tracking-widest text-oxford">
                            ScholarMind Institutional Library · 22 Verified Playbooks
                        </span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight text-oxford leading-tight">
                        Governance, Tally Accounting &amp; 48-Hour ERP Migration Blueprints
                    </h1>
                    <p className="text-lg text-slate-600 leading-relaxed">
                        Practical checklists for Principals, Trustees, Finance Officers, and Chartered Accountants modernizing school fee governance and DPDP Act 2023 Section 9 child-data security.
                    </p>
                </header>

                <GuidesHubClient guides={ALL_SEO_GUIDES} appUrl={appUrl} />
            </div>
        </div>
    );
}
