import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from './lib/auth/session';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/'];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public routes
    if (PUBLIC_ROUTES.includes(pathname)) {
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

    // Tenant isolation: extract tenant from subdomain or header
    const host = request.headers.get('host') || '';
    const subdomain = host.split('.')[0];

    // If subdomain routing is used, validate tenant access
    if (subdomain && subdomain !== 'localhost' && subdomain !== 'www') {
        // TODO: Implement tenant validation logic
        // For now, we'll use tenantId from session
    }

    // Role-based route protection
    const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/dashboard') || pathname.startsWith('/hq');
    const isParentRoute = pathname.startsWith('/parent') || pathname.startsWith('/overview');
    const isPlatformRoute = pathname.startsWith('/platform');

    if (isPlatformRoute) {
        if (session.role !== 'PLATFORM_ADMIN') {
            return NextResponse.redirect(new URL('/unauthorized', request.url));
        }
    }

    if (isAdminRoute) {
        const adminRoles = ['PLATFORM_ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT', 'ADMISSION_COUNSELOR', 'TEACHER', 'TRANSPORT_MANAGER'];
        if (!adminRoles.includes(session.role)) {
            return NextResponse.redirect(new URL('/unauthorized', request.url));
        }
    }

    if (isParentRoute) {
        if (session.role !== 'PARENT') {
            return NextResponse.redirect(new URL('/unauthorized', request.url));
        }
    }

    // ─── SaaS Paywall & Feature Flagging (Phase 5) ─────────────
    // Note: In production, `activeModules` is injected into the JWT/Session
    // during login from the `tenants` DB table.
    const activeModules = session.activeModules || ['ATTENDANCE', 'FEES']; 
    
    // Group HQ Command Center (Super Admin Only + Multi-Campus Tier)
    if (pathname.startsWith('/hq')) {
        if (session.role !== 'SUPER_ADMIN') {
            return NextResponse.redirect(new URL('/unauthorized', request.url));
        }
        if (!activeModules.includes('MULTI_CAMPUS') && !activeModules.includes('ENTERPRISE')) {
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
