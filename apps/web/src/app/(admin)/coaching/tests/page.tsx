import { getTestSeriesAction } from '@/lib/actions/coaching';
import { getSession } from '@/lib/auth/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default async function TestSeriesDashboard() {
    const session = await getSession();
    if (!session.tenantId) return <div>Unauthorized</div>;

    const tests = await getTestSeriesAction();


    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 bg-gray-50/20 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900">All India Test Series (AITS)</h1>
                    <p className="text-gray-500 mt-2 text-base">Schedule rank predictors, manage question banks, and sync OMR results.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" className="bg-white">OMR Scanner App</Button>
                    <Button className="bg-purple-600 hover:bg-purple-700">Schedule New Mock Test</Button>
                </div>
            </div>

            <Card className="border-0 shadow-lg bg-white overflow-hidden mt-8">
                <CardHeader className="bg-gray-50 border-b border-gray-100 px-6 py-5 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-xl">Upcoming & Completed Tests</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white border-b border-gray-100 text-xs text-gray-500 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Test Name (AITS)</th>
                                    <th className="px-6 py-4">Target Batch</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Total Marks</th>
                                    <th className="px-6 py-4">Date Scheduled</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {tests.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            No test series scheduled yet. Start by scheduling a Mock Exam.
                                        </td>
                                    </tr>
                                )}
                                {tests.map((test) => {
                                    const isPast = new Date(test.scheduledAt) < new Date();
                                    return (
                                        <tr key={test.id} className="hover:bg-gray-50 transition-colors group">
                                            <td className="px-6 py-4 font-bold text-gray-900">{test.testName}</td>
                                            <td className="px-6 py-4 text-gray-700 font-medium">{test.batchName}</td>
                                            <td className="px-6 py-4">
                                                <Badge variant="outline" className={isPast ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-green-50 text-green-700 border-green-200'}>
                                                    {isPast ? 'Awaiting OMR Results' : 'Scheduled'}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 font-mono font-bold text-gray-900">{test.totalMarks}</td>
                                            <td className="px-6 py-4 text-gray-600 font-medium">
                                                {new Date(test.scheduledAt).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                {isPast ? (
                                                    <Button variant="default" size="sm" className="bg-orange-600 hover:bg-orange-700 font-semibold">Upload Results</Button>
                                                ) : (
                                                    <Button variant="outline" size="sm" className="font-semibold">Modify</Button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
