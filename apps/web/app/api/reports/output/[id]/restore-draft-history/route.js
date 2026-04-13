import { proxyJson } from '../../../../_proxy';

export async function POST(request, { params }) {
  const id = encodeURIComponent(params?.id || '');
  const body = await request.text();
  return proxyJson(`/api/reports/output/${id}/restore-draft-history`, {
    method: 'POST',
    body,
  });
}
