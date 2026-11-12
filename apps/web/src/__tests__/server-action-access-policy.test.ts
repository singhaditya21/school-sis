import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const SRC_DIR = path.join(process.cwd(), 'src');

/**
 * Explicit allowlist of intentionally unauthenticated `'use server'` exports.
 * Every entry here MUST enforce rate limiting (`consumeRateLimit` /
 * `consumeLoginRateLimit` / `consumeGuestPortalRateLimit`) inside its module.
 */
const PUBLIC_RATE_LIMITED_SERVER_ACTIONS = new Set([
    'lib/actions/auth.ts::loginAction',
    'lib/actions/auth.ts::loginActionV2',
    'lib/actions/onboarding.ts::setupSchoolWorkspace',
    'lib/actions/demo-sandbox.ts::launchDemoSandboxAction',
    'lib/actions/metadata-engine.ts::getPublicPortalIntakeSchema',
    'lib/actions/metadata-engine.ts::submitPublicPortalIntakeRecord',
    'lib/actions/metadata-engine.ts::lookupPublicPortalRecordStatus',
]);

/**
 * Explicit allowlist of user-agnostic self-session or tenant-bootstrap `'use server'`
 * exports permitted to call bare 0-argument `requireAuth()` / `getSession()` / `currentSession()`
 * without a secondary role or permission check.
 *
 * Every tenant-mutating or domain-specific server action MUST pass an explicit
 * permission (`requireAuth('domain:action')`), call a role-scoped guard (`requireRole`,
 * `requireSchoolAdmin`, `hasPermission`, etc.), or delegate to an FLS/OLS-enforcing helper.
 */
const BARE_SESSION_AUTH_ALLOWLIST = new Set([
    // Self-session authentication & MFA lifecycle
    'lib/actions/auth.ts::logoutAction',
    'lib/actions/mfa.ts::beginMfaEnrollment',
    'lib/actions/mfa.ts::completeMfaEnrollment',
    'lib/actions/mfa.ts::verifyMfaBackupCodeAction',
    'lib/actions/mfa.ts::disableMfaAction',
    'lib/actions/platform.ts::returnToHQAction',
    'lib/actions/platform.ts::fetchActiveBroadcasts',
    // Tenant-scoped read/bootstrap helpers available to any authenticated tenant member under RLS
    'lib/actions/scaffolding-bridge.ts::getTenantId',
    'lib/actions/payments.ts::getOnlinePaymentCapabilities',
    'lib/actions/queries.ts::getSectionInfo',
    'lib/actions/queries.ts::getAcademicYears',
    'lib/actions/metadata-engine.ts::getAllMetadataObjects',
    'lib/actions/metadata-engine.ts::logRecordQuickActivity',
]);

const SECONDARY_AUTHORIZATION_MARKERS = [
    'hasPermission(',
    'requireRole(',
    'assertRole(',
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
    'requireUserAdmin(',
    'assertGuardianOfStudent(',
    'getObjectMetadata(',
    'queryRecords(',
    'updateRecordFieldValue(',
    'updateAssetCondition(',
    'restockConsumable(',
    'resolveChild(',
    'session.role',
    'auth.role',
    'authSession.role',
    'userRole',
    'ROLE_GROUPS',
    'ADMIN_ROLES',
    'STAFF_ROLES',
    'FINANCE_ROLES',
    'CONNECT_ADMIN_ROLES',
    'INVOICE_PAYER_ROLES',
];

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

    it('flags bare 0-argument requireAuth() or session lookups without secondary RBAC unless allowlisted (LOW-07)', () => {
        const bareRequireAuthViolations: string[] = [];

        for (const absPath of sourceFiles) {
            const source = fs.readFileSync(absPath, 'utf8');
            if (!/^\s*['"]use server['"]\s*;?/m.test(source)) continue;

            const relPath = path.relative(SRC_DIR, absPath).replaceAll(path.sep, '/');
            const sf = ts.createSourceFile(
                absPath,
                source,
                ts.ScriptTarget.Latest,
                true,
                absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
            );

            const firstStmt = sf.statements[0];
            const isModuleUseServer =
                Boolean(firstStmt) &&
                ts.isExpressionStatement(firstStmt) &&
                ts.isStringLiteral(firstStmt.expression) &&
                firstStmt.expression.text === 'use server';
            if (!isModuleUseServer) continue;

            for (const stmt of sf.statements) {
                if (!ts.isFunctionDeclaration(stmt) || !stmt.name || !stmt.body) continue;
                const modifiers = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
                const isExported = Boolean(
                    modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
                );
                const isAsync = Boolean(
                    modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword),
                );
                if (!isExported || !isAsync) continue;

                const fnName = stmt.name.text;
                const actionKey = `${relPath}::${fnName}`;
                if (
                    PUBLIC_RATE_LIMITED_SERVER_ACTIONS.has(actionKey) ||
                    BARE_SESSION_AUTH_ALLOWLIST.has(actionKey)
                ) {
                    continue;
                }

                let callsBareZeroArgRequireAuth = false;
                let callsScopedRequireAuth = false;
                let callsBareSessionLookup = false;

                const visit = (node: ts.Node) => {
                    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
                        const callee = node.expression.text;
                        if (callee === 'requireAuth') {
                            if (node.arguments.length === 0) {
                                callsBareZeroArgRequireAuth = true;
                            } else {
                                callsScopedRequireAuth = true;
                            }
                        } else if (callee === 'getSession' || callee === 'currentSession') {
                            callsBareSessionLookup = true;
                        }
                    }
                    ts.forEachChild(node, visit);
                };
                visit(stmt.body);

                if (!callsBareZeroArgRequireAuth && !callsBareSessionLookup) {
                    continue;
                }
                if (callsScopedRequireAuth) {
                    continue;
                }

                const fnText = stmt.body.getText(sf);
                const hasSecondaryCheck = SECONDARY_AUTHORIZATION_MARKERS.some((marker) =>
                    fnText.includes(marker),
                );

                if (!hasSecondaryCheck) {
                    bareRequireAuthViolations.push(actionKey);
                }
            }
        }

        expect(bareRequireAuthViolations).toEqual([]);
    });
});
