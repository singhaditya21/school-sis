export type MetadataDataType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'PICKLIST' | 'CURRENCY';

export type MetadataValidationRules = {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
};

export type RuntimeMetadataField = {
    id: string;
    apiName: string;
    label: string;
    dataType: MetadataDataType;
    isRequired?: boolean;
    picklistOptions?: string[] | null;
    validationRules?: MetadataValidationRules | null;
};

export type ValidatedMetadataPayload =
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; errors: string[] };

const IDENTIFIER_RE = /^[a-z][a-z0-9_]{1,62}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const RESERVED_IDENTIFIERS = new Set([
    'all',
    'alter',
    'and',
    'any',
    'as',
    'between',
    'by',
    'case',
    'create',
    'delete',
    'drop',
    'from',
    'group',
    'insert',
    'into',
    'join',
    'limit',
    'not',
    'null',
    'or',
    'order',
    'select',
    'table',
    'tenant_id',
    'update',
    'where',
]);

export const METADATA_OBJECT_STATUSES = new Set(['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const METADATA_FIELD_STATUSES = new Set(['DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED']);
export const METADATA_DATA_TYPES = new Set<MetadataDataType>([
    'TEXT',
    'NUMBER',
    'BOOLEAN',
    'DATE',
    'PICKLIST',
    'CURRENCY',
]);

export function isSafeMetadataIdentifier(value: unknown): value is string {
    return typeof value === 'string' && IDENTIFIER_RE.test(value) && !RESERVED_IDENTIFIERS.has(value);
}

function isSafeSqlIdentifier(value: unknown): value is string {
    return typeof value === 'string' && IDENTIFIER_RE.test(value);
}

export function assertSafeMetadataIdentifier(value: string, label = 'metadata identifier'): void {
    if (!isSafeMetadataIdentifier(value)) {
        throw new Error(`Invalid ${label}. Use lower-case letters, numbers, and underscores, starting with a letter.`);
    }
}

export function quoteIdentifier(identifier: string): string {
    if (!isSafeSqlIdentifier(identifier)) {
        throw new Error('Invalid SQL identifier.');
    }
    return `"${identifier}"`;
}

export function quoteSqlAlias(alias: string): string {
    const trimmed = String(alias || '').trim();
    if (!trimmed || trimmed.length > 120) throw new Error('Invalid SQL alias.');
    return `"${trimmed.replace(/"/g, '""')}"`;
}

export function normalizePicklistOptions(value: unknown): string[] {
    if (value == null) return [];
    if (!Array.isArray(value)) throw new Error('Picklist options must be an array.');

    const options = value
        .map((option) => String(option).trim())
        .filter(Boolean);

    if (options.length > 100) throw new Error('Picklist fields support at most 100 options.');

    const seen = new Set<string>();
    for (const option of options) {
        if (option.length > 120) throw new Error('Picklist options must be 120 characters or fewer.');
        const key = option.toLowerCase();
        if (seen.has(key)) throw new Error('Picklist options must be unique.');
        seen.add(key);
    }

    return options;
}

export function normalizeValidationRules(value: unknown): MetadataValidationRules {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const input = value as Record<string, unknown>;
    const rules: MetadataValidationRules = {};

    for (const key of ['minLength', 'maxLength', 'min', 'max'] as const) {
        if (input[key] == null || input[key] === '') continue;
        const parsed = Number(input[key]);
        if (!Number.isFinite(parsed)) throw new Error(`Validation rule ${key} must be numeric.`);
        rules[key] = parsed;
    }

    if (input.pattern != null && input.pattern !== '') {
        const pattern = String(input.pattern);
        if (pattern.length > 250) throw new Error('Validation pattern is too long.');
        new RegExp(pattern);
        rules.pattern = pattern;
    }

    if (rules.minLength != null && rules.maxLength != null && rules.minLength > rules.maxLength) {
        throw new Error('Minimum length cannot be greater than maximum length.');
    }
    if (rules.min != null && rules.max != null && rules.min > rules.max) {
        throw new Error('Minimum value cannot be greater than maximum value.');
    }

    return rules;
}

export function normalizeMetadataFieldInput(input: Record<string, unknown>) {
    const label = String(input.label || '').trim();
    const apiName = String(input.apiName || '').trim();
    const dataType = String(input.dataType || '').trim().toUpperCase() as MetadataDataType;

    if (!label || label.length > 255) throw new Error('Field label is required and must be 255 characters or fewer.');
    assertSafeMetadataIdentifier(apiName, 'field API name');
    if (!METADATA_DATA_TYPES.has(dataType)) throw new Error('Unsupported field data type.');

    const picklistOptions = dataType === 'PICKLIST'
        ? normalizePicklistOptions(input.picklistOptions)
        : [];

    if (dataType === 'PICKLIST' && picklistOptions.length === 0) {
        throw new Error('Picklist fields require at least one option.');
    }

    return {
        label,
        apiName,
        dataType,
        isRequired: Boolean(input.isRequired),
        picklistOptions,
        validationRules: normalizeValidationRules(input.validationRules),
    };
}

export function eavValueColumnForType(dataType: MetadataDataType): 'value_string' | 'value_number' | 'value_boolean' | 'value_date' {
    if (dataType === 'NUMBER' || dataType === 'CURRENCY') return 'value_number';
    if (dataType === 'BOOLEAN') return 'value_boolean';
    if (dataType === 'DATE') return 'value_date';
    return 'value_string';
}

function isEmpty(value: unknown): boolean {
    return value == null || value === '';
}

function coerceMetadataValue(field: RuntimeMetadataField, value: unknown): unknown {
    const rules = field.validationRules || {};

    if (isEmpty(value)) {
        if (field.isRequired) throw new Error(`${field.label} is required.`);
        return null;
    }

    if (field.dataType === 'BOOLEAN') {
        if (typeof value === 'boolean') return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
        throw new Error(`${field.label} must be true or false.`);
    }

    if (field.dataType === 'NUMBER' || field.dataType === 'CURRENCY') {
        const parsed = typeof value === 'number' ? value : Number(String(value).trim());
        if (!Number.isFinite(parsed)) throw new Error(`${field.label} must be a number.`);
        if (rules.min != null && parsed < rules.min) throw new Error(`${field.label} must be at least ${rules.min}.`);
        if (rules.max != null && parsed > rules.max) throw new Error(`${field.label} must be at most ${rules.max}.`);
        return String(parsed);
    }

    if (field.dataType === 'DATE') {
        const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim();
        if (!DATE_RE.test(raw) || Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime())) {
            throw new Error(`${field.label} must be a valid date.`);
        }
        return raw;
    }

    const text = String(value).trim();
    if (field.dataType === 'PICKLIST') {
        const options = field.picklistOptions || [];
        if (options.length > 0 && !options.includes(text)) {
            throw new Error(`${field.label} must be one of the configured options.`);
        }
    }

    if (rules.minLength != null && text.length < rules.minLength) {
        throw new Error(`${field.label} must be at least ${rules.minLength} characters.`);
    }
    if (rules.maxLength != null && text.length > rules.maxLength) {
        throw new Error(`${field.label} must be at most ${rules.maxLength} characters.`);
    }
    if (rules.pattern && !new RegExp(rules.pattern).test(text)) {
        throw new Error(`${field.label} is not in the expected format.`);
    }

    return text;
}

export function validateMetadataRecordPayload(
    fields: RuntimeMetadataField[],
    payload: Record<string, unknown>,
    options: { requireAll?: boolean } = {},
): ValidatedMetadataPayload {
    const fieldByApiName = new Map(fields.map((field) => [field.apiName, field]));
    const errors: string[] = [];
    const data: Record<string, unknown> = {};

    if (options.requireAll ?? true) {
        for (const field of fields) {
            if (!field.isRequired) continue;
            if (isEmpty(payload[field.apiName])) errors.push(`${field.label} is required.`);
        }
    }

    for (const [key, value] of Object.entries(payload)) {
        const field = fieldByApiName.get(key);
        if (!field) {
            errors.push(`Unknown field: ${key}`);
            continue;
        }

        try {
            data[key] = coerceMetadataValue(field, value);
        } catch (error) {
            errors.push(error instanceof Error ? error.message : `Invalid value for ${key}`);
        }
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true, data };
}
