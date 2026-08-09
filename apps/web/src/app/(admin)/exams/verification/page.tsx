'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
    getPendingVerifications,
    getRecentRejectedVerifications,
    getVerificationStats,
    rejectExamResults,
    verifyExamResults,
    type ExamReviewStats,
    type PendingExamResultReview,
    type RejectedExamResultReview,
} from '@/lib/actions/exam-review';

const EMPTY_STATS: ExamReviewStats = { pending: 0, verified: 0, rejected: 0 };

function formatDate(value: string): string {
    if (!value) return 'Unavailable';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unavailable';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

export default function MarksVerificationPage() {
    const [pendingMarks, setPendingMarks] = useState<PendingExamResultReview[]>([]);
    const [rejectedMarks, setRejectedMarks] = useState<RejectedExamResultReview[]>([]);
    const [selectedMarks, setSelectedMarks] = useState<Set<string>>(new Set());
    const [rejectionReason, setRejectionReason] = useState('');
    const [stats, setStats] = useState<ExamReviewStats>(EMPTY_STATS);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isMutating, setIsMutating] = useState(false);

    const loadData = useCallback(async (refresh = false) => {
        if (refresh) setIsRefreshing(true);
        try {
            const [pending, recentRejected, currentStats] = await Promise.all([
                getPendingVerifications(),
                getRecentRejectedVerifications(),
                getVerificationStats(),
            ]);
            setPendingMarks(pending);
            setRejectedMarks(recentRejected);
            setStats(currentStats);
            setSelectedMarks(current => new Set(
                [...current].filter(id => pending.some(mark => mark.markId === id)),
            ));
        } catch (error) {
            console.error('Failed to load exam-result review data:', error);
            toast.error('Exam-result review data could not be loaded.');
        } finally {
            setIsInitialLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    function toggleMarkSelection(markId: string) {
        setSelectedMarks(current => {
            const next = new Set(current);
            if (next.has(markId)) next.delete(markId);
            else next.add(markId);
            return next;
        });
    }

    async function handleVerify() {
        const ids = [...selectedMarks];
        if (ids.length === 0) return;
        setIsMutating(true);
        try {
            const result = await verifyExamResults(ids);
            if (result.success === false) {
                toast.error(result.error);
                return;
            }
            const unchanged = result.unchanged > 0 ? ` ${result.unchanged} were already verified.` : '';
            toast.success(`${result.reviewed} result${result.reviewed === 1 ? '' : 's'} verified.${unchanged}`);
            setSelectedMarks(new Set());
            await loadData();
        } catch (error) {
            console.error('Failed to verify exam results:', error);
            toast.error('Exam results were not verified.');
        } finally {
            setIsMutating(false);
        }
    }

    async function handleReject() {
        const ids = [...selectedMarks];
        if (ids.length === 0) return;
        setIsMutating(true);
        try {
            const result = await rejectExamResults(ids, rejectionReason);
            if (result.success === false) {
                toast.error(result.error);
                return;
            }
            const unchanged = result.unchanged > 0 ? ` ${result.unchanged} were already rejected.` : '';
            toast.success(`${result.reviewed} result${result.reviewed === 1 ? '' : 's'} rejected.${unchanged}`);
            setSelectedMarks(new Set());
            setRejectionReason('');
            await loadData();
        } catch (error) {
            console.error('Failed to reject exam results:', error);
            toast.error('Exam results were not rejected.');
        } finally {
            setIsMutating(false);
        }
    }

    const allPendingSelected = pendingMarks.length > 0 && selectedMarks.size === pendingMarks.length;

    return (
        <div className="space-y-6 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Marks verification</h1>
                    <p className="text-muted-foreground">Review persisted marks before result publication.</p>
                </div>
                <Button variant="outline" onClick={() => void loadData(true)} disabled={isRefreshing || isMutating}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="flex items-center gap-4 p-4">
                        <div className="rounded-full bg-warning-muted p-3"><Clock className="h-6 w-6 text-warning" /></div>
                        <div><div className="text-sm text-muted-foreground">Pending</div><div className="text-2xl font-bold">{stats.pending}</div></div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="flex items-center gap-4 p-4">
                        <div className="rounded-full bg-success-muted p-3"><CheckCircle2 className="h-6 w-6 text-success" /></div>
                        <div><div className="text-sm text-muted-foreground">Verified</div><div className="text-2xl font-bold">{stats.verified}</div></div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="flex items-center gap-4 p-4">
                        <div className="rounded-full bg-destructive/10 p-3"><XCircle className="h-6 w-6 text-destructive" /></div>
                        <div><div className="text-sm text-muted-foreground">Rejected</div><div className="text-2xl font-bold">{stats.rejected}</div></div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <CardTitle>Pending review</CardTitle>
                            <CardDescription>Select persisted results to verify or return for correction.</CardDescription>
                        </div>
                        <Button onClick={() => void handleVerify()} disabled={selectedMarks.size === 0 || isMutating}>
                            {isMutating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            Verify selected ({selectedMarks.size})
                        </Button>
                    </div>
                    <div className="grid gap-3 pt-3 md:grid-cols-[1fr_auto] md:items-end">
                        <div>
                            <label htmlFor="rejection-reason" className="mb-1 block text-sm font-medium">Rejection reason</label>
                            <Textarea
                                id="rejection-reason"
                                value={rejectionReason}
                                onChange={event => setRejectionReason(event.target.value)}
                                placeholder="Explain what must be corrected (5–500 characters)."
                                maxLength={500}
                                disabled={isMutating}
                            />
                        </div>
                        <Button
                            variant="destructive"
                            onClick={() => void handleReject()}
                            disabled={selectedMarks.size === 0 || rejectionReason.trim().length < 5 || isMutating}
                        >
                            <XCircle className="mr-2 h-4 w-4" />
                            Reject selected
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12">
                                    <Checkbox
                                        aria-label="Select all pending results"
                                        checked={allPendingSelected}
                                        onCheckedChange={checked => setSelectedMarks(
                                            checked === true ? new Set(pendingMarks.map(mark => mark.markId)) : new Set(),
                                        )}
                                    />
                                </TableHead>
                                <TableHead>Student</TableHead>
                                <TableHead>Subject</TableHead>
                                <TableHead>Marks</TableHead>
                                <TableHead>Entered by</TableHead>
                                <TableHead>Entered</TableHead>
                                <TableHead>Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isInitialLoading ? (
                                <TableRow><TableCell colSpan={7} className="h-24 text-center">Loading persisted results…</TableCell></TableRow>
                            ) : pendingMarks.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No results are awaiting review.</TableCell></TableRow>
                            ) : pendingMarks.map(mark => (
                                <TableRow key={mark.markId}>
                                    <TableCell>
                                        <Checkbox
                                            aria-label={`Select ${mark.studentName} ${mark.subject}`}
                                            checked={selectedMarks.has(mark.markId)}
                                            onCheckedChange={() => toggleMarkSelection(mark.markId)}
                                        />
                                    </TableCell>
                                    <TableCell className="font-medium">{mark.studentName}</TableCell>
                                    <TableCell>{mark.subject}</TableCell>
                                    <TableCell>{mark.isAbsent ? 'Absent' : `${mark.marksObtained ?? '—'} / ${mark.maxMarks}`}</TableCell>
                                    <TableCell>{mark.enteredBy}</TableCell>
                                    <TableCell>{formatDate(mark.enteredAt)}</TableCell>
                                    <TableCell><Badge variant="outline">Pending</Badge></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Recent rejections</CardTitle>
                    <CardDescription>The latest 25 persisted rejection decisions and their reasons.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Student</TableHead>
                                <TableHead>Subject</TableHead>
                                <TableHead>Reason</TableHead>
                                <TableHead>Reviewed by</TableHead>
                                <TableHead>Reviewed</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rejectedMarks.length === 0 ? (
                                <TableRow><TableCell colSpan={5} className="h-20 text-center text-muted-foreground">No rejected results are recorded.</TableCell></TableRow>
                            ) : rejectedMarks.map(mark => (
                                <TableRow key={mark.markId}>
                                    <TableCell className="font-medium">{mark.studentName}</TableCell>
                                    <TableCell>{mark.subject}</TableCell>
                                    <TableCell className="max-w-md whitespace-normal">{mark.rejectionReason}</TableCell>
                                    <TableCell>{mark.reviewedBy}</TableCell>
                                    <TableCell>{formatDate(mark.reviewedAt)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
