import { proxyJson } from '../../../_proxy';

export async function POST(request) {
  const body = await request.text();
  return proxyJson('/api/audit/capture-tasks/cleanup', {
    method: 'POST',
    body: body || '{}',
  });
}
