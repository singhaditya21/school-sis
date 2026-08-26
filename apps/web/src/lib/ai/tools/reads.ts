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

export const AI_READ_TOOLS = [
    studentStatusCounts,
    studentsPerGrade,
    attendanceSummary,
    feesOutstanding,
    invoiceLookup,
] as const;
