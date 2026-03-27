import { NextResponse } from 'next/server';
import { buildBackendApiUrl } from '../../../lib/config';

export async function POST(request) {
  const formData = await request.formData();
  const templateKey = String(request.nextUrl.searchParams.get('templateKey') || '').trim();

  try {
    const response = await fetch(buildBackendApiUrl(`/api/reports/template-reference?templateKey=${encodeURIComponent(templateKey)}`), {
      method: 'POST',
      body: formData,
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
        path: '/api/reports/template-reference',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
