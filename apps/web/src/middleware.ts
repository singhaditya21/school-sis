import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import {
    isSessionDataExpired,
    MFA_REQUIRED_ROLE_NAMES,
    sessionOptions,
    type SessionData,
} from './lib/auth/session-options';
import {
    getPageAccessPolicy,
    isCapabilitySupportPageRoute,
    isPublicPageRoute,
    isRoleAllowedForPage,
} from './lib/auth/page-access';
import {
    CONTENT_SECURITY_POLICY_HEADER,
    CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER,
    contentSecurityPolicyHeaderName,
    createContentSecurityPolicy,
    createCspNonce,
} from './lib/security/headers';
import {
    evaluateCapabilityDefinition,
    findCapabilityForApiPath,
    findCapabilityForRoute,
} from './lib/capabilities/evaluator';
import { configuredProviderRequirements } from './lib/capabilities/providers';
import { CAPABILITY_REGISTRY_REVISION } from './lib/capabilities/registry';
import { hasPermission, UserRole } from './lib/rbac/permissions';

const MFA_REQUIRED_ROLES = new Set<string>(MFA_REQUIRED_ROLE_NAMES);
const RESERVED_TENANT_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'www']);

function attachContentSecurityPolicy(
    response: NextResponse,
    policy: string,
    reportOnly: boolean,
): NextResponse {
    const headerName = contentSecurityPolicyHeaderName(reportOnly);
    const otherHeaderName = reportOnly
        ? CONTENT_SECURITY_POLICY_HEADER
        : CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER;

    response.headers.set(headerName, policy);
    response.headers.delete(otherHeaderName);
    return response;
}

function normalizeHostname(value: string | null | undefined): string {
    const normalized = (value || '').trim().toLowerCase();
    if (normalized === '::1' || normalized === '[::1]') return '::1';
    return normalized.replace(/:\d+$/, '');
}

function configuredTenantBaseHosts(): string[] {
    const hosts = new Set<string>();
    for (const raw of (process.env.TENANT_BASE_HOSTS || '').split(',')) {
        let host = normalizeHostname(raw);
        if (host.includes('://')) {
            try {
                host = normalizeHostname(new URL(host).hostname);
            } catch {
                host = '';
            }
        }
        if (host) hosts.add(host);
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
        try {
            hosts.add(normalizeHostname(new URL(appUrl).hostname));
        } catch {
            // Ignore malformed optional config here; env validation catches hard requirements.
        }
    }
    return [...hosts];
}

function tenantHostHint(hostname: string, session: SessionData): string | null {
    const host = normalizeHostname(hostname);
    if (!host || RESERVED_TENANT_HOSTS.has(host) || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        return null;
    }

    for (const baseHost of configuredTenantBaseHosts()) {
        if (!baseHost || host === baseHost || host === `www.${baseHost}`) continue;
        if (host.endsWith(`.${baseHost}`)) {
            const prefix = host.slice(0, -(baseHost.length + 1)).split('.')[0];
            return prefix && prefix !== 'www' ? prefix : null;
        }
    }

    const tenantDomain = normalizeHostname(session.tenantDomain);
    if (tenantDomain && host === tenantDomain) {
        return host;
    }

    return null;
}

