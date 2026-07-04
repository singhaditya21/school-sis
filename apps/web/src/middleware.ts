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
    isPublicPageRoute,
    isRoleAllowedForPage,
} from './lib/auth/page-access';

const MFA_REQUIRED_ROLES = new Set<string>(MFA_REQUIRED_ROLE_NAMES);
const RESERVED_TENANT_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'www']);

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

    // Allow public routes
    if (isPublicPageRoute(pathname)) {
        return NextResponse.next();
    }

    // Get session from cookies
    const response = NextResponse.next();
    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    // Check if user is authenticated
    if (!session.isLoggedIn) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
    }

    if (isSessionDataExpired(session)) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        loginUrl.searchParams.set('expired', '1');
        return NextResponse.redirect(loginUrl);
    }

    const productionMfaRequired = process.env.NODE_ENV === 'production' && MFA_REQUIRED_ROLES.has(session.role);
    if ((session.mfaRequired || productionMfaRequired) && !session.mfaVerified && MFA_REQUIRED_ROLES.has(session.role)) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('mfa', 'required');
        return NextResponse.redirect(loginUrl);
    }

    const hostHint = tenantHostHint(request.nextUrl.hostname, session);
    if (hostHint && session.role !== 'PLATFORM_ADMIN' && !tenantHostMatchesSession(hostHint, session)) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    const pagePolicy = getPageAccessPolicy(pathname);
    if (!isRoleAllowedForPage(session.role, pagePolicy)) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    // ─── SaaS Paywall & Feature Flagging (Phase 5) ─────────────
    // Note: In production, `activeModules` is injected into the JWT/Session
    // during login from the `tenants` DB table.
    const activeModules = session.role === 'PLATFORM_ADMIN'
        ? ['ATTENDANCE', 'FEES', 'COMMUNICATION', 'AI_AGENTS', 'HIGHER_ED', 'COACHING', 'INTERNATIONAL', 'MULTI_CAMPUS', 'ENTERPRISE']
        : (session.activeModules || ['ATTENDANCE', 'FEES']); 
    
    // Group HQ Command Center (Super Admin Only + Multi-Campus Tier)
    if (pathname.startsWith('/hq')) {
        if (session.role !== 'SUPER_ADMIN' && session.role !== 'PLATFORM_ADMIN') {
            return NextResponse.redirect(new URL('/unauthorized', request.url));
        }
        if (session.role !== 'PLATFORM_ADMIN' && !activeModules.includes('MULTI_CAMPUS') && !activeModules.includes('ENTERPRISE')) {
            return NextResponse.redirect(new URL('/upgrade?feature=hq', request.url));
        }
    }

    // Higher Education Paywall
    if (pathname.startsWith('/university') && !activeModules.includes('HIGHER_ED')) {
        return NextResponse.redirect(new URL('/upgrade?feature=university', request.url));
    }

    // Coaching Paywall
    if (pathname.startsWith('/coaching') && !activeModules.includes('COACHING')) {
        return NextResponse.redirect(new URL('/upgrade?feature=coaching', request.url));
    }

    // International / Visa Paywall
    if (pathname.startsWith('/international') && !activeModules.includes('INTERNATIONAL')) {
        return NextResponse.redirect(new URL('/upgrade?feature=international', request.url));
    }

    // AI Agents Paywall
    if (pathname.startsWith('/chat') && !activeModules.includes('AI_AGENTS') && session.subscriptionTier === 'CORE') {
        return NextResponse.redirect(new URL('/upgrade?feature=ai', request.url));
    }

    return response;
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
    ],
};
