import { proxyJson } from '../../../../_proxy';

export async function PATCH(request, { params }) {
  const id = encodeURIComponent(params?.id || '');
  const body = await request.text();
  return proxyJson(`/api/reports/output/${id}/draft`, {
    method: 'PATCH',
    body,
  });
}
