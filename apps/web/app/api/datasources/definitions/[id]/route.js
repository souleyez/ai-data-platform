import { proxyJson } from '../../../_proxy';

export const dynamic = 'force-dynamic';

export async function PATCH(request, { params }) {
  const body = await request.text();
  return proxyJson(`/api/datasources/definitions/${params.id}`, {
    method: 'PATCH',
    body,
  });
}

export async function DELETE(_request, { params }) {
  return proxyJson(`/api/datasources/definitions/${params.id}`, {
    method: 'DELETE',
  });
}
