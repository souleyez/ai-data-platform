import { proxyJson } from '../../../../_proxy';

export async function POST(_request, { params }) {
  const resolvedParams = await params;
  const id = encodeURIComponent(resolvedParams?.id || '');
  return proxyJson(`/api/reports/output/${id}/finalize`, {
    method: 'POST',
  });
}
