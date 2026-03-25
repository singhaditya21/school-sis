import { Card, CardContent } from '@/components/ui/card';
import { getIssuedCertificates, getCertificateTemplates, getCertificateStats } from '@/lib/actions/certificate';

export default async function CertificatesPage() {
    const [certs, templates, stats] = await Promise.all([
        getIssuedCertificates(),
        getCertificateTemplates(),
        getCertificateStats(),
    ]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Certificates & ID Cards</h1>
                    <p className="text-gray-500 mt-1">Issue digital certificates, manage templates, and batch print student ID cards.</p>
                </div>
                <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow-sm font-medium transition-colors">
                    + New Template
                </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="shadow-sm border-blue-100 bg-blue-50/30">
                    <CardContent className="pt-6">
                        <div className="text-sm font-medium text-blue-600 mb-1">Active Templates</div>
                        <div className="text-3xl font-bold text-gray-900">{stats.templates}</div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-green-100 bg-green-50/30">
                    <CardContent className="pt-6">
                        <div className="text-sm font-medium text-green-600 mb-1">Certificates Issued</div>
                        <div className="text-3xl font-bold text-gray-900">{stats.issued}</div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-purple-100 bg-purple-50/30">
                    <CardContent className="pt-6">
                        <div className="text-sm font-medium text-purple-600 mb-1">ID Cards Active</div>
                        <div className="text-3xl font-bold text-gray-900">{stats.idCards}</div>
                    </CardContent>
                </Card>
                <Card className="shadow-sm border-orange-100 bg-orange-50/30">
                    <CardContent className="pt-6">
                        <div className="text-sm font-medium text-orange-600 mb-1">Pending Generation</div>
                        <div className="text-3xl font-bold text-gray-900">{stats.pendingCards}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {templates.map(t => (
                    <Card key={t.id} className="shadow-sm overflow-hidden border-gray-200">
                        <CardContent className="pt-5 p-0 border-t-4 border-t-indigo-500">
                            <div className="p-5">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                                        <h3 className="font-bold text-gray-900">{t.name}</h3>
                                    </div>
                                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700 font-semibold">{t.type}</span>
                                </div>
                                <div className="mt-4 text-sm text-gray-500 flex items-center justify-between">
                                    <span>{(t.variables as string[])?.length || 0} smart variables</span>
                                    <span className="text-indigo-600 font-medium cursor-pointer hover:underline">Edit Template</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="shadow-sm border-gray-200 overflow-hidden">
                <CardContent className="p-0">
                    <div className="p-5 border-b bg-gray-50/50 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-900">Recently Issued Certificates</h3>
                        <div className="relative">
                            <input type="text" placeholder="Search by ID or Student..." className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 w-64" />
                            <svg className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white border-b border-gray-100 text-xs text-gray-500 uppercase font-semibold">
                                <tr>
                                    <th className="px-6 py-4">Certificate #</th>
                                    <th className="px-6 py-4">Student</th>
                                    <th className="px-6 py-4">Type</th>
                                    <th className="px-6 py-4">Date Issued</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {certs.map(c => (
                                    <tr key={c.id} className="hover:bg-gray-50/80 transition-colors">
                                        <td className="px-6 py-4 font-mono font-medium text-gray-900">{c.certificateNumber}</td>
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-gray-900">{c.studentName}</div>
                                            <div className="text-xs text-gray-500">ID: {c.studentId?.substring(0,8)}</div>
                                        </td>
                                        <td className="px-6 py-4"><span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 font-medium">{c.type}</span></td>
                                        <td className="px-6 py-4 text-gray-600">{new Date(c.issuedDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${c.status === 'ISSUED' ? 'bg-green-100 text-green-700' : c.status === 'REVOKED' ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}>
                                                {c.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            {c.status === 'ISSUED' && (
                                                <a 
                                                    href={`/api/certificates/${c.id}/pdf`} 
                                                    download={`Certificate_${c.certificateNumber}.pdf`}
                                                    className="inline-flex items-center px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors shadow-sm"
                                                    title="Download PDF"
                                                >
                                                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> PDF
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {certs.length === 0 && <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No certificates generated yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
