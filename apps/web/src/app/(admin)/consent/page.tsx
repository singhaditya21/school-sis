import { Card, CardContent } from '@/components/ui/card';
import { getConsentForms, getConsentStats } from '@/lib/actions/consent';

export default async function ConsentPage() {
    const [forms, stats] = await Promise.all([getConsentForms(), getConsentStats()]);

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">Consent Management</h1><p className="text-gray-600 mt-1">Collect and track parent consent for activities, trips, and permissions</p></div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Forms</div><div className="text-2xl font-bold text-blue-600">{stats.totalForms}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Responses</div><div className="text-2xl font-bold text-purple-600">{stats.totalResponses}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Accepted</div><div className="text-2xl font-bold text-green-600">{stats.accepted}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Declined</div><div className="text-2xl font-bold text-red-600">{stats.declined}</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b"><tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Audience</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Active</th>
                        </tr></thead>
                        <tbody className="divide-y">
                            {forms.map(f => (
                                <tr key={f.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3"><div className="font-medium">{f.title}</div>{f.description && <div className="text-xs text-gray-500 truncate max-w-xs">{f.description}</div>}</td>
                                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-gray-100">{f.formType}</span></td>
                                    <td className="px-4 py-3 text-sm">{f.audience}</td>
                                    <td className="px-4 py-3 text-sm">{f.dueDate || '—'}</td>
                                    <td className="px-4 py-3 text-center">{f.isActive ? '✅' : '❌'}</td>
                                </tr>
                            ))}
                            {forms.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No consent forms yet.</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
