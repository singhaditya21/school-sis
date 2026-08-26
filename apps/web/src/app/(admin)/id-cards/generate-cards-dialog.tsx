'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { generateIdCardsAction } from './_lib/actions';
import type { GradeOption } from './_lib/actions';
import type { PersonType } from './_lib/labels';

interface GenerateCardsDialogProps {
    personType: PersonType;
    grades: GradeOption[];
    withoutCard: number;
}

/** Indian schools run April–March; default to the session containing today. */
function defaultSession(): { from: string; to: string } {
    const now = new Date();
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

export default function GenerateCardsDialog({ personType, grades, withoutCard }: GenerateCardsDialogProps) {
    const router = useRouter();
    const session = defaultSession();
    const [open, setOpen] = useState(false);
    const [gradeId, setGradeId] = useState('');
    const [validFrom, setValidFrom] = useState(session.from);
    const [validTo, setValidTo] = useState(session.to);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!validFrom || !validTo) {
            setError('Both validity dates are required.');
            return;
        }
        if (validTo < validFrom) {
            setError('The "valid to" date cannot be before the "valid from" date.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const result = await generateIdCardsAction({
                personType,
                gradeId: personType === 'STUDENT' && gradeId ? gradeId : undefined,
                validFrom,
                validTo,
            });
            if (!result.success) {
                setError(result.error ?? 'Could not generate the cards.');
                return;
            }
            setOpen(false);
            const created = result.created ?? 0;
            const skipped = result.skipped ?? 0;
            toast.success(
                created === 0
                    ? 'No new cards needed — everyone already has one for these dates.'
                    : `${created} card${created === 1 ? '' : 's'} created${skipped > 0 ? `, ${skipped} already covered` : ''}`
            );
            router.refresh();
        } catch {
            setError('Something went wrong while generating. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    const noun = personType === 'STUDENT' ? 'students' : 'staff';

    return (
        <Dialog open={open} onOpenChange={next => { setOpen(next); if (!next) setError(null); }}>
            <DialogTrigger asChild>
                <Button>Generate cards</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Generate {personType === 'STUDENT' ? 'student' : 'staff'} ID cards</DialogTitle>
                    <DialogDescription>
                        Creates one card per person who does not already hold a card covering these
                        dates. Running it twice does not create duplicates.
                        {withoutCard > 0 && ` ${withoutCard} active ${noun} currently hold no card at all.`}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
                            {error}
                        </div>
                    )}

                    {personType === 'STUDENT' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="generate-grade">Class</Label>
                            <select
                                id="generate-grade"
                                value={gradeId}
                                onChange={e => setGradeId(e.target.value)}
                                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="">All classes</option>
                                {grades.map(g => (
                                    <option key={g.id} value={g.id}>
                                        {g.name} ({g.activeStudents} active)
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="generate-from">Valid from *</Label>
                            <Input
                                id="generate-from"
                                type="date"
                                value={validFrom}
                                onChange={e => setValidFrom(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="generate-to">Valid to *</Label>
                            <Input
                                id="generate-to"
                                type="date"
                                value={validTo}
                                onChange={e => setValidTo(e.target.value)}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? 'Generating…' : 'Generate'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
