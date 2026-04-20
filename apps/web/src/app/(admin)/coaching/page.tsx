import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getActiveBatchesAction, getCoachingDashboardSummaryAction } from '@/lib/actions/coaching';

export default async function CoachingDashboard() {
    const batches = await getActiveBatchesAction();
    const summary = await getCoachingDashboardSummaryAction();

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 bg-gray-50/20 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900">Coaching Institute Intelligence</h1>
                    <p className="text-gray-500 mt-2 text-base">Advanced Batch Management, Performance Analytics, and Competitive Exam Tracking.</p>
                </div>
                <div className="flex gap-3">
                    <Button variant="outline" className="bg-white">Configure Exam Targets</Button>
                    <Button className="bg-indigo-600 hover:bg-indigo-700">Create New Batch</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="border-none shadow-md overflow-hidden bg-white group hover:shadow-lg transition-all">
                    <div className="h-2 w-full bg-blue-500 group-hover:bg-blue-600 transition-colors"></div>
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="text-3xl mb-4 bg-blue-50 w-14 h-14 rounded-2xl flex items-center justify-center border border-blue-100">👥</div>
                            <Badge variant="secondary" className="bg-green-50 text-green-700 font-semibold tracking-wide">{summary.activeBatches} Active</Badge>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Live Batches</h3>
                        <p className="text-gray-500 text-sm leading-relaxed">View all intensive academic cohorts currently operational.</p>
                        <div className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center cursor-pointer">
                            Manage Rosters <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-md overflow-hidden bg-white group hover:shadow-lg transition-all">
                    <div className="h-2 w-full bg-purple-500 group-hover:bg-purple-600 transition-colors"></div>
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="text-3xl mb-4 bg-purple-50 w-14 h-14 rounded-2xl flex items-center justify-center border border-purple-100">📝</div>
                            <Badge variant="secondary" className="bg-orange-50 text-orange-700 font-semibold tracking-wide">{summary.upcomingTests} Upcoming</Badge>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Test Series</h3>
                        <p className="text-gray-500 text-sm leading-relaxed">AI-tracked mock exams and continuous assessment algorithms.</p>
                        <div className="mt-4 text-sm font-semibold text-purple-600 hover:text-purple-800 flex items-center cursor-pointer">
                            View Schedule <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-md overflow-hidden bg-white group hover:shadow-lg transition-all">
                    <div className="h-2 w-full bg-teal-500 group-hover:bg-teal-600 transition-colors"></div>
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="text-3xl mb-4 bg-teal-50 w-14 h-14 rounded-2xl flex items-center justify-center border border-teal-100">🎯</div>
                            <Badge variant="secondary" className="bg-red-50 text-red-700 font-semibold tracking-wide">14 Unresolved</Badge>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Doubt Hub</h3>
                        <p className="text-gray-500 text-sm leading-relaxed">Queue of student queries waiting for SME resolution in Physics.</p>
                        <div className="mt-4 text-sm font-semibold text-teal-600 hover:text-teal-800 flex items-center cursor-pointer">
                            Clear Queue <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-none shadow-md overflow-hidden bg-white group hover:shadow-lg transition-all">
                    <div className="h-2 w-full bg-orange-500 group-hover:bg-orange-600 transition-colors"></div>
                    <CardContent className="p-6">
                        <div className="flex justify-between items-start">
                            <div className="text-3xl mb-4 bg-orange-50 w-14 h-14 rounded-2xl flex items-center justify-center border border-orange-100">📈</div>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">AI Rank Predictor</h3>
                        <p className="text-gray-500 text-sm leading-relaxed">Model updated 2 hours ago using latest AITS performance data vectors.</p>
                        <div className="mt-4 text-sm font-semibold text-orange-600 hover:text-orange-800 flex items-center cursor-pointer">
                            Run Simulations <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-0 shadow-lg bg-white overflow-hidden mt-8">
                <CardHeader className="bg-gray-50 border-b border-gray-100 px-6 py-5 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-xl">Target Batches</CardTitle>
                        <CardDescription>Monitor your high-performance cohorts.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white border-b border-gray-100 text-xs text-gray-500 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Batch Name</th>
                                    <th className="px-6 py-4">Target Exam</th>
                                    <th className="px-6 py-4">Occupancy</th>
                                    <th className="px-6 py-4">Avg Percentile</th>
                                    <th className="px-6 py-4">Next Mock Test</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {batches.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            No active batches found. Create your first batch to start operations.
                                        </td>
                                    </tr>
                                )}
                                {batches.map((batch) => (
                                    <tr key={batch.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-6 py-4 font-bold text-gray-900">{batch.name}</td>
                                        <td className="px-6 py-4">
                                            <Badge variant="outline" className={`${batch.targetExam.includes('JEE') ? 'bg-blue-50 border-blue-200 text-blue-700' : batch.targetExam.includes('NEET') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-purple-50 border-purple-200 text-purple-700'}`}>
                                                {batch.targetExam}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-full bg-gray-200 rounded-full h-2 min-w-[60px]">
                                                    <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `75%` }}></div>
                                                </div>
                                                <span className="text-xs font-semibold text-gray-600">Pending</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-mono font-bold text-gray-900">-- %ile</span>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 font-medium">
                                            {batch.startDate && new Date(batch.startDate).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <Button variant="ghost" size="sm" className="hidden lg:inline-flex text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 font-semibold">View Analytics</Button>
                                            <Button variant="outline" size="sm" className="font-semibold">Edit</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
