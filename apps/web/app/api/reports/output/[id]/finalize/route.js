import { proxyJson } from '../../../../_proxy';

export async function POST(_request, { params }) {
  const id = encodeURIComponent(params?.id || '');
  return proxyJson(`/api/reports/output/${id}/finalize`, {
    method: 'POST',
  });
}
