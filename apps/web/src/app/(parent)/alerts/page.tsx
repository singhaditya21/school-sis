import { Card, CardContent } from '@/components/ui/card';
import { getParentAlerts, ParentAlert } from '@/lib/services/parent/parent.service';
import { redirect } from 'next/navigation';

function timeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just Now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 7)}w ago`;
}

function getAlertStyle(channel: string): { border: string; bg: string; icon: string } {
    switch (channel) {
        case 'SMS': return { border: 'border-l-rose-500 border-rose-200', bg: 'bg-rose-100', icon: '📱' };
        case 'PUSH': return { border: 'border-l-rose-500 border-rose-200', bg: 'bg-rose-100', icon: '🔔' };
        case 'EMAIL': return { border: 'border-l-indigo-500 border-indigo-200', bg: 'bg-indigo-100', icon: '📧' };
        case 'WHATSAPP': return { border: 'border-l-emerald-500 border-emerald-200', bg: 'bg-emerald-100', icon: '💬' };
        default: return { border: 'border-l-amber-500 border-amber-200', bg: 'bg-amber-100', icon: '📋' };
    }
}

export default async function AlertsPage() {
    let alerts: ParentAlert[] = [];
    try {
        alerts = await getParentAlerts();
    } catch {
        redirect('/login');
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <span className="text-rose-500">🔔</span> Real-Time Smart Alerts
                    </h1>
                    <p className="text-gray-500 mt-1">Notifications sent to you by the school.</p>
                </div>
            </div>

            <div className="space-y-4">
                {alerts.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">🔕</div>
                        <p className="text-gray-500 font-medium">No alerts yet</p>
                        <p className="text-gray-400 text-sm mt-1">You&apos;ll see notifications here when the school sends them.</p>
                    </div>
                ) : (
                    alerts.map((alert) => {
                        const style = getAlertStyle(alert.channel);
                        return (
                            <Card key={alert.id} className={`border-l-4 ${style.border} shadow-sm`}>
                                <CardContent className="p-5 flex items-start gap-4">
                                    <div className={`w-10 h-10 rounded-full ${style.bg} flex items-center justify-center text-xl shrink-0`}>
                                        {style.icon}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <h3 className="font-semibold text-gray-900 text-lg leading-tight">
                                                {alert.subject || 'Notification'}
                                            </h3>
                                            <span className="text-xs text-gray-500 font-medium shrink-0 ml-4">
                                                {timeAgo(alert.sentAt || alert.createdAt)}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">{alert.body}</p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded uppercase font-medium">
                                                {alert.channel}
                                            </span>
                                            <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-medium ${
                                                alert.status === 'SENT' || alert.status === 'DELIVERED'
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : alert.status === 'FAILED'
                                                    ? 'bg-red-100 text-red-700'
                                                    : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {alert.status}
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })
                )}

                <div className="text-center pt-8">
                    <p className="text-xs text-gray-400 font-medium">End of alerts history.</p>
                </div>
            </div>
        </div>
    );
}
