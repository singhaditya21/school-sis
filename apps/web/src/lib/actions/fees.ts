'use server';

import { pool } from '@/lib/db';
import { requireAuth } from '@/lib/auth/middleware';

export interface FeePlanListItem {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    academicYearName: string;
    componentCount: number;
    invoiceCount: number;
    totalCollected: number;
}

export interface FeeComponentItem {
    id: string;
    name: string;
    amount: string;
    frequency: string;
    isOptional: boolean;
}

export interface InvoiceListItem {
    id: string;
    invoiceNumber: string;
    studentName: string;
    totalAmount: string;
    paidAmount: string;
    dueDate: string;
    status: string;
}

export async function getFeePlans(): Promise<FeePlanListItem[]> {
    const { tenantId } = await requireAuth('fees:read');

    const plansResult = await pool.query(`
        SELECT 
            p.id, 
            p.name, 
            p.description, 
            p.is_active AS "isActive", 
            a.name AS "academicYearName"
        FROM fee_plans p
        INNER JOIN academic_years a ON p.academic_year_id = a.id
        WHERE p.tenant_id = $1
        ORDER BY p.created_at DESC
    `, [tenantId]);

    const result: FeePlanListItem[] = [];

    for (const plan of plansResult.rows) {
        const compResult = await pool.query(`
            SELECT COUNT(*) AS count
            FROM fee_components
            WHERE fee_plan_id = $1
        `, [plan.id]);

        const invResult = await pool.query(`
            SELECT 
                COUNT(*) AS count, 
                SUM(paid_amount) AS "totalPaid"
            FROM invoices
            WHERE fee_plan_id = $1 AND tenant_id = $2
        `, [plan.id, tenantId]);

        result.push({
            ...plan,
            componentCount: parseInt(compResult.rows[0].count, 10),
            invoiceCount: parseInt(invResult.rows[0].count, 10),
            totalCollected: Number(invResult.rows[0].totalPaid || 0),
        });
    }

    return result;
}

export async function getFeePlanComponents(planId: string): Promise<FeeComponentItem[]> {
    await requireAuth('fees:read');

    const result = await pool.query(`
        SELECT 
            id, 
            name, 
            amount, 
            frequency, 
            is_optional AS "isOptional"
        FROM fee_components
        WHERE fee_plan_id = $1
        ORDER BY created_at ASC
    `, [planId]);

    return result.rows;
}

