/**
 * ============================================================================
 * THE AUTH GUARD MAP — read this before writing another guard.
 * ============================================================================
 *
 * This codebase grew six guard helpers because nobody could tell which one to
 * use, so each new boundary invented its own. They are NOT interchangeable:
 * they differ in how they FAIL, and picking the wrong one is a security bug,
 * not a style problem.
 *
 *   requireAuth               redirects to /login, then throws on permission
 *   requireRole               redirects to /login, then throws on role
 *   requireApiAuth            returns a 401/403 NextResponse (never throws)
 *   requireApiPermission      returns a 401/403 NextResponse (never throws)
 *   requireBearerServiceAuth  returns a 401/503 NextResponse (no session at all)
 *   requireServerSecret       throws at boot — config assertion, not a guard
 *
 * A `redirect()` inside a route handler produces a 307 to an HTML login page,
 * which an API client cannot act on. A `NextResponse` returned from a Server
 * Action is silently discarded and the action carries on UNAUTHENTICATED.
 * That is why the boundary decides the guard.
 *
 * ---------------------------------------------------------------------------
 * PICK BY BOUNDARY
 * ---------------------------------------------------------------------------
 *
 * 1. PAGE  (app/**\/page.tsx, layout.tsx, server components)
 *
 *      const { tenantId } = await requireAuth('fees:read');
 *
 *    Redirect-on-failure is correct here: the caller is a browser and the user
 *    should land on /login. Note that page ACCESS is separately declared in
 *    lib/auth/page-access.ts and enforced by middleware + a CI gate; requireAuth
 *    in the page body is the second line of defence that also gives you tenantId.
 *
 * 2. SERVER ACTION  (lib/actions/*.ts, 'use server')
 *
 *      export async function recordPayment(input: X) {
 *          const { tenantId, userId } = await requireAuth('fees:write');
 *          ...
 *      }
 *
 *    This is the house convention and ~590 call sites follow it. requireAuth
 *    THROWS on a permission failure, which Next surfaces as a server error —
 *    correct, because an unauthorised action must not complete.
 *
 *    If the action's result is read by a client component, remember the flat
 *    result rule ({ success, error? }). Wrap the guard with `safeAuth` below to
 *    turn a throw into a flat error instead of a red error overlay.
 *
 * 3. API ROUTE  (app/api/**\/route.ts) — session-authenticated
 *
 *      const auth = await requireApiPermission('attendance:write');
 *      if (!auth.ok) return auth.response;
 *      const { tenantId } = auth.context;
 *
 *    Never `requireAuth` here. Use requireApiPermission when a named permission
 *    exists; use requireApiAuth(ROLE_GROUPS.finance) when the boundary is a role
 *    group; use bare requireApiAuth() only when the handler does its own
 *    downstream authorization.
 *
 * 4. SERVICE-TO-SERVICE  (webhooks, cron, agent callbacks — no user session)
 *
 *      const denied = requireBearerServiceAuth(request, 'AGENT_WEBHOOK_SECRET', {
 *          serviceName: 'agent webhook',
 *      });
 *      if (denied) return denied;
 *
 *    Constant-time token comparison, 503 when unconfigured, 401 when wrong.
 *    There is no tenantId — the handler must derive tenant scope from the
 *    payload and validate it.
 *
 * 5. CONFIG ASSERTION  (module load / handler entry, not a request check)
 *
 *      const secret = requireServerSecret('RAZORPAY_WEBHOOK_SECRET');
 *
 * ---------------------------------------------------------------------------
 * THE SIXTH ONE
 * ---------------------------------------------------------------------------
 * `requireUserAdmin` in lib/actions/users.ts is a private, hand-rolled role
 * check that returns a flat `{ ok, error }` instead of throwing, because its
 * callers return flat results to client components. That is a legitimate need
 * and the wrong solution — it hardcodes its own role list, so it drifts from
 * packages/api's authorization policy. `safeAuth` and `safeRole` below cover
 * the same need without a private role list. Migrating users.ts is a
 * three-line change; it is left to the owner of that file.
 *
 * ---------------------------------------------------------------------------
 * WHICH BOUNDARY IS EACH API ROUTE?  lib/auth/api-access.ts declares it, and
 * __tests__/api-access-policy.test.ts fails CI when a route's guard does not
 * match its declared boundary. Add the policy entry when you add the route.
 * ---------------------------------------------------------------------------
 *
 * Nothing in this file redefines a guard. Every export below is the original
 * implementation, re-exported so that one import path documents the whole
 * family. Existing imports of '@/lib/auth/middleware' and '@/lib/auth/api'
 * keep working unchanged.
 */

import { requireAuth, requireRole, type AuthContext } from './middleware';
import type { UserRole } from '@/lib/rbac/permissions';

// ─── Page + Server Action boundary (redirect / throw) ────────────────────────

export { requireAuth, requireRole };
export type { AuthContext };

// ─── API route boundary (returns a NextResponse, never throws) ───────────────

export {
    requireApiAuth,
    requireApiPermission,
    requireBearerServiceAuth,
    requireServerSecret,
    ROLE_GROUPS,
    type ApiAuthContext,
    type ApiAuthResult,
} from './api';

// ─── Flat-result variants for actions read by client components ──────────────

/**
 * The flat shape every server action returns to a client component.
 * See CLAUDE.md: results read by client components must be FLAT.
 */
export type SafeAuthResult =
    | { success: true; tenantId: string; userId: string; role: string; email: string }
    | { success: false; error: string };

const FORBIDDEN_MESSAGE = 'You do not have permission to perform this action.';

/**
 * `requireAuth` that reports a permission failure as a flat error instead of
 * throwing. An unauthenticated caller is still redirected to /login, because
 * there is nothing useful a logged-out browser can do with an error string.
 *
 *   const auth = await safeAuth('users:write');
 *   if (!auth.success) return { success: false, error: auth.error };
 *
 * This is the replacement for hand-rolled per-file guards like
 * `requireUserAdmin`: same flat contract, but the permission comes from the
 * shared RBAC policy rather than a local array of role strings.
 */
export async function safeAuth(permission?: string): Promise<SafeAuthResult> {
    try {
        const auth = await requireAuth(permission);
        return {
            success: true,
            tenantId: auth.tenantId,
            userId: auth.userId,
            role: auth.session.role,
            email: auth.session.email,
        };
    } catch (error) {
        // `redirect()` throws a control-flow signal that Next must receive.
        if (isRedirectSignal(error)) throw error;
        return { success: false, error: messageFor(error) };
    }
}

/** Role-group twin of `safeAuth`, for boundaries defined by role not permission. */
export async function safeRole(...roles: UserRole[]): Promise<SafeAuthResult> {
    try {
        const auth = await requireRole(...roles);
        return {
            success: true,
            tenantId: auth.tenantId,
            userId: auth.userId,
            role: auth.session.role,
            email: auth.session.email,
        };
    } catch (error) {
        if (isRedirectSignal(error)) throw error;
        return { success: false, error: messageFor(error) };
    }
}

/**
 * Next's `redirect()` and `notFound()` work by throwing a tagged error that the
 * framework catches. Swallowing it turns a login redirect into a 200 with a
 * broken page, so every catch block around a guard must rethrow it.
 */
function isRedirectSignal(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const digest = (error as { digest?: unknown }).digest;
    return typeof digest === 'string'
        && (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND');
}

function messageFor(error: unknown): string {
    if (error instanceof Error && error.message.startsWith('Forbidden')) {
        return FORBIDDEN_MESSAGE;
    }
    return error instanceof Error && error.message
        ? error.message
        : 'Authentication failed.';
}
