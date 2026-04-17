import { proxyJson } from '../../../../_proxy';

export async function PATCH(request, { params }) {
  const resolvedParams = await params;
  const id = encodeURIComponent(resolvedParams?.id || '');
  const body = await request.text();
  return proxyJson(`/api/reports/output/${id}/draft`, {
    method: 'PATCH',
    body,
  });
}
