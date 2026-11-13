import type { MetadataField, MetadataLayout } from '@/lib/actions/metadata-engine';
import type { RollupAggregateFunction } from '@/lib/metadata/platform';

export type ViewFilterOperator =
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'starts_with'
    | 'gt'
    | 'lt'
    | 'is_empty'
    | 'not_empty';

export interface SavedViewFilterRule {
    field: string;
    operator: ViewFilterOperator;
    value?: string;
}

export interface MetadataViewCategoryItem {
    id: string;
    objectApiName: string | null;
    name: string;
    description: string | null;
    sortOrder: number;
}

export interface SavedObjectViewItem {
    id: string;
    objectApiName: string;
    categoryId: string | null;
    categoryName?: string | null;
    name: string;
    columns: string[];
    filterRules: SavedViewFilterRule[];
    sortField: string | null;
    sortDirection: 'ASC' | 'DESC';
    displayMode: 'TABLE' | 'KANBAN';
    kanbanGroupField: string | null;
    isDefault: boolean;
    visibility: 'PRIVATE' | 'SHARED' | 'ROLES';
    allowedRoles: string[];
    createdBy: string | null;
}

export interface ReportCategoryItem {
    id: string;
    name: string;
    description: string | null;
    sortOrder: number;
}

export interface JoinedReportConfig {
    relatedObjectApiName: string;
    joinDirection: 'PARENT_TO_CHILD' | 'CHILD_TO_PARENT';
    lookupFieldApiName: string;
    joinType: 'LEFT' | 'INNER';
    relatedColumns: string[];
}

export interface SavedLcncReportItem {
    id: string;
    name: string;
    categoryId: string | null;
    categoryName: string | null;
    objectApiName: string | null;
    reportKind: 'STANDARD_BI' | 'OBJECT_REPORT' | 'JOINED_OBJECT_REPORT';
    datasetKey: string;
    groupByField: string;
    aggregateFunction: RollupAggregateFunction;
    metricField: string | null;
    selectedColumns: string[];
    filterRules: SavedViewFilterRule[];
    chartType: 'TABLE' | 'BAR' | 'KPI';
    allowedRoles: string[];
    joinConfig?: JoinedReportConfig | null;
    createdAt: string;
}

export interface HomeKpiCardConfig {
    id: string;
    label: string;
    aggregate: RollupAggregateFunction;
    fieldApiName?: string;
    filterField?: string;
    filterValue?: string;
}

export interface HomeLayoutSchema {
    welcomeHeadline?: string;
    welcomeSubtitle?: string;
    kpiCards?: HomeKpiCardConfig[];
}

const ADMIN_LAYOUT_BYPASS_ROLES = new Set(['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN']);

/**
 * Resolves the active layout (`FORM`, `LIST`, or `HOME`) for a caller's role:
 *   1. Explicit `requestedLayoutId` if permitted for the caller's role
 *   2. Layout whose `assignedRoles` explicitly includes `effectiveRoleCode` or `baseRole`
 *   3. Layout marked `isDefault === true` (unrestricted or matching role)
 *   4. First layout matching `layoutType`
 */
export function resolveLayoutForRole(
    layouts: readonly MetadataLayout[],
    layoutType: 'FORM' | 'LIST' | 'HOME',
    effectiveRoleCode: string,
    baseRole: string,
    requestedLayoutId?: string | null,
): MetadataLayout | undefined {
    const ofType = layouts.filter(l => l.layoutType === layoutType);
    if (ofType.length === 0) return undefined;

    const effUpper = (effectiveRoleCode || '').trim().toUpperCase();
    const baseUpper = (baseRole || '').trim().toUpperCase();
    const isAdmin = ADMIN_LAYOUT_BYPASS_ROLES.has(baseUpper) || ADMIN_LAYOUT_BYPASS_ROLES.has(effUpper);

    const roleMatches = (layout: MetadataLayout): boolean => {
        const assigned = Array.isArray(layout.assignedRoles)
            ? layout.assignedRoles.map(r => String(r).trim().toUpperCase()).filter(Boolean)
            : [];
        if (assigned.length === 0) return true;
        return assigned.includes(effUpper) || assigned.includes(baseUpper);
    };

    if (requestedLayoutId) {
        const requested = ofType.find(l => l.id === requestedLayoutId);
        if (requested && (isAdmin || roleMatches(requested))) {
            return requested;
        }
    }

    // Exact role-scoped match first
    const explicitMatch = ofType.find(l => {
        const assigned = Array.isArray(l.assignedRoles)
            ? l.assignedRoles.map(r => String(r).trim().toUpperCase()).filter(Boolean)
            : [];
        return assigned.length > 0 && (assigned.includes(effUpper) || assigned.includes(baseUpper));
    });
    if (explicitMatch) return explicitMatch;

    const defaultMatch = ofType.find(l => l.isDefault && (isAdmin || roleMatches(l)));
    if (defaultMatch) return defaultMatch;

    return ofType.find(l => isAdmin || roleMatches(l)) ?? ofType[0];
}

