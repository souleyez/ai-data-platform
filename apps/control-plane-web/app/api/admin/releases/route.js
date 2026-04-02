import { proxyJson } from '../../_proxy';

export async function GET(request) {
  return proxyJson('/api/admin/releases', {}, request);
}

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/admin/releases', {
    method: 'POST',
    body,
  }, request);
}
