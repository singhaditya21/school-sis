import fs from 'fs';
import path from 'path';

const SRC_DIR = path.join(process.cwd(), 'src');

/**
 * Explicit allowlist of intentionally unauthenticated `'use server'` exports.
 * Every entry here MUST enforce rate limiting (`consumeRateLimit` /
 * `consumeLoginRateLimit` / `consumeGuestPortalRateLimit`) inside its module.
 */
const PUBLIC_RATE_LIMITED_SERVER_ACTIONS = new Set([
    'lib/actions/auth.ts::loginAction',
    'lib/actions/onboarding.ts::setupSchoolWorkspace',
    'lib/actions/demo-sandbox.ts::launchDemoSandboxAction',
    'lib/actions/metadata-engine.ts::getPublicPortalIntakeSchema',
    'lib/actions/metadata-engine.ts::submitPublicPortalIntakeRecord',
    'lib/actions/metadata-engine.ts::lookupPublicPortalRecordStatus',
]);

/**
 * Server-only internal modules that must NEVER carry `'use server'` (Audit C-01).
 */
const FORBIDDEN_USE_SERVER_FILES = [
    'lib/actions/erasure.ts',
    'lib/actions/webhooks.ts',
    'lib/actions/marketing.ts',
    'lib/actions/executive-analytics.ts',
    'lib/metadata/inbound-webhook.ts',
];

const DIRECT_AUTH_GUARD_MARKERS = [
    'requireAuth(',
    'requireRole(',
    'requirePlatformAdmin(',
    'requireFounderSession(',
    'requireParentContext(',
    'requireTeacherContext(',
    'requireSchoolAdmin(',
    'requireAdmissionsAccess(',
    'requireStaffAccess(',
    'requireTenantAuth(',
    'requireAnalyticsAccess(',
    'requireUsersAccess(',
    'assertGuardianOfStudent(',
    'currentSession(',
    'getSession(',
    'getObjectMetadata(',
    'queryRecords(',
    'updateAssetCondition(',
    'restockConsumable(',
    'resolveChild(',
    'tid(',
    'requireUserAdmin(',
];

function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(fullPath);
        return fullPath;
    });
}

describe('Server Action access policy (Audit C-01 / H-13)', () => {
    const sourceFiles = walk(SRC_DIR)
        .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes('__tests__'))
        .sort();

    it('keeps internal background/admin helper modules free of the use server directive', () => {
        const violations: string[] = [];

        for (const relPath of FORBIDDEN_USE_SERVER_FILES) {
            const absPath = path.join(SRC_DIR, relPath);
            if (!fs.existsSync(absPath)) continue;
            const content = fs.readFileSync(absPath, 'utf8');
            if (/^\s*['"]use server['"]\s*;?/m.test(content)) {
                violations.push(relPath);
            }
        }

        expect(violations).toEqual([]);
        const metadataEngine = fs.readFileSync(
            path.join(SRC_DIR, 'lib/actions/metadata-engine.ts'),
            'utf8',
        );
        expect(metadataEngine).not.toMatch(/export\s+async\s+function\s+ingestInboundWebhookLead\b/);
    });

    it('requires every exported use server async function to enforce session auth or be rate-limited public', () => {
        const unguarded: string[] = [];
        const unthrottledPublic: string[] = [];

        for (const absPath of sourceFiles) {
            const source = fs.readFileSync(absPath, 'utf8');
            if (!/^\s*['"]use server['"]\s*;?/m.test(source)) continue;

            const relPath = path.relative(SRC_DIR, absPath).replaceAll(path.sep, '/');
            const exportRe = /export\s+async\s+function\s+([A-Za-z0-9_]+)\s*\(/g;
            const matches = [...source.matchAll(exportRe)];

            for (let idx = 0; idx < matches.length; idx++) {
                const fnName = matches[idx][1];
                const actionKey = `${relPath}::${fnName}`;
                const start = matches[idx].index ?? 0;
                const end =
                    idx + 1 < matches.length
                        ? (matches[idx + 1].index ?? source.length)
                        : source.length;
                const fnBody = source.slice(start, end);

                if (PUBLIC_RATE_LIMITED_SERVER_ACTIONS.has(actionKey)) {
                    const hasRateLimit =
                        source.includes('consumeRateLimit') ||
                        source.includes('consumeLoginRateLimit') ||
                        source.includes('consumeGuestPortalRateLimit');
                    if (!hasRateLimit) {
                        unthrottledPublic.push(actionKey);
                    }
                    continue;
                }

                const hasAuthGuard = DIRECT_AUTH_GUARD_MARKERS.some((marker) =>
                    fnBody.includes(marker),
                );
                if (!hasAuthGuard) {
                    unguarded.push(actionKey);
                }
            }
        }

        expect(unthrottledPublic).toEqual([]);
        expect(unguarded).toEqual([]);
    });
});
