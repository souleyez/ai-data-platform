import { proxyJson } from '../_proxy';

function buildProxyHeaders(request) {
  const accessKey = request.headers.get('x-access-key');
  return accessKey ? { 'x-access-key': accessKey } : {};
}

export async function GET(request) {
  return proxyJson('/api/access-keys', {
    headers: buildProxyHeaders(request),
  });
}

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/access-keys', {
    method: 'POST',
    body,
    headers: buildProxyHeaders(request),
  });
}
