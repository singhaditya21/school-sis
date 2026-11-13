/**
 * Read tools: questions the assistant may answer directly.
 *
 * Every one of these returns *aggregates or identifiers*, never a student's
 * personal record. That is the retrieval policy of this spine: the model is a
 * router over governed aggregates, not a search engine over PII. Column names are
 * taken from apps/web/drizzle/0000_init_baseline.sql.
 */
import { z } from 'zod';
import { formatCurrency } from '@/lib/utils';
import { runTenantScopedRead } from '../tenant-query';
import type { AiReadTool, AiRow } from '../types';

const MAX_ROWS = 50;

function toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

const studentStatusCounts: AiReadTool<Record<string, never>> = {
    kind: 'read',
    name: 'students.status_counts',
    title: 'Student counts by status',
    description: 'Counts the students in this school grouped by enrollment status (ACTIVE, ALUMNI, TRANSFERRED, …).',
    permission: 'students:read',
    inputSchema: z.object({}).strict(),
    async run(_input, context) {
        const rows = await runTenantScopedRead<{ status: string; total: string }>(
            context,
            `SELECT status::text AS status, COUNT(*)::text AS total
             FROM students
             WHERE tenant_id = $1
             GROUP BY status
             ORDER BY COUNT(*) DESC
             LIMIT ${MAX_ROWS}`,
        );
        const total = rows.reduce((sum, row) => sum + toNumber(row.total), 0);
        return {
            summary:
                rows.length === 0
                    ? 'This school has no student records yet.'
                    : `${total} student record(s) across ${rows.length} status value(s).`,
            fields: [
                { key: 'status', label: 'Status', format: 'text' },
                { key: 'total', label: 'Students', format: 'number' },
            ],
            rows: rows.map((row): AiRow => ({ status: row.status, total: toNumber(row.total) })),
        };
    },
};

const studentsPerGrade: AiReadTool<Record<string, never>> = {
    kind: 'read',
    name: 'students.per_grade',
    title: 'Active students per grade',
    description: 'Counts currently ACTIVE students in each grade, so class sizes can be compared.',
    permission: 'students:read',
    inputSchema: z.object({}).strict(),
    async run(_input, context) {
        const rows = await runTenantScopedRead<{ grade: string; total: string }>(
            context,
            `SELECT g.name AS grade, COUNT(*)::text AS total
             FROM students s
             JOIN grades g ON g.id = s.grade_id AND g.tenant_id = $1
             WHERE s.tenant_id = $1 AND s.status = 'ACTIVE'
             GROUP BY g.name, g.display_order
             ORDER BY g.display_order
             LIMIT ${MAX_ROWS}`,
        );
        const total = rows.reduce((sum, row) => sum + toNumber(row.total), 0);
        return {
            summary:
                rows.length === 0
                    ? 'No active students are enrolled in any grade.'
                    : `${total} active student(s) spread across ${rows.length} grade(s).`,
            fields: [
                { key: 'grade', label: 'Grade', format: 'text' },
                { key: 'total', label: 'Active students', format: 'number' },
            ],
            rows: rows.map((row): AiRow => ({ grade: row.grade, total: toNumber(row.total) })),
        };
    },
};

const attendanceSummarySchema = z.object({
    days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe('How many days back from today to summarise. Defaults to 7.'),
});

const attendanceSummary: AiReadTool<z.infer<typeof attendanceSummarySchema>> = {
    kind: 'read',
    name: 'attendance.recent_summary',
    title: 'Recent attendance summary',
    description: 'Counts attendance marks by status (PRESENT, ABSENT, LATE, …) over a recent window of days.',
    permission: 'attendance:read',
    inputSchema: attendanceSummarySchema,
    async run(input, context) {
        const days = input.days ?? 7;
        const rows = await runTenantScopedRead<{ status: string; total: string }>(
            context,
            `SELECT status::text AS status, COUNT(*)::text AS total
             FROM attendance_records
             WHERE tenant_id = $1 AND date >= (CURRENT_DATE - $2::int)
             GROUP BY status
             ORDER BY COUNT(*) DESC
             LIMIT ${MAX_ROWS}`,
            [context.tenantId, days],
        );
        const total = rows.reduce((sum, row) => sum + toNumber(row.total), 0);
        return {
            summary:
                total === 0
                    ? `No attendance was marked in the last ${days} day(s).`
                    : `${total} attendance mark(s) recorded in the last ${days} day(s).`,
            fields: [
                { key: 'status', label: 'Status', format: 'text' },
                { key: 'total', label: 'Marks', format: 'number' },
            ],
            rows: rows.map((row): AiRow => ({ status: row.status, total: toNumber(row.total) })),
        };
    },
};

