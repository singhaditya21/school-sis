import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default async function ConsentVaultPage() {
    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <span className="text-teal-600">🛡️</span> Digital Consent Vault
                    </h1>
                    <p className="text-gray-500 mt-1">Manage GDPR/DPDPA data sharing preferences, medical waivers, and e-signatures securely.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 md:col-span-2 shadow-sm border-teal-100">
                    <CardHeader className="bg-teal-50/50 border-b border-teal-100 pb-3 flex flex-row justify-between items-center">
                        <div>
                            <CardTitle className="text-lg">Pending Authorizations</CardTitle>
                            <CardDescription className="text-teal-700/70">Requires your cryptographic signature.</CardDescription>
                        </div>
                        <span className="bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded text-xs">2 Pending</span>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-gray-100">
                            {[
                                { title: 'Annual Field Trip - Science Museum', type: 'Liability Waiver', child: 'Aarav Sharma', due: 'Expires in 3 days', status: 'REQUIRES_SIGNATURE' },
                                { title: 'Paracetamol / Basic First-Aid Consent', type: 'Medical Waiver', child: 'Aarav Sharma', due: 'Mandatory', status: 'REQUIRES_SIGNATURE' },
                            ].map((c, i) => (
                                <div key={i} className="p-5 hover:bg-gray-50 transition-colors">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-semibold text-gray-900">{c.title}</h3>
                                                <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded uppercase font-medium">{c.type}</span>
                                            </div>
                                            <p className="text-xs text-gray-500">Student: {c.child} • {c.due}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                                        <p className="text-xs text-gray-600 mb-3 italic">"I hereby authorize the school medical staff to administer basic over-the-counter first aid (including Paracetamol) in the event of minor symptoms..."</p>
                                        <div className="flex justify-end gap-3">
                                            <button className="text-xs font-medium text-gray-600 bg-white border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">Decline Consent</button>
                                            <button className="text-xs font-medium text-white bg-teal-600 border border-teal-700 px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors shadow-sm">Authorize via Aadhaar OTP</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Data Privacy (DPDP Act)</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h4 className="text-sm font-medium text-gray-900">Photography Release</h4>
                                    <p className="text-xs text-gray-500 mt-1">Allow use of student photos in school marketing materials.</p>
                                </div>
                                <div className="w-10 h-5 bg-teal-600 rounded-full relative cursor-pointer ml-4 shrink-0">
                                    <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                                </div>
                            </div>
                            
                            <div className="flex items-start justify-between">
                                <div>
                                    <h4 className="text-sm font-medium text-gray-900">Alumni Network Sync</h4>
                                    <p className="text-xs text-gray-500 mt-1">Share academic records with the alumni association upon graduation.</p>
                                </div>
                                <div className="w-10 h-5 bg-teal-600 rounded-full relative cursor-pointer ml-4 shrink-0">
                                    <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                                </div>
                            </div>

                            <div className="flex items-start justify-between opacity-50">
                                <div>
                                    <h4 className="text-sm font-medium text-gray-900">Core Academic Processing</h4>
                                    <p className="text-xs text-gray-500 mt-1">Mandatory data processing for attendance and grading.</p>
                                </div>
                                <div className="w-10 h-5 bg-gray-400 rounded-full relative ml-4 shrink-0">
                                    <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-gray-50 shadow-sm">
                        <CardContent className="p-4 flex flex-col items-center text-center">
                            <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center text-2xl mb-3">
                                📜
                            </div>
                            <h4 className="text-sm font-semibold text-gray-900">Download Data Archive</h4>
                            <p className="text-xs text-gray-500 mt-1 mb-4">Request a machine-readable export of all data held on your child.</p>
                            <button className="w-full text-xs font-medium text-gray-700 bg-white border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                                Generate ZIP Archive
                            </button>
                        </CardContent>
                    </Card>
                </div>
            </div>
            
            <h2 className="text-lg font-bold text-gray-900 mt-10 mb-4">Historical Consents Ledger</h2>
            <Card className="shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50/50 border-b border-gray-200 text-xs text-gray-500 font-semibold uppercase">
                            <tr>
                                <th className="px-6 py-3">Document Title</th>
                                <th className="px-6 py-3 border-l border-gray-200">Date Signed</th>
                                <th className="px-6 py-3 border-l border-gray-200">IP Sequence</th>
                                <th className="px-6 py-3 border-l border-gray-200 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {[
                                { title: 'Annual Tuition Aggreement 2026', date: '01 Mar 2026', ip: '192.168.1.1 (Aadhaar Verified)', status: 'ACTIVE' },
                                { title: 'Computer Lab Acceptable Use Policy', date: '01 Mar 2026', ip: '192.168.1.1', status: 'ACTIVE' },
                                { title: 'Inter-School Sports Tournament Waiver', date: '15 Jan 2026', ip: '10.0.0.4', status: 'EXPIRED' },
                            ].map((doc, i) => (
                                <tr key={i} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{doc.title}</td>
                                    <td className="px-6 py-4 text-gray-500 border-l border-gray-100">{doc.date}</td>
                                    <td className="px-6 py-4 text-xs font-mono text-gray-400 border-l border-gray-100">{doc.ip}</td>
                                    <td className="px-6 py-4 text-center border-l border-gray-100">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${doc.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {doc.status}
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
