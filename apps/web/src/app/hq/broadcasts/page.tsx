'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createBroadcastAction } from '@/lib/actions/platform-broadcasts';

export default function BroadcastsPage() {
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [type, setType] = useState('INFO');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setResult(null);

        const formData = new FormData();
        formData.set('title', title);
        formData.set('message', message);
        formData.set('type', type);

        const res = await createBroadcastAction(formData);
        if (res?.error) setResult(`Error: ${res.error}`);
        else {
            setResult('Broadcast published successfully.');
            setTitle('');
            setMessage('');
        }
        setSubmitting(false);
    }

    return (
        <div className="space-y-8 max-w-4xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white">Platform Broadcasts</h1>
                <p className="text-slate-400 mt-1">Push system-wide announcements to all tenant dashboards.</p>
            </div>

            <Card className="bg-slate-800/50 border-slate-700 text-slate-100">
                <CardHeader><CardTitle>Create New Broadcast</CardTitle></CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="text-sm font-medium text-slate-300 block mb-2">Title</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                placeholder="e.g., Scheduled Maintenance Window"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-300 block mb-2">Message</label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                required
                                rows={4}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                                placeholder="Detailed broadcast message..."
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-300 block mb-2">Severity Type</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="INFO">INFO — General Announcement</option>
                                <option value="WARNING">WARNING — Action Recommended</option>
                                <option value="MAINTENANCE">MAINTENANCE — Scheduled Downtime</option>
                                <option value="CRITICAL">CRITICAL — Immediate Attention</option>
                            </select>
                        </div>

                        {result && (
                            <p className={`text-sm font-medium ${result.startsWith('Error') ? 'text-rose-400' : 'text-emerald-400'}`}>{result}</p>
                        )}

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors"
                        >
                            {submitting ? 'Publishing...' : 'Publish Broadcast'}
                        </button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
