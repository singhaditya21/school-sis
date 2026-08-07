import { NextResponse } from 'next/server';
import {
  createLtiOidcLogin,
  LTI_STATE_COOKIE_MAX_AGE_SECONDS,
  LTI_STATE_COOKIE_NAME,
} from '@/lib/integrations/lti';
import { integrationJson } from '@/lib/integrations/api-platform';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function beginLogin(request: Request) {
  try {
    const login = await createLtiOidcLogin(request);
    const response = NextResponse.redirect(login.redirect, 302);
    response.cookies.set({
      name: LTI_STATE_COOKIE_NAME,
      value: login.stateCookieValue,
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: LTI_STATE_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid LTI OIDC login request.';
    const response = integrationJson({ error: message }, { status: 400 });
    response.cookies.set({
      name: LTI_STATE_COOKIE_NAME,
      value: '',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      expires: new Date(0),
      maxAge: 0,
    });
    return response;
  }
}

export const GET = beginLogin;
export const POST = beginLogin;
