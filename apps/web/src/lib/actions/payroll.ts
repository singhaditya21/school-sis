'use server';

import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth/session';

async function tid() { const s = await getSession(); return s.tenantId; }

export interface PayrollRecord {
    id: string; staffName: string; department: string; workingDays: number;
    daysPresent: number; basic: number; hra: number; da: number;
    grossSalary: number; pf: number; tax: number; totalDeductions: number;
    netSalary: number; status: 'DRAFT' | 'PROCESSED' | 'PAID'; paidOn?: string;
}

export async function getPayrollData(month: string, year: number): Promise<PayrollRecord[]> {
    const tenantId = await tid();
    await setTenantContext(tenantId);
    const rows = await db.execute(sql`
        SELECT p.id, u.first_name || ' ' || u.last_name AS "staffName", u.department,
               p.working_days AS "workingDays", p.days_present AS "daysPresent",
               p.basic, p.hra, p.da, p.gross_salary AS "grossSalary",
               p.pf, p.tax, p.total_deductions AS "totalDeductions",
               p.net_salary AS "netSalary", p.status, p.paid_on AS "paidOn"
        FROM payroll p JOIN users u ON u.id = p.user_id
        WHERE p.tenant_id = ${tenantId} AND p.month = ${month} AND p.year = ${year}
        ORDER BY u.first_name
    `);
    return (rows as any[]).map(r => ({
        id: r.id, staffName: r.staffName, department: r.department || 'N/A',
        workingDays: Number(r.workingDays || 26), daysPresent: Number(r.daysPresent || 0),
        basic: Number(r.basic || 0), hra: Number(r.hra || 0), da: Number(r.da || 0),
        grossSalary: Number(r.grossSalary || 0), pf: Number(r.pf || 0), tax: Number(r.tax || 0),
        totalDeductions: Number(r.totalDeductions || 0), netSalary: Number(r.netSalary || 0),
        status: r.status || 'DRAFT', paidOn: r.paidOn,
    }));
}
