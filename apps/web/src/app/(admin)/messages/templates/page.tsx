'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getMessageTemplates } from '@/lib/actions/scaffolding-bridge';

export default function MessageTemplatesPage() {
    const [templates, setTemplates] = useState<any[]>([]);
    useEffect(() => { getMessageTemplates().then(setTemplates); }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h1 className="text-3xl font-bold">Message Templates</h1><p className="text-gray-600 mt-1">Manage reusable message templates</p></div>
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">+ New Template</button>
            </div>
            {templates.length === 0 ? <Card><CardContent className="py-12 text-center text-gray-500">No message templates found. Create one to get started.</CardContent></Card> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {templates.map((t: any) => (
                        <Card key={t.id} className="hover:shadow-md transition-shadow">
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between text-lg">
                                    <span>{t.name}</span><Badge variant="outline">{t.type}</Badge>
                                </CardTitle>
                                {t.subject && <p className="text-sm text-gray-500">Subject: {t.subject}</p>}
                            </CardHeader>
                            <CardContent>
                                <p className="text-gray-700 text-sm line-clamp-3">{t.body}</p>
                                {t.variables && <p className="text-xs text-gray-400 mt-2">Variables: {JSON.stringify(t.variables)}</p>}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
