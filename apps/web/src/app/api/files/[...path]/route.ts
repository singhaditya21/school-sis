import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { requireApiAuth } from '@/lib/auth/api';
import { canAccessStudentDocument } from '@/lib/auth/document-access';
import { hasPermission, type UserRole } from '@/lib/rbac/permissions';
import { createPresignedObjectUrl } from '@/lib/storage/s3-config';
import { validateTenantStorageKey } from '@/lib/tenant/isolation';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENDED_STORAGE_FOLDERS = new Set(['logos', 'homework']);
const STAFF_ONLY_FOLDERS = new Set(['exports', 'reports', 'general']);
const INLINE_SAFE_IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)$/i;

function isInlineSafeImageKey(key: string): boolean {
    const filename = key.split('/').pop() || '';
    return INLINE_SAFE_IMAGE_EXT_RE.test(filename);
}

function validateExtendedTenantStorageKey(pathParts: string[], tenantId: string): string {
    if (pathParts.length >= 3 && EXTENDED_STORAGE_FOLDERS.has(pathParts[1])) {
        const proxyRaw = [pathParts[0], 'documents', ...pathParts.slice(2)].join('/');
        const validatedProxy = validateTenantStorageKey(proxyRaw, tenantId);
        const validatedSegments = validatedProxy.split('/');
        return [validatedSegments[0], pathParts[1], ...validatedSegments.slice(2)].join('/');
    }
    return validateTenantStorageKey(pathParts.join('/'), tenantId);
}

function hasFolderReadPermission(role: UserRole, folder: string): boolean {
    switch (folder) {
        case 'avatars':
        case 'logos':
            return true;
        case 'invoices':
            return hasPermission(role, 'fees:read') || hasPermission(role, 'invoices:read');
        case 'certificates':
        case 'id-cards':
            return (
                hasPermission(role, 'certificate:read') ||
                hasPermission(role, 'credentials:read') ||
                hasPermission(role, 'students:read')
            );
        case 'reports':
        case 'exports':
            return hasPermission(role, 'reports:read');
        case 'homework':
            return hasPermission(role, 'homework:read') || hasPermission(role, 'documents:read');
        case 'documents':
        case 'attachments':
        case 'general':
            return hasPermission(role, 'documents:read');
        default:
            return false;
    }
}

