import { Card, CardContent } from '@/components/ui/card';
import { getQuizzes, getQuizStats } from '@/lib/actions/quiz';

export default async function QuizPage() {
    const [quizList, stats] = await Promise.all([getQuizzes(), getQuizStats()]);

    const statusBadge = (s: string) => {
        const m: Record<string, string> = { DRAFT: 'bg-gray-100 text-gray-700', PUBLISHED: 'bg-green-100 text-green-700', CLOSED: 'bg-red-100 text-red-700' };
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m[s] || 'bg-gray-100'}`}>{s}</span>;
    };

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">Online Quizzes</h1><p className="text-gray-600 mt-1">Create, publish, and manage online assessments</p></div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Quizzes</div><div className="text-2xl font-bold text-blue-600">{stats.total}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Published</div><div className="text-2xl font-bold text-green-600">{stats.published}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Draft</div><div className="text-2xl font-bold text-gray-600">{stats.draft}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Closed</div><div className="text-2xl font-bold text-red-600">{stats.closed}</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Duration</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Marks</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {quizList.map(q => (
                                <tr key={q.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium">{q.title}</td>
                                    <td className="px-4 py-3 text-center">{q.duration} min</td>
                                    <td className="px-4 py-3 text-center">{q.totalMarks}</td>
                                    <td className="px-4 py-3">{statusBadge(q.status)}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(q.createdAt).toLocaleDateString('en-IN')}</td>
                                </tr>
                            ))}
                            {quizList.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No quizzes yet. Create your first quiz!</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
