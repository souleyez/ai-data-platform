import { proxyJson } from '../../../_proxy';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  return proxyJson(`/api/datasources/public/${encodeURIComponent(params.token)}`);
}
