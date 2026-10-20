export type MetadataDataType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'PICKLIST' | 'CURRENCY';

export type RollupAggregateFunction = 'COUNT' | 'SUM' | 'MIN' | 'MAX' | 'AVG';

export type MetadataFieldSubType =
    | 'LOOKUP'
    | 'FORMULA'
    | 'ROLLUP_SUMMARY'
    | 'AUTO_NUMBER'
    | 'EMAIL'
    | 'PHONE'
    | 'URL';

export type CrossFieldConditionOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

export type DynamicVisibilityOperator =
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'greater_than'
    | 'less_than'
    | 'not_empty';

export type MetadataValidationRules = {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    fieldSubType?: MetadataFieldSubType;
    lookupTargetObject?: string;
    formulaExpression?: string;
    rollupChildObject?: string;
    rollupForeignKeyField?: string;
    rollupAggregate?: RollupAggregateFunction;
    rollupTargetField?: string;
    autoNumberPrefix?: string;
    crossFieldTarget?: string;
    crossFieldOperator?: CrossFieldConditionOperator;
    crossFieldErrorMessage?: string;
    visibilityWhenField?: string;
    visibilityWhenOperator?: DynamicVisibilityOperator;
    visibilityWhenValue?: string;
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

    if (
        input.fieldSubType === 'LOOKUP' ||
        input.fieldSubType === 'FORMULA' ||
        input.fieldSubType === 'ROLLUP_SUMMARY' ||
        input.fieldSubType === 'AUTO_NUMBER' ||
        input.fieldSubType === 'EMAIL' ||
        input.fieldSubType === 'PHONE' ||
        input.fieldSubType === 'URL'
    ) {
        rules.fieldSubType = input.fieldSubType;
    }

    if (input.autoNumberPrefix != null && String(input.autoNumberPrefix).trim() !== '') {
        const prefix = String(input.autoNumberPrefix).trim();
        if (prefix.length > 64) throw new Error('Auto-number prefix must be 64 characters or fewer.');
        rules.autoNumberPrefix = prefix;
        rules.fieldSubType = 'AUTO_NUMBER';
    }

    if (input.crossFieldTarget != null && String(input.crossFieldTarget).trim() !== '') {
        const target = String(input.crossFieldTarget).trim().toLowerCase();
        assertSafeMetadataIdentifier(target, 'cross-field validation target');
        rules.crossFieldTarget = target;
        const op = String(input.crossFieldOperator || 'lte').trim().toLowerCase() as CrossFieldConditionOperator;
        if (!['gt', 'gte', 'lt', 'lte', 'eq', 'neq'].includes(op)) {
            throw new Error('Invalid cross-field validation operator.');
        }
        rules.crossFieldOperator = op;
        if (input.crossFieldErrorMessage != null && String(input.crossFieldErrorMessage).trim() !== '') {
            rules.crossFieldErrorMessage = String(input.crossFieldErrorMessage).trim().slice(0, 250);
        }
    }

    if (input.visibilityWhenField != null && String(input.visibilityWhenField).trim() !== '') {
        const visField = String(input.visibilityWhenField).trim().toLowerCase();
        assertSafeMetadataIdentifier(visField, 'visibility condition field');
        rules.visibilityWhenField = visField;
        const visOp = String(input.visibilityWhenOperator || 'equals').trim().toLowerCase() as DynamicVisibilityOperator;
        if (
            !['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'not_empty'].includes(
                visOp,
            )
        ) {
            throw new Error('Invalid visibility condition operator.');
        }
        rules.visibilityWhenOperator = visOp;
        rules.visibilityWhenValue = String(input.visibilityWhenValue ?? '').trim();
    }

    if (input.lookupTargetObject != null && String(input.lookupTargetObject).trim() !== '') {
        const target = String(input.lookupTargetObject).trim().toLowerCase();
        assertSafeMetadataIdentifier(target, 'lookup target object');
        rules.lookupTargetObject = target;
        rules.fieldSubType = 'LOOKUP';
    }

    if (input.formulaExpression != null && String(input.formulaExpression).trim() !== '') {
        const expr = String(input.formulaExpression).trim();
        if (expr.length > 500) throw new Error('Formula expression must be 500 characters or fewer.');
        rules.formulaExpression = expr;
        rules.fieldSubType = 'FORMULA';
    }

    if (input.rollupChildObject != null && String(input.rollupChildObject).trim() !== '') {
        const childObj = String(input.rollupChildObject).trim().toLowerCase();
        assertSafeMetadataIdentifier(childObj, 'roll-up child object');
        rules.rollupChildObject = childObj;
        rules.fieldSubType = 'ROLLUP_SUMMARY';
    }
    if (input.rollupForeignKeyField != null && String(input.rollupForeignKeyField).trim() !== '') {
        const fkField = String(input.rollupForeignKeyField).trim().toLowerCase();
        assertSafeMetadataIdentifier(fkField, 'roll-up foreign key field');
        rules.rollupForeignKeyField = fkField;
    }
    if (input.rollupAggregate != null && String(input.rollupAggregate).trim() !== '') {
        const agg = String(input.rollupAggregate).trim().toUpperCase() as RollupAggregateFunction;
        if (!['COUNT', 'SUM', 'MIN', 'MAX', 'AVG'].includes(agg)) {
            throw new Error('Roll-up aggregate must be COUNT, SUM, MIN, MAX, or AVG.');
        }
        rules.rollupAggregate = agg;
    }
    if (input.rollupTargetField != null && String(input.rollupTargetField).trim() !== '') {
        const targetField = String(input.rollupTargetField).trim().toLowerCase();
        assertSafeMetadataIdentifier(targetField, 'roll-up target field');
        rules.rollupTargetField = targetField;
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
    const rawType = String(input.dataType || '').trim().toUpperCase();

    if (!label || label.length > 255) throw new Error('Field label is required and must be 255 characters or fewer.');
    assertSafeMetadataIdentifier(apiName, 'field API name');

    const validationRules = normalizeValidationRules(input.validationRules);
    let dataType: MetadataDataType;

    if (rawType === 'LOOKUP' || validationRules.fieldSubType === 'LOOKUP') {
        const target = String(
            input.lookupTargetObject ?? validationRules.lookupTargetObject ?? '',
        )
            .trim()
            .toLowerCase();
        if (!target) {
            throw new Error('Lookup fields require a target object API name.');
        }
        assertSafeMetadataIdentifier(target, 'lookup target object');
        validationRules.fieldSubType = 'LOOKUP';
        validationRules.lookupTargetObject = target;
        dataType = 'TEXT';
    } else if (rawType === 'FORMULA' || validationRules.fieldSubType === 'FORMULA') {
        const expr = String(
            input.formulaExpression ?? validationRules.formulaExpression ?? '',
        ).trim();
        if (!expr) {
            throw new Error('Formula fields require a formula expression.');
        }
        if (expr.length > 500) {
            throw new Error('Formula expression must be 500 characters or fewer.');
        }
        validationRules.fieldSubType = 'FORMULA';
        validationRules.formulaExpression = expr;
        dataType = /^CONCAT\s*\(/i.test(expr) ? 'TEXT' : 'NUMBER';
    } else if (rawType === 'ROLLUP_SUMMARY' || validationRules.fieldSubType === 'ROLLUP_SUMMARY') {
        const childObj = String(
            input.rollupChildObject ?? validationRules.rollupChildObject ?? '',
        )
            .trim()
            .toLowerCase();
        const fkField = String(
            input.rollupForeignKeyField ?? validationRules.rollupForeignKeyField ?? '',
        )
            .trim()
            .toLowerCase();
        const agg = String(
            input.rollupAggregate ?? validationRules.rollupAggregate ?? 'COUNT',
        )
            .trim()
            .toUpperCase() as RollupAggregateFunction;
        const targetField = String(
            input.rollupTargetField ?? validationRules.rollupTargetField ?? '',
        )
            .trim()
            .toLowerCase();

        if (!childObj || !fkField) {
            throw new Error('Roll-up summary fields require a child object and lookup foreign-key field.');
        }
        assertSafeMetadataIdentifier(childObj, 'roll-up child object');
        assertSafeMetadataIdentifier(fkField, 'roll-up foreign key field');
        if (!['COUNT', 'SUM', 'MIN', 'MAX', 'AVG'].includes(agg)) {
            throw new Error('Roll-up aggregate must be COUNT, SUM, MIN, MAX, or AVG.');
        }
        if (agg !== 'COUNT') {
            if (!targetField) {
                throw new Error(`Roll-up ${agg} requires a numeric target field on ${childObj}.`);
            }
            assertSafeMetadataIdentifier(targetField, 'roll-up target field');
            validationRules.rollupTargetField = targetField;
        }
        validationRules.fieldSubType = 'ROLLUP_SUMMARY';
        validationRules.rollupChildObject = childObj;
        validationRules.rollupForeignKeyField = fkField;
        validationRules.rollupAggregate = agg;
        dataType = 'NUMBER';
    } else if (rawType === 'AUTO_NUMBER' || validationRules.fieldSubType === 'AUTO_NUMBER') {
        const prefix = String(
            input.autoNumberPrefix ?? validationRules.autoNumberPrefix ?? 'REC-{YYYY}-{0000}',
        ).trim();
        validationRules.fieldSubType = 'AUTO_NUMBER';
        validationRules.autoNumberPrefix = prefix;
        dataType = 'TEXT';
    } else if (rawType === 'EMAIL' || validationRules.fieldSubType === 'EMAIL') {
        validationRules.fieldSubType = 'EMAIL';
        dataType = 'TEXT';
    } else if (rawType === 'PHONE' || validationRules.fieldSubType === 'PHONE') {
        validationRules.fieldSubType = 'PHONE';
        dataType = 'TEXT';
    } else if (rawType === 'URL' || validationRules.fieldSubType === 'URL') {
        validationRules.fieldSubType = 'URL';
        dataType = 'TEXT';
    } else {
        if (!METADATA_DATA_TYPES.has(rawType as MetadataDataType)) {
            throw new Error('Unsupported field data type.');
        }
        dataType = rawType as MetadataDataType;
    }

    const picklistOptions = dataType === 'PICKLIST'
        ? normalizePicklistOptions(input.picklistOptions)
        : [];

    if (dataType === 'PICKLIST' && picklistOptions.length === 0) {
        throw new Error('Picklist fields require at least one option.');
    }

    const isAutoOrVirtual =
        validationRules.fieldSubType === 'FORMULA' ||
        validationRules.fieldSubType === 'ROLLUP_SUMMARY' ||
        validationRules.fieldSubType === 'AUTO_NUMBER';

    return {
        label,
        apiName,
        dataType,
        isRequired: isAutoOrVirtual ? false : Boolean(input.isRequired),
        picklistOptions,
        validationRules,
    };
}

export function isVirtualMetadataField(field: { validationRules?: MetadataValidationRules | null }): boolean {
    const sub = field.validationRules?.fieldSubType;
    return sub === 'FORMULA' || sub === 'ROLLUP_SUMMARY';
}

/**
 * Generates a formatted sequential or timestamped auto-number string from a pattern
 * such as `'ADM-{YYYY}-{0000}'` or `'BATCH-{0000}'`.
 */
export function generateMetadataAutoNumber(
    formatPattern = 'REC-{YYYY}-{0000}',
    sequenceNumber?: number,
): string {
    const year = String(new Date().getFullYear());
    const seq =
        sequenceNumber != null && Number.isFinite(sequenceNumber)
            ? Math.max(1, Math.floor(sequenceNumber))
            : Math.floor(1000 + Math.random() * 9000);
    return formatPattern
        .replace(/\{YYYY\}/gi, year)
        .replace(/\{(0+)\}/g, (_m, zeros: string) => String(seq).padStart(zeros.length, '0'));
}

/**
 * Evaluates a Dynamic Form conditional visibility rule (section-level or field-level)
 * against the current form values.
 */
export function evaluateMetadataVisibilityRule(
    rule: {
        field?: string;
        operator?: DynamicVisibilityOperator | string;
        value?: string;
    } | null | undefined,
    recordValues: Record<string, unknown>,
): boolean {
    if (!rule || !rule.field) return true;
    const raw = recordValues[rule.field];
    const actualStr = raw == null ? '' : String(raw).trim();
    const expectedStr = String(rule.value ?? '').trim();
    const op = rule.operator || 'equals';

    switch (op) {
        case 'equals':
        case 'eq':
            return actualStr.toLowerCase() === expectedStr.toLowerCase();
        case 'not_equals':
        case 'neq':
            return actualStr.toLowerCase() !== expectedStr.toLowerCase();
        case 'contains':
            return actualStr.toLowerCase().includes(expectedStr.toLowerCase());
        case 'greater_than':
        case 'gt':
            return Number(raw) > Number(expectedStr);
        case 'less_than':
        case 'lt':
            return Number(raw) < Number(expectedStr);
        case 'not_empty':
            return actualStr.length > 0;
        default:
            return true;
    }
}

/**
 * Evaluates a Salesforce-style Roll-Up Summary (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`)
 * across all child records referencing a parent record ID.
 */
export function evaluateMetadataRollupSummary(
    aggregate: RollupAggregateFunction,
    childRecords: Record<string, unknown>[],
    targetField?: string,
): number {
    if (aggregate === 'COUNT') {
        return childRecords.length;
    }
    if (!targetField || childRecords.length === 0) return 0;

    const nums: number[] = [];
    for (const row of childRecords) {
        const parsed = Number(row[targetField]);
        if (Number.isFinite(parsed)) {
            nums.push(parsed);
        }
    }
    if (nums.length === 0) return 0;

    switch (aggregate) {
        case 'SUM':
            return Math.round(nums.reduce((acc, n) => acc + n, 0) * 100) / 100;
        case 'AVG':
            return Math.round((nums.reduce((acc, n) => acc + n, 0) / nums.length) * 100) / 100;
        case 'MIN':
            return Math.min(...nums);
        case 'MAX':
            return Math.max(...nums);
        default:
            return 0;
    }
}

/**
 * Safe, dependency-free expression evaluator for `FORMULA` metadata fields.
 * Supports:
 *   1. `CONCAT(field_a, ' ', field_b)`
 *   2. `DAYS_BETWEEN(date_field, TODAY())`
 *   3. Arithmetic expressions (`+`, `-`, `*`, `/`, parentheses) referencing record fields
 *      e.g. `amount - paid_amount` or `{total_fee} * 0.18`
 */
export function evaluateMetadataFormula(
    expression: string,
    record: Record<string, unknown>,
): string | number | null {
    const raw = String(expression || '').trim();
    if (!raw) return null;

    // 1. CONCAT(...)
    const concatMatch = raw.match(/^CONCAT\s*\(([\s\S]*)\)$/i);
    if (concatMatch) {
        const inner = concatMatch[1];
        const parts: string[] = [];
        let current = '';
        let inQuote: "'" | '"' | null = null;
        for (let i = 0; i < inner.length; i++) {
            const ch = inner[i];
            if ((ch === "'" || ch === '"') && (i === 0 || inner[i - 1] !== '\\')) {
                if (inQuote === ch) {
                    inQuote = null;
                } else if (!inQuote) {
                    inQuote = ch;
                }
                current += ch;
            } else if (ch === ',' && !inQuote) {
                parts.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        if (current.trim()) parts.push(current.trim());

        return parts
            .map(token => {
                if (
                    (token.startsWith("'") && token.endsWith("'")) ||
                    (token.startsWith('"') && token.endsWith('"'))
                ) {
                    return token.slice(1, -1);
                }
                const fieldKey = token.replace(/^\{|\}$/g, '').trim();
                const val = record[fieldKey];
                return val == null ? '' : String(val);
            })
            .join('');
    }

    // 2. DAYS_BETWEEN(start, end)
    const daysMatch = raw.match(/^DAYS_BETWEEN\s*\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/i);
    if (daysMatch) {
        const resolveDate = (token: string): number | null => {
            const cleaned = token.replace(/^\{|\}$/g, '').trim();
            if (/^TODAY\s*\(\s*\)$/i.test(cleaned)) {
                return Date.now();
            }
            const val = record[cleaned] ?? cleaned.replace(/^['"]|['"]$/g, '');
            if (!val) return null;
            const parsed = new Date(String(val)).getTime();
            return Number.isFinite(parsed) ? parsed : null;
        };
        const d1 = resolveDate(daysMatch[1]);
        const d2 = resolveDate(daysMatch[2]);
        if (d1 == null || d2 == null) return null;
        return Math.round((d2 - d1) / 86_400_000);
    }

    // 3. Safe recursive-descent arithmetic evaluator
    const substituted = raw.replace(/\{?([a-z][a-z0-9_]*)\}?/gi, (match, ident: string) => {
        if (ident.toUpperCase() === 'TODAY') return '0';
        const val = record[ident] ?? record[ident.toLowerCase()];
        const num = Number(val);
        return Number.isFinite(num) ? String(num) : '0';
    });

    if (!/^[0-9+\-*/().\s]+$/.test(substituted)) {
        return null;
    }

    try {
        const tokens = substituted.match(/\d+(?:\.\d+)?|[+\-*/()]/g) || [];
        let pos = 0;

        const parseExpression = (): number => {
            let left = parseTerm();
            while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
                const op = tokens[pos++];
                const right = parseTerm();
                left = op === '+' ? left + right : left - right;
            }
            return left;
        };

        const parseTerm = (): number => {
            let left = parseFactor();
            while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
                const op = tokens[pos++];
                const right = parseFactor();
                left = op === '*' ? left * right : right === 0 ? 0 : left / right;
            }
            return left;
        };

        const parseFactor = (): number => {
            if (tokens[pos] === '-') {
                pos++;
                return -parseFactor();
            }
            if (tokens[pos] === '+') {
                pos++;
                return parseFactor();
            }
            if (tokens[pos] === '(') {
                pos++;
                const val = parseExpression();
                if (tokens[pos] === ')') pos++;
                return val;
            }
            const num = Number(tokens[pos++] ?? '0');
            return Number.isFinite(num) ? num : 0;
        };

        const result = parseExpression();
        if (!Number.isFinite(result)) return null;
        return Math.round(result * 100) / 100;
    } catch {
        return null;
    }
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

    if (rules.fieldSubType === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        throw new Error(`${field.label} must be a valid email address.`);
    }
    if (rules.fieldSubType === 'PHONE' && !/^[+\d][\d\s\-()]{6,20}$/.test(text)) {
        throw new Error(`${field.label} must be a valid phone number.`);
    }
    if (rules.fieldSubType === 'URL' && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(text)) {
        throw new Error(`${field.label} must be a valid http(s) URL.`);
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
            if (isVirtualMetadataField(field)) continue;
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
        if (isVirtualMetadataField(field)) {
            continue;
        }

        try {
            data[key] = coerceMetadataValue(field, value);
        } catch (error) {
            errors.push(error instanceof Error ? error.message : `Invalid value for ${key}`);
        }
    }

    // Populate AUTO_NUMBER fields when empty on create, and evaluate Cross-Field Validation Rules
    for (const field of fields) {
        const rules = field.validationRules;
        if (!rules) continue;

        if (
            rules.fieldSubType === 'AUTO_NUMBER' &&
            (options.requireAll ?? true) &&
            isEmpty(data[field.apiName])
        ) {
            data[field.apiName] = generateMetadataAutoNumber(
                rules.autoNumberPrefix || 'REC-{YYYY}-{0000}',
            );
        }

        if (rules.crossFieldTarget && rules.crossFieldOperator) {
            const leftVal = data[field.apiName] ?? payload[field.apiName];
            const rightVal = data[rules.crossFieldTarget] ?? payload[rules.crossFieldTarget];
            if (!isEmpty(leftVal) && !isEmpty(rightVal)) {
                const leftNum = Number(leftVal);
                const rightNum = Number(rightVal);
                const bothNumeric = Number.isFinite(leftNum) && Number.isFinite(rightNum);
                const a = bothNumeric ? leftNum : String(leftVal);
                const b = bothNumeric ? rightNum : String(rightVal);

                let passes = true;
                switch (rules.crossFieldOperator) {
                    case 'gt':
                        passes = a > b;
                        break;
                    case 'gte':
                        passes = a >= b;
                        break;
                    case 'lt':
                        passes = a < b;
                        break;
                    case 'lte':
                        passes = a <= b;
                        break;
                    case 'eq':
                        passes = a === b;
                        break;
                    case 'neq':
                        passes = a !== b;
                        break;
                }
                if (!passes) {
                    errors.push(
                        rules.crossFieldErrorMessage ||
                            `${field.label} must satisfy ${rules.crossFieldOperator.toUpperCase()} ${rules.crossFieldTarget}.`,
                    );
                }
            }
        }
    }

    return errors.length > 0 ? { ok: false, errors } : { ok: true, data };
}
