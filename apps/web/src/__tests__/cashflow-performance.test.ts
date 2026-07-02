import fs from 'node:fs';
import path from 'node:path';

describe('cashflow service query shape', () => {
    it('uses monthly rollups instead of correlated invoice subqueries', () => {
        const source = fs.readFileSync(
            path.join(process.cwd(), '../../packages/api/src/services/fees/cashflow.service.ts'),
            'utf8',
        );

        expect(source).toContain('payment_rollup');
        expect(source).toContain('invoice_rollup');
        expect(source).not.toContain('(SELECT SUM(i.total_amount)');
    });
});
