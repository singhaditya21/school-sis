'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { assignStudentToRoute } from '@/lib/actions/transport';

interface AssignStudentFormProps {
    routeId: string;
    stops: { id: string; name: string }[];
}

export default function AssignStudentForm({ routeId, stops }: AssignStudentFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [studentId, setStudentId] = useState('');
    const [stopId, setStopId] = useState(stops[0]?.id || '');
    const [startDate, setStartDate] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setStartDate(new Date().toISOString().split('T')[0]);
    }, []);

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
                startDate
            });

            if (res.success) {
                setStudentId('');
                router.refresh();
            }
        } catch (err: any) {
            setError(err.message || 'Failed to assign student');
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
                <Label>Student UUID</Label>
                <Input
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="Enter student UUID"
                    data-testid="assign-student-id"
                />
            </div>
            <div>
                <Label>Select Stop</Label>
                <select
                    value={stopId}
                    onChange={(e) => setStopId(e.target.value)}
                    className="w-full p-2 border rounded text-sm bg-white"
                    data-testid="assign-stop-id"
                >
                    {stops.map(stop => (
                        <option key={stop.id} value={stop.id}>
                            {stop.name}
                        </option>
                    ))}
                </select>
            </div>
            <div>
                <Label>Start Date</Label>
                <Input
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
