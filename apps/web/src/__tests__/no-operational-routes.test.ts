import fs from 'fs';
import path from 'path';

const API_DIR = path.join(process.cwd(), 'src/app/api');

function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(fullPath);
        return fullPath;
    });
}

function routeFromApiFile(filePath: string): string {
    const relative = path.relative(API_DIR, filePath).replaceAll(path.sep, '/');
    const routePath = relative === 'route.ts' ? '' : relative.replace(/\/route\.ts$/, '');
    return routePath ? `/api/${routePath}` : '/api';
}

/**
 * Guard against re-introducing operational database/debug endpoints over HTTP.
 *
 * Schema/seed/debug operations belong in migrations, release scripts, or
 * controlled local runbooks (see scripts/seed.ts, scripts/setup-founder.ts) —
 * never as web route handlers, even when gated. Audit finding P0 #5.
 *
 * If a new endpoint legitimately needs one of these names, add it to
 * ALLOWLIST with a comment justifying the exception.
 */
const FORBIDDEN_SEGMENTS = ['seed', 'force-migrate', 'debug', 'fixture', 'backfill'];
const ALLOWLIST: string[] = [];

describe('operational route handlers', () => {
    const routePaths = walk(API_DIR)
        .filter((file) => file.endsWith('/route.ts'))
        .map(routeFromApiFile);

    it('does not expose seed/force-migrate/debug/fixture/backfill endpoints over HTTP', () => {
        const offenders = routePaths.filter((route) => {
            if (ALLOWLIST.includes(route)) return false;
            const segments = route.split('/');
            return FORBIDDEN_SEGMENTS.some((forbidden) => segments.includes(forbidden));
        });
        expect(offenders).toEqual([]);
    });
});
