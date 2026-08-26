import Link from 'next/link';
import { Check } from 'lucide-react';

const engagements = [
    {
        name: 'Pilot Assessment',
        eyebrow: 'Start here',
        description: 'Confirm the problem, source systems, data path, executive outcome, and security constraints before a proposal.',
        items: [
            '45-minute operating assessment',
            'Buyer, champion, and gatekeeper map',
            'Current-system and data-source review',
            'Pilot fit and disqualification decision',
        ],
        cta: 'Book assessment',
        href: '/book-demo',
        featured: false,
    },
    {
        name: 'Group Finance Control Pilot',
        eyebrow: 'Paid design partnership',
        description: 'An 8–12 week engagement for one or two campuses, scoped after a data workshop.',
        items: [
            'Fee and transaction data import',
            'Reconciliation and variance handling',
            'Receivables, exceptions, and approvals',
            'Executive reporting and value review',
        ],
        cta: 'Discuss a paid pilot',
        href: '/book-demo',
        featured: true,
    },
    {
        name: 'Group Rollout',
        eyebrow: 'After verified value',
        description: 'Expand campuses, integrations, workflows, and implementation support after the pilot meets its agreed success gates.',
        items: [
            'Phased campus deployment',
            'Reusable data mappings',
            'Implementation and support plan',
            'Commercial model based on proven scope',
        ],
        cta: 'Plan the expansion path',
        href: '/book-demo',
        featured: false,
    },
];

export default function PricingPage() {
    return (
        <div className="min-h-screen bg-slate-50 pt-28 pb-24 animate-fade-in">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center max-w-3xl mx-auto mb-16">
                    <p className="text-sm font-bold tracking-widest uppercase text-indigo-600 mb-4">Design-partner engagement</p>
                    <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
                        Prove the outcome before committing to a rollout.
                    </h1>
                    <p className="text-xl text-slate-500">
                        ScholarMind scopes pricing after discovery and a data workshop. Permanent public per-student pricing will follow real pilot and implementation evidence.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
                    {engagements.map((engagement) => (
                        <div
                            key={engagement.name}
                            className={engagement.featured
                                ? 'bg-slate-900 rounded-3xl p-8 border border-indigo-500 shadow-2xl shadow-indigo-600/20 flex flex-col relative md:scale-105 z-10'
                                : 'bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col hover:border-indigo-300 transition-colors'}
                        >
                            <p className={engagement.featured ? 'text-indigo-300 text-xs font-bold uppercase tracking-widest mb-3' : 'text-indigo-600 text-xs font-bold uppercase tracking-widest mb-3'}>
                                {engagement.eyebrow}
                            </p>
                            <h2 className={engagement.featured ? 'text-2xl font-bold text-white mb-3' : 'text-2xl font-bold text-slate-900 mb-3'}>
                                {engagement.name}
                            </h2>
                            <p className={engagement.featured ? 'text-indigo-100 text-sm leading-relaxed mb-7' : 'text-slate-500 text-sm leading-relaxed mb-7'}>
                                {engagement.description}
                            </p>
                            <ul className={engagement.featured ? 'space-y-4 mb-8 flex-1 text-indigo-100' : 'space-y-4 mb-8 flex-1 text-slate-600'}>
                                {engagement.items.map((item) => (
                                    <li key={item} className="flex gap-3 text-sm">
                                        <Check size={18} className={engagement.featured ? 'text-emerald-400 shrink-0' : 'text-indigo-500 shrink-0'} />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                            <Link
                                href={engagement.href}
                                className={engagement.featured
                                    ? 'w-full block text-center py-3 px-4 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 transition shadow-lg'
                                    : 'w-full block text-center py-3 px-4 bg-indigo-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 transition'}
                            >
                                {engagement.cta}
                            </Link>
                        </div>
                    ))}
                </div>

                <div className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-3xl p-8 md:p-10 shadow-sm">
                    <h2 className="text-2xl font-bold text-slate-900 mb-3">What determines a pilot quote?</h2>
                    <p className="text-slate-600 leading-relaxed">
                        Campus count, source-system complexity, historical period, data quality, required integrations, security review, implementation support, and agreed success measures. Third-party costs and unusual remediation are scoped separately.
                    </p>
                </div>
            </div>
        </div>
    );
}
