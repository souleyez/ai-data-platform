import { NextResponse } from 'next/server';
import { buildBackendApiUrl } from '../../../../lib/config';

export async function GET(_request, { params }) {
  try {
    const resolvedParams = await params;
    const id = encodeURIComponent(resolvedParams?.id || '');
    const response = await fetch(buildBackendApiUrl(`/api/reports/output/${id}`), {
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
        path: `/api/reports/output/${id}`,
        backendUrl: buildBackendApiUrl(`/api/reports/output/${id}`),
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}

export async function DELETE(_request, { params }) {
  try {
    const resolvedParams = await params;
    const id = encodeURIComponent(resolvedParams?.id || '');
    const response = await fetch(buildBackendApiUrl(`/api/reports/output/${id}`), {
      method: 'DELETE',
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
        path: `/api/reports/output/${id}`,
        backendUrl: buildBackendApiUrl(`/api/reports/output/${id}`),
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