export function listPermittedLayoutsForRole(
    layouts: readonly MetadataLayout[],
    layoutType: 'FORM' | 'LIST' | 'HOME',
    effectiveRoleCode: string,
    baseRole: string,
): MetadataLayout[] {
    const effUpper = (effectiveRoleCode || '').trim().toUpperCase();
    const baseUpper = (baseRole || '').trim().toUpperCase();
    const isAdmin = ADMIN_LAYOUT_BYPASS_ROLES.has(baseUpper) || ADMIN_LAYOUT_BYPASS_ROLES.has(effUpper);

    return layouts.filter(l => {
        if (l.layoutType !== layoutType) return false;
        if (isAdmin) return true;
        const assigned = Array.isArray(l.assignedRoles)
            ? l.assignedRoles.map(r => String(r).trim().toUpperCase()).filter(Boolean)
            : [];
        return assigned.length === 0 || assigned.includes(effUpper) || assigned.includes(baseUpper);
    });
}

export function matchesFilterRule(
    record: Record<string, unknown>,
    rule: SavedViewFilterRule,
): boolean {
    if (!rule.field) return true;
    const raw = record[rule.field];
    const strVal = raw === null || raw === undefined ? '' : String(raw).trim();
    const target = (rule.value ?? '').trim();

    switch (rule.operator) {
        case 'is_empty':
            return strVal === '';
        case 'not_empty':
            return strVal !== '';
        case 'equals':
            return strVal.toLowerCase() === target.toLowerCase();
        case 'not_equals':
            return strVal.toLowerCase() !== target.toLowerCase();
        case 'contains':
            return strVal.toLowerCase().includes(target.toLowerCase());
        case 'starts_with':
            return strVal.toLowerCase().startsWith(target.toLowerCase());
        case 'gt': {
            const a = Number(strVal);
            const b = Number(target);
            if (Number.isFinite(a) && Number.isFinite(b)) return a > b;
            return strVal > target;
        }
        case 'lt': {
            const a = Number(strVal);
            const b = Number(target);
            if (Number.isFinite(a) && Number.isFinite(b)) return a < b;
            return strVal < target;
        }
        default:
            return true;
    }
}

export function applyViewFilterRules(
    records: Record<string, unknown>[],
    rules: readonly SavedViewFilterRule[],
): Record<string, unknown>[] {
    const active = (rules || []).filter(r => Boolean(r?.field));
    if (active.length === 0) return records;
    return records.filter(rec => active.every(rule => matchesFilterRule(rec, rule)));
}

export function sortRecordsByField(
    records: Record<string, unknown>[],
    sortField?: string | null,
    sortDirection: 'ASC' | 'DESC' = 'DESC',
): Record<string, unknown>[] {
    if (!sortField) return records;
    const mult = sortDirection === 'ASC' ? 1 : -1;
    return [...records].sort((a, b) => {
        const va = a[sortField];
        const vb = b[sortField];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const na = Number(va);
        const nb = Number(vb);
        if (Number.isFinite(na) && Number.isFinite(nb) && String(va) !== '' && String(vb) !== '') {
            return (na - nb) * mult;
        }
        return String(va).localeCompare(String(vb)) * mult;
    });
}

