import { buildBackendApiUrl } from '../../../lib/config';

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const groupKey = url.searchParams.get('groupKey') || '';
    const formData = await request.formData();

    const response = await fetch(buildBackendApiUrl(`/api/reports/reference-image?groupKey=${encodeURIComponent(groupKey)}`), {
      method: 'POST',
      body: formData,
      cache: 'no-store',
    });

    const text = await response.text();
    return new Response(text || JSON.stringify({ error: 'empty response from backend' }), {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? `reference image proxy failed: ${error.message}` : 'reference image proxy failed',
    }, { status: 502 });
  }
}
