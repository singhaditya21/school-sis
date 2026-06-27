'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getMessageTemplates, MessageTemplate } from '@/lib/services/messages/messages.service';

export default function MessageTemplatesPage() {
    const [templates, setTemplates] = useState<MessageTemplate[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { 
        getMessageTemplates().then(data => {
            setTemplates(data);
            setLoading(false);
        }); 
    }, []);

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Message Templates</h1>
                    <p className="text-gray-600 mt-1">Manage reusable message templates</p>
                </div>
                <button className="px-4 py-2 bg-slate-900 text-white rounded-md text-sm font-medium hover:bg-slate-800 transition-colors">
                    + New Template
                </button>
            </div>
            
            {loading ? (
                <div className="text-center py-12 text-slate-500">Loading templates...</div>
            ) : templates.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center text-gray-500">
                        No message templates found. Create one to get started.
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {templates.map((t) => (
                        <Card key={t.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-start justify-between text-lg gap-2">
                                    <span className="leading-tight">{t.name}</span>
                                    <Badge variant="outline" className="shrink-0">{t.type}</Badge>
                                </CardTitle>
                                {t.subject && <p className="text-sm text-gray-500 font-medium mt-1">Subj: {t.subject}</p>}
                            </CardHeader>
                            <CardContent>
                                <p className="text-gray-700 text-sm line-clamp-4 bg-slate-50 p-3 rounded-md border">{t.body}</p>
                                {t.variables && (
                                    <div className="mt-4 flex flex-wrap gap-1">
                                        {Object.keys(t.variables).map(v => (
                                            <Badge key={v} variant="secondary" className="text-[10px] font-mono bg-blue-50 text-blue-700">
                                                {v}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
