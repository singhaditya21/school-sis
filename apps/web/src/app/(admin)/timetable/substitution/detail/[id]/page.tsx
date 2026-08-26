import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getSubstitutionRequestDetail } from '../../../_actions/substitution';

function Shell({ children }: { children: React.ReactNode }) {
    return (
        <div className="container mx-auto p-6 max-w-xl">
            <div className="mb-6">
                <Link href="/timetable/substitution" className="text-blue-600 hover:underline">← Back</Link>
            </div>
            {children}
        </div>
    );
}

function ErrorPanel({ title, body }: { title: string; body: string }) {
    return (
        <div data-testid="error-container" className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <h2 className="text-xl font-semibold text-red-700 mb-2">{title}</h2>
            <p className="text-gray-600">{body}</p>
        </div>
    );
}

export default async function SubstitutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { id } = await params;
    const result = await getSubstitutionRequestDetail(id);

    if (!result.success) {
        return (
            <Shell>
                <ErrorPanel title={result.notFound ? 'Not Found' : 'Invalid ID Format'} body={result.error ?? 'Could not load this request.'} />
            </Shell>
        );
    }

    const request = result.request;
    if (!request) {
        return (
            <Shell>
                <ErrorPanel title="Not Found" body="Substitution request not found." />
            </Shell>
        );
    }

    return (
        <Shell>
            <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
                <h1 className="text-2xl font-bold">Substitution Request Detail</h1>
                <div className="grid grid-cols-2 gap-4 text-sm pt-4">
                    <span className="font-semibold text-gray-500">Date:</span>
                    <span>{request.date}</span>

                    <span className="font-semibold text-gray-500">Absent Teacher:</span>
                    <span className="font-medium text-red-600">{request.originalTeacher}</span>

                    <span className="font-semibold text-gray-500">Substitute Teacher:</span>
                    <span className="font-medium text-green-700">{request.substitute || 'Unassigned'}</span>

                    <span className="font-semibold text-gray-500">Class:</span>
                    <span>{request.className || 'Not set'}</span>

                    <span className="font-semibold text-gray-500">Period:</span>
                    <span>{request.periodName || `Period ${request.period}`}</span>

                    <span className="font-semibold text-gray-500">Reason:</span>
                    <span>{request.reason || 'Not given'}</span>

                    <span className="font-semibold text-gray-500">Status:</span>
                    <span className="capitalize font-semibold">{request.status}</span>

                    <span className="font-semibold text-gray-500">Attached to timetable:</span>
                    <span data-testid="detail-linked">
                        {request.linkedEntryId
                            ? 'Yes — cover is recorded against the scheduled slot'
                            : 'No matching timetable entry'}
                    </span>
                </div>

                {request.sectionId && (
                    <div className="pt-2">
                        <Link href={`/timetable/grid?section=${request.sectionId}`} className="text-blue-600 hover:underline text-sm">
                            View this class in the grid
                        </Link>
                    </div>
                )}
            </div>
        </Shell>
    );
}
