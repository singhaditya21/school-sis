'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Award, CreditCard, Download, ExternalLink, Lock, ShieldCheck, TrendingUp } from 'lucide-react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { ParentTopBar } from '@/components/parent/parent-top-bar';
import { useParentChildren } from '@/components/parent/use-parent-children';
import { formatCurrency } from '@/lib/format/currency';
import {
    BOARD_PRESETS,
    computeBoardGrade,
    type BoardPreset,
} from '@/lib/academics/board-grading';
import {
    getChildResults,
    type ChildExamSeal,
    type ChildResultRow,
} from '../actions';

interface ExamGroup {
    examId: string;
    examName: string;
    examType: string;
    examStartDate: string | null;
    publishedOn: string | null;
    rows: ChildResultRow[];
}

function groupByExam(results: ChildResultRow[]): ExamGroup[] {
    const groups = new Map<string, ExamGroup>();
    for (const row of results) {
        const existing = groups.get(row.examId);
        if (existing) {
            existing.rows.push(row);
        } else {
            groups.set(row.examId, {
                examId: row.examId,
                examName: row.examName,
                examType: row.examType,
                examStartDate: row.examStartDate,
                publishedOn: row.publishedOn,
                rows: [row],
            });
        }
    }
    return [...groups.values()];
}

