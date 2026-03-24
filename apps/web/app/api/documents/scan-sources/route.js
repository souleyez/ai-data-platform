import { proxyJson } from '../../_proxy';

export async function POST(request) {
  const body = await request.text();

  return proxyJson('/api/documents/scan-sources', {
    method: 'POST',
    body,
  });
}