const feesOutstanding: AiReadTool<Record<string, never>> = {
    kind: 'read',
    name: 'fees.outstanding_summary',
    title: 'Outstanding fees by invoice status',
    description:
        'Totals the unpaid balance on invoices, grouped by invoice status. Amounts are rupees. Returns no student names.',
    permission: 'fees:read',
    inputSchema: z.object({}).strict(),
    async run(_input, context) {
        const rows = await runTenantScopedRead<{ status: string; invoices: string; outstanding: string }>(
            context,
            `SELECT status::text AS status,
                    COUNT(*)::text AS invoices,
                    COALESCE(SUM(total_amount - paid_amount), 0)::text AS outstanding
             FROM invoices
             WHERE tenant_id = $1 AND status IN ('PENDING', 'PARTIAL', 'OVERDUE')
             GROUP BY status
             ORDER BY SUM(total_amount - paid_amount) DESC
             LIMIT ${MAX_ROWS}`,
        );
        const outstanding = rows.reduce((sum, row) => sum + toNumber(row.outstanding), 0);
        return {
            summary:
                rows.length === 0
                    ? 'No invoice currently carries an outstanding balance.'
                    : `${formatCurrency(outstanding)} outstanding across ${rows.reduce((sum, row) => sum + toNumber(row.invoices), 0)} invoice(s).`,
            fields: [
                { key: 'status', label: 'Invoice status', format: 'text' },
                { key: 'invoices', label: 'Invoices', format: 'number' },
                { key: 'outstanding', label: 'Outstanding', format: 'currency' },
            ],
            rows: rows.map((row): AiRow => ({
                status: row.status,
                invoices: toNumber(row.invoices),
                outstanding: toNumber(row.outstanding),
            })),
        };
    },
};

const invoiceLookupSchema = z.object({
    invoiceNumber: z.string().trim().min(1).max(50).describe('The invoice number exactly as printed on the invoice.'),
});

const invoiceLookup: AiReadTool<z.infer<typeof invoiceLookupSchema>> = {
    kind: 'read',
    name: 'fees.invoice_lookup',
    title: 'Look up one invoice',
    description:
        'Returns the status, total, paid amount and due date of a single invoice by its invoice number. No student identity is returned.',
    permission: 'fees:read',
    inputSchema: invoiceLookupSchema,
    async run(input, context) {
        const rows = await runTenantScopedRead<{
            invoice_number: string;
            status: string;
            total_amount: string;
            paid_amount: string;
            due_date: string;
        }>(
            context,
            `SELECT invoice_number, status::text AS status, total_amount::text AS total_amount,
                    paid_amount::text AS paid_amount, due_date::text AS due_date
             FROM invoices
             WHERE tenant_id = $1 AND invoice_number = $2
             LIMIT 1`,
            [context.tenantId, input.invoiceNumber],
        );

        if (rows.length === 0) {
            return {
                summary: `No invoice numbered "${input.invoiceNumber}" exists in this school.`,
                fields: [],
                rows: [],
            };
        }

        const invoice = rows[0];
        const balance = toNumber(invoice.total_amount) - toNumber(invoice.paid_amount);
        return {
            summary: `Invoice ${invoice.invoice_number} is ${invoice.status} with ${formatCurrency(balance)} outstanding, due ${invoice.due_date}.`,
            fields: [
                { key: 'invoice_number', label: 'Invoice', format: 'text' },
                { key: 'status', label: 'Status', format: 'text' },
                { key: 'total_amount', label: 'Total', format: 'currency' },
                { key: 'paid_amount', label: 'Paid', format: 'currency' },
                { key: 'due_date', label: 'Due', format: 'date' },
            ],
            rows: [
                {
                    invoice_number: invoice.invoice_number,
                    status: invoice.status,
                    total_amount: toNumber(invoice.total_amount),
                    paid_amount: toNumber(invoice.paid_amount),
                    due_date: invoice.due_date,
                },
            ],
        };
    },
};

