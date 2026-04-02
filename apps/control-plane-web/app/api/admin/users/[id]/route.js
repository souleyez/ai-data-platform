import { proxyJson } from '../../../_proxy';

export async function PATCH(request, { params }) {
  const body = await request.text();
  return proxyJson(`/api/admin/users/${params.id}`, {
    method: 'PATCH',
    body,
  }, request);
}
