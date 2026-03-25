import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';

export default async function StudentWelfarePage({ params }: { params: { id: string } }) {
    // Generate mock student ID using params or fallback
    const studentId = params.id || '2023CS001';
    
    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            {/* Context Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-gray-200">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xl font-bold uppercase">
                        AS
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Aarav Sharma</h1>
                        <p className="text-gray-500 mt-1 flex items-center gap-2">
                            <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{studentId}</span>
                            <span>• B.Tech Computer Science</span>
                            <span>• Year 2</span>
                        </p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <Link href={`/students/${studentId}`} className="text-sm font-medium text-gray-600 bg-white border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                        Academic Profile
                    </Link>
                    <button className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                        Escalate to Counselor
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* SynthesisAgent Welfare Profile */}
                <Card className="col-span-1 lg:col-span-2 border-rose-100 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <span className="text-8xl">⚠️</span>
                    </div>
                    <CardHeader className="pb-2 relative z-10 border-b border-gray-100">
                        <div className="flex justify-between items-start">
                            <CardTitle className="text-lg text-rose-900 flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></div>
                                AI Welfare Risk Assessment
                            </CardTitle>
                            <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2.5 py-1 rounded uppercase tracking-wider">High Risk</span>
                        </div>
                        <CardDescription className="text-rose-700/80 mt-1">
                            SynthesisAgent detected intersecting anomalies across 3 domains.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4 relative z-10">
                        <p className="text-sm text-gray-700 leading-relaxed mb-6">
                            <strong>System Conclusion:</strong> Aarav has shown a significant drop in both attendance and academic performance over the last 14 days, which correlates with an uncharacteristic delay in hostel fee payments. This triad indicates potential financial stress or personal hardship affecting wellbeing.
                        </p>

                        <h4 className="font-semibold text-gray-900 uppercase tracking-widest text-xs mb-3">Intersecting Weak Signals</h4>
                        <div className="space-y-3">
                            <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="mt-0.5 text-amber-500">📉</div>
                                <div>
                                    <h4 className="font-medium text-sm text-gray-900">AcademAgent Signal</h4>
                                    <p className="text-xs text-gray-500 mt-1">Midsem score dropped 42% compared to Quiz 1 & 2 averages in Data Structures.</p>
                                </div>
                            </div>
                            
                            <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="mt-0.5 text-rose-500">🚫</div>
                                <div>
                                    <h4 className="font-medium text-sm text-gray-900">AttendAgent Signal</h4>
                                    <p className="text-xs text-gray-500 mt-1">Missed 4 consecutive morning lectures across Mon-Wed. Previous term attendance was 94%.</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="mt-0.5 text-indigo-500">💸</div>
                                <div>
                                    <h4 className="font-medium text-sm text-gray-900">FeeAgent Signal</h4>
                                    <p className="text-xs text-gray-500 mt-1">Q3 Hostel Installment is 9 days overdue. Historically, Aarav's fees are paid 5 days early.</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Response / Interventions Log */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader className="bg-gray-50 border-b border-gray-200 pb-3">
                            <CardTitle className="text-sm font-semibold text-gray-700">Recommended Interventions</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="divide-y divide-gray-100">
                                <div className="p-4 hover:bg-gray-50 cursor-pointer">
                                    <p className="text-sm font-medium text-blue-700">Schedule 1:1 welfare check-in</p>
                                    <p className="text-xs text-gray-500 mt-1">Recommended by Faculty Advisor.</p>
                                </div>
                                <div className="p-4 hover:bg-gray-50 cursor-pointer">
                                    <p className="text-sm font-medium text-gray-700">Acknowledge fee grace period</p>
                                    <p className="text-xs text-gray-500 mt-1">Route to Financial Dept.</p>
                                </div>
                                <div className="p-4 hover:bg-gray-50 cursor-pointer">
                                    <p className="text-sm font-medium text-rose-700">Escalate to Campus Counselor</p>
                                    <p className="text-xs text-rose-600/70 mt-1">Crisis intervention protocol.</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Past Welfare Log</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                                
                                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                    <div className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-white bg-slate-300 group-[.is-active]:bg-emerald-500 text-slate-500 group-[.is-active]:text-emerald-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2"></div>
                                    <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] ml-4 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="font-semibold text-gray-900 text-xs">Medical Leave Approved</div>
                                            <time className="text-[10px] text-gray-500">12 Oct 2025</time>
                                        </div>
                                        <div className="text-xs text-gray-600 mb-2">Recovering from viral fever.</div>
                                    </div>
                                </div>

                                <div className="text-center mt-3">
                                    <span className="text-xs text-gray-400 font-medium bg-gray-50 px-2 py-1 rounded">No earlier records</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
