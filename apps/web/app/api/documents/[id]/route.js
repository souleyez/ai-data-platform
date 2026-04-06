import { proxyJson } from '../../_proxy';

export async function GET(_request, context) {
  const { id } = await context.params;
  return proxyJson(`/api/documents/${id}`);
}

export async function PATCH(request, context) {
  const { id } = await context.params;
  const body = await request.text();
  return proxyJson(`/api/documents/${id}`, {
    method: 'PATCH',
    body,
  });
}
