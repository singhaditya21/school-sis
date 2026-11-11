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
        description:
            'Everything a K-12 campus needs to run admissions, student records, attendance, exams, and fee collections.',
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
        description:
            'Core SIS plus governed human-approved AI assistants, Tally Prime XML sync, and parent fee reminder workflows.',
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
        description:
            'Group treasury rollup, LCNC Custom Object Studio, Experience Portals, and phased multi-campus rollout.',
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
                    className="inline-flex rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xs"
                >
                    <button
                        type="button"
                        onClick={() => setCurrency('INR')}
                        className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                            currency === 'INR'
                                ? 'bg-oxford text-ivory shadow-xs'
                                : 'text-slate-600 hover:text-oxford'
                        }`}
                    >
                        India — INR (₹) + GST
                    </button>
                    <button
                        type="button"
                        onClick={() => setCurrency('USD')}
                        className={`rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                            currency === 'USD'
                                ? 'bg-oxford text-ivory shadow-xs'
                                : 'text-slate-600 hover:text-oxford'
                        }`}
                    >
                        International — USD ($)
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {SAAS_TIERS.map((tier) => (
                    <div
                        key={tier.id}
                        className={
                            tier.featured
                                ? 'bg-oxford rounded-3xl p-8 border-2 border-brass shadow-xl flex flex-col relative md:scale-105 z-10'
                                : 'bg-white rounded-3xl p-8 border border-slate-200 shadow-2xs flex flex-col hover:border-brass/50 transition-colors'
                        }
                    >
                        <p
                            className={
                                tier.featured
                                    ? 'text-brass-light text-xs font-bold uppercase tracking-widest mb-3'
                                    : 'text-brass text-xs font-bold uppercase tracking-widest mb-3'
                            }
                        >
                            {tier.eyebrow}
                        </p>
                        <h2
                            className={
                                tier.featured
                                    ? 'text-2xl font-bold text-ivory mb-2'
                                    : 'text-2xl font-bold text-oxford mb-2'
                            }
                        >
                            {tier.name}
                        </h2>

                        <div className="mb-5">
                            <div className="flex items-baseline gap-1.5">
                                <span
                                    className={
                                        tier.featured
                                            ? 'text-4xl font-extrabold tabular-nums text-ivory'
                                            : 'text-4xl font-extrabold tabular-nums text-oxford'
                                    }
                                >
                                    {currency === 'INR' ? tier.inrPrice : tier.usdPrice}
                                </span>
                                <span
                                    className={
                                        tier.featured
                                            ? 'text-sm text-slate-300'
                                            : 'text-sm text-slate-500'
                                    }
                                >
                                    / student / month
                                </span>
                            </div>
                            <p
                                className={
                                    tier.featured
                                        ? 'text-xs text-parchment/85 mt-1'
                                        : 'text-xs text-slate-500 mt-1'
                                }
                            >
                                {currency === 'INR' ? tier.inrFloor : tier.usdFloor}
                            </p>
                        </div>

                        <p
                            className={
                                tier.featured
                                    ? 'text-slate-200 text-sm leading-relaxed mb-7'
                                    : 'text-slate-600 text-sm leading-relaxed mb-7'
                            }
                        >
                            {tier.description}
                        </p>

                        <ul
                            className={
                                tier.featured
                                    ? 'space-y-4 mb-8 flex-1 text-slate-100'
                                    : 'space-y-4 mb-8 flex-1 text-slate-700'
                            }
                        >
                            {tier.items.map((item) => (
                                <li key={item} className="flex gap-3 text-sm">
                                    <Check
                                        size={18}
                                        className={
                                            tier.featured
                                                ? 'text-brass-light shrink-0'
                                                : 'text-brass shrink-0'
                                        }
                                    />
                                    {item}
                                </li>
                            ))}
                        </ul>

                        {tier.id === 'ENTERPRISE' ? (
                            <Link
                                href="/book-demo"
                                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-parchment text-oxford border border-brass/35 font-bold rounded-xl hover:bg-parchment/80 transition"
                            >
                                Scope a Multi-Campus Pilot
                                <ArrowRight size={16} />
                            </Link>
                        ) : (
                            <a
                                href={`${appUrl}/setup`}
                                className={
                                    tier.featured
                                        ? 'w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-brass text-ivory font-bold rounded-xl hover:bg-brass-light transition shadow-md'
                                        : 'w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-oxford text-ivory font-bold rounded-xl hover:bg-oxford-dark transition'
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
