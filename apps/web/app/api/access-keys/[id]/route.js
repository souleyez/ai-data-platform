import { proxyJson } from '../../_proxy';

export async function DELETE(request, { params }) {
  const id = encodeURIComponent(params?.id || '');
  const accessKey = request.headers.get('x-access-key');
  return proxyJson(`/api/access-keys/${id}`, {
    method: 'DELETE',
    headers: accessKey ? { 'x-access-key': accessKey } : {},
  });
}
