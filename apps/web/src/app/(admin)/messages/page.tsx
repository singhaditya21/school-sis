import { Card, CardContent } from '@/components/ui/card';
import { getMessageLogs, getMessagingStats } from '@/lib/actions/messaging';

export default async function MessagesPage() {
    const [logs, stats] = await Promise.all([getMessageLogs(), getMessagingStats()]);

    const channelIcon = (c: string) => ({ SMS: '📱', WHATSAPP: '💬', EMAIL: '📧' }[c] || '📨');
    const statusBadge = (s: string) => {
        const m: Record<string, string> = { QUEUED: 'bg-yellow-100 text-yellow-700', SENT: 'bg-blue-100 text-blue-700', DELIVERED: 'bg-green-100 text-green-700', FAILED: 'bg-red-100 text-red-700' };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[s] || 'bg-gray-100'}`}>{s}</span>;
    };

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">Messages & Communication</h1><p className="text-gray-600 mt-1">Send SMS, WhatsApp, and emails to parents and staff</p></div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Templates</div><div className="text-2xl font-bold text-blue-600">{stats.templates}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Sent</div><div className="text-2xl font-bold text-purple-600">{stats.totalSent}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Delivered</div><div className="text-2xl font-bold text-green-600">{stats.delivered}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Failed</div><div className="text-2xl font-bold text-red-600">{stats.failed}</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="p-4 border-b"><h3 className="font-bold">Message Log</h3></div>
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b"><tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Recipients</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr></thead>
                        <tbody className="divide-y">
                            {logs.map(l => (
                                <tr key={l.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">{channelIcon(l.channel)} {l.channel}</td>
                                    <td className="px-4 py-3 text-sm max-w-xs truncate">{l.subject ? `[${l.subject}] ` : ''}{l.message}</td>
                                    <td className="px-4 py-3 text-center">{(l.recipients as string[])?.length || 0}</td>
                                    <td className="px-4 py-3 text-sm">{new Date(l.sentAt).toLocaleString('en-IN')}</td>
                                    <td className="px-4 py-3">{statusBadge(l.status)}</td>
                                </tr>
                            ))}
                            {logs.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No messages sent yet.</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
