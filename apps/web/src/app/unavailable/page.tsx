import Link from 'next/link';

type UnavailablePageProps = {
    searchParams: Promise<{ capability?: string; reason?: string }>;
};

const COPY_BY_REASON: Readonly<Record<string, string>> = {
    HIDDEN: 'This capability is not part of the current product release.',
    INTERNAL_ONLY: 'This capability is limited to internal validation.',
    INSTITUTION_UNSUPPORTED: 'This capability is not available for this institution type.',
    UNCONFIGURED: 'This capability needs a verified provider configuration before it can be used.',
    UNCLASSIFIED: 'This product surface is not part of the approved production release.',
};

export default async function UnavailablePage({ searchParams }: UnavailablePageProps) {
    const { capability, reason } = await searchParams;
    const message = COPY_BY_REASON[reason || ''] || 'This capability is currently unavailable.';

    return (
        <main className="min-h-screen bg-slate-50 px-6 py-20">
            <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">ScholarMind</p>
                <h1 className="mt-2 text-2xl font-bold text-slate-900">Capability unavailable</h1>
                <p className="mt-3 text-slate-600">{message}</p>
                {capability ? (
                    <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm text-slate-700">
                        {capability}
                    </p>
                ) : null}
                <Link
                    href="/dashboard"
                    className="mt-6 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                    Return to dashboard
                </Link>
            </section>
        </main>
    );
}
