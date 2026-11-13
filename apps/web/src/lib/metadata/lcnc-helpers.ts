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

export interface SavedLcncReportItem {
    id: string;
    name: string;
    categoryId: string | null;
    categoryName: string | null;
    objectApiName: string | null;
    reportKind: 'STANDARD_BI' | 'OBJECT_REPORT';
    datasetKey: string;
    groupByField: string;
    aggregateFunction: RollupAggregateFunction;
    metricField: string | null;
    selectedColumns: string[];
    filterRules: SavedViewFilterRule[];
    chartType: 'TABLE' | 'BAR' | 'KPI';
    allowedRoles: string[];
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
