import { buildBackendApiUrl } from '../../../lib/config';

export async function POST(request) {
  const body = await request.text();

  const response = await fetch(buildBackendApiUrl('/api/documents/classify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    cache: 'no-store',
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'application/json',
    },
  });
}
