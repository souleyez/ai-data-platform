import { NextResponse } from 'next/server';
import { buildBackendApiUrl } from '../../../../../lib/config';

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const id = encodeURIComponent(resolvedParams?.id || '');
  const templateKey = encodeURIComponent(request.nextUrl.searchParams.get('templateKey') || '');

  try {
    const response = await fetch(
      buildBackendApiUrl(`/api/reports/template-reference/${id}/download?templateKey=${templateKey}`),
      {
        method: 'GET',
        cache: 'no-store',
      },
    );

    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': response.headers.get('content-disposition') || 'attachment',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'proxy_request_failed',
        path: `/api/reports/template-reference/${id}/download`,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
