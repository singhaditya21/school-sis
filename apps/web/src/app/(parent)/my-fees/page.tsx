import { Suspense } from 'react';
import { FeesClient } from './fees-client';

export const dynamic = 'force-dynamic';

export default function MyFeesPage() {
    return (
        <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading fees…</div>}>
            <FeesClient />
        </Suspense>
    );
}