const metadataObjectCatalog: AiReadTool<Record<string, never>> = {
    kind: 'read',
    name: 'metadata.object_catalog',
    title: 'Custom & Blueprint object catalog summary',
    description:
        'Lists published custom and blueprint objects in this school along with their total record counts. Returns no personal data.',
    permission: 'metadata:read',
    inputSchema: z.object({}).strict(),
    async run(_input, context) {
        const rows = await runTenantScopedRead<{
            object_name: string;
            api_name: string;
            record_count: string;
        }>(
            context,
            `SELECT mo.name AS object_name,
                    mo.api_name AS api_name,
                    COUNT(mr.id)::text AS record_count
             FROM metadata_objects mo
             LEFT JOIN metadata_records mr ON mr.object_id = mo.id AND mr.tenant_id = $1
             WHERE mo.tenant_id = $1 AND mo.status = 'PUBLISHED'
             GROUP BY mo.id, mo.name, mo.api_name
             ORDER BY COUNT(mr.id) DESC, mo.name ASC
             LIMIT ${MAX_ROWS}`,
        );
        const totalRecords = rows.reduce((sum, row) => sum + toNumber(row.record_count), 0);
        return {
            summary:
                rows.length === 0
                    ? 'No published custom or blueprint objects exist in this school yet.'
                    : `${rows.length} published custom object(s) holding ${totalRecords} total record(s).`,
            fields: [
                { key: 'object_name', label: 'Object', format: 'text' },
                { key: 'api_name', label: 'API name', format: 'text' },
                { key: 'record_count', label: 'Records', format: 'number' },
            ],
            rows: rows.map(
                (row): AiRow => ({
                    object_name: row.object_name,
                    api_name: row.api_name,
                    record_count: toNumber(row.record_count),
                }),
            ),
        };
    },
};

const metadataPendingApprovals: AiReadTool<Record<string, never>> = {
    kind: 'read',
    name: 'metadata.pending_approvals',
    title: 'Multi-step object approval queue summary',
    description:
        'Counts multi-step object approval instances grouped by approval process, object API name, and status (PENDING, APPROVED, REJECTED).',
    permission: 'workflow_approvals:read',
    inputSchema: z.object({}).strict(),
    async run(_input, context) {
        const rows = await runTenantScopedRead<{
            process_name: string;
            object_api_name: string;
            status: string;
            total: string;
        }>(
            context,
            `SELECT p.name AS process_name,
                    i.object_api_name AS object_api_name,
                    i.status AS status,
                    COUNT(*)::text AS total
             FROM metadata_approval_instances i
             JOIN metadata_approval_processes p ON p.id = i.process_id AND p.tenant_id = $1
             WHERE i.tenant_id = $1
             GROUP BY p.name, i.object_api_name, i.status
             ORDER BY COUNT(*) DESC
             LIMIT ${MAX_ROWS}`,
        );
        const pendingTotal = rows
            .filter((row) => row.status === 'PENDING')
            .reduce((sum, row) => sum + toNumber(row.total), 0);
        return {
            summary:
                rows.length === 0
                    ? 'No object approval instances have been submitted in this school yet.'
                    : `${pendingTotal} pending approval instance(s) across ${rows.length} process/status bucket(s).`,
            fields: [
                { key: 'process_name', label: 'Approval process', format: 'text' },
                { key: 'object_api_name', label: 'Object', format: 'text' },
                { key: 'status', label: 'Status', format: 'text' },
                { key: 'total', label: 'Instances', format: 'number' },
            ],
            rows: rows.map(
                (row): AiRow => ({
                    process_name: row.process_name,
                    object_api_name: row.object_api_name,
                    status: row.status,
                    total: toNumber(row.total),
                }),
            ),
        };
    },
};

