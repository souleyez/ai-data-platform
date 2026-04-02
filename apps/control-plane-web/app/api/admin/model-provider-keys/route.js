import { proxyJson } from '../../_proxy';

export async function GET(request) {
  return proxyJson('/api/admin/model-provider-keys', {}, request);
}

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/admin/model-provider-keys', {
    method: 'POST',
    body,
  }, request);
}
