import { NextResponse } from 'next/server';
import { buildBackendApiUrl } from '../../../lib/config';

export async function GET(request) {
  const id = encodeURIComponent(request.nextUrl.searchParams.get('id') || '');

  try {
    const response = await fetch(buildBackendApiUrl(`/api/documents/preview?id=${id}`), {
      method: 'GET',
      cache: 'no-store',
    });

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': response.headers.get('content-disposition') || 'inline',
        'Cache-Control': response.headers.get('cache-control') || 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'proxy_request_failed',
        path: '/api/documents/preview',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
