import { Card, CardContent } from '@/components/ui/card';
import { getIncidents, getHealthStats } from '@/lib/actions/health';

export default async function HealthPage() {
    const [incidents, stats] = await Promise.all([
        getIncidents(),
        getHealthStats(),
    ]);

    const typeColor = (t: string) => {
        const m: Record<string, string> = { INJURY: 'bg-red-100 text-red-700', ILLNESS: 'bg-orange-100 text-orange-700', ALLERGY: 'bg-yellow-100 text-yellow-700', EMERGENCY: 'bg-red-200 text-red-800', OTHER: 'bg-gray-100 text-gray-700' };
        return m[t] || 'bg-gray-100 text-gray-700';
    };

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">Health & Medical</h1><p className="text-gray-600 mt-1">Student health records, incidents, and immunizations</p></div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Students w/ Records</div><div className="text-2xl font-bold text-blue-600">{stats.studentsWithRecords}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Incidents</div><div className="text-2xl font-bold text-orange-600">{stats.totalIncidents}</div></CardContent></Card>
                <Card className="border-2 border-red-200"><CardContent className="pt-4"><div className="text-sm text-gray-500">Today&apos;s Incidents</div><div className="text-2xl font-bold text-red-600">{stats.todayIncidents}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Immunizations</div><div className="text-2xl font-bold text-green-600">{stats.totalImmunizations}</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="p-4 border-b"><h3 className="font-bold">Recent Incidents</h3></div>
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action Taken</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Parent</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {incidents.map(inc => (
                                <tr key={inc.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium">{inc.studentName}</td>
                                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor(inc.type)}`}>{inc.type}</span></td>
                                    <td className="px-4 py-3 text-sm max-w-xs truncate">{inc.description}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">{inc.actionTaken || '—'}</td>
                                    <td className="px-4 py-3 text-sm">{new Date(inc.incidentDate).toLocaleDateString('en-IN')}</td>
                                    <td className="px-4 py-3 text-center">{inc.parentNotified ? '✅' : '❌'}</td>
                                </tr>
                            ))}
                            {incidents.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No health incidents recorded.</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
