import { Card, CardContent } from '@/components/ui/card';
import { getAlumni, getAlumniEvents, getAlumniStats } from '@/lib/actions/alumni';

export default async function AlumniPage() {
    const [alumniList, events, stats] = await Promise.all([getAlumni(), getAlumniEvents(), getAlumniStats()]);

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">Alumni Network</h1><p className="text-gray-600 mt-1">Alumni directory, events, and engagement</p></div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Alumni</div><div className="text-2xl font-bold text-blue-600">{stats.total}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Verified</div><div className="text-2xl font-bold text-green-600">{stats.verified}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Pending</div><div className="text-2xl font-bold text-orange-600">{stats.pending}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Batches</div><div className="text-2xl font-bold text-purple-600">{stats.batches}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Events</div><div className="text-2xl font-bold text-indigo-600">{stats.upcomingEvents}</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="p-4 border-b"><h3 className="font-bold">Alumni Directory</h3></div>
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b"><tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Verified</th>
                        </tr></thead>
                        <tbody className="divide-y">
                            {alumniList.map(a => (
                                <tr key={a.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3"><div className="font-medium">{a.name}</div><div className="text-xs text-gray-500">{a.email}</div></td>
                                    <td className="px-4 py-3 font-semibold">{a.batch}</td>
                                    <td className="px-4 py-3"><div>{a.currentCompany || '—'}</div>{a.designation && <div className="text-xs text-gray-500">{a.designation}</div>}</td>
                                    <td className="px-4 py-3 text-sm">{a.location || '—'}</td>
                                    <td className="px-4 py-3 text-center">{a.isVerified ? '✅' : '⏳'}</td>
                                </tr>
                            ))}
                            {alumniList.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No alumni registered yet.</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
