import Link from 'next/link';
import { ArrowLeft, ArrowRight, Boxes, Database, Globe2, HardDrive, LockKeyhole, Server } from 'lucide-react';

const currentLayers = [
    {
        icon: Globe2,
        title: 'Marketing website',
        detail: 'A separate Next.js application for public product information and verified lead capture.',
    },
    {
        icon: Server,
        title: 'ScholarMind web application',
        detail: 'Next.js 16 server components, route handlers, and server actions provide the current product runtime.',
    },
    {
        icon: Boxes,
        title: 'Shared domain package',
        detail: 'Drizzle schemas, services, authorization, workflows, and analytics contracts are shared through the monorepo.',
    },
    {
        icon: Database,
        title: 'Local PostgreSQL and pgvector',
        detail: 'The supported runtime currently uses PostgreSQL 16 locally, with tenant context and row-level security checks.',
    },
];

const targetLayers = [
    'Containerized Next.js workloads behind a load balancer, CDN, and WAF',
    'Managed PostgreSQL/pgvector, object storage, Redis, secrets, and encryption keys',
    'Owned scheduler, migration jobs, logs, metrics, alerts, backups, and restore drills',
    'Verified payment, email, and SMS providers with observable failure handling',
];

export default function ArchitecturePage() {
    return (
        <main className="min-h-screen bg-slate-950 px-4 pb-24 pt-32 text-slate-100 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
                <Link href="/" className="inline-flex items-center gap-2 font-bold text-indigo-300 hover:text-indigo-200">
                    <ArrowLeft aria-hidden="true" size={18} /> Back to overview
                </Link>

                <div className="mt-10 max-w-4xl">
                    <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-300">Evidence-based architecture</p>
                    <h1 className="mt-4 text-5xl font-black tracking-tight text-white sm:text-6xl">Current runtime and approved target—kept deliberately separate.</h1>
                    <p className="mt-7 text-xl leading-8 text-slate-300">
                        ScholarMind currently runs locally. The managed AWS architecture is a release target, not an active deployment claim. Production availability begins only after infrastructure, provider, backup, restore, monitoring, and ownership evidence passes its gate.
                    </p>
                </div>

                <section className="mt-16">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-bold uppercase tracking-wider text-emerald-300">Supported today</p>
                            <h2 className="mt-2 text-3xl font-black text-white">Local-first monorepo</h2>
                        </div>
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-bold text-emerald-200">Current</span>
                    </div>
                    <div className="mt-8 grid gap-6 md:grid-cols-2">
                        {currentLayers.map(({ icon: Icon, title, detail }) => (
                            <article key={title} className="rounded-2xl border border-slate-700 bg-slate-900 p-7">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
                                    <Icon aria-hidden="true" size={22} />
                                </div>
                                <h3 className="mt-5 text-xl font-bold text-white">{title}</h3>
                                <p className="mt-3 leading-7 text-slate-400">{detail}</p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="mt-20 rounded-3xl border border-indigo-400/20 bg-indigo-500/10 p-8 sm:p-10">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-bold uppercase tracking-wider text-indigo-200">Approved production direction</p>
                            <h2 className="mt-2 text-3xl font-black text-white">Managed AWS deployment in Mumbai</h2>
                        </div>
                        <span className="rounded-full border border-indigo-300/30 bg-indigo-300/10 px-4 py-2 text-sm font-bold text-indigo-100">Roadmap</span>
                    </div>
                    <ul className="mt-8 grid gap-4 md:grid-cols-2">
                        {targetLayers.map((item) => (
                            <li key={item} className="flex gap-3 rounded-xl border border-indigo-300/15 bg-slate-950/40 p-5 leading-7 text-slate-200">
                                <HardDrive aria-hidden="true" className="mt-1 shrink-0 text-indigo-300" size={19} />
                                {item}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="mt-16 grid gap-6 md:grid-cols-2">
                    <article className="rounded-2xl border border-slate-700 bg-slate-900 p-7">
                        <LockKeyhole aria-hidden="true" className="text-indigo-300" size={28} />
                        <h2 className="mt-5 text-2xl font-bold text-white">Control boundary</h2>
                        <p className="mt-4 leading-7 text-slate-400">Page and API authorization, server-derived tenant context, database row-level security, approval workflows, and audit evidence are layered controls. No single navigation or middleware check is treated as sufficient.</p>
                    </article>
                    <article className="rounded-2xl border border-slate-700 bg-slate-900 p-7">
                        <Database aria-hidden="true" className="text-emerald-300" size={28} />
                        <h2 className="mt-5 text-2xl font-bold text-white">Release boundary</h2>
                        <p className="mt-4 leading-7 text-slate-400">A capability is visible only when its data contract, tenant ownership, provider prerequisites, tests, documentation, and operational owner agree on its lifecycle.</p>
                    </article>
                </section>

                <div className="mt-16 text-center">
                    <Link href="/book-demo" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-7 py-3 font-bold text-white transition hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                        Review your deployment constraints <ArrowRight aria-hidden="true" size={18} />
                    </Link>
                </div>
            </div>
        </main>
    );
}
