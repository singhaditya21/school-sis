import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function GradebookPage() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Advanced CBCS Gradebook</h1>
                    <p className="text-gray-500 mt-1">Manage Choice Based Credit System assessments, relative grading curves, and GPA computations.</p>
                </div>
                <div className="flex gap-3">
                    <select className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        <option>CS301: Data Structures</option>
                        <option>CS302: Operating Systems</option>
                    </select>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        Publish Final Grades
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <Card className="col-span-1 lg:col-span-3">
                    <CardHeader className="bg-gray-50 border-b border-gray-200 flex flex-row justify-between items-center py-4">
                        <CardTitle className="text-lg">Section A - Continuous Assessment Matrix</CardTitle>
                        <div className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded border border-gray-200">
                            Credits: <span className="text-gray-900">4.0</span>
                        </div>
                    </CardHeader>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50/50 border-b border-gray-200 text-xs text-gray-500 font-semibold uppercase">
                                <tr>
                                    <th className="px-4 py-3 sticky left-0 bg-gray-50/50 min-w-[200px]">Student</th>
                                    <th className="px-4 py-3 text-center">Quiz 1<br/><span className="text-[10px] font-normal">/10%</span></th>
                                    <th className="px-4 py-3 text-center">Quiz 2<br/><span className="text-[10px] font-normal">/10%</span></th>
                                    <th className="px-4 py-3 text-center bg-blue-50/50">Midsem<br/><span className="text-[10px] font-normal">/30%</span></th>
                                    <th className="px-4 py-3 text-center">Project<br/><span className="text-[10px] font-normal">/10%</span></th>
                                    <th className="px-4 py-3 text-center bg-indigo-50/50">Endsem<br/><span className="text-[10px] font-normal">/40%</span></th>
                                    <th className="px-4 py-3 text-center bg-gray-100">Total<br/><span className="text-[10px] font-normal">/100</span></th>
                                    <th className="px-4 py-3 text-center sticky right-0 bg-gray-50/50 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.1)]">Absolute<br/>Grade</th>
                                    <th className="px-4 py-3 text-center sticky right-0 bg-emerald-50/50 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.1)]">Relative<br/>Grade (Z)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {[
                                    { name: 'Aarav Sharma', id: '2023CS001', q1: 8, q2: 9, mid: 25, proj: 9, end: 35, total: 86, grade: 'A', rel: 'A+', z: 1.8 },
                                    { name: 'Priya Patel', id: '2023CS002', q1: 7, q2: 6, mid: 18, proj: 8, end: 28, total: 67, grade: 'B', rel: 'B', z: 0.2 },
                                    { name: 'Rohan Verma', id: '2023CS003', q1: 4, q2: 5, mid: 12, proj: 6, end: 22, total: 49, grade: 'C', rel: 'B-', z: -0.8 },
                                    { name: 'Neha Gupta', id: '2023CS004', q1: 9, q2: 9, mid: 28, proj: 10, end: 38, total: 94, grade: 'A+', rel: 'A+', z: 2.4 },
                                ].map((s, i) => (
                                    <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-4 py-3 sticky left-0 bg-white">
                                            <div className="font-semibold text-gray-900">{s.name}</div>
                                            <div className="text-xs text-gray-500 font-mono">{s.id}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <input type="text" defaultValue={s.q1} className="w-12 text-center border border-transparent hover:border-gray-300 focus:border-blue-500 rounded p-1" />
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <input type="text" defaultValue={s.q2} className="w-12 text-center border border-transparent hover:border-gray-300 focus:border-blue-500 rounded p-1" />
                                        </td>
                                        <td className="px-4 py-3 text-center bg-blue-50/30">
                                            <input type="text" defaultValue={s.mid} className="w-12 text-center border border-transparent hover:border-gray-300 focus:border-blue-500 rounded p-1 font-medium text-blue-800" />
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <input type="text" defaultValue={s.proj} className="w-12 text-center border border-transparent hover:border-gray-300 focus:border-blue-500 rounded p-1" />
                                        </td>
                                        <td className="px-4 py-3 text-center bg-indigo-50/30">
                                            <input type="text" defaultValue={s.end} className="w-12 text-center border border-transparent hover:border-gray-300 focus:border-blue-500 rounded p-1 font-medium text-indigo-800" />
                                        </td>
                                        <td className="px-4 py-3 text-center bg-gray-50 font-bold text-gray-900">{s.total}</td>
                                        <td className="px-4 py-3 text-center sticky right-0 bg-white shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
                                            <span className="font-bold text-gray-700">{s.grade}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center sticky right-0 bg-emerald-50/40 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
                                            <div className="font-bold text-emerald-700">{s.rel}</div>
                                            <div className="text-[10px] text-emerald-600/70">z={s.z}</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                                <span className="font-semibold text-gray-900">74.0 / 100</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">Standard Deviation</span>
                                <span className="font-medium text-gray-600">σ = 14.8</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">Highest Score</span>
                                <span className="font-semibold text-emerald-600">94 (Neha G.)</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">Failing (&lt; 40)</span>
                                <span className="font-semibold text-rose-500">0 Students</span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
                        <CardContent className="p-5">
                            <h3 className="font-semibold text-gray-900 mb-2">Automated Grading Curve</h3>
                            <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                                Curving is currently disabled. Based on the calculated standard deviation ($\sigma=14.8$), the `AcademAgent` recommends applying a relative bell curve pushing the average to a B tier.
                            </p>
                            <button className="w-full bg-white hover:bg-gray-50 text-indigo-700 border border-indigo-200 font-medium py-2 rounded-lg text-sm transition-colors shadow-sm">
                                Apply Relative Grading
                            </button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
