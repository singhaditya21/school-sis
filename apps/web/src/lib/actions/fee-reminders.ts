'use server';

/**
 * Fee Reminder Service — Send payment reminders via SMS/Email
 * 
 * Uses the provider abstraction layer for actual delivery.
 * Tracks reminder history for audit purposes.
 */

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';
import { enqueueNotification } from '@/lib/notifications/outbox';
import { randomUUID } from 'crypto';

// ─── Types ───────────────────────────────────────────────────

export interface ReminderResult {
    success: boolean;
    sent: number;
    failed: number;
    errors: string[];
}

export interface ReminderPreview {
    studentId: string;
    studentName: string;
    guardianName: string;
    guardianPhone: string | null;
    guardianEmail: string | null;
    totalDue: number;
    daysOverdue: number;
}

// ─── Send Fee Reminders ──────────────────────────────────────

export async function sendFeeReminders(
    studentIds: string[],
    channel: 'sms' | 'email' | 'both' = 'both',
): Promise<ReminderResult> {
    const { tenantId, userId } = await requireAuth('fees:write');

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const studentId of studentIds) {
        try {
            // Get student info
            const { rows: [student] } = await pool.query(
                `SELECT first_name AS "firstName", last_name AS "lastName" FROM students WHERE id = $1 AND tenant_id = $2`,
                [studentId, tenantId]
            );

            if (!student) {
                failed++;
                errors.push(`Student ${studentId} not found`);
                continue;
            }

            // Get overdue invoice total
            const { rows: overdueInvoices } = await pool.query(
                `SELECT total_amount AS "totalAmount", paid_amount AS "paidAmount" 
                 FROM invoices 
                 WHERE tenant_id = $1 AND student_id = $2 AND due_date < $3 
                 AND status NOT IN ('PAID', 'CANCELLED', 'WAIVED')`,
                [tenantId, studentId, todayStr]
            );

            if (overdueInvoices.length === 0) {
                continue; // No overdue invoices for this student
            }

            const totalDue = overdueInvoices.reduce(
                (sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)),
                0,
            );

            // Get primary guardian contact
            const { rows: [guardian] } = await pool.query(
                `SELECT first_name AS "firstName", last_name AS "lastName", phone, email 
                 FROM guardians 
                 WHERE student_id = $1 AND tenant_id = $2 AND is_primary = true`,
                [studentId, tenantId]
            );

            if (!guardian) {
                failed++;
                errors.push(`No primary guardian for ${student.firstName} ${student.lastName}`);
                continue;
            }

            const studentName = `${student.firstName} ${student.lastName}`;
            const amountStr = new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0,
            }).format(totalDue);
            let queuedForStudent = 0;

            // Queue SMS
            if ((channel === 'sms' || channel === 'both') && guardian.phone) {
                const message = `Dear ${guardian.firstName}, a fee payment of ${amountStr} is overdue for ${studentName}. Please make the payment at your earliest convenience. - ScholarMind`;
                await enqueueNotification({
                    tenantId,
                    channel: 'SMS',
                    recipient: guardian.phone,
                    body: message,
                    payload: { type: 'FEE_REMINDER', studentId, totalDue, invoiceCount: overdueInvoices.length },
                    idempotencyKey: `fee-reminder:${studentId}:${todayStr}:sms`,
                    createdBy: userId,
                });
                queuedForStudent++;
            }

            // Queue Email
            if ((channel === 'email' || channel === 'both') && guardian.email) {
                await enqueueNotification({
                    tenantId,
                    channel: 'EMAIL',
                    recipient: guardian.email,
                    subject: `Fee Payment Reminder - ${studentName}`,
                    body: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #1e3a5f;">Fee Payment Reminder</h2>
                            <p>Dear ${guardian.firstName} ${guardian.lastName},</p>
                            <p>This is a gentle reminder that a fee payment of <strong>${amountStr}</strong> is overdue for your ward <strong>${studentName}</strong>.</p>
                            <p>Please make the payment at your earliest convenience to avoid any late payment charges.</p>
                            <div style="background: #f8f9fa; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0;">
                                <p style="margin: 0; font-weight: bold;">Amount Due: ${amountStr}</p>
                                <p style="margin: 4px 0 0 0; color: #666;">Invoices: ${overdueInvoices.length}</p>
                            </div>
                            <p style="color: #666; font-size: 12px;">This is an automated reminder from ScholarMind. If you have already made the payment, please ignore this message.</p>
                        </div>
                    `,
                    payload: { type: 'FEE_REMINDER', studentId, totalDue, invoiceCount: overdueInvoices.length },
                    idempotencyKey: `fee-reminder:${studentId}:${todayStr}:email`,
                    createdBy: userId,
                });
                queuedForStudent++;
            }

            if (queuedForStudent === 0) {
                failed++;
                errors.push(`No ${channel} contact for ${studentName}`);
                continue;
            }

            sent += queuedForStudent;

            // Log the reminder
            await pool.query(
                `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, after_state)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [randomUUID(), tenantId, userId, 'UPDATE', 'students', studentId, JSON.stringify({ channel, totalDue, invoiceCount: overdueInvoices.length, queued: queuedForStudent })]
            );
        } catch (err: any) {
            failed++;
            errors.push(`Error for ${studentId}: ${err.message}`);
        }
    }

    return { success: sent > 0, sent, failed, errors };
}

