import { NextResponse } from 'next/server';
import { buildBackendApiUrl } from '../lib/config';

export async function proxyJson(path, init = {}) {
  const response = await fetch(buildBackendApiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
    },
  });
}
