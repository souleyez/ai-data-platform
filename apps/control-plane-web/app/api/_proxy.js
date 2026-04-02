import { NextResponse } from 'next/server';
import { buildControlPlaneApiUrl } from '../lib/config';
import { ADMIN_TOKEN_HEADER, getAdminTokenFromRequest } from '../lib/admin-auth';

export async function proxyJson(path, init = {}, request) {
  try {
    const adminToken = request ? getAdminTokenFromRequest(request) : '';
    const headers = {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(adminToken ? { [ADMIN_TOKEN_HEADER]: adminToken } : {}),
      ...(init.headers || {}),
    };

    const response = await fetch(buildControlPlaneApiUrl(path), {
      ...init,
      headers,
      cache: 'no-store',
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'proxy_request_failed',
        path,
        backendUrl: buildControlPlaneApiUrl(path),
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
