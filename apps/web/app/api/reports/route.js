import { proxyJson } from '../_proxy';

export async function GET() {
  return proxyJson('/api/reports');
}

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/reports/generate', {
    method: 'POST',
    body,
  });
}
