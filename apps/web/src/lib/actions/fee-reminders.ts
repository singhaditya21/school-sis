'use server';

/**
 * Fee Reminder Service — Send payment reminders via SMS/Email
 * 
 * Uses the provider abstraction layer for actual delivery.
 * Tracks reminder history for audit purposes.
 */

import { db } from '@/lib/db';
import { invoices, students, guardians, auditLogs } from '@/lib/db/schema';
import { eq, and, lt, ne } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/middleware';
import { getSmsProvider } from '@/lib/providers/sms';
import { getEmailProvider } from '@/lib/providers/email';
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

    const smsProvider = getSmsProvider();
    const emailProvider = getEmailProvider();

    for (const studentId of studentIds) {
        try {
            // Get student info
            const [student] = await db
                .select({ firstName: students.firstName, lastName: students.lastName })
                .from(students)
                .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)));

            if (!student) {
                failed++;
                errors.push(`Student ${studentId} not found`);
                continue;
            }

            // Get overdue invoice total
            const overdueInvoices = await db
                .select({
                    totalAmount: invoices.totalAmount,
                    paidAmount: invoices.paidAmount,
                })
                .from(invoices)
                .where(and(
                    eq(invoices.tenantId, tenantId),
                    eq(invoices.studentId, studentId),
                    lt(invoices.dueDate, todayStr),
                    ne(invoices.status, 'PAID'),
                    ne(invoices.status, 'CANCELLED'),
                    ne(invoices.status, 'WAIVED'),
                ));

            if (overdueInvoices.length === 0) {
                continue; // No overdue invoices for this student
            }

            const totalDue = overdueInvoices.reduce(
                (sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)),
                0,
            );

            // Get primary guardian contact
            const [guardian] = await db
                .select({
                    firstName: guardians.firstName,
                    lastName: guardians.lastName,
                    phone: guardians.phone,
                    email: guardians.email,
                })
                .from(guardians)
                .where(and(
                    eq(guardians.studentId, studentId),
                    eq(guardians.tenantId, tenantId),
                    eq(guardians.isPrimary, true),
                ));

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

            // Send SMS
            if ((channel === 'sms' || channel === 'both') && guardian.phone) {
                const message = `Dear ${guardian.firstName}, a fee payment of ${amountStr} is overdue for ${studentName}. Please make the payment at your earliest convenience. - ScholarMind`;
                const result = await smsProvider.send(guardian.phone, message);
                if (!result.success) {
                    errors.push(`SMS failed for ${studentName}: ${result.data}`);
                }
            }

            // Send Email
            if ((channel === 'email' || channel === 'both') && guardian.email) {
                const result = await emailProvider.send({
                    to: guardian.email,
                    subject: `Fee Payment Reminder - ${studentName}`,
                    html: `
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
                });
                if (!result.success) {
                    errors.push(`Email failed for ${studentName}: ${result.data}`);
                }
            }

            sent++;

            // Log the reminder
            await db.insert(auditLogs).values({
                id: randomUUID(),
                tenantId,
                userId,
                action: 'UPDATE',
                entityType: 'students',
                entityId: studentId,
                afterState: { channel, totalDue, invoiceCount: overdueInvoices.length },
            });
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
    const overdueRows = await db
        .select({
            studentId: invoices.studentId,
            totalAmount: invoices.totalAmount,
            paidAmount: invoices.paidAmount,
            dueDate: invoices.dueDate,
        })
        .from(invoices)
        .where(and(
            eq(invoices.tenantId, tenantId),
            lt(invoices.dueDate, todayStr),
            ne(invoices.status, 'PAID'),
            ne(invoices.status, 'CANCELLED'),
            ne(invoices.status, 'WAIVED'),
        ));

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
        const [student] = await db
            .select({ firstName: students.firstName, lastName: students.lastName })
            .from(students)
            .where(eq(students.id, studentId));

        const [guardian] = await db
            .select({
                firstName: guardians.firstName,
                lastName: guardians.lastName,
                phone: guardians.phone,
                email: guardians.email,
            })
            .from(guardians)
            .where(and(
                eq(guardians.studentId, studentId),
                eq(guardians.isPrimary, true),
            ));

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