export function computeHomeKpiCards(
    records: Record<string, unknown>[],
    fields: readonly MetadataField[],
    homeSchema?: HomeLayoutSchema | null,
): { id: string; label: string; value: string; subtitle: string }[] {
    const configured = Array.isArray(homeSchema?.kpiCards) ? homeSchema!.kpiCards! : [];

    if (configured.length > 0) {
        return configured.map(card => {
            const scoped =
                card.filterField && card.filterValue !== undefined && card.filterValue !== ''
                    ? records.filter(
                          r =>
                              String(r[card.filterField!] ?? '').toLowerCase() ===
                              String(card.filterValue).toLowerCase(),
                      )
                    : records;

            if (card.aggregate === 'COUNT' || !card.fieldApiName) {
                return {
                    id: card.id,
                    label: card.label,
                    value: String(scoped.length),
                    subtitle: card.filterField
                        ? `Filtered by ${card.filterField} = ${card.filterValue}`
                        : 'Matching records',
                };
            }

            const nums = scoped
                .map(r => Number(r[card.fieldApiName!]))
                .filter(n => Number.isFinite(n));
            let val = 0;
            if (nums.length > 0) {
                switch (card.aggregate) {
                    case 'SUM':
                        val = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
                        break;
                    case 'AVG':
                        val = Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
                        break;
                    case 'MIN':
                        val = Math.min(...nums);
                        break;
                    case 'MAX':
                        val = Math.max(...nums);
                        break;
                }
            }
            const fld = fields.find(f => f.apiName === card.fieldApiName);
            const formatted =
                fld?.dataType === 'CURRENCY'
                    ? `₹${val.toLocaleString('en-IN')}`
                    : val.toLocaleString('en-IN');

            return {
                id: card.id,
                label: card.label,
                value: formatted,
                subtitle: `${card.aggregate} of ${fld?.label || card.fieldApiName}`,
            };
        });
    }

    // Default smart KPIs when no explicit HOME layout has been customized yet
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const createdThisMonth = records.filter(r =>
        String(r.created_at || r.admission_date || r.submitted_at || '').startsWith(monthPrefix),
    ).length;

    const currencyOrNumField = fields.find(
        f => f.dataType === 'CURRENCY' || f.dataType === 'NUMBER',
    );
    const statusField = fields.find(f => f.dataType === 'PICKLIST');

    const cards: { id: string; label: string; value: string; subtitle: string }[] = [
        {
            id: 'total-records',
            label: 'Total Records',
            value: records.length.toLocaleString('en-IN'),
            subtitle: 'Active tenant dataset',
        },
        {
            id: 'this-month',
            label: 'Added This Month',
            value: createdThisMonth.toLocaleString('en-IN'),
            subtitle: `Period ${monthPrefix}`,
        },
    ];

    if (currencyOrNumField) {
        const nums = records
            .map(r => Number(r[currencyOrNumField.apiName]))
            .filter(n => Number.isFinite(n));
        const sum = Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100;
        cards.push({
            id: `sum-${currencyOrNumField.apiName}`,
            label: `Total ${currencyOrNumField.label}`,
            value:
                currencyOrNumField.dataType === 'CURRENCY'
                    ? `₹${sum.toLocaleString('en-IN')}`
                    : sum.toLocaleString('en-IN'),
            subtitle: `Across ${nums.length} record(s)`,
        });
    } else {
        cards.push({
            id: 'readable-fields',
            label: 'Accessible Fields',
            value: String(fields.length),
            subtitle: 'Enforced via role FLS',
        });
    }

    if (statusField) {
        const distinctBuckets = new Set(
            records.map(r => String(r[statusField.apiName] || '')).filter(Boolean),
        ).size;
        cards.push({
            id: `stages-${statusField.apiName}`,
            label: `Active ${statusField.label} Buckets`,
            value: String(distinctBuckets),
            subtitle: `Grouped by ${statusField.label}`,
        });
    } else {
        const customCount = fields.filter(f => f.isCustom).length;
        cards.push({
            id: 'custom-fields',
            label: 'Custom Fields',
            value: String(customCount),
            subtitle: 'Tenant schema extensions',
        });
    }

    return cards;
}

// ============================================================================
// TIER-2 SALESFORCE LIGHTNING PLATFORM PURE EVALUATORS
// ============================================================================

export type OwdMode = 'PUBLIC_READ_WRITE' | 'PUBLIC_READ_ONLY' | 'PRIVATE';

export type SharingCriteriaOperator = 'eq' | 'neq' | 'contains' | 'gt' | 'lt';

export interface MetadataSharingRuleItem {
    id: string;
    objectApiName: string;
    name: string;
    criteriaField: string | null;
    criteriaOperator: SharingCriteriaOperator;
    criteriaValue: string | null;
    sharedWithRole: string;
    accessLevel: 'READ' | 'READ_WRITE';
    isActive: boolean;
    createdAt?: string;
}

export interface MetadataValidationRuleItem {
    id: string;
    objectApiName: string;
    name: string;
    description: string | null;
    errorConditionFormula: string;
    errorMessage: string;
    errorField: string | null;
    isActive: boolean;
    createdAt?: string;
}

export interface ApprovalProcessStepDef {
    stepNumber: number;
    stepName: string;
    approverRole: string;
}

export interface ApprovalStepHistoryEntry {
    stepNumber: number;
    stepName: string;
    approverRole: string;
    actorUserId: string;
    decision: 'APPROVED' | 'REJECTED';
    comment: string | null;
    decidedAt: string;
}

export interface MetadataApprovalProcessItem {
    id: string;
    objectApiName: string;
    name: string;
    description: string | null;
    entryCriteriaFormula: string | null;
    steps: ApprovalProcessStepDef[];
    lockRecordOnSubmit: boolean;
    fieldUpdatesOnApprove: Record<string, string>;
    fieldUpdatesOnReject: Record<string, string>;
    isActive: boolean;
    createdAt?: string;
}

