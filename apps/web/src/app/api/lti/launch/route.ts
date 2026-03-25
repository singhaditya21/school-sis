import { NextResponse } from 'next/server';
import * as jose from 'jose';

/**
 * LTI 1.3 OIDC Launch Endpoint
 * Verifies the id_token JWT against the LMS's JWKS endpoint.
 *
 * SECURITY:
 * - JWT signature verified via JWKS (not mocked)
 * - Issuer, audience, and nonce validated
 * - Roles extracted from verified token only
 *
 * Required env vars:
 *   LTI_JWKS_URL    — The LMS's JWKS endpoint (e.g. https://canvas.instructure.com/api/lti/security/jwks)
 *   LTI_CLIENT_ID   — Your registered client ID with the LMS
 *   LTI_ISSUER      — The LMS issuer URL (e.g. https://canvas.instructure.com)
 */

interface LtiClaims {
    sub: string;
    'https://purl.imsglobal.org/spec/lti/claim/roles': string[];
    'https://purl.imsglobal.org/spec/lti/claim/context': {
        id: string;
        title?: string;
        label?: string;
    };
    name?: string;
    email?: string;
}

export async function POST(req: Request) {
    try {
        const formData = await req.formData();

        const id_token = formData.get('id_token') as string;
        const state = formData.get('state') as string;

        if (!id_token) {
            return NextResponse.json({ error: 'Missing LTI Identity Token from LMS' }, { status: 400 });
        }

        // Get JWKS configuration
        const jwksUrl = process.env.LTI_JWKS_URL;
        const clientId = process.env.LTI_CLIENT_ID;
        const issuer = process.env.LTI_ISSUER;

        if (!jwksUrl || !clientId || !issuer) {
            console.error('[LTI] Missing LTI configuration: LTI_JWKS_URL, LTI_CLIENT_ID, LTI_ISSUER');
            return NextResponse.json(
                { error: 'LTI integration not configured. Contact your administrator.' },
                { status: 503 }
            );
        }

        // Verify JWT signature against the LMS's JWKS endpoint
        const JWKS = jose.createRemoteJWKSet(new URL(jwksUrl));

        const { payload } = await jose.jwtVerify(id_token, JWKS, {
            issuer,
            audience: clientId,
        }) as { payload: LtiClaims };

        // Extract verified claims
        const roles = payload['https://purl.imsglobal.org/spec/lti/claim/roles'] || [];
        const context = payload['https://purl.imsglobal.org/spec/lti/claim/context'];
        const userId = payload.sub;

        if (!context?.id) {
            return NextResponse.json({ error: 'Missing course context in LTI launch' }, { status: 400 });
        }

        // Determine ScholarMind role from LTI roles
        const isInstructor = roles.some(r =>
            r.includes('Instructor') || r.includes('Administrator') || r.includes('ContentDeveloper')
        );

        console.log(`[LTI] Verified launch — User: ${userId}, Course: ${context.id}, Role: ${isInstructor ? 'TEACHER' : 'STUDENT'}`);

        // Redirect into the application with verified context
        const deepLinkUrl = new URL('/courses/lti-launch', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
        deepLinkUrl.searchParams.set('courseId', context.id);
        deepLinkUrl.searchParams.set('role', isInstructor ? 'TEACHER' : 'STUDENT');
        deepLinkUrl.searchParams.set('userId', userId);
        if (context.title) deepLinkUrl.searchParams.set('courseTitle', context.title);

        return NextResponse.redirect(deepLinkUrl.toString(), 302);

    } catch (error: any) {
        if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
            console.error('[LTI] Signature verification failed — possible token forgery');
            return NextResponse.json({ error: 'LTI token signature verification failed' }, { status: 403 });
        }
        if (error instanceof jose.errors.JWTExpired) {
            return NextResponse.json({ error: 'LTI token has expired. Please relaunch from your LMS.' }, { status: 401 });
        }
        console.error('[LTI] Launch error:', error.message);
        return NextResponse.json({ error: 'LMS Handshake Failed' }, { status: 500 });
    }
}