const metadataActiveAutomations: AiReadTool<Record<string, never>> = {
    kind: 'read',
    name: 'metadata.active_automations',
    title: 'Active declarative workflow automations',
    description:
        'Counts active declarative workflows in this school grouped by target object, trigger event, and action type.',
    permission: 'metadata:read',
    inputSchema: z.object({}).strict(),
    async run(_input, context) {
        const rows = await runTenantScopedRead<{
            object_name: string;
            trigger_event: string;
            action_type: string;
            total: string;
        }>(
            context,
            `SELECT object_name,
                    trigger_event,
                    action_type,
                    COUNT(*)::text AS total
             FROM metadata_workflows
             WHERE tenant_id = $1 AND is_active = true
             GROUP BY object_name, trigger_event, action_type
             ORDER BY COUNT(*) DESC
             LIMIT ${MAX_ROWS}`,
        );
        const total = rows.reduce((sum, row) => sum + toNumber(row.total), 0);
        return {
            summary:
                rows.length === 0
                    ? 'No active declarative workflows are enabled in this school.'
                    : `${total} active workflow rule(s) across ${rows.length} object/action group(s).`,
            fields: [
                { key: 'object_name', label: 'Object', format: 'text' },
                { key: 'trigger_event', label: 'Trigger', format: 'text' },
                { key: 'action_type', label: 'Action', format: 'text' },
                { key: 'total', label: 'Active rules', format: 'number' },
            ],
            rows: rows.map(
                (row): AiRow => ({
                    object_name: row.object_name,
                    trigger_event: row.trigger_event,
                    action_type: row.action_type,
                    total: toNumber(row.total),
                }),
            ),
        };
    },
};

const metadataInstalledPackages: AiReadTool<Record<string, never>> = {
    kind: 'read',
    name: 'metadata.installed_packages',
    title: 'Installed AppExchange & Blueprint packages',
    description:
        'Lists the Education Cloud blueprints and schema packages currently installed in this school with their version and install date.',
    permission: 'metadata:read',
    inputSchema: z.object({}).strict(),
    async run(_input, context) {
        const rows = await runTenantScopedRead<{
            name: string;
            package_key: string;
            version: string;
            source_type: string;
            installed_at: string;
        }>(
            context,
            `SELECT name,
                    package_key,
                    version,
                    source_type,
                    installed_at::text AS installed_at
             FROM metadata_installed_packages
             WHERE tenant_id = $1
             ORDER BY updated_at DESC
             LIMIT ${MAX_ROWS}`,
        );
        return {
            summary:
                rows.length === 0
                    ? 'No blueprint or schema packages have been installed in this school yet.'
                    : `${rows.length} blueprint or schema package(s) installed in this school.`,
            fields: [
                { key: 'name', label: 'Package', format: 'text' },
                { key: 'package_key', label: 'Key', format: 'text' },
                { key: 'version', label: 'Version', format: 'text' },
                { key: 'source_type', label: 'Source', format: 'text' },
                { key: 'installed_at', label: 'Installed at', format: 'date' },
            ],
            rows: rows.map(
                (row): AiRow => ({
                    name: row.name,
                    package_key: row.package_key,
                    version: row.version,
                    source_type: row.source_type,
                    installed_at: row.installed_at.slice(0, 10),
                }),
            ),
        };
    },
};

export const AI_READ_TOOLS = [
    studentStatusCounts,
    studentsPerGrade,
    attendanceSummary,
    feesOutstanding,
    invoiceLookup,
    metadataObjectCatalog,
    metadataPendingApprovals,
    metadataActiveAutomations,
    metadataInstalledPackages,
] as const;
