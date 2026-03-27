import { proxyJson } from '../../../../_proxy';

export const dynamic = 'force-dynamic';

export async function POST(_request, { params }) {
  return proxyJson(`/api/datasources/definitions/${params.id}/activate`, {
    method: 'POST',
    body: '{}',
  });
}
