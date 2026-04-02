import { proxyJson } from '../../_proxy';

export async function GET(request) {
  return proxyJson('/api/admin/users', {}, request);
}

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/admin/users', {
    method: 'POST',
    body,
  }, request);
}
