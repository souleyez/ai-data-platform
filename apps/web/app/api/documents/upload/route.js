import { buildBackendApiUrl } from '../../../lib/config';

export async function POST(request) {
  try {
    const formData = await request.formData();

    const response = await fetch(buildBackendApiUrl('/api/documents/upload'), {
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
      error: error instanceof Error ? `upload proxy failed: ${error.message}` : 'upload proxy failed',
    }, { status: 502 });
  }
}
