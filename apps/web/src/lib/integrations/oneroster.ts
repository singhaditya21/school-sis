import { pool } from '@/lib/db';
import { ROLE_GROUPS } from '@/lib/auth/api';
import {
    authenticateIntegrationRequest,
    ensureMockIntegrationConnection,
    integrationJson,
    type IntegrationAuthContext,
    recordIntegrationAudit,
} from '@/lib/integrations/api-platform';

type RouteContext = {
    params: Promise<{ entity: string }>;
};

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

export async function handleOneRosterGet(request: Request, { params }: RouteContext) {
    const startedAt = Date.now();
    const auth = await authenticateIntegrationRequest(request, {
        provider: 'ONEROSTER',
        scopes: ['oneroster:read'],
        allowSession: true,
        sessionRoles: ROLE_GROUPS.tenantAdmins,
    });
    if (auth.ok === false) return auth.response;

    const { entity } = await params;
    const tenantId = auth.context.tenantId;

    await ensureMockIntegrationConnection({
        tenantId,
        provider: 'ONEROSTER',
        scopes: ['oneroster:read'],
        userId: auth.context.userId,
    });

    try {
        switch (entity) {
            case 'orgs': {
                const { rows: orgs } = await pool.query(
                    `SELECT id, is_active AS "isActive", name, code
                     FROM tenants
                     WHERE id = $1`,
                    [tenantId],
                );
                const result: OneRosterOrg[] = orgs.map((tenant) => ({
                    sourcedId: tenant.id,
                    status: tenant.isActive ? 'active' : 'tobedeleted',
                    name: tenant.name,
                    type: 'school',
                    identifier: tenant.code,
                }));
                await auditSuccess(request, auth.context, entity, startedAt, result.length);
                return integrationJson({ orgs: result });
            }

            case 'users': {
                const { rows: users } = await pool.query(
                    `SELECT id,
                            is_active AS "isActive",
                            first_name AS "firstName",
                            last_name AS "lastName",
                            email,
                            role
                     FROM users
                     WHERE tenant_id = $1`,
                    [tenantId],
                );
                const { rows: students } = await pool.query(
                    `SELECT id, status, first_name AS "firstName", last_name AS "lastName"
                     FROM students
                     WHERE tenant_id = $1`,
                    [tenantId],
                );

                const mappedUsers: OneRosterUser[] = users.map((user) => ({
                    sourcedId: user.id,
                    status: user.isActive ? 'active' : 'tobedeleted',
                    givenName: user.firstName,
                    familyName: user.lastName,
                    email: user.email,
                    role: mapRole(user.role),
                    orgs: [{ sourcedId: tenantId }],
                }));

                const mappedStudents: OneRosterUser[] = students.map((student) => ({
                    sourcedId: student.id,
                    status: student.status === 'ACTIVE' ? 'active' : 'tobedeleted',
                    givenName: student.firstName,
                    familyName: student.lastName,
                    email: '',
                    role: 'student',
                    orgs: [{ sourcedId: tenantId }],
                }));

                const result = [...mappedUsers, ...mappedStudents];
                await auditSuccess(request, auth.context, entity, startedAt, result.length);
                return integrationJson({ users: result });
            }

            case 'classes': {
                const { rows: sections } = await pool.query(
                    `SELECT id, name, grade_id AS "gradeId"
                     FROM sections
                     WHERE tenant_id = $1`,
                    [tenantId],
                );
                const result = sections.map((section) => ({
                    sourcedId: section.id,
                    status: 'active',
                    title: section.name,
                    course: { sourcedId: section.gradeId },
                    org: { sourcedId: tenantId },
                }));
                await auditSuccess(request, auth.context, entity, startedAt, result.length);
                return integrationJson({ classes: result });
            }

            case 'courses': {
                const { rows: grades } = await pool.query(
                    `SELECT id, name
                     FROM grades
                     WHERE tenant_id = $1`,
                    [tenantId],
                );
                const result = grades.map((grade) => ({
                    sourcedId: grade.id,
                    status: 'active',
                    title: grade.name,
                    org: { sourcedId: tenantId },
                }));
                await auditSuccess(request, auth.context, entity, startedAt, result.length);
                return integrationJson({ courses: result });
            }

            case 'enrollments': {
                const { rows: students } = await pool.query(
                    `SELECT id, section_id AS "sectionId", status
                     FROM students
                     WHERE tenant_id = $1
                       AND section_id IS NOT NULL`,
                    [tenantId],
                );
                const result = students.map((student) => ({
                    sourcedId: `${student.id}:${student.sectionId}`,
                    status: student.status === 'ACTIVE' ? 'active' : 'tobedeleted',
                    user: { sourcedId: student.id },
                    class: { sourcedId: student.sectionId },
                    role: 'student',
                    primary: true,
                }));
                await auditSuccess(request, auth.context, entity, startedAt, result.length);
                return integrationJson({ enrollments: result });
            }

            default:
                await recordIntegrationAudit({
                    tenantId,
                    provider: 'ONEROSTER',
                    action: `oneroster.${entity}`,
                    status: 'FAILED',
                    request,
                    context: auth.context,
                    statusCode: 404,
                    durationMs: Date.now() - startedAt,
                    error: 'Unknown OneRoster entity',
                });
                return integrationJson(
                    { error: `Unknown OneRoster entity: ${entity}. Valid: orgs, users, classes, courses, enrollments` },
                    { status: 404 },
                );
        }
    } catch (error) {
        await recordIntegrationAudit({
            tenantId,
            provider: 'ONEROSTER',
            action: `oneroster.${entity}`,
            status: 'FAILED',
            request,
            context: auth.context,
            statusCode: 500,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : 'OneRoster mock failed',
        });
        console.error(`[OneRoster] Error fetching ${entity}:`, error);
        return integrationJson({ error: 'Internal server error' }, { status: 500 });
    }
}

async function auditSuccess(
    request: Request,
    context: IntegrationAuthContext,
    entity: string,
    startedAt: number,
    count: number,
) {
    await recordIntegrationAudit({
        tenantId: context.tenantId,
        provider: 'ONEROSTER',
        action: `oneroster.${entity}`,
        status: 'SUCCESS',
        request,
        context,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        metadata: { count, mode: 'mock' },
    });
}

function mapRole(role: string): string {
    const roleMap: Record<string, string> = {
        SUPER_ADMIN: 'administrator',
        SCHOOL_ADMIN: 'administrator',
        PRINCIPAL: 'administrator',
        TEACHER: 'teacher',
        PARENT: 'guardian',
        STUDENT: 'student',
        ACCOUNTANT: 'aide',
        TRANSPORT_MANAGER: 'aide',
        ADMISSION_COUNSELOR: 'aide',
    };
    return roleMap[role] || 'user';
}
