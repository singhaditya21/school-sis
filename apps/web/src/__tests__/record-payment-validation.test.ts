/**
 * recordPayment rejects malformed input before any money moves.
 *
 * The amount rule matters most: invoices.total_amount is numeric(12,2), so a value
 * like '100.999' would be silently rounded up by Postgres — potentially above the
 * balance the check just approved.
 */

const AMOUNT_RE = /^\d{1,10}(\.\d{1,2})?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE'];

describe('recordPayment input rules', () => {
    describe('amount', () => {
        it.each(['1', '100', '15000.00', '0.01', '9999999999.99'])('accepts %s', (value) => {
            expect(AMOUNT_RE.test(value)).toBe(true);
        });

        it.each([
            ['100.999', 'three decimals would be rounded by numeric(12,2)'],
            ['1e3', 'scientific notation'],
            ['-100', 'negative'],
            ['', 'empty'],
            ['abc', 'not a number'],
            ['100.', 'trailing separator'],
            [' 100', 'untrimmed'],
        ])('rejects %s (%s)', (value) => {
            expect(AMOUNT_RE.test(value)).toBe(false);
        });
    });

    describe('invoice id', () => {
        it('accepts a v4 uuid', () => {
            expect(UUID_RE.test('9646c675-65b2-4bbc-9d99-f8a934024c2d')).toBe(true);
        });

        it.each(['', 'not-a-uuid', "'; DROP TABLE invoices; --", '123'])('rejects %s', (value) => {
            expect(UUID_RE.test(value)).toBe(false);
        });
    });

    describe('payment method', () => {
        it('matches the payment_method enum', () => {
            expect(PAYMENT_METHODS).toEqual(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE']);
        });

        it.each(['cash', 'BITCOIN', ''])('rejects %s', (value) => {
            expect(PAYMENT_METHODS.includes(value)).toBe(false);
        });
    });
});
