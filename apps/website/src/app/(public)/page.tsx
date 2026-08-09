import Link from 'next/link';
import {
    ArrowRight,
    Building2,
    CircleCheck,
    Landmark,
    RefreshCw,
    ShieldCheck,
    Users,
} from 'lucide-react';

const capabilities = [
    {
        icon: Building2,
        title: 'One operating view for education groups',
        description: 'Coordinate campuses, identity, policy, finance, and reporting without presenting every institution as an isolated system.',
    },
    {
        icon: Landmark,
        title: 'Finance with accountable workflows',
        description: 'Connect fee plans, invoices, payments, refunds, approvals, and reconciliation to the same tenant-owned ledger.',
    },
    {
        icon: ShieldCheck,
        title: 'Governance built into the workflow',
        description: 'Apply role checks, tenant isolation, approvals, and audit evidence where sensitive education decisions are made.',
    },
    {
        icon: RefreshCw,
        title: 'Migration without a blind cutover',
        description: 'Prepare for data profiling, mapping, dry runs, reconciliation, and phased coexistence with existing systems.',
    },
];

export default function LandingPage() {
    return (
        <main className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
            <section className="relative isolate px-4 pb-24 pt-36 sm:px-6 lg:px-8">
                <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.28),transparent_42%),radial-gradient(circle_at_80%_30%,rgba(15,118,110,0.18),transparent_35%)]" />
                <div className="mx-auto max-w-6xl">
                    <div className="max-w-4xl">
                        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-4 py-2 text-sm font-semibold text-indigo-200">
                            <CircleCheck aria-hidden="true" size={16} />
                            Built for governed, multi-institution operations
                        </div>
                        <h1 className="text-balance text-5xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
                            A shared-services operating platform for education groups.
                        </h1>
                        <p className="mt-8 max-w-3xl text-xl leading-8 text-slate-300">
                            ScholarMind brings student operations, finance, approvals, and group visibility into one tenant-safe platform—starting with multi-campus K-12 and expanding through verified release gates.
                        </p>
                        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                            <Link href="/book-demo" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 font-bold text-white transition hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                                Discuss your group
                                <ArrowRight aria-hidden="true" size={18} />
                            </Link>
                            <Link href="/architecture" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-600 bg-slate-900/70 px-6 py-3 font-bold text-slate-100 transition hover:border-slate-400 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                                Review the current architecture
                            </Link>
                        </div>
                    </div>

                    <dl className="mt-20 grid gap-4 border-t border-slate-800 pt-10 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                            <dt className="text-sm font-semibold uppercase tracking-wider text-slate-400">Initial market</dt>
                            <dd className="mt-2 text-xl font-bold text-white">India school groups</dd>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                            <dt className="text-sm font-semibold uppercase tracking-wider text-slate-400">Delivery model</dt>
                            <dd className="mt-2 text-xl font-bold text-white">Managed SaaS with staged pilots</dd>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
                            <dt className="text-sm font-semibold uppercase tracking-wider text-slate-400">Control posture</dt>
                            <dd className="mt-2 text-xl font-bold text-white">Tenant isolation and human approval</dd>
                        </div>
                    </dl>
                </div>
            </section>

            <section className="border-y border-slate-800 bg-slate-900/50 px-4 py-24 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-6xl">
                    <div className="max-w-3xl">
                        <p className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-300">Product focus</p>
                        <h2 className="mt-4 text-4xl font-black tracking-tight text-white">Depth before module count.</h2>
                        <p className="mt-5 text-lg leading-8 text-slate-300">
                            Capabilities are enabled only when their data, permissions, providers, tests, and operational owner are ready. Missing dependencies are shown as unavailable—not replaced by sample institutional data.
                        </p>
                    </div>

                    <div className="mt-12 grid gap-6 md:grid-cols-2">
                        {capabilities.map(({ icon: Icon, title, description }) => (
                            <article key={title} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-7">
                                <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                                    <Icon aria-hidden="true" size={23} />
                                </div>
                                <h3 className="text-xl font-bold text-white">{title}</h3>
                                <p className="mt-3 leading-7 text-slate-400">{description}</p>
                            </article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="px-4 py-24 sm:px-6 lg:px-8">
                <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_0.8fr] lg:items-center">
                    <div>
                        <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-300">Who it serves</p>
                        <h2 className="mt-4 text-4xl font-black tracking-tight text-white">Designed around the people who run the institution.</h2>
                        <p className="mt-6 text-lg leading-8 text-slate-300">
                            Group executives need consolidated decisions. Campus teams need local autonomy. Finance, registrars, teachers, parents, and students need role-appropriate workflows without losing a common source of truth.
                        </p>
                    </div>
                    <div className="rounded-3xl border border-slate-700 bg-gradient-to-br from-indigo-500/20 to-emerald-500/10 p-8">
                        <Users aria-hidden="true" className="text-indigo-200" size={36} />
                        <h3 className="mt-6 text-2xl font-bold text-white">Premium group platform</h3>
                        <p className="mt-4 leading-7 text-slate-300">
                            Packaging is tailored to institution mix, campuses, migration complexity, integrations, and governance requirements. ScholarMind is not positioned as a commodity single-school ERP.
                        </p>
                        <Link href="/pricing" className="mt-7 inline-flex items-center gap-2 font-bold text-indigo-200 hover:text-white">
                            View packages <ArrowRight aria-hidden="true" size={17} />
                        </Link>
                    </div>
                </div>
            </section>

            <section className="border-t border-slate-800 px-4 py-24 text-center sm:px-6 lg:px-8">
                <div className="mx-auto max-w-3xl">
                    <h2 className="text-4xl font-black tracking-tight text-white">Start with a scoped operating review.</h2>
                    <p className="mt-5 text-lg text-slate-400">We will map your institution hierarchy, current systems, migration constraints, and the first workflow that must become production-ready.</p>
                    <Link href="/book-demo" className="mt-9 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-7 py-3 font-bold text-slate-950 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                        Book a working session <ArrowRight aria-hidden="true" size={18} />
                    </Link>
                </div>
            </section>
        </main>
    );
}
