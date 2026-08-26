/**
 * Execution plans for the governed BI catalog (packages/api/src/analytics/bi).
 *
 * The catalog describes datasets, dimensions and metrics semantically; it holds no SQL.
 * This module is the missing execution layer: it maps each catalog id onto a verified,
 * tenant-scoped SQL fragment. Nothing here is derived from caller input — the caller only
 * ever selects *ids*, which are validated by `validateBiQueryRequest` before compilation.
 * Filter values are the only caller-supplied data and are always bound as parameters.
 *
 * Every fragment below was checked against apps/web/drizzle/0000_init_baseline.sql and
 * executed against a seeded database. Datasets that the schema cannot answer honestly are
 * listed in UNSUPPORTED_BI_DATASETS with the reason, and are never offered as runnable.
 */
import { getBiMetric } from '@school-sis/api';
import type { BiDatasetDefinition, BiQueryFilter } from '@school-sis/api';

type ParamCast = '' | '::text' | '::date' | '::numeric' | '::timestamptz';

interface DimensionPlan {
    /** SQL expression, built only from catalog-controlled literals. */
    sql: string;
    /** Cast applied to bound filter parameters so enum/date comparisons type-check. */
    paramCast: ParamCast;
}

interface DatasetPlan {
    /** FROM + JOIN clause. */
    from: string;
    /** Tenant predicates; `$1` is always the tenant id. */
    tenantPredicates: readonly string[];
    /** Column the optional date range filters on. */
    dateColumn: string;
    /** Human description of what the date range actually filters. */
    dateColumnLabel: string;
    dateParamCast: ParamCast;
    dimensions: Readonly<Record<string, DimensionPlan>>;
    metrics: Readonly<Record<string, string>>;
}

const STUDENT_DIMENSIONS: Readonly<Record<string, DimensionPlan>> = {
    grade: { sql: 'grades.name', paramCast: '::text' },
    section: { sql: 'sections.name', paramCast: '::text' },
    gender: { sql: 'students.gender::text', paramCast: '::text' },
    category: { sql: 'students.category', paramCast: '::text' },
};

