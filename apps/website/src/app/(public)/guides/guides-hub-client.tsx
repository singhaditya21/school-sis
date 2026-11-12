'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Clock, Search, ShieldCheck, Sparkles } from 'lucide-react';
import type { GuideCategory, SeoGuide } from '@/lib/seo-guides';

const CATEGORY_TABS: Array<{ key: 'ALL' | GuideCategory; label: string }> = [
    { key: 'ALL', label: 'All Playbooks (22)' },
    { key: 'COMPLIANCE_FINANCE', label: 'Tally, UPI & DPDP Compliance' },
    { key: 'MIGRATION', label: '48-Hour ERP Migrations' },
    { key: 'REGIONAL_HUB', label: 'City & Trust Hubs' },
];

export default function GuidesHubClient({
    guides,
    appUrl,
}: {
    guides: readonly SeoGuide[];
    appUrl: string;
}) {
    const [activeCategory, setActiveCategory] = useState<'ALL' | GuideCategory>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return guides.filter((guide) => {
            if (activeCategory !== 'ALL' && guide.category !== activeCategory) {
                return false;
            }
            if (!q) return true;
            const hay = `${guide.title} ${guide.badge} ${guide.metaDescription} ${guide.heroSubtitle}`.toLowerCase();
            return hay.includes(q);
        });
    }, [guides, activeCategory, searchQuery]);

    return (
        <div className="space-y-10">
            {/* Search & Category Filter Bar */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                <div className="relative">
                    <Search
                        size={18}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search Tally Prime, DPDP Section 9, Entab, Fedena, MCB, Delhi NCR, Pune, Bengaluru..."
                        aria-label="Search institutional playbooks and migration guides"
                        className="w-full pl-11 pr-4 py-3 rounded-xl bg-ivory border border-slate-200 text-sm text-oxford placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brass"
                    />
                </div>

                <div className="flex flex-wrap gap-2">
                    {CATEGORY_TABS.map((tab) => {
                        const isActive = activeCategory === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveCategory(tab.key)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                    isActive
                                        ? 'bg-oxford text-ivory shadow-xs'
                                        : 'bg-parchment/70 text-oxford hover:bg-parchment border border-brass/30'
                                }`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Featured Free Diagnostic Strip */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <Link
                    href="/tools/dpdp-readiness"
                    className="group rounded-2xl bg-oxford text-ivory p-6 border border-oxford-dark flex items-start justify-between gap-4 hover:bg-oxford-dark transition-all shadow-sm"
                >
                    <div className="space-y-1.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brass-light">
                            <ShieldCheck size={14} />
                            Free 2-Minute Boardroom Diagnostic
                        </span>
                        <h2 className="text-xl font-extrabold text-ivory">
                            School DPDP Act 2023 Section 9 Readiness Scorer
                        </h2>
                        <p className="text-xs text-slate-300 leading-relaxed">
                            Benchmark child-PII encryption, parental consent logs, RLS isolation, and MFA across 8 statutory checks.
                        </p>
                    </div>
                    <ArrowRight
                        size={20}
                        className="shrink-0 text-brass-light mt-1 group-hover:translate-x-1 transition-transform"
                    />
                </Link>

                <a
                    href={`${appUrl}/demo`}
                    className="group rounded-2xl bg-parchment/80 text-oxford p-6 border border-brass/40 flex items-start justify-between gap-4 hover:bg-parchment transition-all shadow-xs"
                >
                    <div className="space-y-1.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brass">
                            <Sparkles size={14} />
                            Zero Sign-Up Required
                        </span>
                        <h2 className="text-xl font-extrabold text-oxford">
                            Launch 1-Click Live CBSE Demo Sandbox
                        </h2>
                        <p className="text-xs text-slate-700 leading-relaxed">
                            Inspect Tally Prime XML voucher exports, 4-eyes waiver approvals, and the 48-hour CSV importer live.
                        </p>
                    </div>
                    <ArrowRight
                        size={20}
                        className="shrink-0 text-oxford mt-1 group-hover:translate-x-1 transition-transform"
                    />
                </a>
            </div>

            {/* Cards Grid */}
            {filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
                    <p className="text-base font-bold text-oxford">No playbooks matched &ldquo;{searchQuery}&rdquo;.</p>
                    <button
                        type="button"
                        onClick={() => {
                            setSearchQuery('');
                            setActiveCategory('ALL');
                        }}
                        className="text-xs font-bold text-brass underline"
                    >
                        Reset search filters
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered.map((guide) => (
                        <Link
                            key={guide.slug}
                            href={`/guides/${guide.slug}`}
                            data-testid={`guide-card-${guide.slug}`}
                            className="group bg-white rounded-2xl border border-slate-200/90 p-6 flex flex-col justify-between hover:border-brass/60 hover:shadow-md transition-all"
                        >
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-parchment text-oxford text-[11px] font-bold border border-brass/30">
                                        <BookOpen size={12} className="text-brass" />
                                        {guide.badge}
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                                        <Clock size={12} />
                                        {guide.readingMinutes} min
                                    </span>
                                </div>
                                <h3 className="text-lg font-extrabold text-oxford group-hover:text-brass transition-colors leading-snug">
                                    {guide.title}
                                </h3>
                                <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">
                                    {guide.metaDescription}
                                </p>
                            </div>

                            <div className="pt-5 mt-5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-oxford">
                                <span>{guide.categoryLabel}</span>
                                <span className="inline-flex items-center gap-1 text-brass group-hover:translate-x-0.5 transition-transform">
                                    Read blueprint <ArrowRight size={14} />
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
