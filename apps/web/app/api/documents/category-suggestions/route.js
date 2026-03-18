import { buildBackendApiUrl } from '../../../lib/config';

export async function POST(request) {
  try {
    const body = await request.text();

    const response = await fetch(buildBackendApiUrl('/api/documents/category-suggestions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
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
      error: error instanceof Error ? `category suggestion proxy failed: ${error.message}` : 'category suggestion proxy failed',
    }, { status: 502 });
  }
}
