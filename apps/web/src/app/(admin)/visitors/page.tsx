import { Card, CardContent } from '@/components/ui/card';
import { getVisitors, getVisitorStats } from '@/lib/actions/visitor';

export default async function VisitorsPage() {
    const [visitorList, stats] = await Promise.all([
        getVisitors(),
        getVisitorStats(),
    ]);

    const purposeLabel = (p: string) => {
        const m: Record<string, string> = { MEETING: '🤝 Meeting', ADMISSION: '📝 Admission', DELIVERY: '📦 Delivery', INTERVIEW: '💼 Interview', PARENT_VISIT: '👨‍👩‍👧 Parent', VENDOR: '🔧 Vendor', OTHER: '📋 Other' };
        return m[p] || p;
    };

    const statusBadge = (s: string) => {
        const m: Record<string, string> = { CHECKED_IN: 'bg-green-100 text-green-700', CHECKED_OUT: 'bg-gray-100 text-gray-700', PRE_APPROVED: 'bg-blue-100 text-blue-700' };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[s] || 'bg-gray-100'}`}>{s.replace('_', ' ')}</span>;
    };

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">Visitor Management</h1><p className="text-gray-600 mt-1">Gate pass, check-in, and visitor tracking</p></div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Today</div><div className="text-2xl font-bold text-blue-600">{stats.todayTotal}</div></CardContent></Card>
                <Card className="border-2 border-green-200"><CardContent className="pt-4"><div className="text-sm text-gray-500">Currently In</div><div className="text-2xl font-bold text-green-600">{stats.currentlyIn}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Checked Out</div><div className="text-2xl font-bold text-gray-600">{stats.checkedOut}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Pre-Approved</div><div className="text-2xl font-bold text-indigo-600">{stats.preApproved}</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Visitor</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Purpose</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Host</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pass</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check In</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {visitorList.map(v => (
                                <tr key={v.id} className={`hover:bg-gray-50 ${v.status === 'CHECKED_IN' ? 'bg-green-50' : ''}`}>
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{v.name}</div>
                                        <div className="text-xs text-gray-500">{v.phone}{v.company ? ` · ${v.company}` : ''}</div>
                                    </td>
                                    <td className="px-4 py-3 text-sm">{purposeLabel(v.purpose)}</td>
                                    <td className="px-4 py-3"><div className="text-sm">{v.hostName}</div><div className="text-xs text-gray-500">{v.hostDepartment}</div></td>
                                    <td className="px-4 py-3 font-mono text-sm">{v.visitorPass || '—'}</td>
                                    <td className="px-4 py-3 text-sm">{v.checkInTime ? new Date(v.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                    <td className="px-4 py-3">{statusBadge(v.status)}</td>
                                </tr>
                            ))}
                            {visitorList.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No visitors yet today.</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