function tenantHostMatchesSession(hostHint: string, session: SessionData): boolean {
    const allowed = [
        normalizeHostname(session.tenantCode),
        normalizeHostname(session.tenantDomain),
    ].filter(Boolean);

    return allowed.some((value) => value === hostHint);
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const apiCapability = pathname.startsWith('/api/')
        ? findCapabilityForApiPath(pathname)
        : null;
    const pageCapability = pathname.startsWith('/api/')
        ? null
        : findCapabilityForRoute(pathname);
    const nonce = createCspNonce();
    const contentSecurityPolicy = createContentSecurityPolicy(nonce, {
        isDevelopment: process.env.NODE_ENV === 'development',
    });
    // Production is secure by default. `false` is an explicit, temporary
    // rollback switch; non-production stays report-only unless opted in so local
    // tooling remains inspectable while exercising the identical nonce policy.
    const reportOnly = process.env.CSP_ENFORCE === 'false'
        || (process.env.NODE_ENV !== 'production' && process.env.CSP_ENFORCE !== 'true');
    const requestHeaders = new Headers(request.headers);

    // Next.js reads the nonce from the request CSP during dynamic rendering and
    // applies it to framework/page scripts and generated style elements.
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set(CONTENT_SECURITY_POLICY_HEADER, contentSecurityPolicy);

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });
    const respond = (candidate: NextResponse) => attachContentSecurityPolicy(
        candidate,
        contentSecurityPolicy,
        reportOnly,
    );

    // Allow public routes
    if (isPublicPageRoute(pathname)) {
        return respond(response);
    }

    // Get session from cookies
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    // Check if user is authenticated
    if (!session.isLoggedIn) {
        if (apiCapability) {
            return respond(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
        }
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return respond(NextResponse.redirect(loginUrl));
    }

    if (isSessionDataExpired(session)) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        loginUrl.searchParams.set('expired', '1');
        return respond(NextResponse.redirect(loginUrl));
    }

    if (session.capabilityRevision !== CAPABILITY_REGISTRY_REVISION) {
        if (apiCapability) {
            return respond(NextResponse.json({
                error: 'Session capability context is stale',
                code: 'CAPABILITY_SESSION_STALE',
            }, { status: 401 }));
        }
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        loginUrl.searchParams.set('reason', 'capabilities_changed');
        return respond(NextResponse.redirect(loginUrl));
    }

    const productionMfaRequired = process.env.NODE_ENV === 'production' && MFA_REQUIRED_ROLES.has(session.role);
    const mfaEnrollmentPending = (session.mfaRequired || productionMfaRequired)
        && !session.mfaVerified
        && MFA_REQUIRED_ROLES.has(session.role);
    const isMfaEnrollmentPath = pathname === '/mfa/enroll' || pathname.startsWith('/mfa/enroll/');
    if (mfaEnrollmentPending && !isMfaEnrollmentPath) {
        if (pathname.startsWith('/api/')) {
            return respond(NextResponse.json({
                error: 'MFA enrollment required',
                code: 'MFA_ENROLLMENT_REQUIRED',
            }, { status: 403 }));
        }
        const enrollmentUrl = new URL('/mfa/enroll', request.url);
        enrollmentUrl.searchParams.set('redirect', pathname);
        return respond(NextResponse.redirect(enrollmentUrl));
    }

    const hostHint = tenantHostHint(request.nextUrl.hostname, session);
    if (hostHint && session.role !== 'PLATFORM_ADMIN' && !tenantHostMatchesSession(hostHint, session)) {
        return respond(NextResponse.redirect(new URL('/unauthorized', request.url)));
    }

    const pagePolicy = getPageAccessPolicy(pathname);
    if (!isRoleAllowedForPage(session.role, pagePolicy)) {
        if (apiCapability) {
            return respond(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
        }
        return respond(NextResponse.redirect(new URL('/unauthorized', request.url)));
    }

    if (
        process.env.NODE_ENV === 'production'
        && !apiCapability
        && !pageCapability
        && !isCapabilitySupportPageRoute(pathname)
    ) {
        const unavailableUrl = new URL('/unavailable', request.url);
        unavailableUrl.searchParams.set('reason', 'UNCLASSIFIED');
        return respond(NextResponse.redirect(unavailableUrl));
    }

    const capability = apiCapability || pageCapability;
    if (capability) {
        const decision = evaluateCapabilityDefinition(capability, {
            // companies.active_modules is copied into the signed session at login.
            // Missing entitlement data fails closed rather than inventing defaults.
            activeModules: session.activeModules || [],
            institutionType: session.institutionType,
            configuredProviders: configuredProviderRequirements(),
            hasPermission: (permission) => hasPermission(session.role as UserRole, permission),
            allowInternal: session.role === 'PLATFORM_ADMIN'
                && process.env.CAPABILITIES_INTERNAL_ACCESS === 'true',
        });

        if (!decision.available) {
            if (apiCapability) {
                const status = decision.reason === 'HIDDEN'
                    ? 404
                    : decision.reason === 'UNCONFIGURED'
                        ? 503
                        : 403;
                return respond(NextResponse.json({
                    error: 'Capability unavailable',
                    capability: decision.id,
                    reason: decision.reason,
                }, { status }));
            }

            if (decision.reason === 'FORBIDDEN') {
                return respond(NextResponse.redirect(new URL('/unauthorized', request.url)));
            }
            if (decision.reason === 'NOT_ENTITLED') {
                const upgradeUrl = new URL('/upgrade', request.url);
                upgradeUrl.searchParams.set('feature', decision.id);
                return respond(NextResponse.redirect(upgradeUrl));
            }

            const unavailableUrl = new URL('/unavailable', request.url);
            unavailableUrl.searchParams.set('capability', decision.id);
            if (decision.reason) unavailableUrl.searchParams.set('reason', decision.reason);
            return respond(NextResponse.redirect(unavailableUrl));
        }
    }

    return respond(response);
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - api routes (handled separately)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public files
         */
        '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|public).*)',
        '/api/agents/:path*',
        '/api/admissions/:path*',
        '/api/attendance/:path*',
        '/api/chat/:path*',
        '/api/coaching/:path*',
        '/api/compliance/:path*',
        '/api/copilot/:path*',
        '/api/exams/:path*',
        '/api/exports/:path*',
        '/api/fee-plans/:path*',
        '/api/finance/:path*',
        '/api/international/:path*',
        '/api/mobile/:path*',
        '/api/parent/:path*',
        '/api/payments',
        '/api/payments/orders/:path*',
        '/api/payments/stripe/:path*',
        '/api/payments/verify/:path*',
        '/api/quiz/:path*',
        '/api/receipts/:path*',
        '/api/report-cards/:path*',
        '/api/students/:path*',
        '/api/university/:path*',
    ],
};
