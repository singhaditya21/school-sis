import { getSession } from '@/lib/auth/session';
import Link from 'next/link';

interface Document {
    id: string;
    name: string;
    type: string;
    url: string;
    uploadedAt: string;
}

export default async function AdmissionDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await getSession();

    let documents: Document[] = [];

    try {
        const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1/admissions/leads/${id}/documents`,
            {
                headers: {
                    'Authorization': `Bearer ${session.token}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.ok) {
            const data = await response.json();
            documents = data.data || [];
        }
    } catch (error) {
        console.error('[Documents] API Error:', error);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Documents</h1>
                <Link href={`/admissions/${id}`} className="text-blue-600 hover:underline">← Back</Link>
            </div>

            <div className="bg-white rounded-xl shadow-sm border">
                {documents.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        No documents uploaded yet.
                    </div>
                ) : (
                    <div className="divide-y">
                        {documents.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between p-4">
                                <div>
                                    <p className="font-medium">{doc.name}</p>
                                    <p className="text-sm text-gray-500">{doc.type}</p>
                                </div>
                                <a href={doc.url} target="_blank" className="text-blue-600 hover:underline">
                                    View
                                </a>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="font-semibold mb-4">Upload Document</h2>
                <form action="/api/documents" method="POST" encType="multipart/form-data">
                    <input type="hidden" name="leadId" value={id} />
                    <div className="space-y-4">
                        <select name="type" className="w-full px-3 py-2 border rounded-lg">
                            <option value="BIRTH_CERTIFICATE">Birth Certificate</option>
                            <option value="PHOTO">Photo</option>
                            <option value="ADDRESS_PROOF">Address Proof</option>
                            <option value="PREVIOUS_MARKS">Previous Marks</option>
                            <option value="OTHER">Other</option>
                        </select>
                        <input type="file" name="file" className="w-full" />
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                            Upload
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
