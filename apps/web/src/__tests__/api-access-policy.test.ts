import fs from 'fs';
import path from 'path';
import { API_ACCESS_POLICIES, findApiAccessPolicy } from '@/lib/auth/api-access';

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

describe('API access policy', () => {
    const routeFiles = walk(API_DIR)
        .filter((file) => file.endsWith('/route.ts'))
        .sort();
    const routePaths = routeFiles.map(routeFromApiFile);

    it('has explicit access policy coverage for every API route handler', () => {
        const missing = routePaths.filter((route) => !findApiAccessPolicy(route));
        expect(missing).toEqual([]);
    });

    it('keeps the retired NextAuth catch-all route out of the API surface', () => {
        expect(routePaths).not.toContain('/api/auth/[...nextauth]');
    });

    it('keeps policy entries anchored to existing API route handlers', () => {
        const stale = API_ACCESS_POLICIES
            .filter((policy) => !routePaths.some((route) => route === policy.prefix || route.startsWith(`${policy.prefix}/`)))
            .map((policy) => policy.prefix);

        expect(stale).toEqual([]);
    });

    it('checks each covered route for its expected guard markers', () => {
        const missingGuards: string[] = [];

        for (const file of routeFiles) {
            const route = routeFromApiFile(file);
            const policy = findApiAccessPolicy(route);
            const source = fs.readFileSync(file, 'utf8');

            for (const snippet of policy?.expectedGuardSnippets || []) {
                if (!source.includes(snippet)) {
                    missingGuards.push(`${route} missing ${snippet}`);
                }
            }
        }

        expect(missingGuards).toEqual([]);
    });
});
