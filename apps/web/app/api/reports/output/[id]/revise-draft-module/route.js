import { proxyJson } from '../../../../_proxy';

export async function POST(request, { params }) {
  const resolvedParams = await params;
  const id = encodeURIComponent(resolvedParams?.id || '');
  const body = await request.text();
  return proxyJson(`/api/reports/output/${id}/revise-draft-module`, {
    method: 'POST',
    body,
  });
}