export function ResultsClient() {
    const { students, selectedId, loading: childrenLoading, error: childrenError } = useParentChildren();
    const [fetched, setFetched] = useState<{
        key: string;
        results: ChildResultRow[];
        childName: string | null;
        boardPreset: BoardPreset;
        schoolName: string;
        feeHold: { active: boolean; overdueAmount: number; overdueCount: number };
        examSeals: Record<string, ChildExamSeal>;
    } | null>(null);

    useEffect(() => {
        if (childrenLoading || !selectedId) return;

        let cancelled = false;
        const key = selectedId;
        getChildResults(selectedId)
            .then((res) => {
                if (cancelled) return;
                setFetched({
                    key,
                    results: res?.results ?? [],
                    childName: res?.child.name ?? null,
                    boardPreset: res?.boardPreset ?? 'CBSE',
                    schoolName: res?.schoolName ?? 'ScholarMind Campus',
                    feeHold: res?.feeHold ?? { active: false, overdueAmount: 0, overdueCount: 0 },
                    examSeals: res?.examSeals ?? {},
                });
            })
            .catch(() => {
                if (cancelled) return;
                setFetched({
                    key,
                    results: [],
                    childName: null,
                    boardPreset: 'CBSE',
                    schoolName: 'ScholarMind Campus',
                    feeHold: { active: false, overdueAmount: 0, overdueCount: 0 },
                    examSeals: {},
                });
                toast.error('Could not load academic records.');
            });

        return () => {
            cancelled = true;
        };
    }, [selectedId, childrenLoading]);

    const current = fetched?.key === selectedId ? fetched : null;
    const results = current?.results ?? [];
    const childName = current?.childName ?? null;
    const boardPreset = current?.boardPreset ?? 'CBSE';
    const boardDef = BOARD_PRESETS[boardPreset];
    const feeHold = current?.feeHold ?? { active: false, overdueAmount: 0, overdueCount: 0 };
    const examSeals = current?.examSeals ?? {};
    const loading = childrenLoading || (selectedId !== null && current === null);

    function examAverage(group: ExamGroup): number | null {
        const scored = group.rows.filter((r) => !r.isAbsent && r.percentage !== null);
        if (scored.length === 0) return null;
        return Math.round(scored.reduce((sum, r) => sum + (r.percentage ?? 0), 0) / scored.length);
    }

    function generatePDF(group: ExamGroup) {
        const seal = examSeals[group.examId];
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text(current?.schoolName ?? 'ScholarMind Campus', 14, 18);

        doc.setFontSize(13);
        doc.setTextColor(60);
        doc.text(`${group.examName} · ${boardDef.shortLabel}`, 14, 26);

        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Student: ${childName ?? 'Student'}`, 14, 34);
        if (seal) {
            doc.text(`Verification Seal: ${seal.sealCode}`, 14, 41);
        }

        let yPos = 54;
        doc.setTextColor(0);
        doc.setFontSize(10);
        doc.setTextColor(130);
        doc.text('Subject', 14, yPos);
        doc.text('Marks', 92, yPos);
        doc.text('Max', 122, yPos);
        doc.text('%', 146, yPos);
        doc.text('Board Grade', 168, yPos);
        yPos += 4;
        doc.line(14, yPos, 195, yPos);
        yPos += 8;
        doc.setTextColor(0);

        for (const row of group.rows) {
            if (yPos > 276) {
                doc.addPage();
                yPos = 20;
            }
            const computed = computeBoardGrade(row.percentage, boardPreset, row.isAbsent);
            doc.text(row.subject, 14, yPos);
            doc.text(row.isAbsent ? 'Absent' : String(row.marksObtained ?? '—'), 92, yPos);
            doc.text(String(row.maxMarks), 122, yPos);
            doc.text(row.isAbsent || row.percentage === null ? '—' : `${row.percentage}%`, 146, yPos);
            doc.text(computed.grade, 168, yPos);
            yPos += 9;
        }

        const average = examAverage(group);
        if (average !== null) {
            const overall = computeBoardGrade(average, boardPreset, false);
            yPos += 5;
            doc.setFontSize(11);
            doc.text(`Overall Average: ${average}% (${overall.grade} · ${overall.descriptor})`, 14, yPos);
        }

        doc.save(`${group.examName.replace(/\s+/g, '_')}_${(childName ?? 'student').replace(/\s+/g, '_')}.pdf`);
    }

    const groups = groupByExam(results);

    return (
        <div className="mx-auto max-w-7xl space-y-6 pb-12">
            <ParentTopBar students={students} selectedId={selectedId} loading={childrenLoading} />

            <div className="flex flex-col gap-3 border-b pb-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                            Academic records &amp; Board transcripts
                        </h1>
                        <Badge
                            variant="outline"
                            className="border-brass/40 bg-accent text-xs font-semibold text-primary"
                            data-testid="parent-board-preset-badge"
                        >
                            <Award className="mr-1.5 h-3.5 w-3.5 text-brass" />
                            {boardDef.shortLabel}
                        </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {childName
                            ? `Published board-graded transcripts & verifiable seals for ${childName}`
                            : 'Published board-graded exam results'}
                    </p>
                </div>
                <span className="text-xs text-muted-foreground">{boardDef.weightageSummary}</span>
            </div>

            {childrenError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive-subtle p-4 text-sm text-destructive-subtle-foreground">
                    {childrenError}
                </div>
            )}

            {loading ? (
                <div className="py-12 text-center text-sm text-muted-foreground">Loading academic records…</div>
            ) : students.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted p-12 text-center text-muted-foreground">
                    No child is linked to your account yet, so there are no results to show.
                </div>
            ) : feeHold.active ? (
                <Card
                    className="border-brass/40 bg-card shadow-sm"
                    data-testid="parent-report-card-fee-hold"
                >
                    <CardHeader className="border-b bg-accent/60">
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brass/30 bg-card text-primary">
                                <Lock className="h-5 w-5 text-brass" />
                            </div>
                            <div>
                                <CardTitle className="font-display text-lg text-foreground">
                                    Fee Clearance Required for Transcript Release
                                </CardTitle>
                                <CardDescription className="mt-1 text-sm">
                                    Per campus governance policy, published report cards unlock automatically once overdue fee invoices are cleared.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                Overdue Balance ({feeHold.overdueCount}{' '}
                                {feeHold.overdueCount === 1 ? 'invoice' : 'invoices'})
                            </p>
                            <p className="mt-1 font-mono text-2xl font-bold text-foreground">
                                {formatCurrency(feeHold.overdueAmount)}
                            </p>
                        </div>
                        <Button asChild className="gap-2">
                            <Link href={selectedId ? `/my-fees?child=${selectedId}` : '/my-fees'}>
                                <CreditCard className="h-4 w-4" />
                                Clear Overdue Fees via UPI
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : groups.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-muted p-12 text-center text-muted-foreground">
                    <p className="font-medium text-muted-foreground">No published results yet</p>
                    <p className="mt-1 text-sm">
                        Marks become visible here only after the school publishes the exam.
                    </p>
                </div>
            ) : (
                groups.map((group) => {
                    const average = examAverage(group);
                    const overallGrade =
                        average !== null ? computeBoardGrade(average, boardPreset, false) : null;
                    const seal = examSeals[group.examId];
                    const chartData = group.rows
                        .filter((r) => !r.isAbsent && r.percentage !== null)
                        .map((r) => ({ subject: r.subject, percentage: r.percentage as number }));

                    return (
                        <Card key={group.examId} className="overflow-hidden rounded-md border-border shadow-sm">
                            <CardHeader className="flex flex-col gap-4 border-b bg-muted px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <CardTitle className="font-display text-lg font-semibold text-foreground">
                                            {group.examName}
                                        </CardTitle>
                                        {seal && (
                                            <Badge
                                                variant="outline"
                                                className="border-brass/40 bg-card font-mono text-[11px] text-primary"
                                            >
                                                <ShieldCheck className="mr-1 h-3 w-3 text-brass" />
                                                {seal.sealCode}
                                            </Badge>
                                        )}
                                    </div>
                                    <CardDescription className="mt-1 text-xs font-medium">
                                        {group.examType.replace(/_/g, ' ')}
                                        {group.examStartDate ? ` · ${group.examStartDate}` : ''}
                                        {group.publishedOn ? ` · published ${group.publishedOn}` : ''}
                                    </CardDescription>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {average !== null && overallGrade && (
                                        <Badge
                                            variant="secondary"
                                            className="border-border px-3 py-1 font-mono text-xs"
                                        >
                                            Avg {average}% · {overallGrade.grade}
                                        </Badge>
                                    )}
                                    {seal && (
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="outline"
                                            className="h-8 border-brass/40 text-xs font-medium text-primary"
                                        >
                                            <Link
                                                href={seal.verifyPath}
                                                target="_blank"
                                                data-testid="parent-verify-report-card-seal"
                                            >
                                                <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-brass" />
                                                Verify Seal
                                                <ExternalLink className="ml-1 h-3 w-3 opacity-70" />
                                            </Link>
                                        </Button>
                                    )}
                                    {seal && (
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="outline"
                                            className="h-8 text-xs font-medium"
                                        >
                                            <a href={seal.pdfPath}>
                                                <Download className="mr-1.5 h-3.5 w-3.5" />
                                                Official PDF
                                            </a>
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 text-xs font-medium"
                                        onClick={() => generatePDF(group)}
                                    >
                                        Quick Summary PDF
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="grid divide-y border-b lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                                    <div className="overflow-x-auto p-0 lg:col-span-2">
                                        <Table>
                                            <TableHeader className="bg-muted">
                                                <TableRow>
                                                    <TableHead className="font-medium text-muted-foreground">
                                                        Subject
                                                    </TableHead>
                                                    <TableHead className="text-right font-medium text-muted-foreground">
                                                        Score
                                                    </TableHead>
                                                    <TableHead className="text-right font-medium text-muted-foreground">
                                                        Percentage
                                                    </TableHead>
                                                    <TableHead className="font-medium text-muted-foreground">
                                                        {boardDef.shortLabel} Grade
                                                    </TableHead>
                                                    <TableHead className="font-medium text-muted-foreground">
                                                        Descriptor / Remarks
                                                    </TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {group.rows.map((row, idx) => {
                                                    const boardGrade = computeBoardGrade(
                                                        row.percentage,
                                                        boardPreset,
                                                        row.isAbsent,
                                                    );
                                                    const failed =
                                                        !row.isAbsent &&
                                                        ((row.passingMarks !== null &&
                                                            row.marksObtained !== null &&
                                                            row.marksObtained < row.passingMarks) ||
                                                            !boardGrade.passed);

                                                    return (
                                                        <TableRow key={`${row.examId}-${row.subject}-${idx}`}>
                                                            <TableCell className="font-medium text-foreground">
                                                                {row.subject}
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono text-muted-foreground">
                                                                {row.isAbsent ? (
                                                                    <span className="text-muted-foreground">Absent</span>
                                                                ) : (
                                                                    <>
                                                                        {row.marksObtained ?? '—'}{' '}
                                                                        <span className="text-muted-foreground">
                                                                            / {row.maxMarks}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono font-medium text-foreground">
                                                                {row.isAbsent || row.percentage === null
                                                                    ? '—'
                                                                    : `${row.percentage}%`}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge
                                                                    variant={
                                                                        row.isAbsent || failed
                                                                            ? 'destructive'
                                                                            : 'secondary'
                                                                    }
                                                                    className="rounded-sm px-2 font-mono text-[11px]"
                                                                >
                                                                    {boardGrade.grade}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-sm text-muted-foreground">
                                                                {row.remarks ??
                                                                    (failed
                                                                        ? 'Below passing threshold'
                                                                        : boardGrade.descriptor)}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    <div className="bg-muted/30 p-6">
                                        <h2 className="mb-4 flex items-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            <TrendingUp className="mr-2 h-4 w-4 text-brass" /> Performance by subject
                                        </h2>
                                        {chartData.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No scored subjects to chart.</p>
                                        ) : (
                                            <div className="h-[200px] w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart
                                                        data={chartData}
                                                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                                    >
                                                        <CartesianGrid
                                                            strokeDasharray="3 3"
                                                            vertical={false}
                                                            stroke="#E6DFD1"
                                                        />
                                                        <XAxis
                                                            dataKey="subject"
                                                            tick={{ fontSize: 10 }}
                                                            tickLine={false}
                                                            axisLine={false}
                                                        />
                                                        <YAxis
                                                            tick={{ fontSize: 10 }}
                                                            tickLine={false}
                                                            axisLine={false}
                                                            domain={[0, 100]}
                                                        />
                                                        <Tooltip
                                                            cursor={{ fill: '#FAF8F4' }}
                                                            contentStyle={{
                                                                borderRadius: '6px',
                                                                fontSize: '12px',
                                                                border: '1px solid #E6DFD1',
                                                                boxShadow: '0 4px 6px -1px rgb(22 43 77 / 0.08)',
                                                            }}
                                                        />
                                                        <Bar
                                                            dataKey="percentage"
                                                            fill="#162B4D"
                                                            radius={[4, 4, 0, 0]}
                                                            maxBarSize={40}
                                                        />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })
            )}
        </div>
    );
}
