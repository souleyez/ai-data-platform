import { proxyJson } from '../_proxy';

export async function GET() {
  return proxyJson('/api/web-captures');
}

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/web-captures', {
    method: 'POST',
    body,
  });
}
