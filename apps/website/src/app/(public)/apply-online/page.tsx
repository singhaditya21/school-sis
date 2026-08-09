import Link from 'next/link';
import { ArrowRight, Building2, ShieldCheck } from 'lucide-react';

export default function PublicAdmissionsPage() {
    return (
        <main className="min-h-screen bg-slate-50 px-4 pb-24 pt-32 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-12">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700">
                    <Building2 aria-hidden="true" size={28} />
                </div>
                <p className="mt-7 text-sm font-bold uppercase tracking-[0.2em] text-indigo-700">Institution-specific capability</p>
                <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950">Public admissions are not enabled on this site.</h1>
                <p className="mt-6 text-lg leading-8 text-slate-600">
                    Applications must be connected to a verified institution, academic year, grade catalog, document policy, and fee configuration. ScholarMind does not accept generic applications or generate sample application IDs.
                </p>
                <div className="mt-8 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-left text-emerald-950">
                    <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0" size={22} />
                    <p className="text-sm leading-6">A tenant-aware admissions portal will be enabled for each design-partner institution only after persistence, duplicate handling, payment ownership, and audit tests pass.</p>
                </div>
                <Link href="/book-demo" className="mt-9 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 py-3 font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                    Discuss an admissions pilot <ArrowRight aria-hidden="true" size={18} />
                </Link>
            </div>
        </main>
    );
}
