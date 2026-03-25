import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function FacultyWorkloadPage() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Advanced HR & Faculty Workloads</h1>
                    <p className="text-gray-500 mt-1">Manage teaching allocations, CPD certs, and visiting faculty contracts.</p>
                </div>
                <div className="flex gap-3">
                    <select className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                        <option>Department: Computer Science</option>
                        <option>Department: Mathematics</option>
                        <option>Department: Physics</option>
                    </select>
                    <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        Auto-Balance Workloads
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Total Full-Time Faculty</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">42</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Visiting / Adjunct</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">18</div>
                    </CardContent>
                </Card>
                <Card className="border-amber-200 bg-amber-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-amber-600 uppercase tracking-widest">Overloaded Faculty</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">3</div>
                        <p className="text-xs text-amber-600/80 mt-1">&gt; 24 hours/week teaching load</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Avg CPD Hours</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">14.2</div>
                        <p className="text-xs text-emerald-600 font-medium mt-1">Target: 20 hrs/year</p>
                    </CardContent>
                </Card>
            </div>

            {/* Workload Matrix */}
            <Card className="overflow-hidden">
                <CardHeader className="bg-gray-50 border-b border-gray-200">
                    <CardTitle className="text-lg">Faculty Load & Certifications</CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50/50 border-b border-gray-200 text-xs text-gray-500 font-semibold uppercase">
                            <tr>
                                <th className="px-6 py-4">Faculty Member</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Allocation (Hrs/Wk)</th>
                                <th className="px-6 py-4">Subject Tags</th>
                                <th className="px-6 py-4">CPD Status</th>
                                <th className="px-6 py-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {[
                                { name: 'Dr. Anita Desai', role: 'Head of CS', type: 'Full-Time', hours: 16, tags: ['Algorithms', 'AI'], cpd: 24, status: 'BALANCED' },
                                { name: 'Rahul Sharma', role: 'Asst. Professor', type: 'Full-Time', hours: 26, tags: ['Data Structs', 'Web Dev'], cpd: 12, status: 'OVERLOAD' },
                                { name: 'Prof. James Cooper', role: 'Industry Expert', type: 'Visiting', hours: 6, tags: ['Cloud Architecture'], cpd: 0, status: 'BALANCED' },
                                { name: 'Megha Gupta', role: 'Tutor', type: 'Contractor', hours: 22, tags: ['Python Basics', 'Labs'], cpd: 8, status: 'BALANCED' },
                            ].map((f, i) => (
                                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{f.name}</div>
                                        <div className="text-xs text-gray-500">{f.role}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-medium">{f.type}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-full bg-gray-200 rounded-full h-2 min-w-[100px] max-w-[150px]">
                                                <div className={`h-2 rounded-full ${f.hours > 24 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min((f.hours / 30) * 100, 100)}%` }}></div>
                                            </div>
                                            <span className={`font-semibold ${f.hours > 24 ? 'text-amber-600' : 'text-gray-700'}`}>{f.hours}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-1 flex-wrap">
                                            {f.tags.map((t, idx) => (
                                                <span key={idx} className="bg-blue-50 border border-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-semibold">{t}</span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className={`font-medium ${f.cpD >= 20 ? 'text-emerald-600' : 'text-gray-600'}`}>{f.cpd} hrs</span>
                                            {f.cpd >= 20 && <span className="text-emerald-500">✓</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                            f.status === 'BALANCED' ? 'bg-emerald-100 text-emerald-700' : 
                                            'bg-amber-100 text-amber-700 shadow-sm border border-amber-200'
                                        }`}>
                                            {f.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
