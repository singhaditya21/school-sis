import { getSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { substitutionRequests, sections, grades } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';

export default async function SubstitutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session.isLoggedIn) redirect('/login');

    const { id } = await params;
    
    // Check if UUID is valid
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
        return (
            <div className="container mx-auto p-6 max-w-xl">
                <div className="mb-6">
                    <Link href="/timetable/substitution" className="text-blue-600 hover:underline">← Back</Link>
                </div>
                <div data-testid="error-container" className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                    <h2 className="text-xl font-semibold text-red-700 mb-2">Invalid ID Format</h2>
                    <p className="text-gray-600">The provided substitution request ID is invalid.</p>
                </div>
            </div>
        );
    }

    try {
        const rows = await db
            .select({
                id: substitutionRequests.id,
                reason: substitutionRequests.reason,
                period: substitutionRequests.period,
                date: substitutionRequests.date,
                status: substitutionRequests.status,
                originalTeacher: sql<string>`orig_u.first_name || ' ' || orig_u.last_name`,
                substitute: sql<string | null>`sub_u.first_name || ' ' || sub_u.last_name`,
                className: sql<string>`g.name || '-' || sec.name`,
            })
            .from(substitutionRequests)
            .innerJoin(sql`users orig_u`, eq(substitutionRequests.teacherId, sql`orig_u.id`))
            .leftJoin(sql`users sub_u`, eq(substitutionRequests.substituteId, sql`sub_u.id`))
            .leftJoin(sections, eq(substitutionRequests.sectionId, sections.id))
            .leftJoin(grades, eq(sections.gradeId, grades.id))
            .where(and(
                eq(substitutionRequests.id, id),
                eq(substitutionRequests.tenantId, session.tenantId)
            ))
            .limit(1);

        if (rows.length === 0) {
            return (
                <div className="container mx-auto p-6 max-w-xl">
                    <div className="mb-6">
                        <Link href="/timetable/substitution" className="text-blue-600 hover:underline">← Back</Link>
                    </div>
                    <div data-testid="error-container" className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                        <h2 className="text-xl font-semibold text-red-700 mb-2">Not Found</h2>
                        <p className="text-gray-600">Substitution request not found.</p>
                    </div>
                </div>
            );
        }

        const request = rows[0];

        return (
            <div className="container mx-auto p-6 max-w-xl">
                <div className="mb-6">
                    <Link href="/timetable/substitution" className="text-blue-600 hover:underline">← Back</Link>
                </div>
                <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
                    <h1 className="text-2xl font-bold">Substitution Request Detail</h1>
                    <div className="grid grid-cols-2 gap-4 text-sm pt-4">
                        <span className="font-semibold text-gray-500">Date:</span>
                        <span>{request.date}</span>

                        <span className="font-semibold text-gray-500">Absent Teacher:</span>
                        <span className="font-medium text-red-600">{request.originalTeacher}</span>

                        <span className="font-semibold text-gray-500">Substitute Teacher:</span>
                        <span className="font-medium text-green-600">{request.substitute || 'TBD'}</span>

                        <span className="font-semibold text-gray-500">Class:</span>
                        <span>{request.className}</span>

                        <span className="font-semibold text-gray-500">Period:</span>
                        <span>Period {request.period}</span>

                        <span className="font-semibold text-gray-500">Reason / Subject:</span>
                        <span>{request.reason || 'None'}</span>

                        <span className="font-semibold text-gray-500">Status:</span>
                        <span className="capitalize font-semibold">{request.status}</span>
                    </div>
                </div>
            </div>
        );
    } catch (err) {
        return (
            <div className="container mx-auto p-6 max-w-xl">
                <div className="mb-6">
                    <Link href="/timetable/substitution" className="text-blue-600 hover:underline">← Back</Link>
                </div>
                <div data-testid="error-container" className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                    <h2 className="text-xl font-semibold text-red-700 mb-2">Error</h2>
                    <p className="text-gray-600">Failed to load substitution request.</p>
                </div>
            </div>
        );
    }
}