const DATASET_PLANS: Readonly<Record<string, DatasetPlan>> = {
    'enrollment.students': {
        from: `students
            LEFT JOIN sections ON sections.id = students.section_id AND sections.tenant_id = students.tenant_id
            LEFT JOIN grades ON grades.id = COALESCE(students.grade_id, sections.grade_id) AND grades.tenant_id = students.tenant_id`,
        tenantPredicates: ['students.tenant_id = $1'],
        dateColumn: 'students.created_at',
        dateColumnLabel: 'student record created',
        dateParamCast: '::timestamptz',
        dimensions: {
            ...STUDENT_DIMENSIONS,
            student_status: { sql: 'students.status::text', paramCast: '::text' },
        },
        metrics: {
            active_students: `COUNT(*) FILTER (WHERE students.status = 'ACTIVE')::int`,
            new_admissions: 'COUNT(*)::int',
        },
    },
    'attendance.daily': {
        from: `attendance_records
            JOIN students ON students.id = attendance_records.student_id AND students.tenant_id = attendance_records.tenant_id
            LEFT JOIN sections ON sections.id = COALESCE(attendance_records.section_id, students.section_id) AND sections.tenant_id = attendance_records.tenant_id
            LEFT JOIN grades ON grades.id = COALESCE(students.grade_id, sections.grade_id) AND grades.tenant_id = attendance_records.tenant_id`,
        tenantPredicates: ['attendance_records.tenant_id = $1'],
        dateColumn: 'attendance_records.date',
        dateColumnLabel: 'attendance date',
        dateParamCast: '::date',
        dimensions: {
            ...STUDENT_DIMENSIONS,
            attendance_date: { sql: 'attendance_records.date', paramCast: '::date' },
            attendance_status: { sql: 'attendance_records.status::text', paramCast: '::text' },
        },
        metrics: {
            attendance_percentage: `ROUND(COUNT(*) FILTER (WHERE attendance_records.status = 'PRESENT')::numeric / NULLIF(COUNT(*), 0) * 100, 2)`,
            absent_count: `COUNT(*) FILTER (WHERE attendance_records.status = 'ABSENT')::int`,
        },
    },
    'academics.results': {
        from: `student_results
            JOIN exam_schedules ON exam_schedules.id = student_results.exam_schedule_id
            JOIN exams ON exams.id = exam_schedules.exam_id
            LEFT JOIN subjects ON subjects.id = exam_schedules.subject_id AND subjects.tenant_id = exams.tenant_id
            JOIN students ON students.id = student_results.student_id AND students.tenant_id = exams.tenant_id
            LEFT JOIN sections ON sections.id = students.section_id AND sections.tenant_id = exams.tenant_id
            LEFT JOIN grades ON grades.id = COALESCE(students.grade_id, sections.grade_id, exam_schedules.grade_id) AND grades.tenant_id = exams.tenant_id`,
        tenantPredicates: ['exams.tenant_id = $1', 'student_results.tenant_id = $1'],
        dateColumn: 'exams.created_at',
        dateColumnLabel: 'exam created',
        dateParamCast: '::timestamptz',
        dimensions: {
            ...STUDENT_DIMENSIONS,
            exam: { sql: 'exams.name', paramCast: '::text' },
            subject: { sql: 'subjects.name', paramCast: '::text' },
        },
        metrics: {
            average_exam_score: `ROUND(AVG(student_results.marks_obtained::numeric / NULLIF(exam_schedules.max_marks, 0) * 100) FILTER (WHERE COALESCE(student_results.is_absent, false) = false), 2)`,
            pass_rate: `ROUND(COUNT(*) FILTER (WHERE COALESCE(student_results.is_absent, false) = false AND student_results.marks_obtained >= COALESCE(exam_schedules.passing_marks, 0))::numeric / NULLIF(COUNT(*) FILTER (WHERE COALESCE(student_results.is_absent, false) = false), 0) * 100, 2)`,
        },
    },
    'fees.ledger': {
        from: `invoices
            JOIN students ON students.id = invoices.student_id AND students.tenant_id = invoices.tenant_id
            LEFT JOIN sections ON sections.id = students.section_id AND sections.tenant_id = invoices.tenant_id
            LEFT JOIN grades ON grades.id = COALESCE(students.grade_id, sections.grade_id) AND grades.tenant_id = invoices.tenant_id
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(p.amount), 0) AS collected
                FROM payments p
                WHERE p.invoice_id = invoices.id AND p.tenant_id = invoices.tenant_id AND p.status = 'COMPLETED'
            ) invoice_payments ON true`,
        tenantPredicates: ['invoices.tenant_id = $1'],
        dateColumn: 'invoices.due_date',
        dateColumnLabel: 'invoice due date',
        dateParamCast: '::date',
        dimensions: {
            ...STUDENT_DIMENSIONS,
            invoice_status: { sql: 'invoices.status::text', paramCast: '::text' },
            due_month: { sql: `date_trunc('month', invoices.due_date)::date`, paramCast: '::date' },
        },
        metrics: {
            invoice_amount: 'COALESCE(SUM(invoices.total_amount), 0)',
            collected_amount: 'COALESCE(SUM(invoice_payments.collected), 0)',
            outstanding_amount: `COALESCE(SUM(GREATEST(invoices.total_amount - invoices.paid_amount, 0)) FILTER (WHERE invoices.status IN ('PENDING', 'PARTIAL', 'OVERDUE')), 0)`,
            collection_rate: 'ROUND(COALESCE(SUM(invoice_payments.collected), 0) / NULLIF(SUM(invoices.total_amount), 0) * 100, 2)',
        },
    },
    'admissions.pipeline': {
        from: 'admission_leads',
        tenantPredicates: ['admission_leads.tenant_id = $1'],
        dateColumn: 'admission_leads.created_at',
        dateColumnLabel: 'lead created',
        dateParamCast: '::timestamptz',
        dimensions: {
            lead_stage: { sql: 'admission_leads.stage::text', paramCast: '::text' },
            lead_source: { sql: 'admission_leads.source::text', paramCast: '::text' },
            created_month: { sql: `date_trunc('month', admission_leads.created_at)::date`, paramCast: '::date' },
        },
        metrics: {
            lead_count: 'COUNT(*)::int',
            conversion_rate: `ROUND(COUNT(*) FILTER (WHERE admission_leads.stage = 'ENROLLED')::numeric / NULLIF(COUNT(*), 0) * 100, 2)`,
        },
    },
    'communications.delivery': {
        from: 'notification_outbox',
        tenantPredicates: ['notification_outbox.tenant_id = $1'],
        dateColumn: 'notification_outbox.created_at',
        dateColumnLabel: 'notification queued',
        dateParamCast: '::timestamptz',
        dimensions: {
            channel: { sql: 'notification_outbox.channel', paramCast: '::text' },
            provider: { sql: 'notification_outbox.provider', paramCast: '::text' },
            status: { sql: 'notification_outbox.status', paramCast: '::text' },
        },
        metrics: {
            delivered_notifications: `COUNT(*) FILTER (WHERE notification_outbox.status IN ('SENT', 'DELIVERED'))::int`,
            delivery_failure_rate: `ROUND(COUNT(*) FILTER (WHERE notification_outbox.status IN ('FAILED', 'DEAD_LETTER'))::numeric / NULLIF(COUNT(*) FILTER (WHERE notification_outbox.status IN ('SENT', 'DELIVERED', 'FAILED', 'DEAD_LETTER')), 0) * 100, 2)`,
        },
    },
    'operations.jobs': {
        from: 'background_jobs',
        tenantPredicates: ['background_jobs.tenant_id = $1'],
        dateColumn: 'background_jobs.created_at',
        dateColumnLabel: 'job created',
        dateParamCast: '::timestamptz',
        dimensions: {
            queue: { sql: 'background_jobs.queue', paramCast: '::text' },
            task_name: { sql: 'background_jobs.task_name', paramCast: '::text' },
            job_status: { sql: 'background_jobs.status', paramCast: '::text' },
        },
        metrics: {
            failed_jobs: `COUNT(*) FILTER (WHERE background_jobs.status IN ('FAILED', 'DEAD_LETTER'))::int`,
        },
    },
};

