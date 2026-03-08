import { Card, CardContent } from '@/components/ui/card';
import { getAssignments, getHomeworkStats } from '@/lib/actions/homework';

export default async function HomeworkPage() {
    const [assignments, stats] = await Promise.all([getAssignments(), getHomeworkStats()]);

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">Homework & Assignments</h1><p className="text-gray-600 mt-1">Manage homework assignments and track submissions</p></div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Assignments</div><div className="text-2xl font-bold text-blue-600">{stats.totalAssignments}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Submissions</div><div className="text-2xl font-bold text-green-600">{stats.totalSubmissions}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Graded</div><div className="text-2xl font-bold text-purple-600">{stats.gradedSubmissions}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Pending Grading</div><div className="text-2xl font-bold text-orange-600">{stats.pendingGrading}</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="p-4 border-b"><h3 className="font-bold">All Assignments</h3></div>
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Max Marks</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {assignments.map(hw => {
                                const isDue = new Date(hw.dueDate) < new Date();
                                return (
                                    <tr key={hw.id} className={`hover:bg-gray-50 ${isDue ? 'bg-red-50' : ''}`}>
                                        <td className="px-4 py-3"><div className="font-medium">{hw.title}</div>{hw.description && <div className="text-xs text-gray-500 truncate max-w-xs">{hw.description}</div>}</td>
                                        <td className="px-4 py-3"><span className={`text-sm ${isDue ? 'text-red-600 font-semibold' : ''}`}>{hw.dueDate}</span></td>
                                        <td className="px-4 py-3 text-center">{hw.maxMarks || '—'}</td>
                                        <td className="px-4 py-3 text-sm text-gray-500">{new Date(hw.createdAt).toLocaleDateString('en-IN')}</td>
                                    </tr>
                                );
                            })}
                            {assignments.length === 0 && <tr><td colSpan={4} className="px-4 py-12 text-center text-gray-400">No assignments yet.</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
