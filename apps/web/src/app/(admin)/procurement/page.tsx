import { getEvidenceLogAction } from '@/lib/actions/procurement';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default async function ProcurementTrustCenter() {
    const logs = await getEvidenceLogAction();

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 pb-6">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900">Enterprise Trust Center</h1>
                    <p className="text-gray-500 mt-2 text-base">Module 43: Procurement evidence packs, shared responsibility matrices, and subprocessor logs.</p>
                </div>
                <div className="flex gap-3 text-sm">
                    <Button variant="outline" className="bg-white border-2">Generate RFP Responses</Button>
                    <Button className="bg-slate-900 hover:bg-slate-800 font-semibold tracking-wide text-white">Export Audit Trail (SOC2)</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="border border-gray-200 shadow-sm hover:shadow-md cursor-pointer transition-all">
                    <CardHeader className="pb-2">
                        <div className="text-2xl mb-2">📜</div>
                        <CardTitle className="text-lg">Compliance Library</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500">ISO 27001, SOC2 Type II, GDPR, and FERPA certificates.</p>
                        <p className="text-xs text-blue-600 font-semibold mt-4">Download Pack →</p>
                    </CardContent>
                </Card>

                <Card className="border border-gray-200 shadow-sm hover:shadow-md cursor-pointer transition-all">
                    <CardHeader className="pb-2">
                        <div className="text-2xl mb-2">🤝</div>
                        <CardTitle className="text-lg">Responsibility Matrix</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500">Shared security responsibilities mapped by infrastructure layer.</p>
                        <p className="text-xs text-blue-600 font-semibold mt-4">View Grid →</p>
                    </CardContent>
                </Card>

                <Card className="border border-gray-200 shadow-sm hover:shadow-md cursor-pointer transition-all">
                    <CardHeader className="pb-2">
                        <div className="text-2xl mb-2">🤖</div>
                        <CardTitle className="text-lg">AI Ethics Register</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500">Subprocessor disclosures and LLM pipeline transparency logs.</p>
                        <p className="text-xs text-blue-600 font-semibold mt-4">Read Manifest →</p>
                    </CardContent>
                </Card>

                <Card className="border border-gray-200 shadow-sm hover:shadow-md cursor-pointer transition-all">
                    <CardHeader className="pb-2">
                        <div className="text-2xl mb-2">🔒</div>
                        <CardTitle className="text-lg">Data Processing (DPA)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500">Your specific Data Processing Agreement and privacy boundaries.</p>
                        <p className="text-xs text-blue-600 font-semibold mt-4">View Agreement →</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border border-gray-200 shadow-sm bg-white overflow-hidden mt-8">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100 px-6 py-5">
                    <div>
                        <CardTitle className="text-xl">Platform Action Log</CardTitle>
                        <CardDescription>Immutable record of critical state changes and impersonations.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white border-b border-gray-100 text-xs text-gray-500 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Timestamp</th>
                                    <th className="px-6 py-4">Action Type</th>
                                    <th className="px-6 py-4">Actor ID</th>
                                    <th className="px-6 py-4">IP Address</th>
                                    <th className="px-6 py-4">Metadata Context</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                            No critical actions logged in the primary trust ledger yet.
                                        </td>
                                    </tr>
                                )}
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-xs font-mono text-gray-500">{new Date(log.createdAt).toLocaleString()}</td>
                                        <td className="px-6 py-4 font-bold text-gray-800">
                                            <Badge variant="outline" className={`${log.actionType === 'IMPERSONATE' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-700'}`}>
                                                {log.actionType}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-mono text-gray-500 truncate max-w-[120px]">{log.actorId}</td>
                                        <td className="px-6 py-4 font-mono text-gray-700">{log.ipAddress || 'Internal'}</td>
                                        <td className="px-6 py-4 text-xs text-gray-400 font-mono truncate max-w-[200px]">{log.metadata || '{}'}</td>
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
