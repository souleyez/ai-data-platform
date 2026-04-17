import { proxyJson } from '../../../_proxy';

export async function PATCH(request, { params }) {
  const resolvedParams = await params;
  const key = encodeURIComponent(resolvedParams?.key || '');
  const body = await request.text();
  return proxyJson(`/api/reports/template/${key}`, {
    method: 'PATCH',
    body,
  });
}

export async function DELETE(_request, { params }) {
  const resolvedParams = await params;
  const key = encodeURIComponent(resolvedParams?.key || '');
  return proxyJson(`/api/reports/template/${key}`, {
    method: 'DELETE',
  });
}
