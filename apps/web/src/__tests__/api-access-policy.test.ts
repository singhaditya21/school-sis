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

    it('enforces auth, signature, or rate-limit guards on every exported HTTP method handler', () => {
        const methodDeclRe =
            /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD)\s*\(/g;
        const approvedMethodGuards = [
            'requireApiAuth',
            'requireApiPermission',
            'requireApiRole',
            'requireBearerServiceAuth',
            'authenticateIntegrationRequest',
            'authenticateScimRequest',
            'getSession',
            'logoutAction',
            'consumeRateLimit',
            'handleOneRosterGet',
            'handleOidcLogin',
            'handleLtiLaunch',
            'verifyTwilioSignature',
            'verifyMsg91Token',
            'stripe-signature',
            'x-hub-signature-256',
            'verifyToken',
            'WHATSAPP_VERIFY_TOKEN',
            'verifyWhatsAppHandshake',
            'x-razorpay-signature',
            'x-scholarmind-webhook-token',
            'INBOUND_WEBHOOK_SECRET',
        ];

        const unguardedMethods: string[] = [];

        for (const file of routeFiles) {
            const route = routeFromApiFile(file);
            const policy = findApiAccessPolicy(route);
            if (!policy || policy.boundary === 'public') continue;

            const source = fs.readFileSync(file, 'utf8');
            const matches = [...source.matchAll(methodDeclRe)];

            for (let idx = 0; idx < matches.length; idx++) {
                const method = matches[idx][1];
                const start = matches[idx].index ?? 0;
                const end = idx + 1 < matches.length ? (matches[idx + 1].index ?? source.length) : source.length;
                const methodBody = source.slice(start, end);

                const hasGuard = approvedMethodGuards.some((marker) => methodBody.includes(marker));
                if (!hasGuard) {
                    unguardedMethods.push(`${method} ${route}`);
                }
            }
        }

        expect(unguardedMethods).toEqual([]);
    });
});
