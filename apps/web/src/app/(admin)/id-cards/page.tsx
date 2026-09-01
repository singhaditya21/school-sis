import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { getSession } from '@/lib/auth/session';
import { requireAuth } from '@/lib/auth/middleware';
import {
    getCardSchool,
    getIdCardStats,
    listGradesForIdCards,
    listIdCards,
} from './_lib/actions';
import { ID_CARD_STATUSES, ID_CARD_STATUS_LABELS, isPersonType } from './_lib/labels';
import GenerateCardsDialog from './generate-cards-dialog';
import IdCardsClient from './IdCardsClient';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ type?: string; status?: string }>;
}

export default async function IDCardsPage({ searchParams }: PageProps) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    try {
        await requireAuth('certificate:read');
    } catch {
        redirect('/unauthorized');
    }

    const { type: rawType, status: rawStatus } = await searchParams;
    const personType = isPersonType(rawType?.toUpperCase()) ? (rawType!.toUpperCase() as 'STUDENT' | 'STAFF') : 'STUDENT';
    const status = ID_CARD_STATUSES.includes(rawStatus as (typeof ID_CARD_STATUSES)[number])
        ? rawStatus!
        : undefined;

    const [stats, cards, grades, school] = await Promise.all([
        getIdCardStats(personType),
        listIdCards(personType, status),
        listGradesForIdCards(),
        getCardSchool(),
    ]);

    function href(next: { type?: string; status?: string | undefined }): string {
        const params = new URLSearchParams();
        const nextType = next.type ?? personType;
        if (nextType !== 'STUDENT') params.set('type', nextType);
        const nextStatus = 'status' in next ? next.status : status;
        if (nextStatus) params.set('status', nextStatus);
        const qs = params.toString();
        return qs ? `/id-cards?${qs}` : '/id-cards';
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">ID cards</h1>
                    <p className="mt-1 text-muted-foreground">
                        Generate cards for a class or the whole school, print the sheet, and record
                        which cards have actually been handed over.
                    </p>
                </div>
                <GenerateCardsDialog
                    personType={personType}
                    grades={grades}
                    withoutCard={stats.withoutCard}
                />
            </div>

            <div className="flex gap-1 print:hidden">
                {(['STUDENT', 'STAFF'] as const).map(t => (
                    <Link
                        key={t}
                        href={href({ type: t, status: undefined })}
                        className={`rounded-md px-4 py-2 text-sm font-medium ${
                            personType === t ? 'bg-gray-900 text-white' : 'text-muted-foreground hover:bg-muted'
                        }`}
                    >
                        {t === 'STUDENT' ? 'Student cards' : 'Staff cards'}
                    </Link>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-5 print:hidden">
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Total cards</div>
                        <div className="text-2xl font-bold">{stats.total}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Not printed</div>
                        <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Printed</div>
                        <div className="text-2xl font-bold text-blue-600">{stats.printed}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Handed over</div>
                        <div className="text-2xl font-bold text-green-600">{stats.issued}</div>
                    </CardContent>
                </Card>
                <Card className={stats.withoutCard > 0 ? 'border-2 border-amber-200' : undefined}>
                    <CardContent className="pt-4">
                        <div className="text-sm text-muted-foreground">Without any card</div>
                        <div className="text-2xl font-bold">{stats.withoutCard}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                            Active {personType === 'STUDENT' ? 'students' : 'staff'}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-wrap gap-1 print:hidden">
                <Link
                    href={href({ status: undefined })}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                        !status ? 'bg-gray-900 text-white' : 'text-muted-foreground hover:bg-muted'
                    }`}
                >
                    All
                </Link>
                {ID_CARD_STATUSES.map(s => (
                    <Link
                        key={s}
                        href={href({ status: s })}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                            status === s ? 'bg-gray-900 text-white' : 'text-muted-foreground hover:bg-muted'
                        }`}
                    >
                        {ID_CARD_STATUS_LABELS[s]}
                    </Link>
                ))}
            </div>

            <IdCardsClient cards={cards} school={school} />

            <p className="text-xs text-muted-foreground print:hidden">
                The QR on each card encodes that card&apos;s code — a student&apos;s admission number
                or a staff member&apos;s employee ID — and nothing else. There is no public
                verification endpoint in this release, so a scanner reads back the code for lookup
                rather than confirming the card online.
            </p>
        </div>
    );
}
