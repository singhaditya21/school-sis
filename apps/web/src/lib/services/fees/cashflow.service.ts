// Fee Cashflow Service — Production (Real DB)
import { db, setTenantContext } from '@/lib/db';
import { sql } from 'drizzle-orm';

export const CashflowService = {
    async getMonthlyCashflow(tenantId: string, months: number = 12) {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT DATE_TRUNC('month',p.paid_at) AS month,SUM(p.amount) AS collected,(SELECT SUM(i.total_amount) FROM invoices i WHERE i.tenant_id=${tenantId} AND DATE_TRUNC('month',i.due_date)=DATE_TRUNC('month',p.paid_at)) AS expected FROM payments p WHERE p.tenant_id=${tenantId} AND p.status='COMPLETED' AND p.paid_at>=NOW()-(${months}||' months')::interval GROUP BY DATE_TRUNC('month',p.paid_at) ORDER BY month ASC`);
        return rows;
    },
    async getOutstandingSummary(tenantId: string) {
        await setTenantContext(tenantId);
        const [s] = await db.execute(sql`SELECT SUM(total_amount) AS "totalInvoiced",SUM(paid_amount) AS "totalCollected",SUM(total_amount-paid_amount) AS "totalOutstanding",COUNT(*) FILTER(WHERE status='OVERDUE') AS "overdueCount",SUM(CASE WHEN status='OVERDUE' THEN total_amount-paid_amount ELSE 0 END) AS "overdueAmount" FROM invoices WHERE tenant_id=${tenantId}`) as any[];
        return { totalInvoiced: Number(s?.totalInvoiced||0), totalCollected: Number(s?.totalCollected||0), totalOutstanding: Number(s?.totalOutstanding||0), overdueCount: Number(s?.overdueCount||0), overdueAmount: Number(s?.overdueAmount||0), collectionRate: s?.totalInvoiced>0?Math.round(Number(s.totalCollected)/Number(s.totalInvoiced)*100):0 };
    },
    async getPaymentMethodBreakdown(tenantId: string) {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT p.method,SUM(p.amount) AS total,COUNT(*) AS count FROM payments p WHERE p.tenant_id=${tenantId} AND p.status='COMPLETED' AND p.paid_at>=DATE_TRUNC('month',CURRENT_DATE) GROUP BY p.method ORDER BY total DESC`);
        return rows;
    },
    async getGradeWiseCollection(tenantId: string) {
        await setTenantContext(tenantId);
        const rows = await db.execute(sql`SELECT g.name AS grade,SUM(i.total_amount) AS expected,SUM(i.paid_amount) AS collected,SUM(i.total_amount-i.paid_amount) AS outstanding,COUNT(DISTINCT i.student_id) AS students FROM invoices i JOIN students s ON s.id=i.student_id LEFT JOIN sections sec ON sec.id=s.section_id LEFT JOIN grades g ON g.id=sec.grade_id WHERE i.tenant_id=${tenantId} GROUP BY g.name,g.display_order ORDER BY g.display_order`);
        return rows;
    },
};
