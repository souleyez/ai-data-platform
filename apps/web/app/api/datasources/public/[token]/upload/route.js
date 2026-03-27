import { buildBackendApiUrl } from '../../../../../lib/config';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  try {
    const formData = await request.formData();
    const response = await fetch(buildBackendApiUrl(`/api/datasources/public/${encodeURIComponent(params.token)}/upload`), {
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
    return Response.json(
      {
        error: error instanceof Error ? `public upload proxy failed: ${error.message}` : 'public upload proxy failed',
      },
      { status: 502 },
    );
  }
}
