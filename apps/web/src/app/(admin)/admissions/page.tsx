import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function AdmissionsPipelinePage() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900">Admissions Pipeline</h1>
                    <p className="text-gray-500 mt-1">Multi-program intake management for University Degrees and Coaching Batches.</p>
                </div>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                    + New Application
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-blue-100 bg-blue-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-blue-600 uppercase tracking-widest">Active Leads</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">142</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Document Verifications</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">38</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Fee Deposits Pending</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">12</div>
                    </CardContent>
                </Card>
                <Card className="border-emerald-100 bg-emerald-50/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">Enrolled Today</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">5</div>
                    </CardContent>
                </Card>
            </div>

            {/* Kanban Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 overflow-x-auto pb-4">
                
                {/* Column 1: Lead Capture */}
                <div className="space-y-3 min-w-[280px]">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                            New Inquiries
                        </h3>
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-medium">24</span>
                    </div>
                    {[
                        { name: 'Aarav Sharma', program: 'JEE Target 2027', score: 'Mock: 140/300', date: 'Today, 10:30 AM' },
                        { name: 'Priya Patel', program: 'B.Tech CompSci', score: '12th: 92%', date: 'Yesterday' }
                    ].map((lead, i) => (
                        <Card key={i} className="hover:shadow-md transition-shadow cursor-grab border-gray-200">
                            <CardContent className="p-4">
                                <h4 className="font-semibold text-gray-900">{lead.name}</h4>
                                <p className="text-xs font-medium text-blue-600 mt-1 bg-blue-50 w-max px-2 py-0.5 rounded">{lead.program}</p>
                                <div className="flex justify-between items-center mt-3 text-xs text-gray-500">
                                    <span>{lead.score}</span>
                                    <span>{lead.date}</span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Column 2: Document Verification */}
                <div className="space-y-3 min-w-[280px]">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                            Document Verification
                        </h3>
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-medium">8</span>
                    </div>
                    {[
                        { name: 'Karan Singh', program: 'NEET Dropper', status: 'Aadhaar Pending', date: '2 days ago' },
                        { name: 'Neha Gupta', program: 'MBA Core', status: 'CAT Scorecard verified', date: '3 days ago' }
                    ].map((lead, i) => (
                        <Card key={i} className="hover:shadow-md transition-shadow cursor-grab border-amber-200 border-l-4 border-l-amber-400">
                            <CardContent className="p-4">
                                <h4 className="font-semibold text-gray-900">{lead.name}</h4>
                                <p className="text-xs font-medium text-blue-600 mt-1 bg-blue-50 w-max px-2 py-0.5 rounded">{lead.program}</p>
                                <div className="flex justify-between items-center mt-3 text-xs text-gray-500">
                                    <span className="text-amber-600 font-medium">{lead.status}</span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Column 3: Entrance / Interview */}
                <div className="space-y-3 min-w-[280px]">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                            Entrance & Interview
                        </h3>
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-medium">15</span>
                    </div>
                    {[
                        { name: 'Rohan Verma', program: 'JEE Target 2027', status: 'Scholarship Test Scheduled', date: 'Tomorrow, 2 PM' },
                    ].map((lead, i) => (
                        <Card key={i} className="hover:shadow-md transition-shadow cursor-grab border-purple-200 border-l-4 border-l-purple-400">
                            <CardContent className="p-4">
                                <h4 className="font-semibold text-gray-900">{lead.name}</h4>
                                <p className="text-xs font-medium text-blue-600 mt-1 bg-blue-50 w-max px-2 py-0.5 rounded">{lead.program}</p>
                                <div className="flex justify-between items-center mt-3 text-xs">
                                    <span className="text-purple-600 font-medium">{lead.status}</span>
                                </div>
                                <div className="mt-2 text-xs text-gray-500">{lead.date}</div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Column 4: Fee Deposit & Allocation */}
                <div className="space-y-3 min-w-[280px]">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            Enrollment Deposit
                        </h3>
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs font-medium">4</span>
                    </div>
                    {[
                        { name: 'Ananya Desai', program: 'B.Tech CompSci', status: 'Payment Link Sent', amount: '₹50,000' },
                    ].map((lead, i) => (
                        <Card key={i} className="hover:shadow-md transition-shadow cursor-grab border-emerald-200 border-l-4 border-l-emerald-400">
                            <CardContent className="p-4">
                                <h4 className="font-semibold text-gray-900">{lead.name}</h4>
                                <p className="text-xs font-medium text-blue-600 mt-1 bg-blue-50 w-max px-2 py-0.5 rounded">{lead.program}</p>
                                <div className="flex justify-between items-center mt-3 text-xs">
                                    <span className="text-emerald-600 font-medium">{lead.status}</span>
                                    <span className="font-semibold text-gray-700">{lead.amount}</span>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

            </div>
        </div>
    );
}
