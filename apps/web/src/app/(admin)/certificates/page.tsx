import { Card, CardContent } from '@/components/ui/card';
import { getIssuedCertificates, getCertificateTemplates, getCertificateStats } from '@/lib/actions/certificate';

export default async function CertificatesPage() {
    const [certs, templates, stats] = await Promise.all([
        getIssuedCertificates(),
        getCertificateTemplates(),
        getCertificateStats(),
    ]);

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">Certificates & ID Cards</h1><p className="text-gray-600 mt-1">Issue certificates, manage templates, and print ID cards</p></div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Templates</div><div className="text-2xl font-bold text-blue-600">{stats.templates}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Certificates Issued</div><div className="text-2xl font-bold text-green-600">{stats.issued}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">ID Cards</div><div className="text-2xl font-bold text-purple-600">{stats.idCards}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Pending Cards</div><div className="text-2xl font-bold text-orange-600">{stats.pendingCards}</div></CardContent></Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {templates.map(t => (
                    <Card key={t.id}>
                        <CardContent className="pt-4">
                            <div className="flex items-center gap-2"><span className="text-lg">📋</span><h3 className="font-bold">{t.name}</h3></div>
                            <span className="mt-2 inline-block px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">{t.type}</span>
                            <div className="mt-2 text-sm text-gray-500">{(t.variables as string[])?.length || 0} variables</div>
                        </CardContent>
                    </Card>
                ))}
                {templates.length === 0 && <div className="col-span-3 text-center text-gray-400 py-8">No templates yet. Create your first certificate template!</div>}
            </div>

            <Card>
                <CardContent className="p-0">
                    <div className="p-4 border-b"><h3 className="font-bold">Issued Certificates</h3></div>
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Certificate #</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {certs.map(c => (
                                <tr key={c.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-mono text-sm">{c.certificateNumber}</td>
                                    <td className="px-4 py-3 font-medium">{c.studentName}</td>
                                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-gray-100">{c.type}</span></td>
                                    <td className="px-4 py-3 text-sm">{c.issuedDate}</td>
                                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.status === 'ISSUED' ? 'bg-green-100 text-green-700' : c.status === 'REVOKED' ? 'bg-red-100 text-red-700' : 'bg-gray-100'}`}>{c.status}</span></td>
                                </tr>
                            ))}
                            {certs.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">No certificates issued yet.</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
