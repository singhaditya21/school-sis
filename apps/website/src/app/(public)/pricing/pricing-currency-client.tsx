'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';

type CurrencyMode = 'INR' | 'USD';

const SAAS_TIERS = [
    {
        id: 'CORE',
        name: 'Core SIS',
        eyebrow: 'Self-serve campus workspace',
        inrPrice: '₹15',
        inrFloor: '₹60,000/yr campus floor + 18% GST (SAC 998314)',
        usdPrice: '$2',
        usdFloor: '$900/yr campus floor',
        description: 'Everything a K-12 campus needs to run admissions, student records, attendance, exams, and fee collections.',
        items: [
            'Encrypted student & guardian registry',
            'Fee plans, invoicing, counter receipts & 4-eyes approvals',
            'Razorpay UPI / NetBanking / Cards & WhatsApp pay links',
            '48-hour Legacy ERP Excel/CSV data migration wizard',
        ],
        featured: false,
    },
    {
        id: 'AI_PRO',
        name: 'Campus Pro + Governed AI',
        eyebrow: 'Most popular for growing schools',
        inrPrice: '₹28',
        inrFloor: '₹1,25,000/yr campus floor + 18% GST (SAC 998314)',
        usdPrice: '$4',
        usdFloor: '$1,800/yr campus floor',
        description: 'Core SIS plus governed human-approved AI assistants, Tally Prime XML sync, and parent fee reminder workflows.',
        items: [
            'Everything in Core SIS',
            'Approval-gated AI copilot workflows',
            'Tally Prime XML voucher sync & ageing analytics',
            'Automated WhatsApp, SMS & Email fee reminders',
        ],
        featured: true,
    },
    {
        id: 'ENTERPRISE',
        name: 'Multi-Campus & Group Pilot',
        eyebrow: 'Trusts, societies & school chains',
        inrPrice: '₹45',
        inrFloor: '₹4,00,000/yr group floor + 18% GST · 8–12 wk pilot option',
        usdPrice: '$7',
        usdFloor: '$5,400/yr group floor · Paid pilot option',
        description: 'Group treasury rollup, LCNC Custom Object Studio, Experience Portals, and phased multi-campus rollout.',
        items: [
            'Cross-campus fee reconciliation & group executive HQ',
            'Custom Object Studio, BI Report Builder & public portals',
            'OIDC / SAML Enterprise SSO & SCIM 2.0 provisioning',
            'Dedicated onboarding engineer & audit evidence SLA',
        ],
        featured: false,
    },
] as const;

export function PublicPricingTiersClient({ appUrl }: { appUrl: string }) {
    const [currency, setCurrency] = useState<CurrencyMode>('INR');

    return (
        <div className="space-y-10 mb-20">
            <div className="flex justify-center">
                <div
                    role="group"
                    aria-label="Pricing currency toggle"
                    className="inline-flex rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
                >
                    <button
                        type="button"
                        onClick={() => setCurrency('INR')}
                        className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                            currency === 'INR'
                                ? 'bg-indigo-600 text-white shadow'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        🇮🇳 India — INR (₹) + GST
                    </button>
                    <button
                        type="button"
                        onClick={() => setCurrency('USD')}
                        className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                            currency === 'USD'
                                ? 'bg-indigo-600 text-white shadow'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        🌍 International — USD ($)
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {SAAS_TIERS.map((tier) => (
                    <div
                        key={tier.id}
                        className={
                            tier.featured
                                ? 'bg-slate-900 rounded-3xl p-8 border border-indigo-500 shadow-2xl shadow-indigo-600/20 flex flex-col relative md:scale-105 z-10'
                                : 'bg-white rounded-3xl p-8 border border-slate-200 shadow-sm flex flex-col hover:border-indigo-300 transition-colors'
                        }
                    >
                        <p
                            className={
                                tier.featured
                                    ? 'text-indigo-300 text-xs font-bold uppercase tracking-widest mb-3'
                                    : 'text-indigo-600 text-xs font-bold uppercase tracking-widest mb-3'
                            }
                        >
                            {tier.eyebrow}
                        </p>
                        <h2
                            className={
                                tier.featured
                                    ? 'text-2xl font-bold text-white mb-2'
                                    : 'text-2xl font-bold text-slate-900 mb-2'
                            }
                        >
                            {tier.name}
                        </h2>

                        <div className="mb-5">
                            <div className="flex items-baseline gap-1.5">
                                <span
                                    className={
                                        tier.featured
                                            ? 'text-4xl font-extrabold text-white'
                                            : 'text-4xl font-extrabold text-slate-900'
                                    }
                                >
                                    {currency === 'INR' ? tier.inrPrice : tier.usdPrice}
                                </span>
                                <span
                                    className={
                                        tier.featured ? 'text-sm text-indigo-200' : 'text-sm text-slate-500'
                                    }
                                >
                                    / student / month
                                </span>
                            </div>
                            <p
                                className={
                                    tier.featured
                                        ? 'text-xs text-indigo-300 mt-1'
                                        : 'text-xs text-slate-500 mt-1'
                                }
                            >
                                {currency === 'INR' ? tier.inrFloor : tier.usdFloor}
                            </p>
                        </div>

                        <p
                            className={
                                tier.featured
                                    ? 'text-indigo-100 text-sm leading-relaxed mb-7'
                                    : 'text-slate-500 text-sm leading-relaxed mb-7'
                            }
                        >
                            {tier.description}
                        </p>

                        <ul
                            className={
                                tier.featured
                                    ? 'space-y-4 mb-8 flex-1 text-indigo-100'
                                    : 'space-y-4 mb-8 flex-1 text-slate-600'
                            }
                        >
                            {tier.items.map((item) => (
                                <li key={item} className="flex gap-3 text-sm">
                                    <Check
                                        size={18}
                                        className={
                                            tier.featured
                                                ? 'text-emerald-400 shrink-0'
                                                : 'text-indigo-500 shrink-0'
                                        }
                                    />
                                    {item}
                                </li>
                            ))}
                        </ul>

                        {tier.id === 'ENTERPRISE' ? (
                            <Link
                                href="/book-demo"
                                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-indigo-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 transition"
                            >
                                Scope a Multi-Campus Pilot
                                <ArrowRight size={16} />
                            </Link>
                        ) : (
                            <a
                                href={`${appUrl}/setup`}
                                className={
                                    tier.featured
                                        ? 'w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-indigo-500 text-white font-bold rounded-xl hover:bg-indigo-600 transition shadow-lg'
                                        : 'w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-indigo-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 transition'
                                }
                            >
                                Start on {tier.name}
                                <ArrowRight size={16} />
                            </a>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
