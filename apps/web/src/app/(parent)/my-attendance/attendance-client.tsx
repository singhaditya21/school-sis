'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { Download, CalendarDays, CheckCircle2, XCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { ParentTopBar } from '@/components/parent/parent-top-bar';
import { useParentChildren } from '@/components/parent/use-parent-children';
import { getChildAttendance, type ChildAttendanceRecord } from '../actions';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const STATUS_STYLES: Record<string, { cell: string; chart: string; label: string }> = {
    PRESENT: { cell: 'bg-emerald-50 text-emerald-700 border-emerald-200', chart: '#10b981', label: 'Present' },
    LATE: { cell: 'bg-amber-50 text-amber-700 border-amber-200', chart: '#f59e0b', label: 'Late' },
    ABSENT: { cell: 'bg-red-50 text-red-700 border-red-200', chart: '#ef4444', label: 'Absent' },
    HALF_DAY: { cell: 'bg-sky-50 text-sky-700 border-sky-200', chart: '#0ea5e9', label: 'Half day' },
    EXCUSED: { cell: 'bg-violet-50 text-violet-700 border-violet-200', chart: '#8b5cf6', label: 'Excused' },
    HOLIDAY: { cell: 'bg-slate-50 text-slate-400 border-slate-200', chart: '#94a3b8', label: 'Holiday' },
};

