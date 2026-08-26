import {
    getExpectedVisitors,
    getGateSuggestions,
    getTodayRegister,
    getVisitorStats,
} from '@/lib/actions/visitor';
import VisitorsClient from './visitors-client';

export const dynamic = 'force-dynamic';

export default async function VisitorsPage() {
    const [stats, register, expected, suggestions] = await Promise.all([
        getVisitorStats(),
        getTodayRegister(),
        getExpectedVisitors(),
        getGateSuggestions(),
    ]);

    return (
        <VisitorsClient
            stats={stats}
            register={register}
            expected={expected}
            suggestions={suggestions}
        />
    );
}
