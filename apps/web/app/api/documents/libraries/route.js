import { proxyJson } from '../../_proxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  return proxyJson('/api/documents/libraries');
}

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/documents/libraries', {
    method: 'POST',
    body,
  });
}
