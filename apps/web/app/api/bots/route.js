import { proxyJson } from '../_proxy';

export async function GET() {
  return proxyJson('/api/bots', {}, { forwardFullAccessKey: true });
}

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/bots', {
    method: 'POST',
    body,
  }, { forwardFullAccessKey: true });
}
