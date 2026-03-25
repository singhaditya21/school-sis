import { NextRequest, NextResponse } from 'next/server';
import { db, setTenantContext } from '@/lib/db';
import { tenants, users, students, grades, sections } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';

/**
 * OneRoster 1.2 REST API — Read-only adapter layer.
 * Implements the IMS Global OneRoster 1.2 specification for LMS interoperability.
 *
 * Endpoints:
 *   GET /api/oneroster/orgs       — Organizations (tenants/schools)
 *   GET /api/oneroster/users      — Users (staff, students, guardians)
 *   GET /api/oneroster/classes    — Classes (sections)
 *   GET /api/oneroster/courses    — Courses (grades)
 *   GET /api/oneroster/enrollments — Enrollments
 *
 * Auth: Bearer token (session-based for now, OAuth2 in production)
 */

// OneRoster data types
interface OneRosterOrg {
    sourcedId: string;
    status: string;
    name: string;
    type: string;
    identifier: string;
}

interface OneRosterUser {
    sourcedId: string;
    status: string;
    givenName: string;
    familyName: string;
    email: string;
    role: string;
    orgs: { sourcedId: string }[];
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ entity: string }> }
) {
    // Auth check
    const session = await getSession();
    if (!session.isLoggedIn) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { entity } = await params;
    const tenantId = session.tenantId;
    await setTenantContext(tenantId);

    try {
        switch (entity) {
            case 'orgs': {
                const orgs = await db.select().from(tenants).where(eq(tenants.id, tenantId));
                const result: OneRosterOrg[] = orgs.map(t => ({
                    sourcedId: t.id,
                    status: t.isActive ? 'active' : 'tobedeleted',
                    name: t.name,
                    type: 'school',
                    identifier: t.code,
                }));
                return NextResponse.json({ orgs: result });
            }

            case 'users': {
                const allUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));
                const allStudents = await db.select().from(students).where(eq(students.tenantId, tenantId));

                const mappedUsers: OneRosterUser[] = allUsers.map(u => ({
                    sourcedId: u.id,
                    status: u.isActive ? 'active' : 'tobedeleted',
                    givenName: u.firstName,
                    familyName: u.lastName,
                    email: u.email,
                    role: mapRole(u.role),
                    orgs: [{ sourcedId: tenantId }],
                }));

                const mappedStudents: OneRosterUser[] = allStudents.map(s => ({
                    sourcedId: s.id,
                    status: s.status === 'ACTIVE' ? 'active' : 'tobedeleted',
                    givenName: s.firstName,
                    familyName: s.lastName,
                    email: '',
                    role: 'student',
                    orgs: [{ sourcedId: tenantId }],
                }));

                return NextResponse.json({ users: [...mappedUsers, ...mappedStudents] });
            }

            case 'classes': {
                const allSections = await db.select({
                    id: sections.id,
                    name: sections.name,
                    gradeId: sections.gradeId,
                }).from(sections).where(eq(sections.tenantId, tenantId));

                return NextResponse.json({
                    classes: allSections.map(s => ({
                        sourcedId: s.id,
                        status: 'active',
                        title: s.name,
                        course: { sourcedId: s.gradeId },
                        org: { sourcedId: tenantId },
                    })),
                });
            }

            case 'courses': {
                const allGrades = await db.select()
                    .from(grades)
                    .where(eq(grades.tenantId, tenantId));

                return NextResponse.json({
                    courses: allGrades.map(g => ({
                        sourcedId: g.id,
                        status: 'active',
                        title: g.name,
                        org: { sourcedId: tenantId },
                    })),
                });
            }

            default:
                return NextResponse.json(
                    { error: `Unknown OneRoster entity: ${entity}. Valid: orgs, users, classes, courses` },
                    { status: 404 }
                );
        }
    } catch (error: any) {
        console.error(`[OneRoster] Error fetching ${entity}:`, error.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

function mapRole(role: string): string {
    const roleMap: Record<string, string> = {
        'SUPER_ADMIN': 'administrator',
        'SCHOOL_ADMIN': 'administrator',
        'PRINCIPAL': 'administrator',
        'TEACHER': 'teacher',
        'PARENT': 'guardian',
        'STUDENT': 'student',
        'ACCOUNTANT': 'aide',
        'TRANSPORT_MANAGER': 'aide',
        'ADMISSION_COUNSELOR': 'aide',
    };
    return roleMap[role] || 'user';
}
