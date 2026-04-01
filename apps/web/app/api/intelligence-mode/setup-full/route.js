import { proxyJson } from '../../_proxy';

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/intelligence-mode/setup-full', {
    method: 'POST',
    body,
  });
}
