import Link from 'next/link';
import { CalendarDays, ChevronLeft } from 'lucide-react';
import {
    getSectionsForTimetable,
    getTimetableForSection,
    type TimetableCell,
} from '@/lib/actions/timetable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const DAYS = [
    ['Monday', 'monday'],
    ['Tuesday', 'tuesday'],
    ['Wednesday', 'wednesday'],
    ['Thursday', 'thursday'],
    ['Friday', 'friday'],
    ['Saturday', 'saturday'],
] as const;

type TimetableGridPageProps = {
    searchParams: Promise<{ section?: string }>;
};

function ScheduledClass({ cell }: { cell: TimetableCell | null }) {
    if (!cell) {
        return <span className="text-xs text-muted-foreground">Not scheduled</span>;
    }

    return (
        <div className="min-w-28 rounded-md border border-indigo-200 bg-indigo-50 p-2 text-xs">
            <p className="font-semibold text-indigo-950">{cell.subjectName}</p>
            <p className="mt-0.5 text-slate-700">{cell.teacherName}</p>
            {cell.roomNumber ? <p className="mt-1 text-slate-500">Room {cell.roomNumber}</p> : null}
        </div>
    );
}

export default async function TimetableGridPage({ searchParams }: TimetableGridPageProps) {
    const requestedSectionId = (await searchParams).section;
    const sections = await getSectionsForTimetable();
    const selectedSection = sections.find((section) => section.id === requestedSectionId) ?? sections[0];
    const timetableRows = selectedSection ? await getTimetableForSection(selectedSection.id) : [];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarDays className="h-4 w-4" aria-hidden="true" />
                        Live tenant timetable
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Timetable Grid</h1>
                    <p className="mt-1 text-muted-foreground">
                        Review the persisted weekly schedule for a grade and section.
                    </p>
                </div>
                <Button asChild variant="outline">
                    <Link href="/timetable">
                        <ChevronLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Timetable home
                    </Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Schedule scope</CardTitle>
                    <CardDescription>
                        Sections are limited to the signed-in tenant. An unknown section identifier is ignored.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {sections.length > 0 ? (
                        <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="w-full max-w-md">
                                <label htmlFor="section" className="mb-1.5 block text-sm font-medium">
                                    Grade and section
                                </label>
                                <select
                                    id="section"
                                    name="section"
                                    defaultValue={selectedSection?.id}
                                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {sections.map((section) => (
                                        <option key={section.id} value={section.id}>
                                            {section.gradeName} — {section.sectionName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <Button type="submit">Load schedule</Button>
                        </form>
                    ) : (
                        <div className="rounded-lg border border-dashed p-6 text-center">
                            <h2 className="font-semibold">No sections configured</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Create grades and sections before building a timetable.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {selectedSection ? (
                <Card>
                    <CardHeader>
                        <CardTitle>{selectedSection.gradeName} — {selectedSection.sectionName}</CardTitle>
                        <CardDescription>
                            This view contains database-backed periods and assignments. Empty cells are genuinely unscheduled.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {timetableRows.length > 0 ? (
                            <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full min-w-[900px]" data-testid="timetable-grid-table">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th scope="col" className="px-4 py-3 text-left text-sm font-medium">Period</th>
                                            {DAYS.map(([label]) => (
                                                <th key={label} scope="col" className="px-4 py-3 text-left text-sm font-medium">
                                                    {label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {timetableRows.map((row) => (
                                            <tr key={`${row.periodName}-${row.startTime}`}>
                                                <th scope="row" className="whitespace-nowrap px-4 py-3 text-left">
                                                    <span className="block text-sm font-medium">{row.periodName}</span>
                                                    <span className="text-xs font-normal text-muted-foreground">
                                                        {row.startTime}–{row.endTime}
                                                    </span>
                                                </th>
                                                {DAYS.map(([label, key]) => (
                                                    <td key={label} className="px-4 py-3 align-top">
                                                        <ScheduledClass cell={row[key]} />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed p-8 text-center">
                                <h2 className="font-semibold">No periods configured</h2>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Add periods before assigning subjects and teachers to this section.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}
