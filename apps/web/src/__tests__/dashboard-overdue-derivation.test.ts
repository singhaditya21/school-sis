import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The admin dashboard must derive overdue fees the same way every other fee
 * readout does, not from a status nothing writes.
 *
 * getDashboardStats filtered invoices on `status = 'OVERDUE'`. Nothing in the
 * app ever stamps that status, so the filter matched zero rows: the landing page
 * showed ₹0 overdue and a 100% collection rate while /fees and /executive showed
 * the real defaulters one click away. Proven on seeded data — the corrected
 * query returns the identical overdue balance and defaulter count as
 * getExecutiveFinancialMetrics.
 */
const dashboard = readFileSync(
    resolve(process.cwd(), 'src/lib/actions/dashboard.ts'),
    'utf8',
);

describe('dashboard overdue derivation', () => {
    it('never filters invoices on the never-written OVERDUE status', () => {
        expect(dashboard).not.toMatch(/status\s*=\s*'OVERDUE'/);
    });

    it('derives overdue from due date and an outstanding balance', () => {
        expect(dashboard).toContain('due_date < CURRENT_DATE');
        expect(dashboard).toContain('total_amount > paid_amount');
        expect(dashboard).toContain("status NOT IN ('CANCELLED', 'WAIVED', 'DRAFT')");
    });

    it('rates collection against billings, not against collected + overdue', () => {
        // The old denominator omitted not-yet-due invoices and pinned the rate to
        // 100% the moment overdue read zero.
        expect(dashboard).toContain('collected / expected');
        expect(dashboard).not.toContain('collected / totalBilled');
    });
});
