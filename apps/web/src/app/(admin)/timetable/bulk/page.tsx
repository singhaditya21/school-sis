'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { bulkCreateEntries, type TimetableConflict } from '@/lib/actions/timetable';

export default function BulkUploadTimetablePage() {
    const router = useRouter();
    const [jsonInput, setJsonInput] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [conflicts, setConflicts] = useState<TimetableConflict[]>([]);
    const [skipConflicts, setSkipConflicts] = useState(false);

    const handleVerifyAndImport = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');
        setConflicts([]);
        setIsSubmitting(true);

        let parsedData: unknown;
        try {
            parsedData = JSON.parse(jsonInput);
            if (!Array.isArray(parsedData)) {
                throw new Error('Input must be a JSON Array');
            }
        } catch (err: unknown) {
            setErrorMessage('Invalid JSON format: ' + (err as Error).message);
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await bulkCreateEntries(parsedData as Parameters<typeof bulkCreateEntries>[0]);
            if (res.success) {
                setSuccessMessage(`Bulk upload completed! Successfully inserted ${res.inserted} entries.`);
                setTimeout(() => {
                    router.push('/timetable');
                }, 1500);
            } else {
                setConflicts(res.conflicts || []);
                if (skipConflicts) {
                    setSuccessMessage(`Bulk upload completed with some conflicts skipped! Successfully inserted ${res.inserted} entries.`);
                    setTimeout(() => {
                        router.push('/timetable');
                    }, 1500);
                } else {
                    setErrorMessage(`Found ${res.conflicts.length} conflicts. Please resolve conflicts or check "Skip conflicts" to proceed with valid entries.`);
                }
            }
        } catch (err: unknown) {
            setErrorMessage((err as Error).message || 'Failed to bulk import entries.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-3xl">
            <div className="mb-6">
                <Link href="/timetable" className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Bulk Upload Class Period Schedule</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleVerifyAndImport} className="space-y-4">
                        {errorMessage && (
                            <div data-testid="bulk-error-message" className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
                                {errorMessage}
                            </div>
                        )}
                        {successMessage && (
                            <div data-testid="bulk-success-message" className="p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg text-sm">
                                {successMessage}
                            </div>
                        )}

                        <div>
                            <Label htmlFor="bulk-json-input">Paste Timetable JSON Mappings</Label>
                            <textarea
                                id="bulk-json-input"
                                data-testid="bulk-json-input"
                                rows={10}
                                value={jsonInput}
                                onChange={(e) => setJsonInput(e.target.value)}
                                placeholder={`[\n  {\n    "sectionId": "uuid-here",\n    "periodId": "uuid-here",\n    "dayOfWeek": "MONDAY",\n    "subjectId": "uuid-here",\n    "teacherId": "uuid-here",\n    "roomNumber": "101"\n  }\n]`}
                                className="w-full px-3 py-2 border rounded-lg mt-1 font-mono text-sm"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="skip-conflicts-checkbox"
                                data-testid="skip-conflicts-checkbox"
                                checked={skipConflicts}
                                onChange={(e) => setSkipConflicts(e.target.checked)}
                            />
                            <Label htmlFor="skip-conflicts-checkbox" className="cursor-pointer">
                                Skip conflicts and finalize import for valid entries
                            </Label>
                        </div>

                        {conflicts.length > 0 && (
                            <div data-testid="conflict-warning-list" className="p-4 bg-yellow-50 border border-yellow-300 rounded-lg space-y-2">
                                <h4 className="font-semibold text-yellow-800 text-sm">Conflict Warnings Detected:</h4>
                                <ul className="list-disc list-inside text-xs text-yellow-700 space-y-1">
                                    {conflicts.map((conflict, index) => (
                                        <li key={index}>
                                            <strong>{conflict.type}:</strong> {conflict.details} (with {conflict.conflictWith})
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex gap-4 pt-4">
                            <Button type="submit" data-testid="bulk-upload-btn" disabled={isSubmitting}>
                                {isSubmitting ? 'Importing...' : 'Verify & Import'}
                            </Button>
                            <Link href="/timetable">
                                <Button type="button" variant="outline">Cancel</Button>
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