export async function getInvoices(options?: {
    status?: string;
    limit?: number;
}): Promise<InvoiceListItem[]> {
    const { tenantId } = await requireAuth('fees:read');
    const limit = options?.limit || 50;

    let query = `
        SELECT 
            i.id, 
            i.invoice_number AS "invoiceNumber", 
            s.first_name AS "studentFirstName", 
            s.last_name AS "studentLastName", 
            i.total_amount AS "totalAmount", 
            i.paid_amount AS "paidAmount", 
            i.due_date AS "dueDate", 
            i.status
        FROM invoices i
        INNER JOIN students s ON i.student_id = s.id
        WHERE i.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (options?.status) {
        params.push(options.status);
        query += ` AND i.status = $${params.length}`;
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);

    return rows.map(r => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        studentName: `${r.studentFirstName} ${r.studentLastName}`,
        totalAmount: r.totalAmount,
        paidAmount: r.paidAmount,
        dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString().split('T')[0] : String(r.dueDate),
        status: r.status,
    }));
}

// ─── Fee Analytics Queries ────────────────────────────────────

export interface DefaulterStats {
    totalOverdueAmount: number;
    defaulterCount: number;
    overdueInvoiceCount: number;
    averageDaysOverdue: number;
    highestOverdue: number;
}

export interface AgeingBucket {
    label: string;
    count: number;
    amount: number;
}

export interface DefaulterItem {
    studentId: string;
    studentName: string;
    className: string;
    totalDue: number;
    totalPaid: number;
    balance: number;
    oldestDueDate: string;
    daysOverdue: number;
    invoiceCount: number;
}

export interface CollectionTrendItem {
    month: string;
    collected: number;
    billed: number;
}

export interface FeeOverview {
    totalBilled: number;
    totalCollected: number;
    totalPending: number;
    collectionRate: number;
    overdueAmount: number;
    defaulterCount: number;
    invoiceCount: number;
    paidInvoiceCount: number;
}

export async function getDefaulterStats(): Promise<DefaulterStats> {
    const { tenantId } = await requireAuth('fees:read');
    const today = new Date().toISOString().split('T')[0];

    const { rows: overdueRows } = await pool.query(`
        SELECT 
            total_amount AS "totalAmount", 
            paid_amount AS "paidAmount", 
            due_date AS "dueDate", 
            student_id AS "studentId"
        FROM invoices
        WHERE tenant_id = $1 
          AND due_date < $2 
          AND status NOT IN ('PAID', 'CANCELLED', 'WAIVED')
    `, [tenantId, today]);

    if (overdueRows.length === 0) {
        return {
            totalOverdueAmount: 0,
            defaulterCount: 0,
            overdueInvoiceCount: 0,
            averageDaysOverdue: 0,
            highestOverdue: 0,
        };
    }

    const todayDate = new Date(today);
    const uniqueStudents = new Set<string>();
    let totalOverdue = 0;
    let highestOverdue = 0;
    let totalDaysOverdue = 0;

    for (const row of overdueRows) {
        const balance = Number(row.totalAmount) - Number(row.paidAmount);
        totalOverdue += balance;
        if (balance > highestOverdue) highestOverdue = balance;
        uniqueStudents.add(row.studentId);
        const dueDate = new Date(row.dueDate);
        const daysOverdue = Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        totalDaysOverdue += daysOverdue;
    }

    return {
        totalOverdueAmount: totalOverdue,
        defaulterCount: uniqueStudents.size,
        overdueInvoiceCount: overdueRows.length,
        averageDaysOverdue: Math.round(totalDaysOverdue / overdueRows.length),
        highestOverdue,
    };
}

export async function getFeeAgeingBreakdown(): Promise<AgeingBucket[]> {
    const { tenantId } = await requireAuth('fees:read');
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const { rows: overdueRows } = await pool.query(`
        SELECT 
            total_amount AS "totalAmount", 
            paid_amount AS "paidAmount", 
            due_date AS "dueDate"
        FROM invoices
        WHERE tenant_id = $1 
          AND due_date < $2 
          AND status NOT IN ('PAID', 'CANCELLED', 'WAIVED')
    `, [tenantId, todayStr]);

    const buckets: AgeingBucket[] = [
        { label: '0-30 days', count: 0, amount: 0 },
        { label: '31-60 days', count: 0, amount: 0 },
        { label: '61-90 days', count: 0, amount: 0 },
        { label: '90+ days', count: 0, amount: 0 },
    ];

    for (const row of overdueRows) {
        const balance = Number(row.totalAmount) - Number(row.paidAmount);
        const dueDate = new Date(row.dueDate);
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

        let bucketIdx = 0;
        if (daysOverdue > 90) bucketIdx = 3;
        else if (daysOverdue > 60) bucketIdx = 2;
        else if (daysOverdue > 30) bucketIdx = 1;

        buckets[bucketIdx].count++;
        buckets[bucketIdx].amount += balance;
    }

    return buckets;
}

export async function getDefaulterList(options?: {
    sortBy?: 'amount' | 'days';
    limit?: number;
}): Promise<DefaulterItem[]> {
    const { tenantId } = await requireAuth('fees:read');
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const { rows: overdueRows } = await pool.query(`
        SELECT 
            i.student_id AS "studentId", 
            s.first_name AS "studentFirstName", 
            s.last_name AS "studentLastName", 
            g.name AS "gradeName", 
            sec.name AS "sectionName", 
            i.total_amount AS "totalAmount", 
            i.paid_amount AS "paidAmount", 
            i.due_date AS "dueDate"
        FROM invoices i
        INNER JOIN students s ON i.student_id = s.id
        INNER JOIN grades g ON s.grade_id = g.id
        INNER JOIN sections sec ON s.section_id = sec.id
        WHERE i.tenant_id = $1 
          AND i.due_date < $2 
          AND i.status NOT IN ('PAID', 'CANCELLED', 'WAIVED')
    `, [tenantId, todayStr]);

    const studentMap = new Map<string, DefaulterItem>();
    for (const row of overdueRows) {
        const existing = studentMap.get(row.studentId);
        const balance = Number(row.totalAmount) - Number(row.paidAmount);
        const dueDate = new Date(row.dueDate);
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const dueDateStr = row.dueDate instanceof Date ? row.dueDate.toISOString().split('T')[0] : String(row.dueDate);

        if (existing) {
            existing.totalDue += Number(row.totalAmount);
            existing.totalPaid += Number(row.paidAmount);
            existing.balance += balance;
            existing.invoiceCount++;
            if (daysOverdue > existing.daysOverdue) {
                existing.daysOverdue = daysOverdue;
                existing.oldestDueDate = dueDateStr;
            }
        } else {
            studentMap.set(row.studentId, {
                studentId: row.studentId,
                studentName: `${row.studentFirstName} ${row.studentLastName}`,
                className: `${row.gradeName} - ${row.sectionName}`,
                totalDue: Number(row.totalAmount),
                totalPaid: Number(row.paidAmount),
                balance,
                oldestDueDate: dueDateStr,
                daysOverdue,
                invoiceCount: 1,
            });
        }
    }

    let result = Array.from(studentMap.values());

    const sortBy = options?.sortBy || 'amount';
    if (sortBy === 'amount') {
        result.sort((a, b) => b.balance - a.balance);
    } else {
        result.sort((a, b) => b.daysOverdue - a.daysOverdue);
    }

    if (options?.limit) {
        result = result.slice(0, options.limit);
    }

    return result;
}

export async function getCollectionTrend(months: number = 6): Promise<CollectionTrendItem[]> {
    const { tenantId } = await requireAuth('fees:read');

    const { rows: paymentRows } = await pool.query(`
        SELECT 
            to_char(paid_at, 'YYYY-MM') AS month, 
            SUM(amount) AS total
        FROM payments
        WHERE tenant_id = $1 AND status = 'COMPLETED'
        GROUP BY to_char(paid_at, 'YYYY-MM')
        ORDER BY to_char(paid_at, 'YYYY-MM')
    `, [tenantId]);

    const { rows: invoiceRows } = await pool.query(`
        SELECT 
            to_char(created_at, 'YYYY-MM') AS month, 
            SUM(total_amount) AS total
        FROM invoices
        WHERE tenant_id = $1 AND status != 'CANCELLED'
        GROUP BY to_char(created_at, 'YYYY-MM')
        ORDER BY to_char(created_at, 'YYYY-MM')
    `, [tenantId]);

    const result: CollectionTrendItem[] = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

        const collected = paymentRows.find(r => r.month === key);
        const billed = invoiceRows.find(r => r.month === key);

        result.push({
            month: monthLabel,
            collected: Number(collected?.total || 0),
            billed: Number(billed?.total || 0),
        });
    }

    return result;
}

export async function getFeeOverview(): Promise<FeeOverview> {
    const { tenantId } = await requireAuth('fees:read');
    const todayStr = new Date().toISOString().split('T')[0];

    const { rows: invoiceStatsRows } = await pool.query(`
        SELECT 
            SUM(total_amount) AS "totalBilled", 
            SUM(paid_amount) AS "totalPaid", 
            COUNT(*) AS "totalCount"
        FROM invoices
        WHERE tenant_id = $1 AND status != 'CANCELLED'
    `, [tenantId]);

    const invoiceStats = invoiceStatsRows[0];

    const { rows: paidStatsRows } = await pool.query(`
        SELECT COUNT(*) AS count
        FROM invoices
        WHERE tenant_id = $1 AND status = 'PAID'
    `, [tenantId]);

    const paidStats = paidStatsRows[0];

    const { rows: overdueRows } = await pool.query(`
        SELECT student_id AS "studentId"
        FROM invoices
        WHERE tenant_id = $1 
          AND due_date < $2 
          AND status NOT IN ('PAID', 'CANCELLED', 'WAIVED')
    `, [tenantId, todayStr]);

    const uniqueDefaulters = new Set(overdueRows.map(r => r.studentId));

    const totalBilled = Number(invoiceStats?.totalBilled || 0);
    const totalCollected = Number(invoiceStats?.totalPaid || 0);
    const totalPending = totalBilled - totalCollected;
    const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0;

    return {
        totalBilled,
        totalCollected,
        totalPending,
        collectionRate,
        overdueAmount: totalPending,
        defaulterCount: uniqueDefaulters.size,
        invoiceCount: parseInt(invoiceStats?.totalCount || '0', 10),
        paidInvoiceCount: parseInt(paidStats?.count || '0', 10),
    };
}

// ─── Defaulter Alert Stats ────────────────────────────────────

export interface DefaulterAlertStats {
    total: number;
    critical: number;   // 60+ days overdue
    serious: number;    // 30-59 days overdue
    warning: number;    // 15-29 days overdue
    totalAmount: number;
}

export async function getDefaulterAlertStats(): Promise<DefaulterAlertStats> {
    const { tenantId } = await requireAuth('fees:read');
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const { rows: overdueRows } = await pool.query(`
        SELECT 
            i.student_id AS "studentId", 
            i.total_amount AS "totalAmount", 
            i.paid_amount AS "paidAmount", 
            i.due_date AS "dueDate"
        FROM invoices i
        WHERE i.tenant_id = $1 
          AND i.due_date < $2 
          AND i.status NOT IN ('PAID', 'CANCELLED', 'WAIVED')
    `, [tenantId, todayStr]);

    // Group by student and find the max days overdue per student
    const studentMaxDays = new Map<string, number>();
    let totalAmount = 0;

    for (const row of overdueRows) {
        const balance = Number(row.totalAmount) - Number(row.paidAmount);
        totalAmount += balance;
        const dueDate = new Date(row.dueDate);
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        const existing = studentMaxDays.get(row.studentId) || 0;
        if (daysOverdue > existing) {
            studentMaxDays.set(row.studentId, daysOverdue);
        }
    }

    let critical = 0;
    let serious = 0;
    let warning = 0;

    for (const days of studentMaxDays.values()) {
        if (days >= 60) critical++;
        else if (days >= 30) serious++;
        else if (days >= 15) warning++;
    }

    return {
        total: studentMaxDays.size,
        critical,
        serious,
        warning,
        totalAmount,
    };
}
