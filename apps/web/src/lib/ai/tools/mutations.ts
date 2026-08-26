/**
 * Mutation tools: things a person asked the assistant to *change*.
 *
 * None of these change anything. Each one resolves the human-facing identifier to
 * a real row **inside the caller's tenant**, then hands a proposal to the existing
 * workflow_approvals engine (packages/api/src/workflows/approvals). The row id is
 * resolved server-side precisely so a model cannot name a row it never saw, and a
 * row that does not exist in this tenant produces a refusal rather than a guess.
 *
 * The approval that comes back is PENDING and lands in the normal /approvals queue,
 * where a human with the policy's approver role decides. Execution stays where it
 * already lives — in the domain code — and is never reachable from here.
 */
import { z } from 'zod';
import { formatCurrency } from '@/lib/utils';
import { runTenantScopedRead } from '../tenant-query';
import type { AiMutationTool } from '../types';

const waiveInvoiceSchema = z.object({
    invoiceNumber: z.string().trim().min(1).max(50).describe('The invoice number to waive, exactly as printed.'),
    reason: z
        .string()
        .trim()
        .min(10)
        .max(500)
        .describe('Why the waiver is being requested. Recorded verbatim in the audit trail.'),
});

const waiveInvoice: AiMutationTool<z.infer<typeof waiveInvoiceSchema>> = {
    kind: 'mutation',
    name: 'fees.request_invoice_waiver',
    title: 'Request an invoice waiver',
    description:
        'Requests that the outstanding balance on one invoice be waived. Requires a written reason. Nothing is waived by this call.',
    permission: 'fees:approve',
    approvalPolicyId: 'fees.invoice.waive',
    inputSchema: waiveInvoiceSchema,
    async propose(input, context) {
        const rows = await runTenantScopedRead<{
            id: string;
            invoice_number: string;
            status: string;
            total_amount: string;
            paid_amount: string;
        }>(
            context,
            `SELECT id, invoice_number, status::text AS status,
                    total_amount::text AS total_amount, paid_amount::text AS paid_amount
             FROM invoices
             WHERE tenant_id = $1 AND invoice_number = $2
             LIMIT 1`,
            [context.tenantId, input.invoiceNumber],
        );

        if (rows.length === 0) {
            return { refused: `No invoice numbered "${input.invoiceNumber}" exists in this school, so no waiver was requested.` };
        }

        const invoice = rows[0];
        if (invoice.status === 'CANCELLED' || invoice.status === 'WAIVED' || invoice.status === 'PAID') {
            return {
                refused: `Invoice ${invoice.invoice_number} is already ${invoice.status}, so a waiver would do nothing. No request was raised.`,
            };
        }

        const balance = Number(invoice.total_amount) - Number(invoice.paid_amount);
        return {
            title: `Waive ${formatCurrency(balance)} on invoice ${invoice.invoice_number}`,
            description: `Requested through the school assistant. Invoice ${invoice.invoice_number} is ${invoice.status} with ${formatCurrency(balance)} outstanding.`,
            reason: input.reason,
            resource: { type: 'invoice', id: invoice.id, label: invoice.invoice_number },
            payload: {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoice_number,
                currentStatus: invoice.status,
                outstandingAmount: balance,
                origin: 'ai_assistant',
                requestedByUserId: context.userId,
            },
            priority: 'HIGH',
        };
    },
};

const archiveStudentSchema = z.object({
    admissionNumber: z.string().trim().min(1).max(50).describe('The student admission number, exactly as recorded.'),
    reason: z
        .string()
        .trim()
        .min(10)
        .max(500)
        .describe('Why the record should be archived. Recorded verbatim in the audit trail.'),
});

const archiveStudent: AiMutationTool<z.infer<typeof archiveStudentSchema>> = {
    kind: 'mutation',
    name: 'students.request_archive',
    title: 'Request that a student record be archived',
    description:
        'Requests archival of one student record, identified by admission number. Archival is terminal, so nothing is archived by this call.',
    permission: 'students:archive',
    approvalPolicyId: 'students.archive',
    inputSchema: archiveStudentSchema,
    async propose(input, context) {
        const rows = await runTenantScopedRead<{ id: string; admission_number: string; status: string }>(
            context,
            `SELECT id, admission_number, status::text AS status
             FROM students
             WHERE tenant_id = $1 AND admission_number = $2
             LIMIT 1`,
            [context.tenantId, input.admissionNumber],
        );

        if (rows.length === 0) {
            return {
                refused: `No student with admission number "${input.admissionNumber}" exists in this school, so nothing was requested.`,
            };
        }

        const student = rows[0];
        if (student.status === 'ALUMNI' || student.status === 'TRANSFERRED') {
            return {
                refused: `Admission number ${student.admission_number} is already ${student.status}. No archival request was raised.`,
            };
        }

        return {
            title: `Archive student ${student.admission_number}`,
            description: `Requested through the school assistant. The record is currently ${student.status}.`,
            reason: input.reason,
            resource: { type: 'student', id: student.id, label: student.admission_number },
            payload: {
                studentId: student.id,
                admissionNumber: student.admission_number,
                currentStatus: student.status,
                origin: 'ai_assistant',
                requestedByUserId: context.userId,
            },
            priority: 'NORMAL',
        };
    },
};

export const AI_MUTATION_TOOLS = [waiveInvoice, archiveStudent] as const;
