import { Card, CardContent } from '@/components/ui/card';
import { getLessonPlans } from '@/lib/actions/lessonPlan';

export default async function LessonPlansPage() {
    const plans = await getLessonPlans();

    const statusBadge = (s: string) => {
        const m: Record<string, string> = { DRAFT: 'bg-gray-100 text-gray-700', SUBMITTED: 'bg-blue-100 text-blue-700', APPROVED: 'bg-green-100 text-green-700', COMPLETED: 'bg-purple-100 text-purple-700' };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[s] || 'bg-gray-100'}`}>{s}</span>;
    };

    const stats = {
        total: plans.length,
        draft: plans.filter(p => p.status === 'DRAFT').length,
        approved: plans.filter(p => p.status === 'APPROVED').length,
        completed: plans.filter(p => p.status === 'COMPLETED').length,
    };

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">Lesson Plans</h1><p className="text-gray-600 mt-1">Curriculum mapping and lesson planning</p></div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Plans</div><div className="text-2xl font-bold text-blue-600">{stats.total}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Draft</div><div className="text-2xl font-bold text-gray-600">{stats.draft}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Approved</div><div className="text-2xl font-bold text-green-600">{stats.approved}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Completed</div><div className="text-2xl font-bold text-purple-600">{stats.completed}</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Topic</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Week</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Duration</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {plans.map(p => (
                                <tr key={p.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3"><div className="font-medium">{p.topic}</div>{p.objectives && <div className="text-xs text-gray-500 truncate max-w-md">{p.objectives}</div>}</td>
                                    <td className="px-4 py-3 text-center">{p.weekNumber || '—'}</td>
                                    <td className="px-4 py-3 text-center">{p.duration ? `${p.duration}m` : '—'}</td>
                                    <td className="px-4 py-3">{statusBadge(p.status)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(p.createdAt).toLocaleDateString('en-IN')}</td>
                                </tr>
                            ))}
                            {plans.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No lesson plans yet.</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
