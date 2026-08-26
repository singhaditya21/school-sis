import { Suspense } from 'react';
import { ResultsClient } from './results-client';

export const dynamic = 'force-dynamic';

export default function MyResultsPage() {
    return (
        <Suspense fallback={<div className="py-16 text-center text-sm text-slate-500">Loading results…</div>}>
            <ResultsClient />
        </Suspense>
    );
}
