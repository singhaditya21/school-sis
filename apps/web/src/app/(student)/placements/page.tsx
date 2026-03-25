import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function PlacementsPage() {
    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-6">
            {/* Context Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <span className="text-emerald-600">💼</span> Campus Placements
                    </h1>
                    <p className="text-gray-500 mt-1 text-sm md:text-base">Browse exclusive campus drives, apply with your verified skills wallet, and track interview statuses.</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <button className="flex-1 md:flex-none justify-center bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
                        Generate Smart Resume
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                
                {/* Filters & Status Sidebar */}
                <div className="lg:col-span-1 space-y-6">
                     <Card className="border-gray-200 shadow-sm bg-emerald-50/30">
                         <CardHeader className="pb-3 border-b border-emerald-100/50">
                             <CardTitle className="text-sm font-bold text-gray-900 uppercase tracking-wider">My Application Status</CardTitle>
                         </CardHeader>
                         <CardContent className="pt-4 p-0">
                             <div className="flex flex-col divide-y divide-gray-100">
                                 <div className="p-4 flex justify-between items-center hover:bg-white transition-colors cursor-pointer">
                                     <div className="flex items-center gap-2">
                                         <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                         <span className="text-sm font-medium text-gray-700">Applied</span>
                                     </div>
                                     <span className="text-sm font-bold text-gray-900">3</span>
                                 </div>
                                 <div className="p-4 flex justify-between items-center hover:bg-white transition-colors cursor-pointer bg-white border-l-2 border-amber-500 shadow-sm">
                                     <div className="flex items-center gap-2">
                                         <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                         <span className="text-sm font-medium text-amber-700">Interviewing</span>
                                     </div>
                                     <span className="text-sm font-bold text-gray-900">1</span>
                                 </div>
                                 <div className="p-4 flex justify-between items-center hover:bg-white transition-colors cursor-pointer">
                                     <div className="flex items-center gap-2">
                                         <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                         <span className="text-sm font-medium text-gray-700">Offers Extended</span>
                                     </div>
                                     <span className="text-sm font-bold text-gray-400">0</span>
                                 </div>
                                 <div className="p-4 flex justify-between items-center hover:bg-white transition-colors cursor-pointer">
                                     <div className="flex items-center gap-2">
                                         <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                                         <span className="text-sm font-medium text-gray-700">Rejected</span>
                                     </div>
                                     <span className="text-sm font-bold text-gray-900">1</span>
                                 </div>
                             </div>
                         </CardContent>
                     </Card>
                     
                     <Card className="shadow-sm border-gray-200">
                         <CardHeader className="pb-3 border-b border-gray-100">
                             <CardTitle className="text-sm font-semibold text-gray-700">Filter Opportunities</CardTitle>
                         </CardHeader>
                         <CardContent className="pt-4 space-y-4">
                             <div className="space-y-2">
                                 <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Role Type</label>
                                 <div className="flex flex-col gap-2">
                                     <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" defaultChecked /> Full-Time (FTE)</label>
                                     <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" defaultChecked /> 6-Month Internship</label>
                                     <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" /> Summer Internship</label>
                                 </div>
                             </div>
                         </CardContent>
                     </Card>
                </div>

                {/* Job Board Feed */}
                <div className="lg:col-span-3 space-y-4">
                    
                    {/* Active Interview Notice */}
                    <Card className="border-amber-200 bg-amber-50 shadow-sm mb-6">
                        <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div className="flex items-start md:items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-white border border-amber-200 flex items-center justify-center font-bold text-emerald-700 text-xl shadow-sm shrink-0">
                                    G
                                </div>
                                <div>
                                    <h3 className="font-bold text-amber-900">Round 2 Technical Interview Scheduled</h3>
                                    <p className="text-sm text-amber-700 mt-0.5"><span className="font-semibold">Google India</span> • Software Engineer (FTE) • <span className="font-medium">Tomorrow, 10:00 AM</span></p>
                                </div>
                            </div>
                            <button className="w-full md:w-auto text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-lg transition-colors shadow-sm whitespace-nowrap">
                                Join Meet Link
                            </button>
                        </CardContent>
                    </Card>

                    <h2 className="text-lg font-bold text-gray-900 mb-2">Open Campus Drives</h2>
                    
                    {[
                        { company: 'Microsoft India', role: 'SDE-1 (Azure Config)', ctc: '₹42,00,000', location: 'Hyderabad / BNG', type: 'Full-Time', deadline: 'Closes in 2 days', initials: 'M', color: 'bg-blue-600', match: 92 },
                        { company: 'Atlassian', role: 'Frontend Engineer', ctc: '₹38,00,000', location: 'Remote / BNG', type: 'Full-Time', deadline: 'Closes in 5 days', initials: 'A', color: 'bg-blue-500', match: 88 },
                        { company: 'Zomato', role: 'SDE Intern', ctc: '₹60,000 / mo', location: 'Gurgaon', type: '6-Month Internship', deadline: 'Closes next week', initials: 'Z', color: 'bg-rose-600', match: 74 },
                        { company: 'Acme TradeFi', role: 'Quantitative Analyst', ctc: '₹22,00,000', location: 'Mumbai', type: 'Full-Time', deadline: 'Requires CGPA > 8.0', initials: 'A', color: 'bg-gray-800', match: 45 },
                    ].map((job, i) => (
                        <Card key={i} className="border-gray-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer overflow-hidden">
                            <CardContent className="p-0">
                                <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl ${job.color} flex items-center justify-center font-bold text-white text-xl shadow-sm shrink-0`}>
                                        {job.initials}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                            <h3 className="font-bold text-gray-900 text-lg leading-tight">{job.role}</h3>
                                            <span className="bg-gray-100 text-gray-600 text-[10px] uppercase font-bold px-2 py-0.5 rounded tracking-wider">{job.type}</span>
                                        </div>
                                        <p className="text-sm font-medium text-emerald-700 mb-2">{job.company} <span className="text-gray-400 mx-1">•</span> <span className="text-gray-600">{job.location}</span></p>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-gray-500">
                                            <span className="flex items-center gap-1">💸 {job.ctc}</span>
                                            <span className="flex items-center gap-1">⏱️ {job.deadline}</span>
                                        </div>
                                    </div>
                                    <div className="w-full sm:w-auto mt-4 sm:mt-0 flex flex-col items-stretch sm:items-end gap-3">
                                        {job.match > 80 ? (
                                             <div className="bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg flex flex-col items-center justify-center self-start sm:self-end">
                                                 <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest text-center">PlacementAgent Match</span>
                                                 <span className="text-sm font-black text-emerald-700">{job.match}%</span>
                                             </div>
                                        ) : (
                                            <div className="bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-lg flex flex-col items-center justify-center self-start sm:self-end">
                                                 <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">PlacementAgent Match</span>
                                                 <span className="text-sm font-black text-gray-600">{job.match}%</span>
                                             </div>
                                        )}
                                        <button className="w-full bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 px-6 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap">
                                            1-Click Apply via Wallet
                                        </button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                </div>
            </div>
        </div>
    );
}
