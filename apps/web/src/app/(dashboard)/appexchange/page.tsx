import { Store } from 'lucide-react';

export default function AppExchangePage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-900 to-indigo-800 p-8 text-white shadow-lg">
        <div className="relative z-10">
          <div className="mb-4 flex items-center gap-3">
            <Store className="h-8 w-8 text-purple-300" />
            <h1 className="text-3xl font-bold">AppExchange</h1>
          </div>
          <p className="max-w-2xl text-lg text-purple-200">
            The integration marketplace is not available yet. Verified apps, pricing, ratings,
            and installation controls will appear here only after the live catalog service is configured.
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">No live catalog configured</h2>
        <p className="mx-auto mt-2 max-w-xl text-slate-600">
          Contact your platform administrator if your school needs a supported integration in the meantime.
        </p>
      </section>
    </div>
  );
}
