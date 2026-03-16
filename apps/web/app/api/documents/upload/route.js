import { buildBackendApiUrl } from '../../../lib/config';

export async function POST(request) {
  const formData = await request.formData();

  const response = await fetch(buildBackendApiUrl('/api/documents/upload'), {
    method: 'POST',
    body: formData,
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
