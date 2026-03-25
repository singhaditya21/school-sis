'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getDiaryEntries } from '@/lib/actions/scaffolding-bridge';

export default function DiaryPage() {
    const [entries, setEntries] = useState<any[]>([]);
    useEffect(() => { getDiaryEntries().then(setEntries); }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">School Diary</h1><p className="text-gray-600 mt-1">Daily homework and announcements</p></div>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ New Entry</button>
            </div>
            {entries.length === 0 ? <Card><CardContent className="py-12 text-center text-gray-500">No diary entries found.</CardContent></Card> : (
                <div className="space-y-4">
                    {entries.map((entry: any) => (
                        <Card key={entry.id}>
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between">
                                    <span>{entry.title}</span>
                                    <div className="flex gap-2">
                                        <Badge variant="outline">{entry.class} {entry.section}</Badge>
                                        <Badge>{entry.subject}</Badge>
                                    </div>
                                </CardTitle>
                                <p className="text-sm text-gray-500">{entry.teacherName} • {entry.date}</p>
                            </CardHeader>
                            <CardContent><p className="text-gray-700">{entry.content}</p></CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