export function AttendanceClient() {
    const now = new Date();
    const { students, selectedId, loading: childrenLoading, error: childrenError } = useParentChildren();
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [year, setYear] = useState(now.getFullYear());
    // Keyed by child + month so a stale response can never be shown for the
    // wrong child: anything whose key does not match the current request is
    // treated as "still loading" rather than rendered.
    const requestKey = `${selectedId ?? ''}:${year}-${month}`;
    const [fetched, setFetched] = useState<{
        key: string;
        records: ChildAttendanceRecord[];
        childName: string | null;
    } | null>(null);

    useEffect(() => {
        if (childrenLoading || !selectedId) return;

        let cancelled = false;
        const key = `${selectedId}:${year}-${month}`;
        getChildAttendance({ studentId: selectedId, month, year })
            .then((res) => {
                if (cancelled) return;
                setFetched({ key, records: res?.records ?? [], childName: res?.child.name ?? null });
            })
            .catch(() => {
                if (cancelled) return;
                setFetched({ key, records: [], childName: null });
                toast.error('Could not load the attendance register.');
            });

        return () => {
            cancelled = true;
        };
    }, [selectedId, childrenLoading, month, year]);

    const current = fetched?.key === requestKey ? fetched : null;
    const records = current?.records ?? [];
    const childName = current?.childName ?? null;
    const loading = childrenLoading || (selectedId !== null && current === null);

    const counts = records.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
    }, {});

    const present = counts.PRESENT ?? 0;
    const late = counts.LATE ?? 0;
    const absent = counts.ABSENT ?? 0;
    const halfDay = counts.HALF_DAY ?? 0;
    const excused = counts.EXCUSED ?? 0;
    const marked = records.filter((r) => r.status !== 'HOLIDAY').length;
    const attended = present + late + halfDay * 0.5;
    const percentage = marked > 0 ? Math.round((attended / marked) * 100) : null;

    const chartData = Object.entries(counts)
        .filter(([status]) => status !== 'HOLIDAY')
        .map(([status, value]) => ({
            name: STATUS_STYLES[status]?.label ?? status,
            value,
            color: STATUS_STYLES[status]?.chart ?? '#64748b',
        }));

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

    // Records come back as plain YYYY-MM-DD strings; compare them as strings so
    // no timezone conversion can shift a day.
    const calendarDays = Array.from({ length: daysInMonth }, (_, i) => {
        const dayNum = i + 1;
        const date = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
        const record = records.find((r) => r.date === date);
        return { day: dayNum, date, status: record?.status ?? null, remarks: record?.remarks ?? null };
    });

    function stepMonth(delta: number) {
        const next = new Date(year, month - 1 + delta, 1);
        setMonth(next.getMonth() + 1);
        setYear(next.getFullYear());
    }

    function generatePDF() {
        if (records.length === 0) {
            toast.error('There is nothing to export for this month.');
            return;
        }

        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.text(`Attendance: ${MONTHS[month - 1]} ${year}`, 14, 20);

        doc.setFontSize(12);
        doc.setTextColor(100);
        doc.text(childName ?? 'Student', 14, 29);
        doc.text('Generated by ScholarMind SIS', 14, 36);

        let yPos = 50;
        doc.setTextColor(0);
        doc.setFontSize(11);
        doc.text(`Days marked: ${marked}`, 14, yPos);
        doc.text(`Present: ${present}`, 70, yPos);
        doc.text(`Absent: ${absent}`, 115, yPos);
        doc.text(percentage === null ? 'Attendance: n/a' : `Attendance: ${percentage}%`, 155, yPos);

        yPos += 14;
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text('Date', 14, yPos);
        doc.text('Status', 60, yPos);
        doc.text('Remarks', 105, yPos);
        yPos += 4;
        doc.line(14, yPos, 195, yPos);
        yPos += 8;

        doc.setTextColor(0);
        for (const record of records) {
            if (yPos > 280) {
                doc.addPage();
                yPos = 20;
            }
            doc.text(record.date, 14, yPos);
            doc.text(record.status, 60, yPos);
            doc.text((record.remarks ?? '').slice(0, 50), 105, yPos);
            yPos += 8;
        }

        doc.save(`Attendance_${(childName ?? 'student').replace(/\s+/g, '_')}_${MONTHS[month - 1]}_${year}.pdf`);
    }

    return (
        <div className="mx-auto max-w-7xl space-y-6 pb-12">
            <ParentTopBar students={students} selectedId={selectedId} loading={childrenLoading} />

            <div className="flex flex-col items-start justify-between border-b pb-6 md:flex-row md:items-center">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Attendance register</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        {childName ? `Daily record for ${childName}` : 'Daily record'}
                    </p>
                </div>
                <div className="mt-4 flex items-center rounded-md border bg-white p-1 shadow-sm md:mt-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous month" onClick={() => stepMonth(-1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="w-40 px-4 text-center text-sm font-medium text-slate-700">
                        {MONTHS[month - 1]} {year}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Next month" onClick={() => stepMonth(1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {childrenError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {childrenError}
                </div>
            )}

            {!childrenLoading && students.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-white p-12 text-center text-slate-500">
                    No child is linked to your account yet, so there is no attendance to show.
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                        <Card className="border-slate-200 shadow-sm">
                            <CardContent className="p-6">
                                <div className="mb-4 flex items-center justify-between">
                                    <div className="text-sm font-medium text-slate-500">Present</div>
                                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                </div>
                                <div className="text-3xl font-bold text-slate-900">
                                    {present} <span className="text-sm font-normal text-slate-400">days</span>
                                </div>
                                {(late > 0 || halfDay > 0 || excused > 0) && (
                                    <p className="mt-1 text-xs text-slate-500">
                                        {late > 0 ? `${late} late` : ''}
                                        {late > 0 && (halfDay > 0 || excused > 0) ? ' · ' : ''}
                                        {halfDay > 0 ? `${halfDay} half day` : ''}
                                        {halfDay > 0 && excused > 0 ? ' · ' : ''}
                                        {excused > 0 ? `${excused} excused` : ''}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                        <Card className="border-slate-200 shadow-sm">
                            <CardContent className="p-6">
                                <div className="mb-4 flex items-center justify-between">
                                    <div className="text-sm font-medium text-slate-500">Absent</div>
                                    <XCircle className="h-5 w-5 text-red-500" />
                                </div>
                                <div className="text-3xl font-bold text-slate-900">
                                    {absent} <span className="text-sm font-normal text-slate-400">days</span>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="border-slate-200 shadow-sm">
                            <CardContent className="p-6">
                                <div className="mb-4 flex items-center justify-between">
                                    <div className="text-sm font-medium text-slate-500">Days marked</div>
                                    <CalendarDays className="h-5 w-5 text-blue-500" />
                                </div>
                                <div className="text-3xl font-bold text-slate-900">
                                    {marked} <span className="text-sm font-normal text-slate-400">days</span>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="relative overflow-hidden border-slate-200 shadow-sm">
                            <CardContent className="relative p-6">
                                <div className="mb-4 flex items-center justify-between">
                                    <div className="text-sm font-medium text-slate-700">Attendance rate</div>
                                    <AlertCircle className="h-5 w-5 text-slate-400" />
                                </div>
                                {percentage === null ? (
                                    <div className="text-xl font-semibold text-slate-400">Not marked</div>
                                ) : (
                                    <div
                                        className={`text-3xl font-bold ${
                                            percentage >= 85
                                                ? 'text-emerald-700'
                                                : percentage >= 75
                                                  ? 'text-amber-700'
                                                  : 'text-red-700'
                                        }`}
                                    >
                                        {percentage}%
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-3">
                        <Card className="border-slate-200 shadow-sm lg:col-span-2">
                            <CardHeader className="flex flex-row items-center justify-between border-b bg-slate-50 px-6 py-4">
                                <CardTitle className="flex items-center text-base font-semibold text-slate-800">
                                    <CalendarDays className="mr-2 h-4 w-4" /> Daily log
                                </CardTitle>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 bg-white text-xs font-medium"
                                    disabled={loading || records.length === 0}
                                    onClick={generatePDF}
                                >
                                    <Download className="mr-2 h-4 w-4" /> Export log
                                </Button>
                            </CardHeader>
                            <CardContent className="p-6">
                                {loading ? (
                                    <div className="flex h-64 items-center justify-center text-sm text-slate-400">
                                        Loading register…
                                    </div>
                                ) : (
                                    <div className="mb-2 grid grid-cols-7 gap-2">
                                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                                            <div
                                                key={d}
                                                className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                                            >
                                                {d}
                                            </div>
                                        ))}
                                        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                                            <div
                                                key={`empty-${i}`}
                                                className="aspect-square rounded-md border border-slate-100 bg-slate-50/50"
                                            />
                                        ))}
                                        {calendarDays.map(({ day, status, remarks }) => (
                                            <div
                                                key={day}
                                                title={remarks ?? undefined}
                                                className={`flex aspect-square flex-col items-center justify-center rounded-md border text-sm font-medium transition-all ${
                                                    status
                                                        ? (STATUS_STYLES[status]?.cell ??
                                                          'bg-slate-50 text-slate-600 border-slate-200')
                                                        : 'border-slate-100 bg-white text-slate-400'
                                                }`}
                                            >
                                                <span>{day}</span>
                                                {status && (
                                                    <span className="mt-1 text-[9px] font-semibold uppercase tracking-tight opacity-70">
                                                        {status.substring(0, 3)}
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="border-slate-200 shadow-sm">
                            <CardHeader className="border-b bg-slate-50 px-6 py-4">
                                <CardTitle className="text-base font-semibold text-slate-800">Distribution</CardTitle>
                            </CardHeader>
                            <CardContent className="p-6">
                                {chartData.length === 0 ? (
                                    <div className="flex h-48 items-center justify-center text-center text-sm text-slate-400">
                                        No attendance marked for this month
                                    </div>
                                ) : (
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={chartData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={80}
                                                    paddingAngle={2}
                                                    dataKey="value"
                                                >
                                                    {chartData.map((entry) => (
                                                        <Cell key={entry.name} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip
                                                    contentStyle={{
                                                        borderRadius: '6px',
                                                        fontSize: '12px',
                                                        border: 'none',
                                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                                    }}
                                                    itemStyle={{ color: '#334155', fontWeight: 500 }}
                                                />
                                                <Legend
                                                    verticalAlign="bottom"
                                                    height={36}
                                                    iconType="circle"
                                                    wrapperStyle={{ fontSize: '12px' }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
