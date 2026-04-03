import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { buildBackendApiUrl } from '../lib/config';

export const FULL_ACCESS_COOKIE_NAME = 'aidp_full_access_key_v1';

export async function proxyJson(path, init = {}, options = {}) {
  try {
    const headers = {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    };
    if (options.forwardFullAccessKey) {
      const cookieStore = await cookies();
      const accessKey = String(cookieStore.get(FULL_ACCESS_COOKIE_NAME)?.value || '').trim();
      if (accessKey) {
        headers['X-Access-Key'] = accessKey;
      }
    }

    const response = await fetch(buildBackendApiUrl(path), {
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
        backendUrl: buildBackendApiUrl(path),
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
