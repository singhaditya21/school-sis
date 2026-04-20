import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getUniversityProgramsAction } from '@/lib/actions/higher_ed';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export default async function UniversityDashboard() {
    const programs = await getUniversityProgramsAction();

    return (
        <div className="max-w-7xl mx-auto p-8 space-y-8">
            <div>
                <h1 className="text-3xl font-black text-gray-900 mb-2">Higher Education Administration</h1>
                <p className="text-gray-500">Manage degree programs, credit distributions, and faculty research.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Link href="/university/courses">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                        <span className="text-4xl mb-4 block group-hover:scale-110 transition-transform">🎓</span>
                        <h3 className="text-xl font-semibold mb-2">Programs & Courses</h3>
                        <p className="text-gray-500 text-sm">Manage Bachelor, Master, and PhD program requirements and CBCS credits.</p>
                    </div>
                </Link>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                    <span className="text-4xl mb-4 block group-hover:scale-110 transition-transform">👨‍🏫</span>
                    <h3 className="text-xl font-semibold mb-2">Faculty Workload</h3>
                    <p className="text-gray-500 text-sm">Track professor assignments, research hours, and semester scheduling.</p>
                </div>
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                    <span className="text-4xl mb-4 block group-hover:scale-110 transition-transform">🔬</span>
                    <h3 className="text-xl font-semibold mb-2">Research Grants</h3>
                    <p className="text-gray-500 text-sm">Track institutional ethics committee (IEC) approvals and patent tracking.</p>
                </div>
            </div>

            <Card className="border-0 shadow-lg bg-white overflow-hidden mt-8">
                <CardHeader className="bg-gray-50 border-b border-gray-100 px-6 py-5 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-xl">Active Degree Programs</CardTitle>
                        <CardDescription>All academic programs governed by your institution.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white border-b border-gray-100 text-xs text-gray-500 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Program Name</th>
                                    <th className="px-6 py-4">Degree Type</th>
                                    <th className="px-6 py-4">Duration</th>
                                    <th className="px-6 py-4">Total Credits</th>
                                    <th className="px-6 py-4">Founded</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {programs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                            No degree programs configured yet. Create a program to start mapped courses.
                                        </td>
                                    </tr>
                                )}
                                {programs.map((prog) => (
                                    <tr key={prog.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="px-6 py-4 font-bold text-gray-900">{prog.name}</td>
                                        <td className="px-6 py-4">
                                            <Badge variant="outline" className={`${prog.degreeType === 'BACHELOR' ? 'bg-blue-50 text-blue-700 border-blue-200' : prog.degreeType === 'MASTER' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {prog.degreeType}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 font-medium">{prog.durationYears} Years</td>
                                        <td className="px-6 py-4 font-mono font-bold">{prog.totalCredits} Credits</td>
                                        <td className="px-6 py-4 text-gray-600 font-medium">{new Date(prog.createdAt).getFullYear()}</td>
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
