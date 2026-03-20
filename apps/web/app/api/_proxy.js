import { NextResponse } from 'next/server';
import { buildBackendApiUrl } from '../lib/config';

export async function proxyJson(path, init = {}) {
  try {
    const headers = {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    };

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
