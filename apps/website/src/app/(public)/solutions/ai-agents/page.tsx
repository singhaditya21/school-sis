import Link from 'next/link';
import { ArrowRight, Bot, CircleGauge, FileCheck2, ShieldCheck } from 'lucide-react';

const controls = [
    {
        icon: ShieldCheck,
        title: 'Approval before sensitive action',
        description: 'Grades, credentials, refunds, aid, and safeguarding decisions remain human-owned and require explicit authorization.',
    },
    {
        icon: FileCheck2,
        title: 'Traceable evidence',
        description: 'The intended control model records the actor, policy, input provenance, model or rule version, approval, and outcome.',
    },
    {
        icon: CircleGauge,
        title: 'Measured release gates',
        description: 'Cost budgets, fallback behavior, tenant-leakage tests, prompt-injection tests, and red-team results are prerequisites for release.',
    },
];

export default function GovernedAIPage() {
    return (
        <main className="min-h-screen bg-slate-50 px-4 pb-24 pt-32 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
                <div className="mx-auto max-w-4xl text-center">
                    <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                        <Bot aria-hidden="true" size={25} />
                    </div>
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-700">Controlled roadmap capability</p>
                    <h1 className="mt-4 text-5xl font-black tracking-tight text-slate-950 sm:text-6xl">AI must earn the right to act.</h1>
                    <p className="mx-auto mt-7 max-w-3xl text-xl leading-8 text-slate-600">
                        ScholarMind is building governed assistance around education workflows. Autonomous agent claims are not part of the current production runtime, and AI-backed features remain unavailable until their safety and operational gates pass.
                    </p>
                </div>

                <div className="mt-16 grid gap-7 md:grid-cols-3">
                    {controls.map(({ icon: Icon, title, description }) => (
                        <article key={title} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                                <Icon aria-hidden="true" size={24} />
                            </div>
                            <h2 className="mt-6 text-xl font-bold text-slate-950">{title}</h2>
                            <p className="mt-3 leading-7 text-slate-600">{description}</p>
                        </article>
                    ))}
                </div>

                <section className="mt-16 rounded-3xl border border-amber-200 bg-amber-50 p-8 sm:p-10">
                    <h2 className="text-2xl font-bold text-amber-950">Current availability</h2>
                    <p className="mt-4 max-w-4xl leading-7 text-amber-900">
                        The product currently prioritizes deterministic SIS workflows, tenant isolation, approvals, payments, and provider evidence. AI chat, predictive risk, and automated mutations are gated from production while evaluation, provenance, fallback, and cost-control work is incomplete.
                    </p>
                </section>

                <div className="mt-12 text-center">
                    <Link href="/book-demo" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 py-3 font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                        Discuss the governance roadmap <ArrowRight aria-hidden="true" size={18} />
                    </Link>
                </div>
            </div>
        </main>
    );
}
