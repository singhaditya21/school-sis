import { Card, CardContent } from '@/components/ui/card';
import { getStudentDocuments, getDocumentStats } from '@/lib/actions/document';

export default async function DocumentsPage() {
    const [docs, stats] = await Promise.all([getStudentDocuments(), getDocumentStats()]);

    return (
        <div className="space-y-6">
            <div><h1 className="text-3xl font-bold">Student Documents</h1><p className="text-gray-600 mt-1">Upload, verify, and manage student documents</p></div>

            <div className="grid grid-cols-3 gap-4">
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Total Documents</div><div className="text-2xl font-bold text-blue-600">{stats.total}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Verified</div><div className="text-2xl font-bold text-green-600">{stats.verified}</div></CardContent></Card>
                <Card><CardContent className="pt-4"><div className="text-sm text-gray-500">Pending</div><div className="text-2xl font-bold text-orange-600">{stats.pending}</div></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b"><tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Document</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Size</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Verified</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded</th>
                        </tr></thead>
                        <tbody className="divide-y">
                            {docs.map(d => (
                                <tr key={d.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium">{d.studentName}</td>
                                    <td className="px-4 py-3 text-sm">{d.fileName}</td>
                                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-gray-100">{d.documentType}</span></td>
                                    <td className="px-4 py-3 text-right text-sm">{d.fileSize ? `${(d.fileSize / 1024).toFixed(0)} KB` : '—'}</td>
                                    <td className="px-4 py-3 text-center">{d.isVerified ? '✅' : '⏳'}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500">{new Date(d.createdAt).toLocaleDateString('en-IN')}</td>
                                </tr>
                            ))}
                            {docs.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-400">No documents uploaded yet.</td></tr>}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
