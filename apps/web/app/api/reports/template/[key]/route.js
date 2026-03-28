import { proxyJson } from '../../../_proxy';

export async function PATCH(request, { params }) {
  const key = encodeURIComponent(params?.key || '');
  const body = await request.text();
  return proxyJson(`/api/reports/template/${key}`, {
    method: 'PATCH',
    body,
  });
}

export async function DELETE(_request, { params }) {
  const key = encodeURIComponent(params?.key || '');
  return proxyJson(`/api/reports/template/${key}`, {
    method: 'DELETE',
  });
}
