import { proxyJson } from '../../_proxy';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const datasourceId = searchParams.get('datasourceId');
  const query = datasourceId ? `?datasourceId=${encodeURIComponent(datasourceId)}` : '';
  return proxyJson(`/api/datasources/runs${query}`);
}
