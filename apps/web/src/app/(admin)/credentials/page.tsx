import { getCredentialRegistryAction } from '@/lib/actions/credentials';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default async function CredentialsDashboard() {
    const credentials = await getCredentialRegistryAction();

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 pb-6">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-gray-900">Credential Trust Layer</h1>
                    <p className="text-gray-500 mt-2 text-base">Module 41: Verifiable credentials, Open Badges issuance, and registrar revocation control.</p>
                </div>
                <div className="flex gap-3 text-sm">
                    <Button variant="outline" className="bg-white border-2">Auditor Portal</Button>
                    <Button className="bg-blue-600 hover:bg-blue-700 font-semibold tracking-wide">Issue Certificate</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border border-gray-200 shadow-sm">
                    <CardHeader>
                        <CardDescription className="text-gray-500 font-bold uppercase tracking-wider text-xs">Total Issued</CardDescription>
                        <CardTitle className="text-4xl font-mono text-gray-900 mt-1">{credentials.filter(c => c.status === 'ISSUED').length}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500">Tamper-proof verifiable awards logged to the registry.</p>
                    </CardContent>
                </Card>

                <Card className="border border-gray-200 shadow-sm">
                    <CardHeader>
                        <CardDescription className="text-gray-500 font-bold uppercase tracking-wider text-xs">Awaiting Approval</CardDescription>
                        <CardTitle className="text-4xl font-mono text-gray-900 mt-1">{credentials.filter(c => c.status === 'DRAFT').length}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-gray-500">Pending Registrar Human-In-The-Loop Signoff.</p>
                    </CardContent>
                </Card>

                <Card className="border-2 border-red-50 bg-red-50/20 shadow-sm">
                    <CardHeader>
                        <CardDescription className="text-red-700 font-bold uppercase tracking-wider text-xs">Revoked Records</CardDescription>
                        <CardTitle className="text-4xl font-mono text-red-900 mt-1">{credentials.filter(c => c.status === 'REVOKED').length}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-red-600 font-semibold cursor-pointer hover:underline">View Incident Logs →</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="border border-gray-200 shadow-sm bg-white overflow-hidden mt-8">
                <CardHeader className="bg-gray-50/50 border-b border-gray-100 px-6 py-5 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-xl">Immutable Registry Log</CardTitle>
                        <CardDescription>All academic assertions published by your institution.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white border-b border-gray-100 text-xs text-gray-500 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Certificate UID</th>
                                    <th className="px-6 py-4">Student</th>
                                    <th className="px-6 py-4">Badge / Type</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Issuance Date</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {credentials.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                            No credentials issued yet. Start by digitizing a template.
                                        </td>
                                    </tr>
                                )}
                                {credentials.map((cert) => (
                                    <tr key={cert.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 font-mono font-bold text-gray-900 text-xs">{cert.certificateNumber}</td>
                                        <td className="px-6 py-4 font-semibold text-gray-900">{cert.studentName || 'Unknown Student'}</td>
                                        <td className="px-6 py-4 text-gray-600">{cert.templateName || 'Custom Record'}</td>
                                        <td className="px-6 py-4">
                                            <Badge variant={cert.status === 'REVOKED' ? 'destructive' : cert.status === 'ISSUED' ? 'outline' : 'secondary'} 
                                                   className={cert.status === 'ISSUED' ? 'border-green-200 text-green-700 bg-green-50' : cert.status === 'DRAFT' ? 'bg-orange-50 text-orange-700' : ''}>
                                                {cert.status}
                                            </Badge>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-600">
                                            {cert.issuedDate ? new Date(cert.issuedDate).toLocaleDateString() : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {cert.status === 'ISSUED' ? (
                                                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-800 hover:bg-red-50">Revoke</Button>
                                            ) : cert.status === 'DRAFT' ? (
                                                <Button variant="ghost" size="sm" className="text-blue-600 hover:bg-blue-50">Approve</Button>
                                            ) : (
                                                <Button variant="ghost" size="sm" className="text-gray-400 cursor-not-allowed">Locked</Button>
                                            )}
                                        </td>
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
