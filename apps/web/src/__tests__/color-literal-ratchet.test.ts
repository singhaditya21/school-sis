import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Design-system ratchet: the number of hardcoded Tailwind color literals in the
 * app must not grow. New code uses the semantic tokens instead — bg-primary,
 * text-muted-foreground, border-border, text-destructive, bg-success-subtle, …
 *
 * When a refactor removes literals, lower BASELINE to the new count to lock in
 * the win (the test prints the current number). This mirrors the risk-debt
 * ratchet (`audit:debt`): it can only go down.
 */
const BASELINE = 2972;

// A Tailwind utility (bg-/text-/border-/…) on one of the numbered color scales.
// Semantic tokens (bg-primary, text-muted-foreground) have no numeric shade and
// are deliberately not matched.
const COLOR_LITERAL =
    '(bg|text|border|ring|from|via|to|fill|stroke|divide|placeholder|caret|accent|decoration|outline)-' +
    '(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-' +
    '(50|100|200|300|400|500|600|700|800|900|950)';

const repoRoot = resolve(process.cwd(), '..', '..');

function countColorLiterals(): number {
    try {
        const out = execFileSync(
            'git',
            ['grep', '-ohE', COLOR_LITERAL, '--', 'apps/web/src'],
            { cwd: repoRoot, encoding: 'utf8' },
        );
        return out.split('\n').filter(Boolean).length;
    } catch (error) {
        const e = error as { status?: number; stdout?: string };
        // git grep exits 1 with no output when nothing matches.
        if (e.status === 1 && !e.stdout) return 0;
        throw error;
    }
}

describe('design-system color-literal ratchet', () => {
    it(`does not exceed the ${BASELINE} baseline (use semantic tokens for new code)`, () => {
        const current = countColorLiterals();
        if (current < BASELINE) {
            // eslint-disable-next-line no-console
            console.info(
                `[color-ratchet] ${current} literals — below baseline ${BASELINE}. ` +
                    `Lower BASELINE to ${current} to lock it in.`,
            );
        }
        expect(current).toBeLessThanOrEqual(BASELINE);
    });
});
