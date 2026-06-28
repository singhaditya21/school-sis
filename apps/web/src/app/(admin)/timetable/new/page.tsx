'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    getSectionsForTimetable,
    getPeriods,
    getTeachersForTimetable,
    getSubjectsForTimetable,
    createTimetableEntry
} from '@/lib/actions/timetable';

export default function NewTimetablePage() {
    const router = useRouter();
    const [sections, setSections] = useState<any[]>([]);
    const [periods, setPeriods] = useState<any[]>([]);
    const [teachers, setTeachers] = useState<any[]>([]);
    const [subjects, setSubjects] = useState<any[]>([]);

    const [sectionId, setSectionId] = useState('');
    const [subjectId, setSubjectId] = useState('');
    const [dayOfWeek, setDayOfWeek] = useState('');
    const [periodId, setPeriodId] = useState('');
    const [teacherId, setTeacherId] = useState('');
    const [roomNumber, setRoomNumber] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        getSectionsForTimetable().then(setSections).catch(console.error);
        getPeriods().then(setPeriods).catch(console.error);
        getTeachersForTimetable().then(setTeachers).catch(console.error);
        getSubjectsForTimetable().then(setSubjects).catch(console.error);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');
        setIsSubmitting(true);

        if (!sectionId || !subjectId || !dayOfWeek || !periodId || !teacherId) {
            setErrorMessage('All fields except Room are required');
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await createTimetableEntry({
                sectionId,
                periodId,
                dayOfWeek,
                subjectId,
                teacherId,
                roomNumber: roomNumber || undefined,
            });

            if (res.success) {
                setSuccessMessage('Timetable entry created successfully!');
                setTimeout(() => {
                    router.push('/timetable');
                }, 1000);
            } else {
                if (res.conflicts && res.conflicts.length > 0) {
                    setErrorMessage(res.conflicts[0].details);
                } else {
                    setErrorMessage('Conflict detected or failed to create entry.');
                }
            }
        } catch (err: any) {
            setErrorMessage(err.message || 'An error occurred while creating entry.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-2xl">
            <div className="mb-6">
                <Link href="/timetable" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Create New Timetable Entry</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {errorMessage && (
                            <div data-testid="error-message" className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                                {errorMessage}
                            </div>
                        )}
                        {successMessage && (
                            <div data-testid="success-message" className="p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg text-sm">
                                {successMessage}
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="class-select">Class</Label>
                                <select
                                    id="class-select"
                                    data-testid="class-select"
                                    value={sectionId}
                                    onChange={(e) => setSectionId(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg bg-white mt-1"
                                >
                                    <option value="">Select class...</option>
                                    {sections.map((sec) => (
                                        <option key={sec.id} value={sec.id}>
                                            {sec.gradeName} - {sec.sectionName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <Label htmlFor="subject-select">Subject</Label>
                                <select
                                    id="subject-select"
                                    data-testid="subject-select"
                                    value={subjectId}
                                    onChange={(e) => setSubjectId(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg bg-white mt-1"
                                >
                                    <option value="">Select subject...</option>
                                    {subjects.map((sub) => (
                                        <option key={sub.id} value={sub.id}>
                                            {sub.name} ({sub.code})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label htmlFor="day-select">Day</Label>
                                <select
                                    id="day-select"
                                    data-testid="day-select"
                                    value={dayOfWeek}
                                    onChange={(e) => setDayOfWeek(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg bg-white mt-1"
                                >
                                    <option value="">Select day...</option>
                                    <option value="MONDAY">Monday</option>
                                    <option value="TUESDAY">Tuesday</option>
                                    <option value="WEDNESDAY">Wednesday</option>
                                    <option value="THURSDAY">Thursday</option>
                                    <option value="FRIDAY">Friday</option>
                                    <option value="SATURDAY">Saturday</option>
                                </select>
                            </div>
                            <div>
                                <Label htmlFor="period-select">Period</Label>
                                <select
                                    id="period-select"
                                    data-testid="period-select"
                                    value={periodId}
                                    onChange={(e) => setPeriodId(e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg bg-white mt-1"
                                >
                                    <option value="">Select period...</option>
                                    {periods.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.name} ({p.startTime} - {p.endTime})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <Label htmlFor="teacher-select">Teacher</Label>
                            <select
                                id="teacher-select"
                                data-testid="teacher-select"
                                value={teacherId}
                                onChange={(e) => setTeacherId(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg bg-white mt-1"
                            >
                                <option value="">Select teacher...</option>
                                {teachers.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.firstName} {t.lastName}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <Label htmlFor="room-input">Room</Label>
                            <Input
                                id="room-input"
                                data-testid="room-input"
                                value={roomNumber}
                                onChange={(e) => setRoomNumber(e.target.value)}
                                placeholder="e.g., Room 101"
                                className="mt-1"
                            />
                        </div>

                        <div className="flex gap-4 pt-4">
                            <Button type="submit" data-testid="submit-btn" disabled={isSubmitting}>
                                {isSubmitting ? 'Creating...' : 'Add Entry'}
                            </Button>
                            <Link href="/timetable">
                                <Button type="button" data-testid="cancel-btn" variant="outline">Cancel</Button>
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
