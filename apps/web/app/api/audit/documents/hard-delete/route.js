import { proxyJson } from '../../../_proxy';

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/audit/documents/hard-delete', {
    method: 'POST',
    body: body || '{}',
  });
}
