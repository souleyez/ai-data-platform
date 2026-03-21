import { proxyJson } from '../../../../_proxy';

export async function POST(_request, context) {
  const { id } = await context.params;
  return proxyJson(`/api/audit/capture-tasks/${id}/hard-delete`, {
    method: 'POST',
    body: '{}',
  });
}
