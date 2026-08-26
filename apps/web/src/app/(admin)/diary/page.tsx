import { getDiaryOptions, listDiaryEntries } from './actions';
import DiaryClient from './diary-client';

export const dynamic = 'force-dynamic';

export default async function DiaryPage({
    searchParams,
}: {
    searchParams: Promise<{ gradeId?: string; type?: string; date?: string }>;
}) {
    const { gradeId = '', type = '', date = '' } = await searchParams;

    const [entries, options] = await Promise.all([
        listDiaryEntries({ gradeId, type, date }),
        getDiaryOptions(),
    ]);

    const today = new Date().toISOString().slice(0, 10);

    return (
        <DiaryClient
            entries={entries}
            options={options}
            filters={{ gradeId, type, date }}
            today={today}
        />
    );
}
