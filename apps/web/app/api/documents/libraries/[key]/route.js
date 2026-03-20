import { buildBackendApiUrl } from '../../../../lib/config';

export async function DELETE(_request, { params }) {
  try {
    const response = await fetch(buildBackendApiUrl(`/api/documents/libraries/${params.key}`), {
      method: 'DELETE',
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
      error: error instanceof Error ? `delete libraries proxy failed: ${error.message}` : 'delete libraries proxy failed',
    }, { status: 502 });
  }
}
