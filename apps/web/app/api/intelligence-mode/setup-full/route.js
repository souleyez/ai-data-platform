import { NextResponse } from 'next/server';
import { FULL_ACCESS_COOKIE_NAME } from '../../_proxy';
import { buildBackendApiUrl } from '../../../lib/config';

async function readJson(response) {
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text ? { error: text } : {};
  }
  return { text, payload };
}

export async function POST(request) {
  const payload = await request.json().catch(() => ({}));
  const response = await fetch(buildBackendApiUrl('/api/intelligence-mode/setup-full'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(payload),
  });
  const { payload: data } = await readJson(response);

  const nextResponse = NextResponse.json(data, { status: response.status });
  if (response.ok) {
    nextResponse.cookies.set({
      name: FULL_ACCESS_COOKIE_NAME,
      value: String(payload?.code || '').trim(),
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return nextResponse;
}
