import { proxyJson } from '../../../../_proxy';

export async function POST(_request, { params }) {
  return proxyJson(`/api/audit/documents/${params.id}/cleanup`, { method: 'POST' });
}
