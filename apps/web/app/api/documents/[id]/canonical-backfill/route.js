import { proxyJson } from '../../../_proxy';

export async function POST(request, context) {
  const { id } = await context.params;
  const body = await request.text();
  return proxyJson(`/api/documents/${id}/canonical-backfill`, {
    method: 'POST',
    body,
  });
}
