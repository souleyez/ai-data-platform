import { proxyJson } from '../_proxy';

export async function GET() {
  return proxyJson('/api/model-config');
}

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/model-config', {
    method: 'POST',
    body,
  });
}
