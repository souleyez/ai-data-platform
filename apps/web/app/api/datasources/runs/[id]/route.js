import { proxyJson } from '../../../_proxy';

export const dynamic = 'force-dynamic';

export async function DELETE(_request, { params }) {
  return proxyJson(`/api/datasources/runs/${encodeURIComponent(params.id)}`, {
    method: 'DELETE',
  });
}
