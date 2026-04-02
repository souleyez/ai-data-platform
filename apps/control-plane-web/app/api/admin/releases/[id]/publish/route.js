import { proxyJson } from '../../../../_proxy';

export async function POST(request, { params }) {
  return proxyJson(`/api/admin/releases/${params.id}/publish`, {
    method: 'POST',
    body: await request.text(),
  }, request);
}
