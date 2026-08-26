import fs from 'fs';
import path from 'path';
import { API_ROUTES } from '../route-catalog';

const API_DIR = path.join(process.cwd(), 'src', 'app', 'api');
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function findRouteFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return findRouteFiles(full);
        return entry.name === 'route.ts' ? [full] : [];
    });
}

function routePathFor(file: string): string {
    const relative = path.relative(API_DIR, path.dirname(file));
    return `/api${relative === '' ? '' : `/${relative.split(path.sep).join('/')}`}`;
}

function exportedMethods(file: string): string[] {
    const source = fs.readFileSync(file, 'utf8');
    return HTTP_METHODS.filter((method) =>
        new RegExp(`export\\s+(async\\s+)?(function|const)\\s+${method}\\b`).test(source) ||
        new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`).test(source),
    );
}

describe('API documentation matches the routes on disk', () => {
    const files = findRouteFiles(API_DIR);
    const actual = new Map(files.map((file) => [routePathFor(file), exportedMethods(file)]));

    it('finds route files to compare against', () => {
        expect(files.length).toBeGreaterThan(50);
    });

    it('documents every route that exists', () => {
        const documented = new Set(API_ROUTES.map((route) => route.path));
        const undocumented = [...actual.keys()].filter((route) => !documented.has(route)).sort();
        expect(undocumented).toEqual([]);
    });

    it('does not document routes that do not exist', () => {
        const missing = API_ROUTES.map((route) => route.path).filter((route) => !actual.has(route)).sort();
        expect(missing).toEqual([]);
    });

    it('lists the same HTTP methods the handlers export', () => {
        const mismatches = API_ROUTES.flatMap((route) => {
            const found = actual.get(route.path);
            if (!found) return [];
            const documented = [...route.methods].sort().join(',');
            const implemented = [...found].sort().join(',');
            return documented === implemented ? [] : [`${route.path}: documented ${documented}, implemented ${implemented}`];
        });
        expect(mismatches).toEqual([]);
    });

    it('names a permission for every permission-gated route', () => {
        for (const route of API_ROUTES) {
            if (route.auth === 'session-permission') {
                expect(route.permission).toBeTruthy();
            } else {
                expect(route.permission).toBeUndefined();
            }
        }
    });
});
