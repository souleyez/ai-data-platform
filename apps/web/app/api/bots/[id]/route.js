import { proxyJson } from '../../_proxy';

export async function PATCH(request, { params }) {
  const body = await request.text();
  const resolvedParams = await params;
  return proxyJson(`/api/bots/${encodeURIComponent(String(resolvedParams?.id || ''))}`, {
    method: 'PATCH',
    body,
  }, { forwardFullAccessKey: true });
}