export interface MetadataApprovalInstanceItem {
    id: string;
    processId: string;
    processName?: string;
    objectApiName: string;
    recordId: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'RECALLED';
    currentStep: number;
    totalSteps?: number;
    currentStepName?: string;
    currentApproverRole?: string;
    submittedBy: string | null;
    submissionComment: string | null;
    stepHistory: ApprovalStepHistoryEntry[];
    isLocked: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface DashboardWidgetConfig {
    id: string;
    reportId: string;
    title: string;
    width: 'HALF' | 'FULL';
    chartOverride?: 'TABLE' | 'BAR' | 'KPI';
}

export interface MetadataDashboardItem {
    id: string;
    name: string;
    description: string | null;
    allowedRoles: string[];
    isDefault: boolean;
    widgets: DashboardWidgetConfig[];
    createdAt: string;
    updatedAt: string;
}

export interface MetadataRecordAttachmentItem {
    id: string;
    objectApiName: string;
    recordId: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256Checksum: string;
    description: string | null;
    uploadedBy: string | null;
    createdAt: string;
    hasInlineContent: boolean;
}

export interface RecordFieldDiffItem {
    field: string;
    label: string;
    before: string;
    after: string;
}

const OWD_ADMIN_BYPASS_ROLES = new Set([
    'PLATFORM_ADMIN',
    'SUPER_ADMIN',
    'SCHOOL_ADMIN',
    'PRINCIPAL',
]);

export function resolveRecordOwnerUserId(record: Record<string, unknown>): string | null {
    const candidates = [
        record.owner_user_id,
        record._owner_user_id,
        record.created_by,
        record.user_id,
    ];
    for (const c of candidates) {
        if (typeof c === 'string' && c.trim().length > 0) {
            return c.trim();
        }
    }
    return null;
}

function matchesSharingCriteria(
    record: Record<string, unknown>,
    rule: MetadataSharingRuleItem,
): boolean {
    if (!rule.criteriaField || rule.criteriaField.trim() === '') {
        return true;
    }
    const raw = record[rule.criteriaField];
    const actual = raw == null ? '' : String(raw).trim();
    const expected = (rule.criteriaValue ?? '').trim();

    switch (rule.criteriaOperator) {
        case 'eq':
            return actual.toLowerCase() === expected.toLowerCase();
        case 'neq':
            return actual.toLowerCase() !== expected.toLowerCase();
        case 'contains':
            return actual.toLowerCase().includes(expected.toLowerCase());
        case 'gt': {
            const na = Number(actual);
            const nb = Number(expected);
            return Number.isFinite(na) && Number.isFinite(nb) ? na > nb : actual > expected;
        }
        case 'lt': {
            const na = Number(actual);
            const nb = Number(expected);
            return Number.isFinite(na) && Number.isFinite(nb) ? na < nb : actual < expected;
        }
        default:
            return false;
    }
}

/**
 * Evaluates Salesforce-style Organization-Wide Defaults (OWD) + Record Ownership +
 * Criteria Sharing Rules for `READ` or `WRITE` access to a record.
 */
export function canAccessRecordUnderOwd(params: {
    owdMode: OwdMode;
    operation: 'READ' | 'WRITE';
    record: Record<string, unknown>;
    callerUserId: string;
    effectiveRoleCode: string;
    baseRole: string;
    sharingRules: readonly MetadataSharingRuleItem[];
}): boolean {
    const {
        owdMode,
        operation,
        record,
        callerUserId,
        effectiveRoleCode,
        baseRole,
        sharingRules,
    } = params;

    const effUpper = (effectiveRoleCode || '').trim().toUpperCase();
    const baseUpper = (baseRole || '').trim().toUpperCase();

    if (OWD_ADMIN_BYPASS_ROLES.has(effUpper) || OWD_ADMIN_BYPASS_ROLES.has(baseUpper)) {
        return true;
    }

    if (owdMode === 'PUBLIC_READ_WRITE') {
        return true;
    }

    if (owdMode === 'PUBLIC_READ_ONLY' && operation === 'READ') {
        return true;
    }

    const ownerId = resolveRecordOwnerUserId(record);
    if (ownerId && callerUserId && ownerId === callerUserId) {
        return true;
    }

    // Legacy unowned records created prior to OWD remain readable under PUBLIC_READ_ONLY (handled above);
    // under PRIVATE or WRITE, sharing rules grant access to matching roles.
    for (const rule of sharingRules) {
        if (!rule.isActive) continue;
        const targetRole = (rule.sharedWithRole || '').trim().toUpperCase();
        if (targetRole !== '*' && targetRole !== effUpper && targetRole !== baseUpper) {
            continue;
        }
        if (operation === 'WRITE' && rule.accessLevel !== 'READ_WRITE') {
            continue;
        }
        if (matchesSharingCriteria(record, rule)) {
            return true;
        }
    }

    return false;
}

// ─── Safe Boolean Validation & Entry-Criteria Formula Parser ─────────────────

type FormulaToken =
    | { kind: 'IDENT'; value: string }
    | { kind: 'STRING'; value: string }
    | { kind: 'NUMBER'; value: number }
    | { kind: 'OP'; value: string }
    | { kind: 'LPAREN' }
    | { kind: 'RPAREN' }
    | { kind: 'COMMA' };

function tokenizeBooleanFormula(src: string): FormulaToken[] {
    const tokens: FormulaToken[] = [];
    let i = 0;
    const n = src.length;

    while (i < n) {
        const ch = src[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        if (ch === '(') {
            tokens.push({ kind: 'LPAREN' });
            i++;
            continue;
        }
        if (ch === ')') {
            tokens.push({ kind: 'RPAREN' });
            i++;
            continue;
        }
        if (ch === ',') {
            tokens.push({ kind: 'COMMA' });
            i++;
            continue;
        }
        if (ch === "'" || ch === '"') {
            const quote = ch;
            i++;
            let buf = '';
            while (i < n && src[i] !== quote) {
                if (src[i] === '\\' && i + 1 < n) {
                    i++;
                }
                buf += src[i++];
            }
            if (i < n && src[i] === quote) i++;
            tokens.push({ kind: 'STRING', value: buf });
            continue;
        }
        if (ch === '{') {
            i++;
            let ident = '';
            while (i < n && src[i] !== '}') {
                ident += src[i++];
            }
            if (i < n && src[i] === '}') i++;
            tokens.push({ kind: 'IDENT', value: ident.trim() });
            continue;
        }
        const two = src.slice(i, i + 2);
        if (['&&', '||', '==', '!=', '<>', '>=', '<='].includes(two)) {
            tokens.push({ kind: 'OP', value: two });
            i += 2;
            continue;
        }
        if (['=', '>', '<', '!', '+', '-', '*', '/'].includes(ch)) {
            tokens.push({ kind: 'OP', value: ch });
            i++;
            continue;
        }
        if (/[0-9]/.test(ch)) {
            let numStr = '';
            while (i < n && /[0-9.]/.test(src[i])) {
                numStr += src[i++];
            }
            const parsed = Number(numStr);
            tokens.push({ kind: 'NUMBER', value: Number.isFinite(parsed) ? parsed : 0 });
            continue;
        }
        if (/[A-Za-z_]/.test(ch)) {
            let ident = '';
            while (i < n && /[A-Za-z0-9_.]/.test(src[i])) {
                ident += src[i++];
            }
            tokens.push({ kind: 'IDENT', value: ident });
            continue;
        }
        // Unknown character — skip safely rather than crashing
        i++;
    }

    return tokens;
}

type FormulaValue = string | number | boolean | null;

function toTruthy(val: FormulaValue): boolean {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val !== 0 && Number.isFinite(val);
    if (typeof val === 'string') return val.trim().length > 0 && val.toLowerCase() !== 'false';
    return false;
}

function toNum(val: FormulaValue): number {
    if (typeof val === 'number') return val;
    if (typeof val === 'boolean') return val ? 1 : 0;
    if (val == null || String(val).trim() === '') return 0;
    const n = Number(val);
    return Number.isFinite(n) ? n : NaN;
}

function isBlankValue(val: unknown): boolean {
    if (val === null || val === undefined) return true;
    return String(val).trim() === '';
}

/**
 * Dependency-free Salesforce-style boolean formula evaluator (`eval`-free).
 * Supports `AND(...)`, `OR(...)`, `NOT(...)`, `ISBLANK(field)`, `NOT_BLANK(field)`,
 * `CONTAINS(field, 'text')`, `STARTS_WITH(field, 'text')`, `LEN(field)`,
 * infix `&&`, `||`, `!`, comparisons (`==`, `=`, `!=`, `<>`, `>=`, `<=`, `>`, `<`),
 * and arithmetic (`+`, `-`, `*`, `/`).
 */
export function evaluateValidationRuleFormula(
    formula: string,
    record: Record<string, unknown>,
): boolean {
    const trimmed = String(formula || '').trim();
    if (!trimmed) return false;

    const tokens = tokenizeBooleanFormula(trimmed);
    if (tokens.length === 0) return false;
    let pos = 0;

    const peek = (): FormulaToken | undefined => tokens[pos];
    const consume = (): FormulaToken | undefined => tokens[pos++];

    const resolveField = (name: string): FormulaValue => {
        const direct = record[name] ?? record[name.toLowerCase()];
        if (direct === undefined || direct === null) return null;
        if (typeof direct === 'boolean' || typeof direct === 'number') return direct;
        return String(direct);
    };

    const parseOr = (): FormulaValue => {
        let left = parseAnd();
        while (true) {
            const tok = peek();
            if (
                !tok ||
                !(
                    (tok.kind === 'OP' && tok.value === '||') ||
                    (tok.kind === 'IDENT' &&
                        tok.value.toUpperCase() === 'OR' &&
                        tokens[pos + 1]?.kind !== 'LPAREN')
                )
            ) {
                break;
            }
            consume();
            const right = parseAnd();
            left = toTruthy(left) || toTruthy(right);
        }
        return left;
    };

    const parseAnd = (): FormulaValue => {
        let left = parseNot();
        while (true) {
            const tok = peek();
            if (
                !tok ||
                !(
                    (tok.kind === 'OP' && tok.value === '&&') ||
                    (tok.kind === 'IDENT' &&
                        tok.value.toUpperCase() === 'AND' &&
                        tokens[pos + 1]?.kind !== 'LPAREN')
                )
            ) {
                break;
            }
            consume();
            const right = parseNot();
            left = toTruthy(left) && toTruthy(right);
        }
        return left;
    };

    const parseNot = (): FormulaValue => {
        const tok = peek();
        if (tok && tok.kind === 'OP' && tok.value === '!') {
            consume();
            return !toTruthy(parseNot());
        }
        return parseComparison();
    };

    const parseComparison = (): FormulaValue => {
        const left = parseAddSub();
        const tok = peek();
        if (
            tok &&
            tok.kind === 'OP' &&
            ['==', '=', '!=', '<>', '>=', '<=', '>', '<'].includes(tok.value)
        ) {
            const op = tok.value;
            consume();
            const right = parseAddSub();

            const leftNum = toNum(left);
            const rightNum = toNum(right);
            const bothNumeric =
                !Number.isNaN(leftNum) &&
                !Number.isNaN(rightNum) &&
                left !== null &&
                right !== null &&
                String(left).trim() !== '' &&
                String(right).trim() !== '';

            if (op === '==' || op === '=') {
                if (bothNumeric) return leftNum === rightNum;
                return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
            }
            if (op === '!=' || op === '<>') {
                if (bothNumeric) return leftNum !== rightNum;
                return String(left ?? '').trim().toLowerCase() !== String(right ?? '').trim().toLowerCase();
            }
            if (bothNumeric) {
                if (op === '>') return leftNum > rightNum;
                if (op === '>=') return leftNum >= rightNum;
                if (op === '<') return leftNum < rightNum;
                if (op === '<=') return leftNum <= rightNum;
            }
            const ls = String(left ?? '');
            const rs = String(right ?? '');
            if (op === '>') return ls > rs;
            if (op === '>=') return ls >= rs;
            if (op === '<') return ls < rs;
            if (op === '<=') return ls <= rs;
        }
        return left;
    };

    const parseAddSub = (): FormulaValue => {
        let left = parseMulDiv();
        while (true) {
            const tok = peek();
            if (!tok || tok.kind !== 'OP' || (tok.value !== '+' && tok.value !== '-')) {
                break;
            }
            const op = tok.value;
            consume();
            const right = parseMulDiv();
            const ln = toNum(left);
            const rn = toNum(right);
            const safeLn = Number.isNaN(ln) ? 0 : ln;
            const safeRn = Number.isNaN(rn) ? 0 : rn;
            left = op === '+' ? safeLn + safeRn : safeLn - safeRn;
        }
        return left;
    };

    const parseMulDiv = (): FormulaValue => {
        let left = parsePrimary();
        while (true) {
            const tok = peek();
            if (!tok || tok.kind !== 'OP' || (tok.value !== '*' && tok.value !== '/')) {
                break;
            }
            const op = tok.value;
            consume();
            const right = parsePrimary();
            const ln = toNum(left);
            const rn = toNum(right);
            const safeLn = Number.isNaN(ln) ? 0 : ln;
            const safeRn = Number.isNaN(rn) ? 0 : rn;
            left = op === '*' ? safeLn * safeRn : safeRn === 0 ? 0 : safeLn / safeRn;
        }
        return left;
    };

    const parsePrimary = (): FormulaValue => {
        const tok = peek();
        if (!tok) return false;

        if (tok.kind === 'OP' && tok.value === '-') {
            consume();
            const inner = toNum(parsePrimary());
            return Number.isNaN(inner) ? 0 : -inner;
        }

        if (tok.kind === 'LPAREN') {
            consume();
            const val = parseOr();
            if (peek()?.kind === 'RPAREN') consume();
            return val;
        }

        if (tok.kind === 'NUMBER') {
            consume();
            return tok.value;
        }

        if (tok.kind === 'STRING') {
            consume();
            return tok.value;
        }

        if (tok.kind === 'IDENT') {
            consume();
            const upper = tok.value.toUpperCase();
            if (upper === 'TRUE') return true;
            if (upper === 'FALSE') return false;
            if (upper === 'NULL') return null;

            if (peek()?.kind === 'LPAREN') {
                consume(); // '('
                const args: FormulaValue[] = [];
                const rawIdentFirst =
                    peek()?.kind === 'IDENT' && tokens[pos + 1]?.kind !== 'LPAREN'
                        ? (peek() as { kind: 'IDENT'; value: string }).value
                        : null;
                if (peek() && peek()!.kind !== 'RPAREN') {
                    args.push(parseOr());
                    while (peek()?.kind === 'COMMA') {
                        consume();
                        args.push(parseOr());
                    }
                }
                if (peek()?.kind === 'RPAREN') consume();

                switch (upper) {
                    case 'ISBLANK':
                    case 'ISNULL':
                    case 'ISEMPTY': {
                        if (rawIdentFirst && !(rawIdentFirst in record)) {
                            return true;
                        }
                        return isBlankValue(args[0]);
                    }
                    case 'NOT_BLANK':
                    case 'ISNOTBLANK':
                        return !isBlankValue(args[0]);
                    case 'LEN':
                    case 'LENGTH':
                        return String(args[0] ?? '').trim().length;
                    case 'CONTAINS':
                        return String(args[0] ?? '')
                            .toLowerCase()
                            .includes(String(args[1] ?? '').toLowerCase());
                    case 'STARTS_WITH':
                    case 'BEGINS':
                        return String(args[0] ?? '')
                            .toLowerCase()
                            .startsWith(String(args[1] ?? '').toLowerCase());
                    case 'AND':
                        return args.length > 0 && args.every(a => toTruthy(a));
                    case 'OR':
                        return args.some(a => toTruthy(a));
                    case 'NOT':
                        return !toTruthy(args[0] ?? false);
                    case 'TODAY':
                        return new Date().toISOString().split('T')[0];
                    default:
                        return false;
                }
            }

            return resolveField(tok.value);
        }

        consume();
        return false;
    };

    try {
        return toTruthy(parseOr());
    } catch {
        return false;
    }
}

export function evaluateRecordValidationRules(
    rules: readonly MetadataValidationRuleItem[],
    candidateRecord: Record<string, unknown>,
): {
    valid: boolean;
    violations: {
        ruleId: string;
        ruleName: string;
        errorMessage: string;
        errorField: string | null;
    }[];
} {
    const violations: {
        ruleId: string;
        ruleName: string;
        errorMessage: string;
        errorField: string | null;
    }[] = [];

    for (const rule of rules) {
        if (!rule.isActive) continue;
        const triggered = evaluateValidationRuleFormula(
            rule.errorConditionFormula,
            candidateRecord,
        );
        if (triggered) {
            violations.push({
                ruleId: rule.id,
                ruleName: rule.name,
                errorMessage: rule.errorMessage,
                errorField: rule.errorField,
            });
        }
    }

    return {
        valid: violations.length === 0,
        violations,
    };
}

// ─── Multi-Step Approval Process Helpers ─────────────────────────────────────

export function selectMatchingApprovalProcess(
    processes: readonly MetadataApprovalProcessItem[],
    record: Record<string, unknown>,
): MetadataApprovalProcessItem | null {
    const active = processes.filter(p => p.isActive && Array.isArray(p.steps) && p.steps.length > 0);
    if (active.length === 0) return null;

    // Prefer processes with explicit entry criteria matching first, then unconditional fallback
    const conditionalMatch = active.find(
        p =>
            p.entryCriteriaFormula &&
            p.entryCriteriaFormula.trim().length > 0 &&
            evaluateValidationRuleFormula(p.entryCriteriaFormula, record),
    );
    if (conditionalMatch) return conditionalMatch;

    const unconditional = active.find(
        p => !p.entryCriteriaFormula || p.entryCriteriaFormula.trim() === '',
    );
    return unconditional ?? null;
}

export function evaluateApprovalStepDecision(params: {
    process: MetadataApprovalProcessItem;
    instance: MetadataApprovalInstanceItem;
    actorUserId: string;
    effectiveRoleCode: string;
    baseRole: string;
    decision: 'APPROVED' | 'REJECTED';
    comment?: string | null;
    nowIso?: string;
}):
    | {
          ok: true;
          nextStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
          nextStep: number;
          nextIsLocked: boolean;
          updatedHistory: ApprovalStepHistoryEntry[];
          fieldUpdatesToApply: Record<string, string>;
      }
    | { ok: false; error: string } {
    const {
        process,
        instance,
        actorUserId,
        effectiveRoleCode,
        baseRole,
        decision,
        comment,
        nowIso = new Date().toISOString(),
    } = params;

    if (instance.status !== 'PENDING') {
        return { ok: false, error: `Approval instance is already ${instance.status}.` };
    }

    if (instance.submittedBy && instance.submittedBy === actorUserId) {
        return {
            ok: false,
            error: 'Maker-checker violation: submitter cannot approve or reject their own submission.',
        };
    }

    const sortedSteps = [...process.steps].sort((a, b) => a.stepNumber - b.stepNumber);
    const stepDef =
        sortedSteps.find(s => s.stepNumber === instance.currentStep) ??
        sortedSteps[instance.currentStep - 1];
    if (!stepDef) {
        return { ok: false, error: 'Current approval step definition not found.' };
    }

    const effUpper = (effectiveRoleCode || '').trim().toUpperCase();
    const baseUpper = (baseRole || '').trim().toUpperCase();
    const reqRole = (stepDef.approverRole || '').trim().toUpperCase();
    const isAdminOverride =
        baseUpper === 'PLATFORM_ADMIN' ||
        baseUpper === 'SUPER_ADMIN' ||
        baseUpper === 'SCHOOL_ADMIN';

    if (!isAdminOverride && reqRole && reqRole !== effUpper && reqRole !== baseUpper) {
        return {
            ok: false,
            error: `Step ${stepDef.stepNumber} ("${stepDef.stepName}") requires role ${reqRole}.`,
        };
    }

    const historyEntry: ApprovalStepHistoryEntry = {
        stepNumber: stepDef.stepNumber,
        stepName: stepDef.stepName,
        approverRole: stepDef.approverRole,
        actorUserId,
        decision,
        comment: comment?.trim() || null,
        decidedAt: nowIso,
    };
    const updatedHistory = [...(instance.stepHistory || []), historyEntry];

    if (decision === 'REJECTED') {
        return {
            ok: true,
            nextStatus: 'REJECTED',
            nextStep: stepDef.stepNumber,
            nextIsLocked: false,
            updatedHistory,
            fieldUpdatesToApply: process.fieldUpdatesOnReject || {},
        };
    }

    const nextStepDef = sortedSteps.find(s => s.stepNumber > stepDef.stepNumber);
    if (nextStepDef) {
        return {
            ok: true,
            nextStatus: 'PENDING',
            nextStep: nextStepDef.stepNumber,
            nextIsLocked: process.lockRecordOnSubmit,
            updatedHistory,
            fieldUpdatesToApply: {},
        };
    }

    return {
        ok: true,
        nextStatus: 'APPROVED',
        nextStep: stepDef.stepNumber,
        nextIsLocked: false,
        updatedHistory,
        fieldUpdatesToApply: process.fieldUpdatesOnApprove || {},
    };
}

// ─── Field-Level Audit Diff Helper ───────────────────────────────────────────

export function computeReadableRecordFieldDiffs(
    beforeRecord: Record<string, unknown> | null | undefined,
    afterRecord: Record<string, unknown> | null | undefined,
    readableFields: readonly Pick<MetadataField, 'apiName' | 'label'>[],
): RecordFieldDiffItem[] {
    if (!beforeRecord || !afterRecord) return [];
    const diffs: RecordFieldDiffItem[] = [];
    for (const fld of readableFields) {
        if (!(fld.apiName in afterRecord)) continue;
        const bRaw = beforeRecord[fld.apiName];
        const aRaw = afterRecord[fld.apiName];
        const bStr = bRaw === null || bRaw === undefined || String(bRaw).trim() === '' ? '—' : String(bRaw);
        const aStr = aRaw === null || aRaw === undefined || String(aRaw).trim() === '' ? '—' : String(aRaw);
        if (bStr !== aStr) {
            diffs.push({
                field: fld.apiName,
                label: fld.label,
                before: bStr,
                after: aStr,
            });
        }
    }
    return diffs;
}

// ─── Cross-Object Lookup Join Helper ─────────────────────────────────────────

export function joinRecordsOnLookup(params: {
    primaryRows: Record<string, unknown>[];
    relatedRows: Record<string, unknown>[];
    joinConfig: JoinedReportConfig;
}): Record<string, unknown>[] {
    const { primaryRows, relatedRows, joinConfig } = params;
    const prefix = `${joinConfig.relatedObjectApiName}.`;
    const joined: Record<string, unknown>[] = [];

    if (joinConfig.joinDirection === 'CHILD_TO_PARENT') {
        // primaryRow[lookupFieldApiName] -> relatedRow.id
        const parentById = new Map<string, Record<string, unknown>>();
        for (const r of relatedRows) {
            if (r.id != null) parentById.set(String(r.id), r);
        }
        for (const p of primaryRows) {
            const fkVal = p[joinConfig.lookupFieldApiName];
            const parent = fkVal != null ? parentById.get(String(fkVal)) : undefined;
            if (!parent && joinConfig.joinType === 'INNER') continue;
            const merged: Record<string, unknown> = { ...p };
            for (const col of joinConfig.relatedColumns) {
                merged[`${prefix}${col}`] = parent ? (parent[col] ?? null) : null;
            }
            joined.push(merged);
        }
        return joined;
    }

    // PARENT_TO_CHILD: relatedRow[lookupFieldApiName] -> primaryRow.id
    const childrenByParentId = new Map<string, Record<string, unknown>[]>();
    for (const child of relatedRows) {
        const fkVal = child[joinConfig.lookupFieldApiName];
        if (fkVal == null || String(fkVal).trim() === '') continue;
        const key = String(fkVal);
        const bucket = childrenByParentId.get(key) ?? [];
        bucket.push(child);
        childrenByParentId.set(key, bucket);
    }

    for (const p of primaryRows) {
        const pid = p.id != null ? String(p.id) : '';
        const children = pid ? childrenByParentId.get(pid) ?? [] : [];
        if (children.length === 0) {
            if (joinConfig.joinType === 'INNER') continue;
            const merged: Record<string, unknown> = { ...p };
            for (const col of joinConfig.relatedColumns) {
                merged[`${prefix}${col}`] = null;
            }
            joined.push(merged);
        } else {
            for (const child of children) {
                const merged: Record<string, unknown> = { ...p };
                for (const col of joinConfig.relatedColumns) {
                    merged[`${prefix}${col}`] = child[col] ?? null;
                }
                joined.push(merged);
            }
        }
    }

    return joined;
}
