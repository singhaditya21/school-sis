'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { assignStudentToRoute } from '@/lib/actions/transport';

import type { AssignableStudentView } from '../transport-constants';

interface AssignStudentFormProps {
    routeId: string;
    stops: { id: string; name: string }[];
    students: AssignableStudentView[];
    canWrite: boolean;
}

export default function AssignStudentForm({ routeId, stops, students, canWrite }: AssignStudentFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [studentId, setStudentId] = useState('');
    const [stopId, setStopId] = useState(stops[0]?.id || '');
    const [startDate, setStartDate] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setStartDate(new Date().toISOString().split('T')[0]);
    }, []);

    useEffect(() => {
        // Stops can be added or removed while this form is on screen.
        if (!stops.some((s) => s.id === stopId)) setStopId(stops[0]?.id || '');
    }, [stops, stopId]);

    const selected = students.find((s) => s.id === studentId) || null;

    if (!canWrite) {
        return (
            <p className="text-sm text-muted-foreground italic">
                You do not have permission to change transport assignments.
            </p>
        );
    }

    if (stops.length === 0) {
        return (
            <p className="text-sm text-muted-foreground italic" data-testid="assign-needs-stop">
                Add at least one stop to this route before assigning students.
            </p>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        if (!studentId) {
            setError('Student ID is required');
            setIsSubmitting(false);
            return;
        }

        if (!stopId) {
            setError('Stop is required');
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await assignStudentToRoute({
                studentId,
                routeId,
                stopId,
                startDate,
            });

            if (res.success) {
                toast.success('Student assigned to this route.');
                setStudentId('');
                router.refresh();
            }
        } catch (err: unknown) {
            const message = (err as { message?: string }).message || 'Failed to assign student';
            setError(message);
            toast.error(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
                <div className="p-3 bg-red-100 text-red-700 rounded-lg text-sm" data-testid="assign-error">
                    {error}
                </div>
            )}
            <div>
                <Label htmlFor="assign-student-picker">Student</Label>
                <select
                    id="assign-student-picker"
                    value={students.some((s) => s.id === studentId) ? studentId : ''}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="w-full p-2 border rounded text-sm bg-card"
                    data-testid="assign-student-picker"
                >
                    <option value="">Select a student…</option>
                    {students.map((student) => (
                        <option key={student.id} value={student.id}>
                            {student.name}
                            {student.className ? ` — ${student.className}` : ''} ({student.admissionNumber})
                            {student.currentRouteName ? ` · on ${student.currentRouteName}` : ''}
                        </option>
                    ))}
                </select>
                {selected?.currentRouteName && (
                    <p className="text-xs text-orange-600 mt-1" data-testid="assign-existing-route-warning">
                        {selected.name} already rides {selected.currentRouteName}. End that assignment first
                        unless they genuinely use both.
                    </p>
                )}
            </div>
            <div>
                <Label htmlFor="assign-student-id">Student UUID</Label>
                <Input
                    id="assign-student-id"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="Filled in by the picker, or paste one"
                    data-testid="assign-student-id"
                />
            </div>
            <div>
                <Label htmlFor="assign-stop-id">Select Stop</Label>
                <select
                    id="assign-stop-id"
                    value={stopId}
                    onChange={(e) => setStopId(e.target.value)}
                    className="w-full p-2 border rounded text-sm bg-card"
                    data-testid="assign-stop-id"
                >
                    {stops.map((stop) => (
                        <option key={stop.id} value={stop.id}>
                            {stop.name}
                        </option>
                    ))}
                </select>
            </div>
            <div>
                <Label htmlFor="assign-start-date">Start Date</Label>
                <Input
                    id="assign-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    data-testid="assign-start-date"
                />
            </div>
            <Button type="submit" disabled={isSubmitting} data-testid="assign-submit-btn">
                {isSubmitting ? 'Assigning...' : 'Assign Student'}
            </Button>
        </form>
    );
}