/**
 * Catalog datasets this surface deliberately does not execute, and why.
 * Shown verbatim in the UI so the gap is visible rather than silently hidden.
 */
export const UNSUPPORTED_BI_DATASETS: Readonly<Record<string, string>> = {
    'platform.tenant_fleet':
        'Platform-scoped. The Platform ARR metric has no source column in this schema (companies stores a Stripe price id, not a contract value), so the dataset cannot be executed honestly from the tenant reporting workspace.',
    'platform.ai_economics':
        'Platform-scoped. Runs outside the tenant reporting workspace, which only issues tenant-scoped queries.',
};

export function isExecutableBiDataset(datasetId: string): boolean {
    return Object.prototype.hasOwnProperty.call(DATASET_PLANS, datasetId);
}

export function getBiDatasetDateLabel(datasetId: string): string | null {
    return DATASET_PLANS[datasetId]?.dateColumnLabel ?? null;
}

export interface CompiledBiQuery {
    sql: string;
    params: unknown[];
    /** Column headers in select order: dimensions first, then metrics. */
    columns: string[];
    /** Metric column headers, so numeric formatting can be applied downstream. */
    metricColumns: string[];
}

export interface CompileBiQueryInput {
    dataset: BiDatasetDefinition;
    tenantId: string;
    metricIds: readonly string[];
    dimensionIds: readonly string[];
    filters: readonly BiQueryFilter[];
    dateRange?: { from: string; to: string };
    limit: number;
}

export class BiCompileError extends Error {}

/**
 * Compile an already-validated BI request into parameterised SQL.
 *
 * Precondition: `validateBiQueryRequest` returned `valid` for this request, which guarantees
 * every metric/dimension/filter id belongs to the dataset. This function re-checks that each
 * id has an execution plan and refuses otherwise, so an un-planned catalog entry can never
 * fall through into generated SQL.
 */
