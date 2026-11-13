import type { RuntimeMetadataField } from '@/lib/metadata/platform';

export type MetadataFieldPermission = {
    role: string;
    canRead?: boolean | null;
    canWrite?: boolean | null;
};

export type RuntimeMetadataFieldWithPermissions = RuntimeMetadataField & {
    permissions?: MetadataFieldPermission[] | null;
};

export const LEDGER_AND_IDENTITY_PROTECTED_TABLES: ReadonlySet<string> = new Set([
    'invoices',
    'payments',
    'payment_orders',
    'concessions',
    'receipts',
    'users',
    'workflow_approval_requests',
    'workflow_approval_reviews',
    'audit_logs',
    'platform_audit_logs',
]);

export const PROTECTED_LEGACY_PLAINTEXT_COLUMNS: ReadonlySet<string> = new Set([
    'aadhaar_number',
    'apaar_id',
    'email',
    'phone',
    'alternate_phone',
    'emergency_phone',
    'doctor_phone',
    'passport_number',
    'pan_number',
    'bank_account',
    'parent_email',
    'parent_phone',
    'password_hash',
    'mfa_secret',
    'mfa_backup_codes',
    'session_version',
]);

export function isProtectedLedgerOrIdentityTable(tableName: string | null | undefined): boolean {
    if (!tableName) return false;
    return LEDGER_AND_IDENTITY_PROTECTED_TABLES.has(tableName.trim().toLowerCase());
}

export function isProtectedLegacyPlaintextColumn(columnName: string | null | undefined): boolean {
    if (!columnName) return false;
    return PROTECTED_LEGACY_PLAINTEXT_COLUMNS.has(columnName.trim().toLowerCase());
}

const METADATA_FIELD_BYPASS_ROLES = new Set(['PLATFORM_ADMIN', 'SUPER_ADMIN']);
const METADATA_FIELD_DEFAULT_ACCESS_ROLES = new Set(['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN']);

function permissionsForRole(field: RuntimeMetadataFieldWithPermissions, role: string): MetadataFieldPermission | null {
    const permissions = Array.isArray(field.permissions) ? field.permissions : [];
    return permissions.find((permission) => permission.role === role) ?? null;
}

export function canReadMetadataField(
    role: string,
    field: RuntimeMetadataFieldWithPermissions,
    fallbackRole?: string,
): boolean {
    if (METADATA_FIELD_BYPASS_ROLES.has(role) || (fallbackRole && METADATA_FIELD_BYPASS_ROLES.has(fallbackRole))) {
        return true;
    }

    const explicit = permissionsForRole(field, role);
    if (explicit) return explicit.canRead !== false;

    if (fallbackRole && fallbackRole !== role) {
        const fallbackExplicit = permissionsForRole(field, fallbackRole);
        if (fallbackExplicit) return fallbackExplicit.canRead !== false;
    }

    return METADATA_FIELD_DEFAULT_ACCESS_ROLES.has(role) || Boolean(fallbackRole && METADATA_FIELD_DEFAULT_ACCESS_ROLES.has(fallbackRole));
}

export function canWriteMetadataField(
    role: string,
    field: RuntimeMetadataFieldWithPermissions,
    fallbackRole?: string,
): boolean {
    if (METADATA_FIELD_BYPASS_ROLES.has(role) || (fallbackRole && METADATA_FIELD_BYPASS_ROLES.has(fallbackRole))) {
        return true;
    }

    const explicit = permissionsForRole(field, role);
    if (explicit) return explicit.canWrite === true;

    if (fallbackRole && fallbackRole !== role) {
        const fallbackExplicit = permissionsForRole(field, fallbackRole);
        if (fallbackExplicit) return fallbackExplicit.canWrite === true;
    }

    return METADATA_FIELD_DEFAULT_ACCESS_ROLES.has(role) || Boolean(fallbackRole && METADATA_FIELD_DEFAULT_ACCESS_ROLES.has(fallbackRole));
}

export function filterReadableMetadataFields(
    fields: readonly RuntimeMetadataFieldWithPermissions[],
    role: string,
    fallbackRole?: string,
): RuntimeMetadataFieldWithPermissions[] {
    return fields.filter((field) => canReadMetadataField(role, field, fallbackRole));
}

export type MetadataWriteAccessResult =
    | { ok: true }
    | { ok: false; deniedFields: string[]; blockedRequiredFields: string[] };

export function checkWritableMetadataPayload(
    fields: readonly RuntimeMetadataFieldWithPermissions[],
    role: string,
    payload: Record<string, unknown>,
    fallbackRole?: string,
): MetadataWriteAccessResult {
    const fieldByApiName = new Map(fields.map((field) => [field.apiName, field]));
    const deniedFields = Object.keys(payload)
        .map((fieldName) => fieldByApiName.get(fieldName))
        .filter((field): field is RuntimeMetadataFieldWithPermissions => Boolean(field))
        .filter((field) => !canWriteMetadataField(role, field, fallbackRole))
        .map((field) => field.apiName);

    const blockedRequiredFields = fields
        .filter((field) => field.isRequired)
        .filter((field) => !canWriteMetadataField(role, field, fallbackRole))
        .map((field) => field.apiName);

    if (deniedFields.length > 0 || blockedRequiredFields.length > 0) {
        return { ok: false, deniedFields, blockedRequiredFields };
    }

    return { ok: true };
}
