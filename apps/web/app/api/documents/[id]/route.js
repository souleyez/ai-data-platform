import { proxyJson } from '../../_proxy';

export async function GET(_request, context) {
  const { id } = await context.params;
  return proxyJson(`/api/documents/${id}`);
}
