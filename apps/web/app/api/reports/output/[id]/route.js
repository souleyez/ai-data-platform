import { NextResponse } from 'next/server';
import { buildBackendApiUrl } from '../../../../lib/config';

export async function GET(_request, { params }) {
  try {
    const id = encodeURIComponent(params?.id || '');
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
        path: `/api/reports/output/${params?.id || ''}`,
        backendUrl: buildBackendApiUrl(`/api/reports/output/${params?.id || ''}`),
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}

export async function DELETE(_request, { params }) {
  try {
    const id = encodeURIComponent(params?.id || '');
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
        path: `/api/reports/output/${params?.id || ''}`,
        backendUrl: buildBackendApiUrl(`/api/reports/output/${params?.id || ''}`),
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 },
    );
  }
}
