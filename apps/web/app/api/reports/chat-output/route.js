import { proxyJson } from '../../_proxy';

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/reports/chat-output', {
    method: 'POST',
    body,
  });
}
