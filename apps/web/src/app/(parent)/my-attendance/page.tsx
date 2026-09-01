import { Suspense } from 'react';
import { AttendanceClient } from './attendance-client';

export const dynamic = 'force-dynamic';

export default function MyAttendancePage() {
    return (
        <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading attendance…</div>}>
            <AttendanceClient />
        </Suspense>
    );
}
