/**
 * D12 — the duplication tax, locked shut.
 *
 * Six independent `formatCurrency` implementations existed in this codebase.
 * One was configured with `currency: 'USD'` and rendered the executive
 * dashboard's rupee totals as dollars. This file both proves the surviving
 * implementation behaves correctly and fails CI if a seventh copy appears.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';

import {
    CURRENCY_CODE,
    formatCurrency,
    formatCurrencyPrecise,
    formatCompactCurrency,
    toRupees,
} from '@/lib/format/currency';
import { formatDate, formatDateTime, toDateInputValue } from '@/lib/format/date';
import { formatNumber, formatPercent, formatCompactNumber } from '@/lib/format/number';

const SRC_ROOT = path.join(__dirname, '..');
const FORMAT_DIR = path.join(SRC_ROOT, 'lib', 'format');

function walk(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === 'node_modules' || entry === '__tests__') continue;
            walk(full, files);
        } else if (/\.tsx?$/.test(entry)) {
            files.push(full);
        }
    }
    return files;
}

describe('currency is INR, structurally', () => {
    const sourceFiles = walk(SRC_ROOT).filter((f) => !f.startsWith(FORMAT_DIR));

    it('declares INR in exactly one place', () => {
        expect(CURRENCY_CODE).toBe('INR');
    });

    it('has no Intl currency formatter outside lib/format', () => {
        const offenders = sourceFiles.filter((file) =>
            /style:\s*['"]currency['"]/.test(readFileSync(file, 'utf8')),
        );
        expect(offenders.map((f) => path.relative(SRC_ROOT, f))).toEqual([]);
    });

    it('has no second formatCurrency definition anywhere', () => {
        const offenders = sourceFiles.filter((file) =>
            /(function|const)\s+formatCurrency\b/.test(readFileSync(file, 'utf8')),
        );
        expect(offenders.map((f) => path.relative(SRC_ROOT, f))).toEqual([]);
    });

    it('never mentions a non-INR currency code', () => {
        const offenders = sourceFiles.filter((file) =>
            /currency:\s*['"](?!INR)[A-Z]{3}['"]/.test(readFileSync(file, 'utf8')),
        );
        expect(offenders.map((f) => path.relative(SRC_ROOT, f))).toEqual([]);
    });
});

describe('formatCurrency', () => {
    it('renders rupees with Indian digit grouping', () => {
        expect(formatCurrency(1234567)).toBe('₹12,34,567');
        expect(formatCurrency(1234567.89)).toBe('₹12,34,568'); // rounds to whole rupees
        expect(formatCurrency(5000)).toBe('₹5,000');
    });

    it('accepts the string that pg returns for numeric(12,2)', () => {
        // invoices.total_amount is numeric(12,2); node-postgres yields '15000.00'
        expect(formatCurrency('15000.00')).toBe('₹15,000');
        expect(formatCurrencyPrecise('15000.00')).toBe('₹15,000.00');
    });

    it('treats money as rupees, never paise', () => {
        expect(formatCurrency(100)).toBe('₹100');
    });

    it('distinguishes a zero balance from a missing one', () => {
        expect(formatCurrency('0.00')).toBe('₹0');
        expect(formatCurrency(null)).toBe('—');
        expect(formatCurrency(undefined)).toBe('—');
        expect(formatCurrency('')).toBe('—');
        expect(formatCurrency('not a number')).toBe('—');
    });

    it('never emits NaN', () => {
        expect(formatCurrency(Number.NaN)).toBe('—');
        expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe('—');
    });

    it('keeps 0 and null distinguishable at the parsing layer', () => {
        expect(toRupees('0')).toBe(0);
        expect(toRupees(null)).toBeNull();
    });
});

describe('formatCompactCurrency', () => {
    it('uses lakh and crore, not thousand/million', () => {
        expect(formatCompactCurrency(42000000)).toBe('₹4.20 Cr');
        expect(formatCompactCurrency(350000)).toBe('₹3.50 L');
    });

    it('shows the exact figure below one lakh', () => {
        // Intl notation:'compact' renders this as '₹45T', which reads wrong in India.
        expect(formatCompactCurrency(45000)).toBe('₹45,000');
    });

    it('keeps the sign on negatives', () => {
        expect(formatCompactCurrency(-42000000)).toBe('-₹4.20 Cr');
    });
});

describe('formatDate', () => {
    it('renders a Postgres date column on the intended calendar day in UTC', () => {
        // pg returns date '2025-05-15' as this Date; a UTC serverless runtime
        // used to render it as 14 May.
        const dueDate = new Date('2025-05-14T18:30:00.000Z');
        expect(formatDate(dueDate)).toBe('15 May 2025');
    });

    it('formats a bare YYYY-MM-DD from its parts, with no timezone involved', () => {
        expect(formatDate('2025-05-15')).toBe('15 May 2025');
    });

    it('returns an em dash rather than "Invalid Date"', () => {
        expect(formatDate(null)).toBe('—');
        expect(formatDate('')).toBe('—');
        expect(formatDate('garbage')).toBe('—');
        expect(formatDateTime(null)).toBe('—');
    });

    it('round-trips to the shape a date column and a date input expect', () => {
        expect(toDateInputValue(new Date('2025-05-14T18:30:00.000Z'))).toBe('2025-05-15');
        expect(toDateInputValue(null)).toBe('');
    });
});

describe('numbers', () => {
    it('groups the Indian way', () => {
        expect(formatNumber(1234567)).toBe('12,34,567');
    });

    it('formats a percentage, not a ratio', () => {
        expect(formatPercent(69.0789)).toBe('69.1%');
        expect(formatPercent(null)).toBe('—');
    });

    it('mirrors the currency compact scale without the symbol', () => {
        expect(formatCompactNumber(42000000)).toBe('4.20 Cr');
    });
});

describe('the guard family has one documented home', () => {
    const guards = readFileSync(path.join(SRC_ROOT, 'lib', 'auth', 'guards.ts'), 'utf8');

    it.each([
        'requireAuth',
        'requireRole',
        'requireApiAuth',
        'requireApiPermission',
        'requireBearerServiceAuth',
        'requireServerSecret',
    ])('documents and re-exports %s', (name) => {
        expect(guards).toContain(name);
    });

    it('re-exports rather than redefining, so call sites cannot drift', () => {
        expect(/(export\s+)?(async\s+)?function\s+require[A-Z]/.test(guards)).toBe(false);
    });
});
