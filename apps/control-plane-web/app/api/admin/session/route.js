import { NextResponse } from 'next/server';
import { buildControlPlaneApiUrl } from '../../../lib/config';
import { ADMIN_TOKEN_COOKIE, ADMIN_TOKEN_HEADER } from '../../../lib/admin-auth';

function buildCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  };
}

export async function GET(request) {
  const token = request.cookies.get(ADMIN_TOKEN_COOKIE)?.value?.trim() || '';
  return NextResponse.json({
    authenticated: Boolean(token),
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return NextResponse.json({
        error: 'ADMIN_TOKEN_REQUIRED',
      }, { status: 400 });
    }

    const verifyResponse = await fetch(buildControlPlaneApiUrl('/api/admin/users'), {
      method: 'GET',
      cache: 'no-store',
      headers: {
        [ADMIN_TOKEN_HEADER]: token,
      },
    });

    if (!verifyResponse.ok) {
      const text = await verifyResponse.text();
      return new NextResponse(text || JSON.stringify({ error: 'ADMIN_TOKEN_INVALID' }), {
        status: verifyResponse.status,
        headers: {
          'Content-Type': verifyResponse.headers.get('content-type') || 'application/json',
        },
      });
    }

    const response = NextResponse.json({
      status: 'ok',
      authenticated: true,
    });
    response.cookies.set(ADMIN_TOKEN_COOKIE, token, buildCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json({
      error: 'ADMIN_SESSION_CREATE_FAILED',
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({
    status: 'ok',
    authenticated: false,
  });
  response.cookies.set(ADMIN_TOKEN_COOKIE, '', {
    ...buildCookieOptions(),
    maxAge: 0,
  });
  return response;
}