export function compileBiQuery(input: CompileBiQueryInput): CompiledBiQuery {
    const plan = DATASET_PLANS[input.dataset.id];
    if (!plan) {
        throw new BiCompileError(
            UNSUPPORTED_BI_DATASETS[input.dataset.id] ??
            `Dataset ${input.dataset.id} has no execution plan in this release.`,
        );
    }

    if (input.metricIds.length === 0) {
        throw new BiCompileError('Select at least one metric.');
    }

    const params: unknown[] = [input.tenantId];
    const selects: string[] = [];
    const columns: string[] = [];
    const metricColumns: string[] = [];
    const groupBy: string[] = [];

    for (const dimensionId of input.dimensionIds) {
        const dimension = plan.dimensions[dimensionId];
        const definition = input.dataset.dimensions.find((entry) => entry.id === dimensionId);
        if (!dimension || !definition) {
            throw new BiCompileError(`Dimension ${dimensionId} is not executable for ${input.dataset.id}.`);
        }
        selects.push(`${dimension.sql} AS ${quoteAlias(definition.label)}`);
        columns.push(definition.label);
        groupBy.push(dimension.sql);
    }

    for (const metricId of input.metricIds) {
        const expression = plan.metrics[metricId];
        if (!expression) {
            throw new BiCompileError(`Metric ${metricId} is not executable for ${input.dataset.id}.`);
        }
        const label = metricLabel(input.dataset, metricId);
        selects.push(`${expression} AS ${quoteAlias(label)}`);
        columns.push(label);
        metricColumns.push(label);
    }

    const where = [...plan.tenantPredicates];

    if (input.dateRange) {
        params.push(input.dateRange.from);
        const fromParam = params.length;
        params.push(input.dateRange.to);
        const toParam = params.length;
        // The range is inclusive of both calendar days. For timestamp columns that means an
        // exclusive upper bound of the following midnight, otherwise same-day rows recorded
        // after 00:00 would silently drop out of the report.
        where.push(
            plan.dateParamCast === '::timestamptz'
                ? `${plan.dateColumn} >= $${fromParam}::date AND ${plan.dateColumn} < ($${toParam}::date + INTERVAL '1 day')`
                : `${plan.dateColumn} >= $${fromParam}::date AND ${plan.dateColumn} <= $${toParam}::date`,
        );
    }

    for (const filter of input.filters) {
        const dimension = plan.dimensions[filter.dimensionId];
        if (!dimension) {
            throw new BiCompileError(`Filter dimension ${filter.dimensionId} is not executable for ${input.dataset.id}.`);
        }
        where.push(compileFilter(dimension, filter, params));
    }

    params.push(input.limit);
    const limitParam = params.length;

    const sql = [
        `SELECT ${selects.join(', ')}`,
        `FROM ${plan.from}`,
        `WHERE ${where.join(' AND ')}`,
        groupBy.length > 0 ? `GROUP BY ${groupBy.join(', ')}` : '',
        groupBy.length > 0 ? `ORDER BY ${groupBy.map((_, index) => index + 1).join(', ')}` : '',
        `LIMIT $${limitParam}`,
    ]
        .filter(Boolean)
        .join('\n');

    return { sql, params, columns, metricColumns };
}

function compileFilter(dimension: DimensionPlan, filter: BiQueryFilter, params: unknown[]): string {
    const cast = dimension.paramCast;

    switch (filter.operator) {
        case 'eq':
        case 'neq':
        case 'gte':
        case 'lte': {
            const operator = { eq: '=', neq: '<>', gte: '>=', lte: '<=' }[filter.operator];
            params.push(scalarFilterValue(filter.value));
            return `${dimension.sql} ${operator} $${params.length}${cast}`;
        }
        case 'in': {
            const values = Array.isArray(filter.value) ? filter.value : [filter.value];
            if (values.length === 0) {
                throw new BiCompileError(`Filter on ${filter.dimensionId} needs at least one value.`);
            }
            params.push(values.map(scalarFilterValue));
            return `${dimension.sql} = ANY($${params.length}${cast === '' ? '' : `${cast}[]`})`;
        }
        case 'between': {
            const values = Array.isArray(filter.value) ? filter.value : [];
            if (values.length !== 2) {
                throw new BiCompileError(`A "between" filter on ${filter.dimensionId} needs exactly two values.`);
            }
            params.push(scalarFilterValue(values[0]));
            const low = params.length;
            params.push(scalarFilterValue(values[1]));
            return `${dimension.sql} BETWEEN $${low}${cast} AND $${params.length}${cast}`;
        }
        default:
            throw new BiCompileError(`Unsupported filter operator on ${filter.dimensionId}.`);
    }
}

function scalarFilterValue(value: unknown): string | number | boolean {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    throw new BiCompileError('Filter values must be a string, number, boolean or date.');
}

function metricLabel(dataset: BiDatasetDefinition, metricId: string): string {
    // Labels come from the catalog itself, so a catalog rename flows straight through.
    return getBiMetric(metricId)?.label ?? `${dataset.id}.${metricId}`;
}

/** Double-quote a column alias. Labels come from the catalog, never from the caller. */
function quoteAlias(label: string): string {
    return `"${label.replace(/"/g, '""')}"`;
}
