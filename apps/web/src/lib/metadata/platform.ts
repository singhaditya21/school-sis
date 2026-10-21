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

export type DuplicateRuleBehavior = 'BLOCK' | 'WARN';

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
    duplicateRuleBehavior?: DuplicateRuleBehavior;
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

    if (input.duplicateRuleBehavior != null && String(input.duplicateRuleBehavior).trim() !== '') {
        const dupRule = String(input.duplicateRuleBehavior).trim().toUpperCase();
        if (dupRule !== 'BLOCK' && dupRule !== 'WARN') {
            throw new Error('Duplicate rule behavior must be BLOCK or WARN.');
        }
        rules.duplicateRuleBehavior = dupRule as DuplicateRuleBehavior;
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

export interface DuplicateMatchEntry {
    recordId: string;
    fieldApiName: string;
    fieldLabel: string;
    matchedValue: string;
    behavior: DuplicateRuleBehavior;
}

/**
 * Evaluates Salesforce-style Duplicate & Matching Rules across existing records of an object.
 * Checks fields configured with `validationRules.duplicateRuleBehavior` (`BLOCK` or `WARN`)
 * and, when `includeContactHeuristics` is true, also flags exact matches on `EMAIL` / `PHONE`
 * or primary name fields (`student_name`, `candidate_name`, `email`, `phone`) as `WARN`.
 */
export function detectMetadataDuplicates(
    fields: Pick<RuntimeMetadataField, 'apiName' | 'label' | 'validationRules'>[],
    candidateRecord: Record<string, unknown>,
    existingRecords: Record<string, unknown>[],
    options: { excludeRecordId?: string; includeContactHeuristics?: boolean } = {},
): {
    blocked: boolean;
    matches: DuplicateMatchEntry[];
} {
    const matches: DuplicateMatchEntry[] = [];
    const heuristicKeys = new Set([
        'email',
        'contact_email',
        'phone',
        'contact_phone',
        'student_name',
        'candidate_name',
    ]);

    for (const field of fields) {
        const explicitRule = field.validationRules?.duplicateRuleBehavior;
        const subType = field.validationRules?.fieldSubType;
        const isHeuristic =
            Boolean(options.includeContactHeuristics) &&
            (subType === 'EMAIL' || subType === 'PHONE' || heuristicKeys.has(field.apiName));

        const behavior: DuplicateRuleBehavior | undefined =
            explicitRule || (isHeuristic ? 'WARN' : undefined);
        if (!behavior) continue;

        const rawCandidate = candidateRecord[field.apiName];
        if (isEmpty(rawCandidate)) continue;

        const normalizedCandidate =
            subType === 'PHONE'
                ? String(rawCandidate).replace(/\D/g, '')
                : String(rawCandidate).trim().toLowerCase();
        if (!normalizedCandidate) continue;

        for (const row of existingRecords) {
            const rowId = String(row.id ?? '');
            if (!rowId || (options.excludeRecordId && rowId === options.excludeRecordId)) {
                continue;
            }
            const rawExisting = row[field.apiName];
            if (isEmpty(rawExisting)) continue;

            const normalizedExisting =
                subType === 'PHONE'
                    ? String(rawExisting).replace(/\D/g, '')
                    : String(rawExisting).trim().toLowerCase();

            if (normalizedExisting && normalizedExisting === normalizedCandidate) {
                matches.push({
                    recordId: rowId,
                    fieldApiName: field.apiName,
                    fieldLabel: field.label,
                    matchedValue: String(rawCandidate).trim(),
                    behavior,
                });
            }
        }
    }

    return {
        blocked: matches.some((m) => m.behavior === 'BLOCK'),
        matches,
    };
}

export type RecordSlaState = 'COMPLETED' | 'ON_TRACK' | 'AT_RISK' | 'OVERDUE';

export interface RecordSlaStatus {
    state: RecordSlaState;
    label: string;
    elapsedHours: number;
    remainingHours: number;
    slaHours: number;
}

const TERMINAL_STAGE_KEYWORDS = new Set([
    'ENROLLED',
    'RESOLVED',
    'AWARDED',
    'CLOSED',
    'COMPLETED',
    'APPROVED',
    'DISROLLED',
    'DROPPED',
    'REJECTED',
    'PAID',
]);

/**
 * Computes the SLA / Escalation countdown status for a record on the 360° Record Console.
 */
export function computeRecordSlaStatus(params: {
    createdAt?: string | Date | null;
    currentStage?: string | null;
    slaHours?: number;
    now?: Date;
}): RecordSlaStatus {
    const slaHours = Math.max(1, params.slaHours ?? 24);
    const normalizedStage = String(params.currentStage ?? '')
        .trim()
        .toUpperCase();

    if (normalizedStage && TERMINAL_STAGE_KEYWORDS.has(normalizedStage)) {
        return {
            state: 'COMPLETED',
            label: `SLA Met · ${normalizedStage}`,
            elapsedHours: 0,
            remainingHours: slaHours,
            slaHours,
        };
    }

    const createdDate = params.createdAt ? new Date(params.createdAt) : new Date();
    const nowDate = params.now ?? new Date();
    const elapsedMs = Math.max(0, nowDate.getTime() - createdDate.getTime());
    const elapsedHours = Math.round((elapsedMs / (1000 * 60 * 60)) * 10) / 10;
    const remainingHours = Math.round((slaHours - elapsedHours) * 10) / 10;

    if (remainingHours < 0) {
        return {
            state: 'OVERDUE',
            label: `Overdue by ${Math.abs(remainingHours)}h (SLA ${slaHours}h)`,
            elapsedHours,
            remainingHours,
            slaHours,
        };
    }

    if (remainingHours <= slaHours * 0.25) {
        return {
            state: 'AT_RISK',
            label: `At Risk · ${remainingHours}h left`,
            elapsedHours,
            remainingHours,
            slaHours,
        };
    }

    return {
        state: 'ON_TRACK',
        label: `On Track · ${remainingHours}h left`,
        elapsedHours,
        remainingHours,
        slaHours,
    };
}

/**
 * Salesforce AppExchange Callout / SSRF Guard:
 * Validates that an outbound workflow webhook URL uses `https:` and does not target
 * loopback (`localhost`, `127.x.x.x`, `::1`), cloud metadata endpoints (`169.254.169.254`,
 * `metadata.google.internal`), or private RFC1918 / internal networks (`10.x`, `172.16-31.x`,
 * `192.168.x`, `.local`, `.internal`).
 */
export function isSafeWebhookDestinationUrl(rawUrl: string): boolean {
    try {
        const parsed = new URL(String(rawUrl || '').trim());
        if (parsed.protocol !== 'https:') return false;

        const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
        if (!host) return false;

        if (
            host === 'localhost' ||
            host === '::1' ||
            host === '0.0.0.0' ||
            host === 'metadata.google.internal' ||
            host.endsWith('.local') ||
            host.endsWith('.internal') ||
            host.endsWith('.localhost')
        ) {
            return false;
        }

        // IPv4 literal checks for loopback, link-local / cloud metadata, and RFC1918 ranges
        const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
        if (ipv4Match) {
            const octets = ipv4Match.slice(1, 5).map(Number);
            if (octets.some((o) => o < 0 || o > 255)) return false;
            const [a, b] = octets;
            if (a === 0 || a === 10 || a === 127) return false;
            if (a === 169 && b === 254) return false;
            if (a === 172 && b >= 16 && b <= 31) return false;
            if (a === 192 && b === 168) return false;
        }

        // IPv6 loopback / unique-local / link-local checks
        if (
            host.startsWith('fe80:') ||
            host.startsWith('fc00:') ||
            host.startsWith('fd00:') ||
            host.startsWith('::ffff:127.') ||
            host.startsWith('::ffff:10.') ||
            host.startsWith('::ffff:169.254.') ||
            host.startsWith('::ffff:192.168.')
        ) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

const SENSITIVE_PAYLOAD_KEYS = new Set([
    'secret',
    'signingsecret',
    'signing_secret',
    'token',
    'password',
    'apikey',
    'api_key',
    'authorization',
]);

/**
 * Redacts webhook secrets, API keys, and tokens from workflow action payloads
 * before persisting execution traces to `audit_logs`.
 */
export function redactSensitiveWorkflowPayload(
    payload: Record<string, unknown>,
): Record<string, unknown> {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload || {})) {
        if (SENSITIVE_PAYLOAD_KEYS.has(key.toLowerCase())) {
            redacted[key] = value ? '[REDACTED]' : null;
        } else {
            redacted[key] = value;
        }
    }
    return redacted;
}

export interface ScholarMindSchemaBundleField {
    label: string;
    apiName: string;
    dataType: MetadataDataType;
    isRequired: boolean;
    picklistOptions: string[];
    validationRules: MetadataValidationRules;
}

export interface ScholarMindSchemaBundleObject {
    name: string;
    apiName: string;
    description: string;
    fields: ScholarMindSchemaBundleField[];
    layouts: {
        layoutType: 'FORM' | 'LIST';
        schema: Record<string, unknown>;
    }[];
}

export interface ScholarMindSchemaBundleWorkflow {
    name: string;
    objectName: string;
    triggerEvent: string;
    conditions: { field: string; operator: string; value: string }[];
    actionType: string;
    actionPayload: Record<string, unknown>;
}

export interface ScholarMindSchemaBundle {
    formatVersion: 'scholarmind.bundle.v1';
    bundleName: string;
    bundleDescription: string;
    exportedAt: string;
    objects: ScholarMindSchemaBundleObject[];
    workflows: ScholarMindSchemaBundleWorkflow[];
}

/**
 * Validates and normalizes a portable `.scholarmind.json` Schema Bundle (`ScholarMindSchemaBundle`)
 * for Sandbox-to-Production and Multi-Campus deployments on Vercel + Neon PostgreSQL.
 */
export function validateScholarMindSchemaBundle(
    raw: unknown,
): { ok: true; bundle: ScholarMindSchemaBundle } | { ok: false; error: string } {
    try {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { ok: false, error: 'Schema bundle must be a JSON object.' };
        }
        const input = raw as Record<string, unknown>;
        if (input.formatVersion !== 'scholarmind.bundle.v1') {
            return {
                ok: false,
                error: 'Unsupported bundle formatVersion. Expected "scholarmind.bundle.v1".',
            };
        }
        const bundleName = String(input.bundleName || '').trim();
        if (!bundleName || bundleName.length > 140) {
            return { ok: false, error: 'Bundle name is required (max 140 chars).' };
        }
        const bundleDescription = String(input.bundleDescription || '').trim().slice(0, 500);
        const rawObjects = Array.isArray(input.objects) ? input.objects : [];
        if (rawObjects.length === 0) {
            return { ok: false, error: 'Schema bundle must include at least one object.' };
        }
        if (rawObjects.length > 50) {
            return { ok: false, error: 'Schema bundle supports at most 50 objects per package.' };
        }

        const normalizedObjects: ScholarMindSchemaBundleObject[] = [];
        for (const rawObj of rawObjects) {
            if (!rawObj || typeof rawObj !== 'object') {
                return { ok: false, error: 'Invalid object entry in schema bundle.' };
            }
            const o = rawObj as Record<string, unknown>;
            const name = String(o.name || '').trim();
            const apiName = String(o.apiName || '').trim().toLowerCase();
            if (!name || name.length > 120) {
                return { ok: false, error: `Object "${apiName || 'unknown'}" requires a valid name.` };
            }
            assertSafeMetadataIdentifier(apiName, 'bundle object API name');

            const rawFields = Array.isArray(o.fields) ? o.fields : [];
            const normalizedFields: ScholarMindSchemaBundleField[] = [];
            for (const rf of rawFields) {
                if (!rf || typeof rf !== 'object') continue;
                const f = rf as Record<string, unknown>;
                const normField = normalizeMetadataFieldInput({
                    label: f.label,
                    apiName: f.apiName,
                    dataType: f.dataType,
                    isRequired: f.isRequired,
                    picklistOptions: f.picklistOptions,
                    validationRules: f.validationRules,
                });
                normalizedFields.push(normField);
            }

            const rawLayouts = Array.isArray(o.layouts) ? o.layouts : [];
            const normalizedLayouts: { layoutType: 'FORM' | 'LIST'; schema: Record<string, unknown> }[] = [];
            for (const rl of rawLayouts) {
                if (!rl || typeof rl !== 'object') continue;
                const l = rl as Record<string, unknown>;
                const lt = String(l.layoutType || '').toUpperCase();
                if (lt !== 'FORM' && lt !== 'LIST') continue;
                const schema =
                    l.schema && typeof l.schema === 'object' && !Array.isArray(l.schema)
                        ? (l.schema as Record<string, unknown>)
                        : {};
                normalizedLayouts.push({ layoutType: lt, schema });
            }

            normalizedObjects.push({
                name,
                apiName,
                description: String(o.description || '').trim().slice(0, 500),
                fields: normalizedFields,
                layouts: normalizedLayouts,
            });
        }

        const rawWorkflows = Array.isArray(input.workflows) ? input.workflows : [];
        const normalizedWorkflows: ScholarMindSchemaBundleWorkflow[] = [];
        for (const rw of rawWorkflows.slice(0, 100)) {
            if (!rw || typeof rw !== 'object') continue;
            const w = rw as Record<string, unknown>;
            const wfName = String(w.name || '').trim();
            const objName = String(w.objectName || '').trim().toLowerCase();
            if (!wfName || !objName) continue;
            assertSafeMetadataIdentifier(objName, 'workflow object API name');
            const conditions = Array.isArray(w.conditions)
                ? w.conditions
                      .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
                      .map((c) => ({
                          field: String(c.field || '').trim(),
                          operator: String(c.operator || 'equals').trim(),
                          value: String(c.value ?? '').trim(),
                      }))
                : [];
            const rawPayload =
                w.actionPayload && typeof w.actionPayload === 'object' && !Array.isArray(w.actionPayload)
                    ? (w.actionPayload as Record<string, unknown>)
                    : {};
            normalizedWorkflows.push({
                name: wfName,
                objectName: objName,
                triggerEvent: String(w.triggerEvent || 'object.record.upserted').trim(),
                conditions,
                actionType: String(w.actionType || 'CREATE_TASK').trim().toUpperCase(),
                actionPayload: redactSensitiveWorkflowPayload(rawPayload),
            });
        }

        return {
            ok: true,
            bundle: {
                formatVersion: 'scholarmind.bundle.v1',
                bundleName,
                bundleDescription,
                exportedAt: String(input.exportedAt || new Date().toISOString()),
                objects: normalizedObjects,
                workflows: normalizedWorkflows,
            },
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : 'Invalid schema bundle.',
        };
    }
}

