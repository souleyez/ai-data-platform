import { proxyJson } from '../../_proxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  return proxyJson('/api/datasources/credentials');
}

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/datasources/credentials', {
    method: 'POST',
    body,
  });
}
