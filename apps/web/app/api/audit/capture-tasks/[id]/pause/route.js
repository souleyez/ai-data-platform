import { proxyJson } from '../../../../_proxy';

export async function POST(_request, { params }) {
  return proxyJson(`/api/audit/capture-tasks/${params.id}/pause`, { method: 'POST' });
}