// ============================================================================
// Track E: Declarative Document & Certificate Merge Engine (OmniStudio DocGen)
// ============================================================================

export type DocumentTemplateCategory =
    | 'OFFER_LETTER'
    | 'CERTIFICATE'
    | 'SCHOLARSHIP_LETTER'
    | 'FEE_RECEIPT'
    | 'CUSTOM';

export interface MetadataDocumentTemplate {
    id: string;
    name: string;
    category: DocumentTemplateCategory;
    headerTitle: string;
    bodyMarkdown: string;
    footerText: string;
    includeVerificationBadge: boolean;
}

function escapeHtml(raw: string): string {
    return raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Renders a declarative Document / Certificate Merge Template (`MetadataDocumentTemplate`)
 * against a record payload, substituting `{{field_api_name}}` and system tokens (`{{RECORD_ID}}`,
 * `{{ISSUED_DATE}}`, `{{OBJECT_NAME}}`) with HTML-escaped values and computing a deterministic
 * verification code.
 */
export function renderMetadataDocumentTemplate(
    template: MetadataDocumentTemplate,
    record: Record<string, unknown>,
    context: { objectName?: string; recordId?: string; issuedDate?: string } = {},
): {
    renderedBody: string;
    verificationCode: string;
    htmlDocument: string;
} {
    const issuedDate = context.issuedDate || new Date().toISOString().split('T')[0];
    const recordId = String(context.recordId || record.id || '00000000');
    const objectName = String(context.objectName || 'Record');

    const tokenLookup = (key: string): string => {
        const cleanKey = key.trim();
        if (cleanKey === 'RECORD_ID') return recordId.slice(0, 8).toUpperCase();
        if (cleanKey === 'ISSUED_DATE') return issuedDate;
        if (cleanKey === 'OBJECT_NAME') return objectName;
        const val = record[cleanKey] ?? record[cleanKey.toLowerCase()];
        if (val === null || val === undefined || val === '') return '—';
        return String(val);
    };

    const renderedBody = String(template.bodyMarkdown || '').replace(
        /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
        (_match, tokenKey: string) => tokenLookup(tokenKey),
    );

    // Deterministic verification code from recordId + template.id + issuedDate
    const seed = `${recordId}:${template.id}:${issuedDate}`;
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    const hexSuffix = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
    const verificationCode = `SM-DOC-${issuedDate.slice(0, 4)}-${hexSuffix}`;

    const paragraphsHtml = renderedBody
        .split(/\n{2,}/)
        .map(p => `<p style="margin:0 0 14px 0;line-height:1.65;">${escapeHtml(p.trim()).replace(/\n/g, '<br/>')}</p>`)
        .join('');

    const badgeHtml = template.includeVerificationBadge
        ? `<div style="margin-top:28px;padding:12px 16px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#334155;">
             <div><strong>Verified Official Document</strong> · Issued ${escapeHtml(issuedDate)}</div>
             <div style="font-family:monospace;font-weight:700;color:#0f172a;">Ref: ${escapeHtml(verificationCode)}</div>
           </div>`
        : '';

    const htmlDocument = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(template.headerTitle || template.name)}</title>
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:32px auto;padding:40px;border:2px solid #0f172a;border-radius:12px;color:#0f172a;background:#ffffff;">
  <div style="border-bottom:2px solid #0f172a;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;color:#475569;font-weight:600;">ScholarMind Official Document · ${escapeHtml(template.category.replace(/_/g, ' '))}</div>
      <h1 style="margin:6px 0 0 0;font-size:24px;">${escapeHtml(template.headerTitle || template.name)}</h1>
    </div>
    <div style="font-size:12px;color:#475569;font-family:monospace;">Date: ${escapeHtml(issuedDate)}</div>
  </div>
  <div style="font-size:14px;color:#1e293b;">
    ${paragraphsHtml}
  </div>
  ${badgeHtml}
  <div style="margin-top:32px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">
    ${escapeHtml(template.footerText || 'Generated via ScholarMind Document Studio')}
  </div>
</body>
</html>`;

    return {
        renderedBody,
        verificationCode,
        htmlDocument,
    };
}

// ============================================================================
// Track F: Agentforce Natural-Language AI Schema & Workflow Copilot
// ============================================================================

/**
 * Synthesizes a complete, validated `ScholarMindSchemaBundle` (`scholarmind.bundle.v1`)
 * from a plain-English administrator prompt (Salesforce Agentforce Builder parity).
 */
export function synthesizeSchemaBundleFromPrompt(prompt: string): {
    bundle: ScholarMindSchemaBundle;
    summary: string;
} {
    const rawPrompt = String(prompt || '').trim();
    const lower = rawPrompt.toLowerCase();

    // 1. Extract or infer object name and API name
    const namedMatch =
        rawPrompt.match(/(?:create|build|design|add)\s+(?:an?\s+)?([a-z0-9\s-]{3,45}?)\s+(?:object|module|table)\b/i) ||
        rawPrompt.match(/(?:create|build|design|add)\s+(?:an?\s+)?([a-z0-9\s-]{3,40}?\s+(?:tracker|log|registry|form))\b/i) ||
        rawPrompt.match(/([a-z0-9\s-]{3,35}?)\s+(?:object|module|table)\b/i);

    let objectTitle = namedMatch?.[1]?.trim() || 'Campus Operations Tracker';
    objectTitle = objectTitle
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
        .slice(0, 60);

    let objectApiName = objectTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
    if (!/^[a-z]/.test(objectApiName)) {
        objectApiName = `custom_${objectApiName || 'tracker'}`;
    }

    const prefix = objectTitle
        .split(/\s+/)
        .map(w => w[0]?.toUpperCase() || '')
        .join('')
        .slice(0, 4) || 'REC';

    const blockDuplicates = /block\s+duplicate|prevent\s+duplicate|unique|no\s+duplicate/i.test(lower);

    const fields: ScholarMindSchemaBundleField[] = [
        normalizeMetadataFieldInput({
            label: `${objectTitle} Reference`,
            apiName: `${objectApiName}_no`,
            dataType: 'AUTO_NUMBER',
            autoNumberPrefix: `${prefix}-{YYYY}-{0000}`,
        }),
        normalizeMetadataFieldInput({
            label: 'Primary Name / Title',
            apiName: 'full_name',
            dataType: 'TEXT',
            isRequired: true,
        }),
    ];

    const addFieldIfNotExists = (input: Record<string, unknown>) => {
        const norm = normalizeMetadataFieldInput(input);
        if (!fields.some(f => f.apiName === norm.apiName)) {
            fields.push(norm);
        }
    };

    if (lower.includes('email') || lower.includes('contact') || lower.includes('applicant') || lower.includes('visitor') || lower.includes('alumni') || lower.includes('student')) {
        addFieldIfNotExists({
            label: 'Contact Email',
            apiName: 'contact_email',
            dataType: 'EMAIL',
            isRequired: true,
            validationRules: blockDuplicates ? { duplicateRuleBehavior: 'BLOCK' } : { duplicateRuleBehavior: 'WARN' },
        });
    }

    if (lower.includes('phone') || lower.includes('mobile') || lower.includes('whatsapp') || lower.includes('visitor')) {
        addFieldIfNotExists({
            label: 'Mobile Phone',
            apiName: 'contact_phone',
            dataType: 'PHONE',
            isRequired: true,
            validationRules: blockDuplicates ? { duplicateRuleBehavior: 'BLOCK' } : { duplicateRuleBehavior: 'WARN' },
        });
    }

    if (lower.includes('student')) {
        addFieldIfNotExists({
            label: 'Linked Student',
            apiName: 'student_id',
            dataType: 'LOOKUP',
            lookupTargetObject: 'student',
        });
    }

    if (lower.includes('fee') || lower.includes('amount') || lower.includes('scholarship') || lower.includes('stipend') || lower.includes('grant') || lower.includes('budget')) {
        addFieldIfNotExists({
            label: 'Amount (INR)',
            apiName: 'amount_inr',
            dataType: 'CURRENCY',
            isRequired: false,
            validationRules: { min: 0 },
        });
    }

    if (lower.includes('score') || lower.includes('marks') || lower.includes('year') || lower.includes('count') || lower.includes('rating')) {
        addFieldIfNotExists({
            label: 'Score / Metric Value',
            apiName: 'metric_value',
            dataType: 'NUMBER',
            isRequired: false,
        });
    }

    if (lower.includes('date') || lower.includes('visit') || lower.includes('event') || lower.includes('deadline')) {
        addFieldIfNotExists({
            label: 'Scheduled Date',
            apiName: 'event_date',
            dataType: 'DATE',
            isRequired: false,
        });
    }

    if (lower.includes('url') || lower.includes('website') || lower.includes('linkedin') || lower.includes('portfolio')) {
        addFieldIfNotExists({
            label: 'Reference Link URL',
            apiName: 'reference_url',
            dataType: 'URL',
            isRequired: false,
        });
    }

    const stageOptions = lower.includes('approval')
        ? ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED']
        : lower.includes('visitor')
          ? ['CHECKED_IN', 'IN_CAMPUS', 'CHECKED_OUT']
          : ['NEW', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'];

    addFieldIfNotExists({
        label: 'Lifecycle Stage',
        apiName: 'pipeline_stage',
        dataType: 'PICKLIST',
        isRequired: true,
        picklistOptions: stageOptions,
    });

    const workflowActionType = lower.includes('email') && lower.includes('send')
        ? 'SEND_EMAIL'
        : lower.includes('approval')
          ? 'SUBMIT_FOR_APPROVAL'
          : 'CREATE_TASK';

    const workflows: ScholarMindSchemaBundleWorkflow[] = [
        {
            name: `Auto-${workflowActionType.replace(/_/g, ' ')} on ${objectTitle}`,
            objectName: objectApiName,
            triggerEvent: 'object.record.upserted',
            conditions: [{ field: 'full_name', operator: 'not_empty', value: '' }],
            actionType: workflowActionType,
            actionPayload:
                workflowActionType === 'SEND_EMAIL'
                    ? {
                          to_field: 'contact_email',
                          subject: `Confirmation: ${objectTitle} Received`,
                      }
                    : {
                          title: `Follow up on new ${objectTitle} submission`,
                          due_days: 1,
                      },
        },
    ];

    const bundle: ScholarMindSchemaBundle = {
        formatVersion: 'scholarmind.bundle.v1',
        bundleName: `${objectTitle} AI Copilot Package`,
        bundleDescription: `Synthesized from prompt: "${rawPrompt.slice(0, 180)}"`,
        exportedAt: new Date().toISOString(),
        objects: [
            {
                name: objectTitle,
                apiName: objectApiName,
                description: `AI-synthesized custom object for ${objectTitle}.`,
                fields,
                layouts: [
                    {
                        layoutType: 'FORM',
                        schema: {
                            sections: [
                                {
                                    title: `${objectTitle} Details`,
                                    fields: fields.map(f => f.apiName),
                                },
                            ],
                        },
                    },
                    {
                        layoutType: 'LIST',
                        schema: {
                            columns: fields.map(f => f.apiName),
                            kanbanGroupByField: 'pipeline_stage',
                            defaultViewMode: 'KANBAN',
                        },
                    },
                ],
            },
        ],
        workflows,
    };

    return {
        bundle,
        summary: `Generated "${objectTitle}" (${objectApiName}) with ${fields.length} fields (${blockDuplicates ? 'Duplicate Blocking enabled, ' : ''}Kanban Stage Path on pipeline_stage) and 1 automated workflow.`,
    };
}

// ============================================================================
// Track H: Inbound Webhook & External Lead-Ad Payload Mapper (MuleSoft / Zapier)
// ============================================================================

function readNestedKey(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.').map(p => p.trim()).filter(Boolean);
    let current: unknown = obj;
    for (const part of parts) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

/**
 * Maps an external JSON webhook payload (from Meta Lead Ads, Google Forms, Typeform,
 * Shiksha, Collegedunia, or Zapier) into a target ScholarMind metadata record payload
 * using declarative `fieldMappings` (`{ externalKeyPath: targetFieldApiName }`) and
 * optional `defaultValues`.
 */
export function mapInboundWebhookPayloadToRecord(
    externalPayload: Record<string, unknown>,
    fieldMappings: Record<string, string>,
    defaultValues: Record<string, unknown> = {},
): Record<string, unknown> {
    const mapped: Record<string, unknown> = { ...defaultValues };
    const source = externalPayload && typeof externalPayload === 'object' ? externalPayload : {};

    // 1. Apply explicit field mappings ({ "full_name": "candidate_name", "lead.email": "contact_email" })
    for (const [externalPath, targetFieldApi] of Object.entries(fieldMappings || {})) {
        const cleanTarget = String(targetFieldApi || '').trim();
        if (!cleanTarget) continue;
        const val = readNestedKey(source, externalPath);
        if (val !== undefined && val !== null && val !== '') {
            mapped[cleanTarget] = val;
        }
    }

    // 2. Also pass through any top-level keys that aren't already mapped
    for (const [key, value] of Object.entries(source)) {
        if (mapped[key] === undefined && value !== undefined && value !== null && typeof value !== 'object') {
            mapped[key] = value;
        }
    }

    return mapped;
}