// ─── Get Reminder Preview ────────────────────────────────────

export async function getReminderPreview(): Promise<ReminderPreview[]> {
    const { tenantId } = await requireAuth('fees:read');
    const todayStr = new Date().toISOString().split('T')[0];
    const today = new Date();

    // Get overdue invoices grouped by student
    const { rows: overdueRows } = await pool.query(
        `SELECT student_id AS "studentId", total_amount AS "totalAmount", paid_amount AS "paidAmount", due_date AS "dueDate"
         FROM invoices
         WHERE tenant_id = $1 AND due_date < $2 AND status NOT IN ('PAID', 'CANCELLED', 'WAIVED')`,
        [tenantId, todayStr]
    );

    if (overdueRows.length === 0) return [];

    // Group by student
    const studentMap = new Map<string, { totalDue: number; oldestDue: Date }>();
    for (const row of overdueRows) {
        const existing = studentMap.get(row.studentId);
        const balance = Number(row.totalAmount) - Number(row.paidAmount);
        const dueDate = new Date(row.dueDate);

        if (existing) {
            existing.totalDue += balance;
            if (dueDate < existing.oldestDue) existing.oldestDue = dueDate;
        } else {
            studentMap.set(row.studentId, { totalDue: balance, oldestDue: dueDate });
        }
    }

    // Enrich with student + guardian info
    const previews: ReminderPreview[] = [];

    for (const [studentId, data] of studentMap) {
        const { rows: [student] } = await pool.query(
            `SELECT first_name AS "firstName", last_name AS "lastName" FROM students WHERE id = $1`,
            [studentId]
        );

        const { rows: [guardian] } = await pool.query(
            `SELECT first_name AS "firstName", last_name AS "lastName", phone, email 
             FROM guardians 
             WHERE student_id = $1 AND is_primary = true`,
            [studentId]
        );

        if (student) {
            previews.push({
                studentId,
                studentName: `${student.firstName} ${student.lastName}`,
                guardianName: guardian ? `${guardian.firstName} ${guardian.lastName}` : 'N/A',
                guardianPhone: guardian?.phone || null,
                guardianEmail: guardian?.email || null,
                totalDue: data.totalDue,
                daysOverdue: Math.floor((today.getTime() - data.oldestDue.getTime()) / (1000 * 60 * 60 * 24)),
            });
        }
    }

    // Sort by amount desc
    previews.sort((a, b) => b.totalDue - a.totalDue);
    return previews;
}