async function resolveReferencedStudentId(
    tenantId: string,
    key: string,
    candidateSegment: string,
    explicitStudentId: string | null,
): Promise<{ ok: true; studentId: string | null } | { ok: false; response: NextResponse }> {
    if (explicitStudentId) {
        const trimmed = explicitStudentId.trim();
        if (!UUID_RE.test(trimmed)) {
            return {
                ok: false,
                response: NextResponse.json({ error: 'Invalid studentId' }, { status: 400 }),
            };
        }
        return { ok: true, studentId: trimmed };
    }

    if (candidateSegment && UUID_RE.test(candidateSegment)) {
        return { ok: true, studentId: candidateSegment };
    }

    try {
        const lookup = await pool.query<{ studentId: string }>(
            `SELECT student_id AS "studentId"
               FROM student_documents
              WHERE tenant_id = $1
                AND (file_url = $2 OR file_url LIKE $3)
              LIMIT 1`,
            [tenantId, `/api/files/${key}`, `%/${key}`],
        );
        return { ok: true, studentId: lookup?.rows?.[0]?.studentId ?? null };
    } catch {
        return { ok: true, studentId: null };
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> },
) {
    const auth = await requireApiAuth();
    if (auth.ok === false) return auth.response;

    const { path: pathParts } = await params;
    if (!Array.isArray(pathParts) || pathParts.length < 3) {
        return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    let key: string;
    try {
        key = validateExtendedTenantStorageKey(pathParts, auth.context.tenantId);
    } catch (error: unknown) {
        const status = (error as { message?: string }).message === 'Forbidden file path.' ? 403 : 400;
        return NextResponse.json({ error: (error as { message?: string }).message || 'Invalid file path' }, { status });
    }

    const segments = key.split('/');
    const folder = segments[1] || '';
    const remainder = segments.slice(2);
    const candidateStudentId = remainder[0] || '';
    const explicitStudentId = request.nextUrl.searchParams.get('studentId');

    const role = auth.context.role as UserRole;
    const isParentOrStudent = role === 'PARENT' || role === 'STUDENT';

    if (isParentOrStudent) {
        if (STAFF_ONLY_FOLDERS.has(folder)) {
            return NextResponse.json({ error: 'Forbidden file path.' }, { status: 403 });
        }
        if (folder !== 'logos' && folder !== 'avatars') {
            if (remainder.length < 2 || !UUID_RE.test(candidateStudentId)) {
                return NextResponse.json({ error: 'Forbidden file path.' }, { status: 403 });
            }
            const allowed = await canAccessStudentDocument({
                tenantId: auth.context.tenantId,
                userId: auth.context.userId,
                role: auth.context.role,
                studentId: candidateStudentId,
                staffPermission: folder === 'invoices' ? 'fees:read' : 'students:read',
            });
            if (!allowed) {
                return NextResponse.json({ error: 'Forbidden file path.' }, { status: 403 });
            }
        }
    } else if (folder !== 'logos' && folder !== 'avatars') {
        const teacherScopedStudentDoc =
            role === 'TEACHER' &&
            (folder === 'documents' || folder === 'attachments') &&
            Boolean(UUID_RE.test(candidateStudentId) || explicitStudentId);

        if (!hasFolderReadPermission(role, folder) && !teacherScopedStudentDoc) {
            return NextResponse.json({ error: 'Forbidden file path.' }, { status: 403 });
        }

        const shouldCheckStudentAccess =
            folder === 'documents' ||
            folder === 'attachments' ||
            folder === 'general' ||
            folder === 'homework' ||
            role === 'TEACHER' ||
            Boolean(explicitStudentId);

        if (shouldCheckStudentAccess) {
            const refResult = await resolveReferencedStudentId(
                auth.context.tenantId,
                key,
                candidateStudentId,
                explicitStudentId,
            );
            if (refResult.ok === false) {
                return refResult.response;
            }
            if (refResult.studentId) {
                const staffPermission =
                    folder === 'homework'
                        ? 'homework:read'
                        : role === 'TEACHER'
                            ? 'students:read'
                            : 'documents:read';
                const allowed = await canAccessStudentDocument({
                    tenantId: auth.context.tenantId,
                    userId: auth.context.userId,
                    role: auth.context.role,
                    studentId: refResult.studentId,
                    staffPermission,
                });
                if (!allowed) {
                    return NextResponse.json({ error: 'Forbidden file path.' }, { status: 403 });
                }
            } else if (role === 'TEACHER' && (folder === 'certificates' || folder === 'id-cards' || folder === 'documents' || folder === 'attachments')) {
                return NextResponse.json({ error: 'Forbidden file path.' }, { status: 403 });
            }
        }
    }

    const requestedExpires = Number(request.nextUrl.searchParams.get('expires') || 300);
    const expiresSeconds = Math.min(900, Math.max(60, Number.isFinite(requestedExpires) ? requestedExpires : 300));
    const responseContentDisposition = isInlineSafeImageKey(key) ? undefined : 'attachment';

    let signedUrl: string;
    try {
        signedUrl = createPresignedObjectUrl(key, {
            method: 'GET',
            expiresSeconds,
            responseContentDisposition,
        });
    } catch (error: unknown) {
        return NextResponse.json({ error: (error as { message?: string }).message || 'Storage is not configured' }, { status: 503 });
    }

    if (request.nextUrl.searchParams.get('redirect') === 'false') {
        return NextResponse.json({
            success: true,
            data: {
                url: signedUrl,
                expiresIn: expiresSeconds,
            },
        });
    }

    const response = NextResponse.redirect(signedUrl, 307);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
}
