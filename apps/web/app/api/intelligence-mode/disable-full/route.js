import { NextResponse } from 'next/server';
import { FULL_ACCESS_COOKIE_NAME } from '../../_proxy';
import { buildBackendApiUrl } from '../../../lib/config';

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return text ? { error: text } : {};
  }
}

export async function POST() {
  const response = await fetch(buildBackendApiUrl('/api/intelligence-mode/disable-full'), {
    method: 'POST',
    cache: 'no-store',
  });
  const data = await readJson(response);
  const nextResponse = NextResponse.json(data, { status: response.status });
  nextResponse.cookies.set({
    name: FULL_ACCESS_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: 0,
  });
  return nextResponse;
}
