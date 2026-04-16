import { proxyJson } from '../../_proxy';

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/dataset-secrets/verify', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });
}
