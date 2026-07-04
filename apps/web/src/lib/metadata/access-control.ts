import type { RuntimeMetadataField } from '@/lib/metadata/platform';

export type MetadataFieldPermission = {
    role: string;
    canRead?: boolean | null;
    canWrite?: boolean | null;
};

export type RuntimeMetadataFieldWithPermissions = RuntimeMetadataField & {
    permissions?: MetadataFieldPermission[] | null;
};

const METADATA_FIELD_BYPASS_ROLES = new Set(['PLATFORM_ADMIN', 'SUPER_ADMIN']);
const METADATA_FIELD_DEFAULT_ACCESS_ROLES = new Set(['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN']);

function permissionsForRole(field: RuntimeMetadataFieldWithPermissions, role: string): MetadataFieldPermission | null {
    const permissions = Array.isArray(field.permissions) ? field.permissions : [];
    return permissions.find((permission) => permission.role === role) ?? null;
}

export function canReadMetadataField(role: string, field: RuntimeMetadataFieldWithPermissions): boolean {
    if (METADATA_FIELD_BYPASS_ROLES.has(role)) return true;

    const explicit = permissionsForRole(field, role);
    if (explicit) return explicit.canRead !== false;

    return METADATA_FIELD_DEFAULT_ACCESS_ROLES.has(role);
}

export function canWriteMetadataField(role: string, field: RuntimeMetadataFieldWithPermissions): boolean {
    if (METADATA_FIELD_BYPASS_ROLES.has(role)) return true;

    const explicit = permissionsForRole(field, role);
    if (explicit) return explicit.canWrite === true;

    return METADATA_FIELD_DEFAULT_ACCESS_ROLES.has(role);
}

export function filterReadableMetadataFields(
    fields: readonly RuntimeMetadataFieldWithPermissions[],
    role: string,
): RuntimeMetadataFieldWithPermissions[] {
    return fields.filter((field) => canReadMetadataField(role, field));
}

export type MetadataWriteAccessResult =
    | { ok: true }
    | { ok: false; deniedFields: string[]; blockedRequiredFields: string[] };

export function checkWritableMetadataPayload(
    fields: readonly RuntimeMetadataFieldWithPermissions[],
    role: string,
    payload: Record<string, unknown>,
): MetadataWriteAccessResult {
    const fieldByApiName = new Map(fields.map((field) => [field.apiName, field]));
    const deniedFields = Object.keys(payload)
        .map((fieldName) => fieldByApiName.get(fieldName))
        .filter((field): field is RuntimeMetadataFieldWithPermissions => Boolean(field))
        .filter((field) => !canWriteMetadataField(role, field))
        .map((field) => field.apiName);

    const blockedRequiredFields = fields
        .filter((field) => field.isRequired)
        .filter((field) => !canWriteMetadataField(role, field))
        .map((field) => field.apiName);

    if (deniedFields.length > 0 || blockedRequiredFields.length > 0) {
        return { ok: false, deniedFields, blockedRequiredFields };
    }

    return { ok: true };
}
