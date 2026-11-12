import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { ALL_SEO_GUIDES, getGuideBySlug, WEBSITE_BASE_URL } from '@/lib/seo-guides';
import { resolveAppUrl } from '@/lib/app-url';

export function generateStaticParams() {
    return ALL_SEO_GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const guide = getGuideBySlug(slug);
    if (!guide) {
        return { title: 'Guide Not Found | ScholarMind' };
    }

    const canonicalUrl = `${WEBSITE_BASE_URL}/guides/${guide.slug}`;
    return {
        title: `${guide.title} | ScholarMind`,
        description: guide.metaDescription,
        alternates: {
            canonical: canonicalUrl,
        },
        openGraph: {
            title: guide.title,
            description: guide.metaDescription,
            url: canonicalUrl,
            siteName: 'ScholarMind',
            type: 'article',
        },
    };
}

export default async function GuideDetailPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const guide = getGuideBySlug(slug);
    if (!guide) {
        notFound();
    }

    const appUrl = resolveAppUrl();
    const relatedGuides = ALL_SEO_GUIDES.filter(
        (g) => g.slug !== guide.slug && g.category === guide.category,
    ).slice(0, 3);

    const faqSchema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: guide.faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
            },
        })),
    };

    const softwareSchema = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'ScholarMind Institutional Operating System',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, iOS, Android',
        offers: {
            '@type': 'Offer',
            price: '18',
            priceCurrency: 'INR',
            description: 'Core SIS & Fee Governance per active student per month (billed annually)',
        },
        provider: {
            '@type': 'Organization',
            name: 'ScholarMind',
            address: {
                '@type': 'PostalAddress',
                addressLocality: 'New Delhi',
                addressRegion: 'Delhi',
                addressCountry: 'IN',
            },
        },
    };

    return (
        <article className="min-h-screen bg-ivory pt-28 pb-24 text-slate-900">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
            />

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
                {/* Breadcrumb */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-600">
                    <Link
                        href="/guides"
                        className="inline-flex items-center gap-1.5 text-oxford hover:text-brass transition-colors"
                    >
                        <ArrowLeft size={14} />
                        All Institutional Playbooks
                    </Link>
                    <span>
                        {guide.categoryLabel} · {guide.readingMinutes} min read
                    </span>
                </div>

                {/* Hero */}
                <header className="bg-white rounded-3xl border border-slate-200/90 p-8 md:p-12 shadow-xs space-y-6">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-parchment border border-brass/35">
                        <span className="h-2 w-2 rounded-full bg-brass" />
                        <span className="text-xs font-bold uppercase tracking-widest text-oxford">
                            {guide.badge}
                        </span>
                    </div>

                    <h1 className="text-3xl md:text-5xl font-black tracking-tight text-oxford leading-tight">
                        {guide.title}
                    </h1>

                    <p className="text-lg text-slate-600 leading-relaxed">{guide.heroSubtitle}</p>

                    {/* Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                        {guide.keyMetrics.map((metric) => (
                            <div
                                key={metric.label}
                                className="rounded-2xl bg-ivory border border-slate-200/80 p-4 text-center"
                            >
                                <p className="text-2xl font-black tabular-nums text-oxford">{metric.value}</p>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mt-1">
                                    {metric.label}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* Direct Self-Serve CTAs */}
                    <div className="flex flex-wrap gap-3 pt-2">
                        <a
                            href={`${appUrl}/demo`}
                            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-oxford text-ivory font-bold text-sm hover:bg-oxford-dark transition-all shadow-sm"
                        >
                            <Sparkles size={16} className="text-brass-light" />
                            Explore 1-Click Live CBSE Demo
                        </a>
                        <a
                            href={`${appUrl}/setup`}
                            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-parchment border border-brass/45 text-oxford font-bold text-sm hover:bg-parchment/80 transition-all"
                        >
                            Start 60-Second Campus Workspace
                            <ArrowRight size={15} />
                        </a>
                        <Link
                            href="/tools/dpdp-readiness"
                            className="inline-flex items-center gap-2 px-5 py-3.5 rounded-xl bg-white border border-slate-300 text-oxford font-semibold text-sm hover:bg-slate-50 transition-all"
                        >
                            <ShieldCheck size={16} className="text-brass" />
                            Run 2-Min DPDP Score
                        </Link>
                    </div>
                </header>

                {/* Executive Context */}
                <section className="bg-white rounded-3xl border border-slate-200/90 p-8 md:p-10 space-y-4">
                    <h2 className="text-2xl font-extrabold text-oxford">Executive Summary</h2>
                    {guide.executiveSummary.map((paragraph, idx) => (
                        <p key={idx} className="text-base text-slate-700 leading-relaxed">
                            {paragraph}
                        </p>
                    ))}
                </section>

                {/* Implementation Checklist */}
                <section className="bg-oxford text-ivory rounded-3xl p-8 md:p-10 space-y-6 border border-oxford-dark shadow-md">
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-widest text-brass-light">
                            Actionable Playbook
                        </p>
                        <h2 className="text-2xl md:text-3xl font-extrabold text-ivory">
                            {guide.checklistTitle}
                        </h2>
                    </div>

                    <div className="space-y-4">
                        {guide.checklistItems.map((item) => (
                            <div
                                key={item.step}
                                className="rounded-2xl bg-white/5 border border-white/10 p-5 flex items-start gap-3.5"
                            >
                                <CheckCircle2 className="text-brass-light shrink-0 mt-0.5" size={20} />
                                <div className="space-y-1">
                                    <h3 className="font-bold text-ivory text-base">{item.step}</h3>
                                    <p className="text-sm text-slate-300 leading-relaxed">{item.detail}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Side-by-Side Comparison */}
                <section className="bg-white rounded-3xl border border-slate-200/90 p-8 md:p-10 space-y-6">
                    <h2 className="text-2xl font-extrabold text-oxford">
                        Legacy School Software vs ScholarMind Institutional Control
                    </h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                                    <th className="py-3 pr-4 font-bold">Control Dimension</th>
                                    <th className="py-3 px-4 font-bold">Typical Legacy Setup</th>
                                    <th className="py-3 pl-4 font-bold text-oxford">ScholarMind Standard</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {guide.comparisonRows.map((row) => (
                                    <tr key={row.dimension} className="align-top">
                                        <td className="py-4 pr-4 font-bold text-oxford">{row.dimension}</td>
                                        <td className="py-4 px-4 text-slate-600">{row.legacyApproach}</td>
                                        <td className="py-4 pl-4 font-semibold text-oxford">
                                            {row.scholarMindStandard}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* FAQ Section */}
                <section className="bg-white rounded-3xl border border-slate-200/90 p-8 md:p-10 space-y-6">
                    <h2 className="text-2xl font-extrabold text-oxford">
                        Frequently Asked Questions
                    </h2>
                    <div className="space-y-5">
                        {guide.faqs.map((faq) => (
                            <div
                                key={faq.question}
                                className="rounded-2xl bg-ivory border border-slate-200/80 p-5 space-y-2"
                            >
                                <h3 className="text-base font-bold text-oxford">{faq.question}</h3>
                                <p className="text-sm text-slate-600 leading-relaxed">{faq.answer}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Related Guides */}
                {relatedGuides.length > 0 && (
                    <section className="space-y-4">
                        <h2 className="text-xl font-extrabold text-oxford">Related Institutional Playbooks</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {relatedGuides.map((rel) => (
                                <Link
                                    key={rel.slug}
                                    href={`/guides/${rel.slug}`}
                                    className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-brass/60 transition-all space-y-2"
                                >
                                    <span className="text-[11px] font-bold text-brass uppercase tracking-wider">
                                        {rel.badge}
                                    </span>
                                    <h3 className="text-sm font-bold text-oxford leading-snug">{rel.title}</h3>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </article>
    );
}
