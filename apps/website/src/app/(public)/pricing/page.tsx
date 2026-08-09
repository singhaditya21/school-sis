import Link from 'next/link';
import { ArrowRight, Check, CircleDollarSign } from 'lucide-react';

const packages = [
    {
        name: 'Group Core',
        status: 'Design-partner pilot',
        description: 'The operational foundation for multi-campus K-12 groups.',
        features: ['Admissions and learner records', 'Attendance, timetable, and exams', 'Fees, payments, approvals, and audit', 'Staff, parent, and student web journeys'],
    },
    {
        name: 'International Pack',
        status: 'Staged release',
        description: 'Additional controls for international and cross-border school groups.',
        features: ['Multi-currency operations', 'Curriculum and calendar flexibility', 'Multilingual communication', 'Guardianship, visa, and residency workflows'],
    },
    {
        name: 'Higher-Ed Pack',
        status: 'Roadmap',
        description: 'Registrar and academic operations for private and autonomous institutions.',
        features: ['Programs, courses, and credits', 'Registration and degree audit', 'Transcripts and credentials', 'Accreditation and placement workflows'],
    },
    {
        name: 'Trust & AI Pack',
        status: 'Controlled roadmap',
        description: 'Evidence and governed automation released only after evaluation gates pass.',
        features: ['Procurement evidence room', 'Policy-bound approvals and provenance', 'Model budgets and fallback controls', 'Low-risk copilots before any mutation'],
    },
];

export default function PricingPage() {
    return (
        <main className="min-h-screen bg-slate-50 px-4 pb-24 pt-32 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
                <div className="mx-auto max-w-3xl text-center">
                    <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                        <CircleDollarSign aria-hidden="true" size={25} />
                    </div>
                    <h1 className="text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">Commercial packages built around operating complexity.</h1>
                    <p className="mt-6 text-xl leading-8 text-slate-600">
                        ScholarMind uses scoped, quote-based pricing for education groups. Subscription, migration, implementation, provider usage, and governed AI are priced separately so the operating model stays clear.
                    </p>
                </div>

                <div className="mt-16 grid gap-7 md:grid-cols-2">
                    {packages.map((item) => (
                        <article key={item.name} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <h2 className="text-2xl font-bold text-slate-950">{item.name}</h2>
                                <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">{item.status}</span>
                            </div>
                            <p className="mt-4 text-slate-600">{item.description}</p>
                            <ul className="mt-7 flex-1 space-y-4">
                                {item.features.map((feature) => (
                                    <li key={feature} className="flex gap-3 text-sm text-slate-700">
                                        <Check aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                        </article>
                    ))}
                </div>

                <section className="mt-16 rounded-3xl bg-slate-950 px-8 py-12 text-center text-white sm:px-12">
                    <h2 className="text-3xl font-black">What determines a proposal?</h2>
                    <p className="mx-auto mt-5 max-w-3xl leading-7 text-slate-300">
                        Institution types, active learners, campus hierarchy, migration quality, integrations, data residency, support level, and rollout sequencing. Fixed public per-student prices are intentionally withheld until paid pilots establish repeatable delivery economics.
                    </p>
                    <Link href="/book-demo" className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-7 py-3 font-bold text-white transition hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300">
                        Request a scoped proposal <ArrowRight aria-hidden="true" size={18} />
                    </Link>
                </section>
            </div>
        </main>
    );
}
