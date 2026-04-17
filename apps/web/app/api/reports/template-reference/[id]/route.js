import { proxyJson } from '../../../_proxy';

export async function DELETE(request, { params }) {
  const resolvedParams = await params;
  const id = encodeURIComponent(resolvedParams?.id || '');
  const templateKey = encodeURIComponent(request.nextUrl.searchParams.get('templateKey') || '');
  return proxyJson(`/api/reports/template-reference/${id}?templateKey=${templateKey}`, {
    method: 'DELETE',
  });
}
