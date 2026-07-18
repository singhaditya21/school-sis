import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdvancedGradebook } from '@/lib/actions/exams';
import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default async function GradebookPage({ searchParams }: { searchParams: Promise<{ subjectId?: string; gradeId?: string }> }) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const resolvedParams = await searchParams;
    const subjectId = resolvedParams?.subjectId || '';
    const gradeId = resolvedParams?.gradeId || '';

    let gradebookData = null;
    let errorMsg = '';
    if (subjectId && gradeId) {
        try {
            gradebookData = await getAdvancedGradebook(subjectId, gradeId);
        } catch (err) {
            errorMsg = (err as { message?: string }).message || 'An error occurred';
        }
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Advanced CBCS Gradebook</h1>
                    <p className="text-gray-500 mt-1">Manage Choice Based Credit System assessments, relative grading curves, and GPA computations.</p>
                </div>
                <div className="flex gap-3">
                    <select className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        <option>Select a class...</option>
                        {/* We would dynamically load teacher's classes here */}
                        <option value="CS301">CS301: Data Structures</option>
                        <option value="CS302">CS302: Operating Systems</option>
                    </select>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        Publish Final Grades
                    </button>
                </div>
            </div>

            {!gradebookData ? (
                <Card className="border border-gray-200 shadow-sm p-12 text-center text-gray-500">
                    <div className="text-4xl mb-4">📚</div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">No Class Selected</h3>
                    <p>Select a subject and grade from the dropdown above to view the gradebook.</p>
                    <div className="mt-4 text-xs">
                        (Demo Hint: Provide ?subjectId=...&gradeId=... in the URL to view live data)
                    </div>
                </Card>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <Card className="col-span-1 lg:col-span-3">
                    <CardHeader className="bg-gray-50 border-b border-gray-200 flex flex-row justify-between items-center py-4">
                        <CardTitle className="text-lg">Continuous Assessment Matrix</CardTitle>
                        <div className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded border border-gray-200">
                            Credits: <span className="text-gray-900">4.0</span>
                        </div>
                    </CardHeader>
                    <div className="overflow-x-auto">
                        <Table className="w-full text-sm text-left">
                            <TableHeader className="bg-gray-50/50 border-b border-gray-200 text-xs text-gray-500 font-semibold uppercase">
                                <TableRow>
                                    <TableHead className="px-4 py-3 sticky left-0 bg-gray-50/50 min-w-[200px]">Student</TableHead>
                                    {gradebookData.schedules.map(sched => (
                                        <TableHead key={sched.id} className="px-4 py-3 text-center">
                                            {sched.examType}
                                            <br/><span className="text-[10px] font-normal">/{sched.maxMarks}</span>
                                        </TableHead>
                                    ))}
                                    <TableHead className="px-4 py-3 text-center bg-gray-100">Total<br/><span className="text-[10px] font-normal">/100</span></TableHead>
                                    <TableHead className="px-4 py-3 text-center sticky right-0 bg-gray-50/50 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.1)]">Absolute<br/>Grade</TableHead>
                                    <TableHead className="px-4 py-3 text-center sticky right-0 bg-emerald-50/50 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.1)]">Relative<br/>Grade (Z)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody className="divide-y divide-gray-100">
                                {gradebookData.rows.length === 0 ? (
                                    <TableRow><TableCell colSpan={10} className="p-8 text-center text-gray-500">No students enrolled in this grade.</TableCell></TableRow>
                                ) : (
                                gradebookData.rows.map((s, i) => (
                                    <TableRow key={i} className="hover:bg-gray-50/50 transition-colors">
                                        <TableCell className="px-4 py-3 sticky left-0 bg-white">
                                            <div className="font-semibold text-gray-900">{s.student.firstName} {s.student.lastName}</div>
                                            <div className="text-xs text-gray-500 font-mono">{s.student.admissionNumber}</div>
                                        </TableCell>
                                        {gradebookData.schedules.map(sched => (
                                            <TableCell key={sched.id} className="px-4 py-3 text-center">
                                                <input type="text" defaultValue={s.examScores[sched.examType] || 0} className="w-12 text-center border border-transparent hover:border-gray-300 focus:border-blue-500 rounded p-1" />
                                            </TableCell>
                                        ))}
                                        <TableCell className="px-4 py-3 text-center bg-gray-50 font-bold text-gray-900">{s.total}</TableCell>
                                        <TableCell className="px-4 py-3 text-center sticky right-0 bg-white shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
                                            <Badge variant="outline" className="font-bold text-gray-700">{s.absoluteGrade}</Badge>
                                        </TableCell>
                                        <TableCell className="px-4 py-3 text-center sticky right-0 bg-emerald-50/40 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
                                            <Badge variant="default" className="font-bold bg-emerald-600 hover:bg-emerald-600 text-white">{s.relativeGrade}</Badge>
                                            <div className="text-[10px] text-emerald-600/70 mt-1">z={s.zScore}</div>
                                        </TableCell>
                                    </TableRow>
                                )))}
                            </TableBody>
                        </Table>
                    </div>
                </Card>

                <div className="space-y-6">
                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Class Analytics</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">Class Average</span>
                                <span className="font-semibold text-gray-900">{gradebookData.stats.average}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">Standard Deviation</span>
                                <span className="font-medium text-gray-600">σ = {gradebookData.stats.stdDev}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">Highest Score</span>
                                <span className="font-semibold text-emerald-600">{gradebookData.stats.highest}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">Failing (D, F)</span>
                                <span className="font-semibold text-rose-500">{gradebookData.stats.failing} Students</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
                        <CardContent className="p-5">
                            <h3 className="font-semibold text-gray-900 mb-2">Automated Grading Curve</h3>
                            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                                Based on the calculated standard deviation ($\sigma={gradebookData.stats.stdDev}$), the `AcademAgent` recommends applying a relative bell curve pushing the average to a B tier.
                            </p>
                            <button className="w-full bg-white hover:bg-gray-50 text-indigo-700 border border-indigo-200 font-medium py-2 rounded-lg text-sm transition-colors shadow-sm">
                                Apply Relative Grading
                            </button>
                        </CardContent>
                    </Card>
                </div>
            </div>
            )}
        </div>
    );
}
