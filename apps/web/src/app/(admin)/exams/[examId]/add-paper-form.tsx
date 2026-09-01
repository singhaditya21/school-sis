'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { addExamPaper } from '../_actions/exam-marks';
import type { SchedulePicklists } from '../_actions/exam-marks';

interface Props {
    examId: string;
    examStartDate: string;
    examEndDate: string;
    picklists: SchedulePicklists;
    defaultGradeId?: string;
}

const FIELD =
    'w-full px-3 py-2 border border-border rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500';

export function AddPaperForm({
    examId,
    examStartDate,
    examEndDate,
    picklists,
    defaultGradeId,
}: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    const [gradeId, setGradeId] = useState(defaultGradeId ?? '');
    const [subjectId, setSubjectId] = useState('');
    const [examDate, setExamDate] = useState(examStartDate?.slice(0, 10) ?? '');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('11:00');
    const [maxMarks, setMaxMarks] = useState('100');
    const [passingMarks, setPassingMarks] = useState('33');
    const [roomNumber, setRoomNumber] = useState('');

    const disabled = picklists.grades.length === 0 || picklists.subjects.length === 0;

    const submit = () => {
        startTransition(async () => {
            const result = await addExamPaper({
                examId,
                gradeId,
                subjectId,
                examDate,
                startTime,
                endTime,
                maxMarks: Number(maxMarks),
                passingMarks: Number(passingMarks),
                roomNumber,
            });
            if (!result.success) {
                toast.error(result.error || 'Could not add the paper');
                return;
            }
            toast.success('Paper added to the exam');
            setOpen(false);
            setSubjectId('');
            router.refresh();
        });
    };

    if (disabled) {
        return (
            <p className="text-sm text-muted-foreground">
                Papers need at least one class and one subject to exist first.
            </p>
        );
    }

    return (
        <>
            <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add paper
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add a paper</DialogTitle>
                        <DialogDescription>
                            One paper = one class sitting one subject. Marks entry and report cards
                            both read from these rows.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block text-sm">
                                <span className="font-medium text-foreground">Class</span>
                                <select
                                    className={FIELD}
                                    value={gradeId}
                                    onChange={(e) => setGradeId(e.target.value)}
                                >
                                    <option value="">Select class</option>
                                    {picklists.grades.map((g) => (
                                        <option key={g.id} value={g.id}>
                                            {g.name} ({g.studentCount} students)
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block text-sm">
                                <span className="font-medium text-foreground">Subject</span>
                                <select
                                    className={FIELD}
                                    value={subjectId}
                                    onChange={(e) => setSubjectId(e.target.value)}
                                >
                                    <option value="">Select subject</option>
                                    {picklists.subjects.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} ({s.code})
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <label className="block text-sm">
                                <span className="font-medium text-foreground">Date</span>
                                <input
                                    type="date"
                                    className={FIELD}
                                    value={examDate}
                                    min={examStartDate?.slice(0, 10)}
                                    max={examEndDate?.slice(0, 10)}
                                    onChange={(e) => setExamDate(e.target.value)}
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="font-medium text-foreground">Start</span>
                                <input
                                    type="time"
                                    className={FIELD}
                                    value={startTime}
                                    onChange={(e) => setStartTime(e.target.value)}
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="font-medium text-foreground">End</span>
                                <input
                                    type="time"
                                    className={FIELD}
                                    value={endTime}
                                    onChange={(e) => setEndTime(e.target.value)}
                                />
                            </label>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <label className="block text-sm">
                                <span className="font-medium text-foreground">Max marks</span>
                                <input
                                    type="number"
                                    min={1}
                                    className={FIELD}
                                    value={maxMarks}
                                    onChange={(e) => setMaxMarks(e.target.value)}
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="font-medium text-foreground">Passing marks</span>
                                <input
                                    type="number"
                                    min={0}
                                    className={FIELD}
                                    value={passingMarks}
                                    onChange={(e) => setPassingMarks(e.target.value)}
                                />
                            </label>
                            <label className="block text-sm">
                                <span className="font-medium text-foreground">Room</span>
                                <input
                                    type="text"
                                    className={FIELD}
                                    value={roomNumber}
                                    placeholder="Optional"
                                    onChange={(e) => setRoomNumber(e.target.value)}
                                />
                            </label>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={submit} disabled={isPending || !gradeId || !subjectId}>
                            {isPending ? 'Adding…' : 'Add paper'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
