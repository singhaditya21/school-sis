import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getParentConsentData, ConsentFormForParent } from '@/lib/services/parent/parent.service';
import { redirect } from 'next/navigation';

export default async function ConsentVaultPage() {
    let consentData: ConsentFormForParent[] = [];
    try {
        consentData = await getParentConsentData();
    } catch {
        redirect('/login');
    }

    const pending = consentData.filter(c => !c.response && c.isActive);
    const historical = consentData.filter(c => c.response);

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                        <span className="text-teal-600">🛡️</span> Digital Consent Vault
                    </h1>
                    <p className="text-gray-500 mt-1">Manage data sharing preferences, waivers, and e-signatures securely.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="col-span-1 md:col-span-2 shadow-sm border-teal-100">
                    <CardHeader className="bg-teal-50/50 border-b border-teal-100 pb-3 flex flex-row justify-between items-center">
                        <div>
                            <CardTitle className="text-lg">Pending Authorizations</CardTitle>
                            <CardDescription className="text-teal-700/70">Requires your review and signature.</CardDescription>
                        </div>
                        <span className="bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded text-xs">{pending.length} Pending</span>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-gray-100">
                            {pending.length === 0 ? (
                                <div className="p-8 text-center text-gray-400">
                                    <p className="font-medium">No pending consent forms</p>
                                    <p className="text-sm mt-1">All consent forms have been addressed.</p>
                                </div>
                            ) : (
                                pending.map((c) => (
                                    <div key={`${c.id}-${c.studentName}`} className="p-5 hover:bg-gray-50 transition-colors">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-semibold text-gray-900">{c.title}</h3>
                                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded uppercase font-medium">{c.formType}</span>
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    Student: {c.studentName}
                                                    {c.dueDate ? ` • Due: ${c.dueDate}` : ' • No deadline'}
                                                </p>
                                            </div>
                                        </div>
                                        {c.description && (
                                            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                                                <p className="text-xs text-gray-600 italic">&ldquo;{c.description}&rdquo;</p>
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>

                <div className="space-y-6">
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3 border-b border-gray-100">
                            <CardTitle className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Total Forms</span>
                                <span className="font-mono text-sm font-bold text-gray-900">{consentData.length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Pending</span>
                                <span className="font-mono text-sm font-bold text-amber-600">{pending.length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-gray-600">Responded</span>
                                <span className="font-mono text-sm font-bold text-emerald-600">{historical.length}</span>
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
                                <th className="px-6 py-3 border-l border-gray-200">Student</th>
                                <th className="px-6 py-3 border-l border-gray-200">Date Responded</th>
                                <th className="px-6 py-3 border-l border-gray-200 text-center">Response</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {historical.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-400">No historical consent records.</td>
                                </tr>
                            ) : (
                                historical.map((doc, i) => (
                                    <tr key={`${doc.id}-${i}`} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">{doc.title}</td>
                                        <td className="px-6 py-4 text-gray-500 border-l border-gray-100">{doc.studentName}</td>
                                        <td className="px-6 py-4 text-gray-500 border-l border-gray-100">
                                            {doc.respondedAt || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 text-center border-l border-gray-100">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                doc.response === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-700' :
                                                doc.response === 'DECLINED' ? 'bg-red-100 text-red-700' :
                                                'bg-gray-100 text-gray-500'
                                            }`}>
                                                {doc.response}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
