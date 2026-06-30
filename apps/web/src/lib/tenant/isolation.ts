import crypto from 'crypto';
import path from 'path';
import { NextResponse } from 'next/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TENANT_FIELD_NAMES = ['tenantId', 'tenant_id'] as const;

export const TENANT_STORAGE_FOLDERS = new Set([
    'documents',
    'avatars',
    'reports',
    'invoices',
    'certificates',
    'id-cards',
    'attachments',
    'exports',
    'general',
]);

export type TenantScopedResult<T> =
    | { ok: true; data: T }
    | { ok: false; response: NextResponse };

export function isValidTenantId(value: unknown): value is string {
    return typeof value === 'string' && UUID_RE.test(value);
}

export function requireValidTenantId(tenantId: string): void {
    if (!isValidTenantId(tenantId)) {
        throw new Error('Invalid tenant context.');
    }
}

export function requireTenantHeaderMatch(request: Request, tenantId: string): NextResponse | null {
    const headerTenantId = request.headers.get('x-tenant-id');
    if (!headerTenantId) {
        return NextResponse.json({ error: 'X-Tenant-Id header is required' }, { status: 400 });
    }
    if (!isValidTenantId(headerTenantId)) {
        return NextResponse.json({ error: 'Invalid X-Tenant-Id header' }, { status: 400 });
    }
    if (headerTenantId !== tenantId) {
        return NextResponse.json({ error: 'Tenant header does not match request tenant' }, { status: 403 });
    }
    return null;
}

export function rejectCrossTenantFields(input: unknown, tenantId: string): NextResponse | null {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return null;
    }

    const record = input as Record<string, unknown>;
    for (const field of TENANT_FIELD_NAMES) {
        if (!(field in record)) continue;

        const value = record[field];
        if (value == null || value === '') continue;

        if (!isValidTenantId(value)) {
            return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
        }
        if (value !== tenantId) {
            return NextResponse.json({ error: 'Tenant field does not match authenticated tenant' }, { status: 403 });
        }
    }

    return null;
}

export function stripTenantFields<T extends Record<string, unknown>>(input: T): Omit<T, 'tenantId' | 'tenant_id'> {
    const { tenantId: _tenantId, tenant_id: _tenant_id, ...rest } = input;
    return rest;
}

export async function readTenantScopedJson<T = Record<string, unknown>>(
    request: Request,
    tenantId: string,
): Promise<TenantScopedResult<T>> {
    let data: unknown;
    try {
        data = await request.json();
    } catch {
        return {
            ok: false,
            response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
        };
    }

    const tenantError = rejectCrossTenantFields(data, tenantId);
    if (tenantError) {
        return { ok: false, response: tenantError };
    }

    return { ok: true, data: data as T };
}

export async function readTenantScopedFormData(
    request: Request,
    tenantId: string,
): Promise<TenantScopedResult<FormData>> {
    const formData = await request.formData();
    for (const field of TENANT_FIELD_NAMES) {
        const value = formData.get(field);
        if (value == null || value === '') continue;

        if (typeof value !== 'string' || !isValidTenantId(value)) {
            return {
                ok: false,
                response: NextResponse.json({ error: `Invalid ${field}` }, { status: 400 }),
            };
        }
        if (value !== tenantId) {
            return {
                ok: false,
                response: NextResponse.json({ error: 'Tenant field does not match authenticated tenant' }, { status: 403 }),
            };
        }
    }

    return { ok: true, data: formData };
}

export function normalizeStorageFolder(folder: string | null | undefined): string {
    const normalized = (folder || 'documents')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    if (!normalized || !TENANT_STORAGE_FOLDERS.has(normalized)) {
        throw new Error('Invalid upload folder.');
    }

    return normalized;
}

export function createTenantStorageKey(
    tenantId: string,
    folder: string,
    originalFilename: string,
): string {
    requireValidTenantId(tenantId);

    const safeFolder = normalizeStorageFolder(folder);
    const rawExt = path.extname(originalFilename || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const ext = rawExt.length > 0 && rawExt.length <= 8 ? rawExt : 'bin';

    return `${tenantId}/${safeFolder}/${crypto.randomUUID()}.${ext}`;
}

export function validateTenantStorageKey(key: string, tenantId: string): string {
    requireValidTenantId(tenantId);

    let decoded: string;
    try {
        decoded = decodeURIComponent(key);
    } catch {
        throw new Error('Invalid file path.');
    }

    if (
        decoded.includes('\0') ||
        decoded.includes('\\') ||
        decoded.startsWith('/') ||
        decoded.startsWith('~')
    ) {
        throw new Error('Invalid file path.');
    }

    const normalized = path.posix.normalize(decoded);
    const segments = normalized.split('/').filter(Boolean);

    if (
        normalized !== decoded ||
        segments.length < 3 ||
        segments.some((segment) => segment === '.' || segment === '..' || segment.includes('\0'))
    ) {
        throw new Error('Invalid file path.');
    }

    if (segments[0] !== tenantId) {
        throw new Error('Forbidden file path.');
    }

    if (!TENANT_STORAGE_FOLDERS.has(segments[1])) {
        throw new Error('Invalid file folder.');
    }

    return normalized;
}

export type TenantJobPayload = Record<string, unknown> & { tenantId: string };
export type PlatformJobPayload = Record<string, unknown> & { scope: 'platform' };

export function createTenantJobPayload(
    tenantId: string,
    payload: Record<string, unknown>,
): TenantJobPayload {
    requireValidTenantId(tenantId);

    const tenantError = rejectCrossTenantFields(payload, tenantId);
    if (tenantError) {
        throw new Error('Job payload tenant does not match context.');
    }

    return {
        ...stripTenantFields(payload),
        tenantId,
    };
}

export function createPlatformJobPayload(payload: Record<string, unknown>): PlatformJobPayload {
    const { tenantId: _tenantId, tenant_id: _tenant_id, ...rest } = payload;
    return {
        ...rest,
        scope: 'platform',
    };
}

export function getTenantIdFromJobPayload(payload: unknown): string {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Job payload must be an object.');
    }
    const tenantId = (payload as Record<string, unknown>).tenantId;
    if (!isValidTenantId(tenantId)) {
        throw new Error('Job payload is missing a valid tenantId.');
    }
    return tenantId;
}
