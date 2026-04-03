import { proxyJson } from '../../_proxy';

export async function GET(request) {
  return proxyJson('/api/admin/report-governance', {}, request);
}

export async function PUT(request) {
  const body = await request.text();
  return proxyJson('/api/admin/report-governance', {
    method: 'PUT',
    body,
  }, request);
}
